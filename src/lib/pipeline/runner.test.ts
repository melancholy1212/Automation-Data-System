import { beforeEach, describe, expect, it, vi } from "vitest";

import { LostLeaseError } from "@/lib/db/errors";
import type { ClaimedRun, Lead } from "@/lib/types/domain";

const claimProcessingRuns = vi.fn();
const findLeadById = vi.fn();
const insertProcessingEvent = vi.fn();
const updateProcessingRun = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  claimProcessingRuns: (...args: unknown[]) => claimProcessingRuns(...args),
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  insertProcessingEvent: (...args: unknown[]) => insertProcessingEvent(...args),
  updateProcessingRun: (...args: unknown[]) => updateProcessingRun(...args),
}));

const validatingExecute = vi.fn();
const enrichingExecute = vi.fn();

vi.mock("@/lib/pipeline/registry", () => ({
  STAGE_REGISTRY: {
    validating: { name: "validating", timeoutMs: 5_000, execute: (...args: unknown[]) => validatingExecute(...args) },
    enriching: { name: "enriching", timeoutMs: 5_000, execute: (...args: unknown[]) => enrichingExecute(...args) },
  },
}));

const { processClaimedRun, runWorkerTick } = await import("./runner");

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    raw_company_name: "Acme Corp",
    company_name: "Acme Corp",
    website: null,
    website_domain: null,
    contact_name: null,
    email: null,
    email_domain: null,
    linkedin_url: null,
    industry: null,
    country: null,
    status: "pending",
    qualification_level: null,
    qualification_score: null,
    duplicate_of_lead_id: null,
    source: "api",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeClaimedRun(overrides: Partial<ClaimedRun> = {}): ClaimedRun {
  return {
    id: "run-1",
    lead_id: "lead-1",
    status: "validating",
    current_stage: "validating",
    attempt_count: 1,
    max_attempts: 5,
    locked_at: new Date().toISOString(),
    locked_by: "exec-1",
    lease_expires_at: new Date(Date.now() + 120_000).toISOString(),
    next_attempt_at: new Date().toISOString(),
    failure_reason: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    was_recovered: false,
    ...overrides,
  };
}

describe("processClaimedRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findLeadById.mockResolvedValue(makeLead());
    updateProcessingRun.mockResolvedValue({});
    insertProcessingEvent.mockResolvedValue({});
  });

  it("advances to the next stage on success and records run.claimed + stage events", async () => {
    validatingExecute.mockResolvedValue({ kind: "success" });

    const tag = await processClaimedRun({} as never, makeClaimedRun(), "exec-1");

    expect(tag).toBe("completed");
    expect(updateProcessingRun).toHaveBeenCalledWith(
      {},
      "run-1",
      "exec-1",
      expect.objectContaining({ status: "normalizing", current_stage: "normalizing", locked_by: null }),
    );
    const eventTypes = insertProcessingEvent.mock.calls.map(([, event]) => event.event_type);
    expect(eventTypes).toContain("run.claimed");
    expect(eventTypes).toContain("stage.started");
    expect(eventTypes).toContain("stage.completed");
  });

  it("records run.recovered instead of run.claimed for a stale-lease recovery", async () => {
    validatingExecute.mockResolvedValue({ kind: "success" });

    await processClaimedRun({} as never, makeClaimedRun({ was_recovered: true }), "exec-1");

    const eventTypes = insertProcessingEvent.mock.calls.map(([, event]) => event.event_type);
    expect(eventTypes).toContain("run.recovered");
    expect(eventTypes).not.toContain("run.claimed");
  });

  it("schedules a retry (same stage, backoff, no terminal status) on a retryable failure under the attempt limit", async () => {
    validatingExecute.mockRejectedValue(new Error("transient db blip"));

    const tag = await processClaimedRun({} as never, makeClaimedRun({ attempt_count: 2, max_attempts: 5 }), "exec-1");

    expect(tag).toBe("retried");
    const [, , , patch] = updateProcessingRun.mock.calls[0];
    expect(patch.status).toBe("validating");
    expect(patch.locked_by).toBeNull();
    expect(new Date(patch.next_attempt_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("transitions to failed once the attempt limit is exhausted", async () => {
    validatingExecute.mockRejectedValue(new Error("still failing"));

    const tag = await processClaimedRun(
      {} as never,
      makeClaimedRun({ attempt_count: 5, max_attempts: 5 }),
      "exec-1",
    );

    expect(tag).toBe("failed");
    const [, , , patch] = updateProcessingRun.mock.calls[0];
    expect(patch.status).toBe("failed");
  });

  it("parks a not-implemented stage as blocked without pretending success", async () => {
    enrichingExecute.mockResolvedValue({ kind: "not_implemented" });

    const tag = await processClaimedRun(
      {} as never,
      makeClaimedRun({ status: "enriching", current_stage: "enriching" }),
      "exec-1",
    );

    expect(tag).toBe("blocked");
    const [, , , patch] = updateProcessingRun.mock.calls[0];
    expect(patch.status).toBe("blocked");
    expect(patch.current_stage).toBeUndefined(); // stays at 'enriching', unchanged
  });

  it("returns lease_lost without throwing when the update loses the lock race", async () => {
    validatingExecute.mockResolvedValue({ kind: "success" });
    updateProcessingRun.mockRejectedValueOnce(new LostLeaseError("run-1"));

    const tag = await processClaimedRun({} as never, makeClaimedRun(), "exec-1");

    expect(tag).toBe("lease_lost");
    const eventTypes = insertProcessingEvent.mock.calls.map(([, event]) => event.event_type);
    expect(eventTypes).toContain("run.lease_lost");
  });

  it("forces failed rather than crashing when the claimed run's lead is missing", async () => {
    findLeadById.mockResolvedValue(null);

    const tag = await processClaimedRun({} as never, makeClaimedRun(), "exec-1");

    expect(tag).toBe("failed");
    const lastCall = updateProcessingRun.mock.calls.at(-1);
    expect(lastCall?.[3]).toMatchObject({ status: "failed" });
  });
});

describe("runWorkerTick", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findLeadById.mockResolvedValue(makeLead());
    updateProcessingRun.mockResolvedValue({});
    insertProcessingEvent.mockResolvedValue({});
  });

  it("returns zeroed stats when nothing is claimable", async () => {
    claimProcessingRuns.mockResolvedValue([]);

    const result = await runWorkerTick({} as never, {
      batchSize: 5,
      concurrency: 3,
      leaseSeconds: 120,
      executionBudgetMs: 8_000,
    });

    expect(result.claimed).toBe(0);
    expect(result.completed).toBe(0);
    expect(result.execution_id).toBeTruthy();
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("tallies stats across a batch of claimed runs", async () => {
    validatingExecute.mockResolvedValue({ kind: "success" });
    claimProcessingRuns.mockResolvedValue([makeClaimedRun({ id: "run-a" }), makeClaimedRun({ id: "run-b" })]);

    const result = await runWorkerTick({} as never, {
      batchSize: 5,
      concurrency: 3,
      leaseSeconds: 120,
      executionBudgetMs: 8_000,
    });

    expect(result.claimed).toBe(2);
    expect(result.completed).toBe(2);
  });

  it("treats a run as a retryable failure without starting its stage once the execution budget is exhausted", async () => {
    claimProcessingRuns.mockResolvedValue([makeClaimedRun()]);

    const result = await runWorkerTick({} as never, {
      batchSize: 5,
      concurrency: 1,
      leaseSeconds: 120,
      executionBudgetMs: 0,
    });

    expect(validatingExecute).not.toHaveBeenCalled();
    expect(result.retried).toBe(1);
  });
});
