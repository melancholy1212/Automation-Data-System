import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, LeadProcessingRun } from "@/lib/types/domain";

const findLeadById = vi.fn();
const getLatestRunForLead = vi.fn();
const resetRunForRetry = vi.fn();
const updateLeadStatus = vi.fn();
const insertProcessingEvent = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  getLatestRunForLead: (...args: unknown[]) => getLatestRunForLead(...args),
  resetRunForRetry: (...args: unknown[]) => resetRunForRetry(...args),
  updateLeadStatus: (...args: unknown[]) => updateLeadStatus(...args),
  insertProcessingEvent: (...args: unknown[]) => insertProcessingEvent(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { POST } = await import("./route");

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    raw_company_name: "Acme Corp",
    company_name: "Acme Corp",
    website: "https://acme.com",
    website_domain: "acme.com",
    contact_name: null,
    email: null,
    email_domain: null,
    linkedin_url: null,
    industry: null,
    country: null,
    status: "failed",
    qualification_level: null,
    qualification_score: null,
    duplicate_of_lead_id: null,
    source: "api",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeRun(overrides: Partial<LeadProcessingRun> = {}): LeadProcessingRun {
  return {
    id: "run-1",
    lead_id: "lead-1",
    status: "failed",
    current_stage: "enriching",
    attempt_count: 5,
    max_attempts: 5,
    locked_at: null,
    locked_by: null,
    lease_expires_at: null,
    next_attempt_at: new Date().toISOString(),
    failure_reason: "Tavily returned 500",
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function ctx(id = "lead-1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/leads/:id/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertProcessingEvent.mockResolvedValue({});
  });

  it("returns 404 when the lead does not exist", async () => {
    findLeadById.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost"), ctx("missing"));

    expect(response.status).toBe(404);
    expect(resetRunForRetry).not.toHaveBeenCalled();
  });

  it("returns 404 when the lead has no processing run", async () => {
    findLeadById.mockResolvedValue(makeLead());
    getLatestRunForLead.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost"), ctx());

    expect(response.status).toBe(404);
  });

  it("returns 409 when the run is not in a retryable state", async () => {
    findLeadById.mockResolvedValue(makeLead({ status: "completed" }));
    getLatestRunForLead.mockResolvedValue(makeRun({ status: "completed" }));

    const response = await POST(new Request("http://localhost"), ctx());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("not_retryable");
    expect(resetRunForRetry).not.toHaveBeenCalled();
  });

  it("resets a failed run to resume from its current stage", async () => {
    findLeadById.mockResolvedValue(makeLead({ status: "failed" }));
    const run = makeRun({ status: "failed", current_stage: "enriching" });
    getLatestRunForLead.mockResolvedValue(run);
    resetRunForRetry.mockResolvedValue(
      makeRun({ status: "enriching", current_stage: "enriching", attempt_count: 0, failure_reason: null }),
    );

    const response = await POST(new Request("http://localhost"), ctx());

    expect(response.status).toBe(200);
    expect(resetRunForRetry).toHaveBeenCalledWith({}, run);
    expect(updateLeadStatus).toHaveBeenCalledWith({}, "lead-1", "processing");
    const body = await response.json();
    expect(body.run.status).toBe("enriching");
    expect(body.lead.status).toBe("processing");

    const [, event] = insertProcessingEvent.mock.calls[0];
    // RUN_RETRIED predates the dot-notation worker events (Phase 2) and is
    // reused as-is by both the automatic and manual retry paths.
    expect(event.event_type).toBe("run_retried");
    expect(event.metadata).toMatchObject({ manual: true, resumed_stage: "enriching" });
  });

  it("allows retrying a blocked run", async () => {
    findLeadById.mockResolvedValue(makeLead({ status: "processing" }));
    getLatestRunForLead.mockResolvedValue(makeRun({ status: "blocked", current_stage: "enriching" }));
    resetRunForRetry.mockResolvedValue(makeRun({ status: "enriching", current_stage: "enriching" }));

    const response = await POST(new Request("http://localhost"), ctx());

    expect(response.status).toBe(200);
  });
});
