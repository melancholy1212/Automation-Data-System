// Integration tests against a real Postgres instance, exercising the
// database constraints in supabase/migrations directly (not the application
// layer, which is covered by the unit tests elsewhere). Skipped unless
// TEST_DATABASE_URL is set — see .env.example for how to point this at a
// throwaway Postgres container.
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resetAndMigrate } from "./setup";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("database constraints (supabase/migrations)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await resetAndMigrate(client);
  });

  afterAll(async () => {
    await client.end();
  });

  async function insertLead(overrides: Record<string, unknown> = {}): Promise<string> {
    const row: Record<string, unknown> = {
      raw_company_name: "Acme Corp",
      company_name: "Acme Corp",
      website_domain: "acme.com",
      ...overrides,
    };
    const columns = Object.keys(row);
    const values = Object.values(row);
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
    const result = await client.query(
      `insert into leads (${columns.join(", ")}) values (${placeholders}) returning id`,
      values,
    );
    return result.rows[0].id as string;
  }

  it("rejects a second lead with the same website_domain", async () => {
    await insertLead({ website_domain: "unique-domain-1.com" });
    await expect(insertLead({ website_domain: "unique-domain-1.com" })).rejects.toThrow(
      /duplicate key/,
    );
  });

  it("allows leads with different website_domains", async () => {
    await expect(insertLead({ website_domain: "unique-domain-2.com" })).resolves.toBeDefined();
    await expect(insertLead({ website_domain: "unique-domain-3.com" })).resolves.toBeDefined();
  });

  it("allows multiple leads with no website (null website_domain)", async () => {
    await expect(
      insertLead({ website_domain: null, raw_company_name: "No Site A" }),
    ).resolves.toBeDefined();
    await expect(
      insertLead({ website_domain: null, raw_company_name: "No Site B" }),
    ).resolves.toBeDefined();
  });

  it("rejects a blank company_name", async () => {
    await expect(
      insertLead({ website_domain: "blank-name.com", company_name: "   " }),
    ).rejects.toThrow(/leads_company_name_not_blank/);
  });

  it("rejects a qualification_score outside 0-100", async () => {
    await expect(
      insertLead({ website_domain: "bad-score.com", qualification_score: 150 }),
    ).rejects.toThrow(/leads_qualification_score_check/);
  });

  it("rejects a second active processing run for the same lead", async () => {
    const leadId = await insertLead({ website_domain: "one-active-run.com" });
    await client.query(
      "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating')",
      [leadId],
    );
    await expect(
      client.query(
        "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating')",
        [leadId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("allows a new active run once the previous one reaches a terminal status", async () => {
    const leadId = await insertLead({ website_domain: "terminal-then-new.com" });
    const first = await client.query(
      "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating') returning id",
      [leadId],
    );
    await client.query("update lead_processing_runs set status = 'completed' where id = $1", [
      first.rows[0].id,
    ]);
    await expect(
      client.query(
        "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating')",
        [leadId],
      ),
    ).resolves.toBeDefined();
  });
});
