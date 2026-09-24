// Integration tests for the claim_lead_processing_runs() function against a
// real Postgres instance — SKIP LOCKED concurrency and lease/recovery
// semantics can't be meaningfully verified against a mock. Skipped unless
// TEST_DATABASE_URL is set (see .env.example / docs/architecture.md).
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetAndMigrate } from "./setup";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("worker claim / lease / recovery (real Postgres)", () => {
  let admin: Client;
  let workerA: Client;
  let workerB: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
    await resetAndMigrate(admin);

    workerA = new Client({ connectionString: TEST_DATABASE_URL });
    workerB = new Client({ connectionString: TEST_DATABASE_URL });
    await workerA.connect();
    await workerB.connect();
  });

  afterAll(async () => {
    await workerA?.end();
    await workerB?.end();
    await admin?.end();
  });

  beforeEach(async () => {
    await admin.query("truncate table processing_events, lead_processing_runs, leads restart identity cascade");
  });

  async function insertLeadWithRun(domainSuffix: string): Promise<{ leadId: string; runId: string }> {
    const leadResult = await admin.query(
      "insert into leads (raw_company_name, company_name, website_domain) values ($1, $1, $2) returning id",
      [`Acme ${domainSuffix}`, `acme-${domainSuffix}.example`],
    );
    const leadId = leadResult.rows[0].id as string;
    const runResult = await admin.query(
      "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating') returning id",
      [leadId],
    );
    return { leadId, runId: runResult.rows[0].id as string };
  }

  async function claim(client: Client, workerId: string, limit = 5, leaseSeconds = 120) {
    return client.query("select * from claim_lead_processing_runs($1::int, $2::text, $3::int)", [
      limit,
      workerId,
      leaseSeconds,
    ]);
  }

  it("claims exactly one available run and records ownership", async () => {
    const { runId } = await insertLeadWithRun("solo");

    const result = await claim(workerA, "worker-a");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].id).toBe(runId);
    expect(result.rows[0].locked_by).toBe("worker-a");
    expect(result.rows[0].was_recovered).toBe(false);
    expect(result.rows[0].attempt_count).toBe(1);
  });

  it("syncs status to current_stage on claim, even for a brand-new 'pending' run (regression)", async () => {
    // Caught via live end-to-end verification: a fresh run has
    // status='pending', current_stage='validating'. Claiming it must set
    // status='validating' so the runner's first transition check
    // (assertValidTransition(run.status, 'normalizing')) sees 'validating',
    // not 'pending' — otherwise every brand-new lead fails its first tick.
    await insertLeadWithRun("status-sync");

    const result = await claim(workerA, "worker-a");

    expect(result.rows[0].status).toBe("validating");
    expect(result.rows[0].current_stage).toBe("validating");
  });

  it("does not let a second worker claim a run that's already actively leased", async () => {
    await insertLeadWithRun("active-lease");

    const first = await claim(workerA, "worker-a", 5, 120);
    const second = await claim(workerB, "worker-b", 5, 120);

    expect(first.rows).toHaveLength(1);
    expect(second.rows).toHaveLength(0);
  });

  it("SKIP LOCKED: two workers claiming concurrently from a shared pool never claim the same run", async () => {
    // Sequential on purpose: these all share the single `admin` connection,
    // and node-pg queues (rather than truly parallelizes) concurrent queries
    // on one client — only the claim calls below, on separate connections,
    // need genuine concurrency.
    const inserted = [];
    for (let i = 0; i < 20; i += 1) {
      inserted.push(await insertLeadWithRun(`concurrent-${i}`));
    }

    const [resultA, resultB] = await Promise.all([
      claim(workerA, "worker-a", 15),
      claim(workerB, "worker-b", 15),
    ]);

    const idsA = resultA.rows.map((row) => row.id as string);
    const idsB = resultB.rows.map((row) => row.id as string);

    expect(idsA.filter((id) => idsB.includes(id))).toHaveLength(0);
    expect(idsA.length + idsB.length).toBe(inserted.length);
  });

  it("recovers a stale (lease-expired) run and marks it as recovered", async () => {
    const { runId } = await insertLeadWithRun("stale");

    // A negative lease is already expired by the time the second claim runs.
    const first = await claim(workerA, "worker-a", 5, -1);
    expect(first.rows[0].was_recovered).toBe(false);
    expect(first.rows[0].attempt_count).toBe(1);

    const second = await claim(workerB, "worker-b", 5, 120);
    expect(second.rows).toHaveLength(1);
    expect(second.rows[0].id).toBe(runId);
    expect(second.rows[0].was_recovered).toBe(true);
    expect(second.rows[0].attempt_count).toBe(2);
  });

  it("does not recover a run whose lease has not expired yet (no stealing an active job)", async () => {
    await insertLeadWithRun("still-active");

    await claim(workerA, "worker-a", 5, 300);
    const stolen = await claim(workerB, "worker-b", 5, 300);

    expect(stolen.rows).toHaveLength(0);
  });

  it("excludes terminal and blocked runs from claiming", async () => {
    const { runId: completedRunId } = await insertLeadWithRun("done");
    await admin.query("update lead_processing_runs set status = 'completed' where id = $1", [completedRunId]);

    const { runId: blockedRunId } = await insertLeadWithRun("blocked");
    await admin.query(
      "update lead_processing_runs set status = 'blocked', current_stage = 'enriching' where id = $1",
      [blockedRunId],
    );

    const result = await claim(workerA, "worker-a", 10);

    expect(result.rows.map((row) => row.id)).not.toContain(completedRunId);
    expect(result.rows.map((row) => row.id)).not.toContain(blockedRunId);
  });

  it("does not honor a next_attempt_at that is still in the future", async () => {
    await insertLeadWithRun("not-due-yet");
    await admin.query(
      "update lead_processing_runs set next_attempt_at = now() + interval '1 hour' where lead_id = (select id from leads where website_domain = 'acme-not-due-yet.example')",
    );

    const result = await claim(workerA, "worker-a", 10);

    expect(result.rows).toHaveLength(0);
  });

  it("rejects direct RPC access from an unprivileged role (defense in depth beyond RLS)", async () => {
    await admin.query("drop role if exists ads_test_anon");
    await admin.query("create role ads_test_anon login password 'ads_test_anon_pw'");
    const unprivileged = new Client({
      connectionString: TEST_DATABASE_URL!.replace(
        /\/\/[^@]+@/,
        "//ads_test_anon:ads_test_anon_pw@",
      ),
    });
    try {
      await unprivileged.connect();
      // Postgres reports this as "function ... does not exist" rather than
      // "permission denied" when the caller lacks EXECUTE and there's only
      // one candidate overload — the access is still blocked either way.
      await expect(claim(unprivileged, "intruder")).rejects.toThrow(/does not exist|permission denied/);
    } finally {
      await unprivileged.end().catch(() => undefined);
      await admin.query("drop role if exists ads_test_anon");
    }
  });
});
