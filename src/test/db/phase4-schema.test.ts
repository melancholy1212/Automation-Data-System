// Real-Postgres tests for the Phase 4 schema additions: the new
// classification_category enum values, and the unique(run_id) constraint on
// each of lead_classifications/lead_qualifications/lead_intelligence_briefs
// that makes "no duplicate output per run" a database guarantee, not just an
// application-level check (the stages' own findByRunId-first behavior is
// covered by mocked unit tests in src/lib/pipeline/stages/*.test.ts).
//
// This also serves as the Phase 4 "trace one realistic lead end-to-end"
// verification at the schema level: inserting a full realistic row set
// (lead -> run -> evidence -> classification -> qualification -> brief ->
// completed) and reading it back exactly as the application would.
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resetAndMigrate } from "./setup";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("Phase 4 schema (real Postgres)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    await resetAndMigrate(client);
  });

  afterAll(async () => {
    await client?.end();
  });

  beforeEach(async () => {
    await client.query(
      "truncate table processing_events, lead_intelligence_briefs, lead_qualifications, lead_classifications, lead_evidence, lead_processing_runs, leads restart identity cascade",
    );
  });

  async function insertLead(domainSuffix: string): Promise<string> {
    const result = await client.query(
      "insert into leads (raw_company_name, company_name, website_domain, industry, country) values ($1, $1, $2, 'SaaS', 'US') returning id",
      [`Acme ${domainSuffix}`, `acme-${domainSuffix}.example`],
    );
    return result.rows[0].id as string;
  }

  async function insertRun(leadId: string): Promise<string> {
    const result = await client.query(
      "insert into lead_processing_runs (lead_id, status, current_stage) values ($1, 'pending', 'validating') returning id",
      [leadId],
    );
    return result.rows[0].id as string;
  }

  it("accepts the new classification_category values (software_company, marketplace, unknown)", async () => {
    const leadId = await insertLead("cat-values");
    const runId = await insertRun(leadId);

    for (const category of ["software_company", "marketplace", "unknown"]) {
      await expect(
        client.query(
          `insert into lead_classifications (lead_id, run_id, category, confidence, reasoning, model, raw_output)
           values ($1, $2, $3, 0.5, 'test', 'test-model', '{}'::jsonb)`,
          [leadId, runId, category],
        ),
      ).resolves.toBeDefined();
      await client.query("delete from lead_classifications where run_id = $1", [runId]);
    }
  });

  it("rejects a second classification for the same run", async () => {
    const leadId = await insertLead("dup-classification");
    const runId = await insertRun(leadId);
    await client.query(
      `insert into lead_classifications (lead_id, run_id, category, confidence, reasoning, model, raw_output)
       values ($1, $2, 'software_company', 0.5, 'test', 'test-model', '{}'::jsonb)`,
      [leadId, runId],
    );

    await expect(
      client.query(
        `insert into lead_classifications (lead_id, run_id, category, confidence, reasoning, model, raw_output)
         values ($1, $2, 'other', 0.1, 'retry', 'test-model', '{}'::jsonb)`,
        [leadId, runId],
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("rejects a second qualification for the same run", async () => {
    const leadId = await insertLead("dup-qualification");
    const runId = await insertRun(leadId);
    const insertQualification = () =>
      client.query(
        `insert into lead_qualifications
           (lead_id, run_id, score, level, deterministic_score, ai_score, evidence_confidence, reasons)
         values ($1, $2, 60, 'medium', 50, 70, 0.5, '[]'::jsonb)`,
        [leadId, runId],
      );

    await insertQualification();
    await expect(insertQualification()).rejects.toThrow(/duplicate key/);
  });

  it("rejects a second intelligence brief for the same run", async () => {
    const leadId = await insertLead("dup-brief");
    const runId = await insertRun(leadId);
    const insertBrief = () =>
      client.query(
        `insert into lead_intelligence_briefs
           (lead_id, run_id, company_summary, outreach_angle, confidence, model, raw_output)
         values ($1, $2, 'summary', 'angle', 0.5, 'test-model', '{}'::jsonb)`,
        [leadId, runId],
      );

    await insertBrief();
    await expect(insertBrief()).rejects.toThrow(/duplicate key/);
  });

  it("allows the same run to hold one classification, one qualification, and one brief simultaneously", async () => {
    const leadId = await insertLead("one-of-each");
    const runId = await insertRun(leadId);

    await client.query(
      `insert into lead_classifications (lead_id, run_id, category, confidence, reasoning, model, raw_output)
       values ($1, $2, 'software_company', 0.8, 'SaaS product', 'gemini-3.5-flash', '{}'::jsonb)`,
      [leadId, runId],
    );
    await client.query(
      `insert into lead_qualifications
         (lead_id, run_id, score, level, deterministic_score, ai_score, evidence_confidence, reasons)
       values ($1, $2, 72, 'medium', 60, 80, 0.6, '[{"factor":"has_website","contribution":15,"source":"deterministic"}]'::jsonb)`,
      [leadId, runId],
    );
    await client.query(
      `insert into lead_intelligence_briefs (lead_id, run_id, company_summary, outreach_angle, confidence, model, raw_output)
       values ($1, $2, 'Acme is a SaaS company.', 'Ask about workflow bottlenecks.', 0.6, 'gemini-3.5-flash', '{"facts":{"known":[],"inferred":[],"unknown":[]}}'::jsonb)`,
      [leadId, runId],
    );

    const counts = await client.query(
      `select
         (select count(*) from lead_classifications where run_id = $1) as classifications,
         (select count(*) from lead_qualifications where run_id = $1) as qualifications,
         (select count(*) from lead_intelligence_briefs where run_id = $1) as briefs`,
      [runId],
    );
    expect(counts.rows[0]).toEqual({ classifications: "1", qualifications: "1", briefs: "1" });
  });

  it("traces one realistic lead end-to-end: evidence, classification, qualification, brief, events, completed run", async () => {
    const leadId = await insertLead("end-to-end");
    const runId = await insertRun(leadId);

    // enrichment
    await client.query(
      `insert into lead_evidence (lead_id, run_id, source_url, source_type, provider, idempotency_key, title, snippet, relevance)
       values
         ($1, $2, 'https://acme-end-to-end.example', 'search_result', 'tavily', 'https://acme-end-to-end.example', 'Acme', 'Acme builds workflow software', 'primary'),
         ($1, $2, 'https://techcrunch.com/acme-funding', 'search_result', 'tavily', 'https://techcrunch.com/acme-funding', 'Acme raises funding', 'Acme raised a seed round', 'supporting')`,
      [leadId, runId],
    );

    // classification
    await client.query(
      `insert into lead_classifications (lead_id, run_id, category, confidence, reasoning, model, raw_output)
       values ($1, $2, 'software_company', 0.8, 'Evidence describes a SaaS workflow product.', 'gemini-3.5-flash', '{"company_type":"software_company"}'::jsonb)`,
      [leadId, runId],
    );

    // qualification with explainable component breakdown
    await client.query(
      `insert into lead_qualifications
         (lead_id, run_id, score, level, deterministic_score, ai_score, evidence_confidence, reasons, opportunity_signals)
       values ($1, $2, 78, 'medium', 75, 80, 0.6,
         '[{"factor":"has_website","contribution":15,"detail":"Lead has a verified website domain","source":"deterministic"},
           {"factor":"ICP fit","contribution":20,"detail":"Matches target industry","source":"ai"},
           {"factor":"evidence_confidence","contribution":12,"detail":"2 evidence items collected","source":"evidence"}]'::jsonb,
         '["Recently raised funding"]'::jsonb)`,
      [leadId, runId],
    );
    await client.query("update leads set qualification_score = 78, qualification_level = 'medium' where id = $1", [
      leadId,
    ]);

    // intelligence brief
    await client.query(
      `insert into lead_intelligence_briefs
         (lead_id, run_id, company_summary, signals, pain_points, automation_opportunities, outreach_angle, confidence, model, raw_output)
       values ($1, $2, 'Acme is a SaaS workflow company that recently raised funding.',
         '["Recently raised a funding round"]'::jsonb, '[]'::jsonb, '[]'::jsonb,
         'Congratulate on the funding round and ask about workflow scaling challenges.', 0.65, 'gemini-3.5-flash',
         '{"facts":{"known":["Has a public website","Raised funding"],"inferred":["Likely scaling operations"],"unknown":["Headcount"]}}'::jsonb)`,
      [leadId, runId],
    );

    // processing events an operator would see in the timeline
    const eventTypes = [
      "lead_imported",
      "run.claimed",
      "stage.completed",
      "run.claimed",
      "stage.completed",
      "run.claimed",
      "stage.completed",
      "run.claimed",
      "stage.completed",
      "run.claimed",
      "stage.completed",
      "run.completed",
    ];
    for (const eventType of eventTypes) {
      await client.query(
        "insert into processing_events (lead_id, run_id, event_type, metadata) values ($1, $2, $3, '{}'::jsonb)",
        [leadId, runId, eventType],
      );
    }

    // finally, the run completes
    await client.query(
      "update lead_processing_runs set status = 'completed', current_stage = 'generating_brief', completed_at = now() where id = $1",
      [runId],
    );

    // Verify everything an operator (or a future dashboard) would need is present.
    const lead = await client.query("select * from leads where id = $1", [leadId]);
    expect(lead.rows[0].qualification_score).toBe(78);
    expect(lead.rows[0].qualification_level).toBe("medium");

    const run = await client.query("select * from lead_processing_runs where id = $1", [runId]);
    expect(run.rows[0].status).toBe("completed");
    expect(run.rows[0].completed_at).not.toBeNull();

    const evidence = await client.query("select * from lead_evidence where lead_id = $1", [leadId]);
    expect(evidence.rows).toHaveLength(2);

    const classification = await client.query("select * from lead_classifications where run_id = $1", [runId]);
    expect(classification.rows).toHaveLength(1);
    expect(classification.rows[0].category).toBe("software_company");

    const qualification = await client.query("select * from lead_qualifications where run_id = $1", [runId]);
    expect(qualification.rows).toHaveLength(1);
    expect(qualification.rows[0].score).toBe(78);
    expect(qualification.rows[0].reasons).toHaveLength(3);

    const brief = await client.query("select * from lead_intelligence_briefs where run_id = $1", [runId]);
    expect(brief.rows).toHaveLength(1);
    expect(brief.rows[0].raw_output.facts.unknown).toContain("Headcount");

    const events = await client.query(
      "select event_type from processing_events where lead_id = $1 order by created_at",
      [leadId],
    );
    expect(events.rows.map((r) => r.event_type)).toEqual(eventTypes);
  });

  it("verifies a failure/retry scenario: retries the same stage, then reaches failed once attempts are exhausted", async () => {
    const leadId = await insertLead("failure-retry");
    const runId = await insertRun(leadId);

    // Simulate the enrichment stage failing on attempt 1: claim increments
    // attempt_count, the failure keeps status == current_stage and pushes
    // next_attempt_at out (see src/lib/pipeline/runner.ts's resolveOutcome).
    await client.query(
      `update lead_processing_runs
       set current_stage = 'enriching', status = 'enriching', attempt_count = 1,
           failure_reason = 'Tavily search request failed', next_attempt_at = now() + interval '1 minute'
       where id = $1`,
      [runId],
    );
    let run = await client.query("select * from lead_processing_runs where id = $1", [runId]);
    expect(run.rows[0].status).toBe("enriching");
    expect(run.rows[0].attempt_count).toBe(1);

    await client.query(
      "insert into processing_events (lead_id, run_id, event_type, metadata) values ($1, $2, 'stage.failed', '{\"attempt\":1}'::jsonb)",
      [leadId, runId],
    );
    await client.query(
      "insert into processing_events (lead_id, run_id, event_type, metadata) values ($1, $2, 'run.retried', '{\"attempt\":1}'::jsonb)",
      [leadId, runId],
    );

    // Exhaust the remaining attempts (max_attempts defaults to 5).
    await client.query(
      `update lead_processing_runs
       set status = 'failed', attempt_count = 5,
           failure_reason = 'Tavily search request failed', completed_at = now()
       where id = $1`,
      [runId],
    );
    await client.query(
      "insert into processing_events (lead_id, run_id, event_type, metadata) values ($1, $2, 'stage.failed', '{\"attempt\":5,\"exhausted\":true}'::jsonb)",
      [leadId, runId],
    );

    run = await client.query("select * from lead_processing_runs where id = $1", [runId]);
    expect(run.rows[0].status).toBe("failed");
    expect(run.rows[0].current_stage).toBe("enriching");
    expect(run.rows[0].failure_reason).toBe("Tavily search request failed");
    expect(run.rows[0].completed_at).not.toBeNull();

    // The lead itself survives the failure — it's not deleted, and whatever
    // evidence existed (none here) would remain queryable.
    const lead = await client.query("select status from leads where id = $1", [leadId]);
    expect(lead.rows[0]).toBeDefined();

    // A failed run is excluded from the worker's claimable pool.
    const claimable = await client.query(
      "select * from claim_lead_processing_runs($1::int, $2::text, $3::int)",
      [10, "verification-worker", 120],
    );
    expect(claimable.rows.map((r) => r.id)).not.toContain(runId);
  });
});
