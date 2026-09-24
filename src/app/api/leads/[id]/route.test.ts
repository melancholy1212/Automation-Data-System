import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, LeadProcessingRun } from "@/lib/types/domain";

const findLeadById = vi.fn();
const getLatestRunForLead = vi.fn();
const listEvidenceForLead = vi.fn();
const findClassificationByRunId = vi.fn();
const findQualificationByRunId = vi.fn();
const findBriefByRunId = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  getLatestRunForLead: (...args: unknown[]) => getLatestRunForLead(...args),
}));
vi.mock("@/lib/db/evidence.repository", () => ({
  listEvidenceForLead: (...args: unknown[]) => listEvidenceForLead(...args),
}));
vi.mock("@/lib/db/ai-outputs.repository", () => ({
  findClassificationByRunId: (...args: unknown[]) => findClassificationByRunId(...args),
  findQualificationByRunId: (...args: unknown[]) => findQualificationByRunId(...args),
  findBriefByRunId: (...args: unknown[]) => findBriefByRunId(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { GET } = await import("./route");

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

describe("GET /api/leads/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listEvidenceForLead.mockResolvedValue([]);
  });

  it("returns the lead, run, evidence, classification, qualification, and brief", async () => {
    const lead = makeLead();
    const run = { id: "run-1", lead_id: lead.id } as LeadProcessingRun;
    findLeadById.mockResolvedValue(lead);
    getLatestRunForLead.mockResolvedValue(run);
    listEvidenceForLead.mockResolvedValue([{ id: "e1" }]);
    findClassificationByRunId.mockResolvedValue({ id: "c1" });
    findQualificationByRunId.mockResolvedValue({ id: "q1" });
    findBriefByRunId.mockResolvedValue({ id: "b1" });

    const response = await GET(new Request("http://localhost/api/leads/lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      lead,
      run,
      evidence: [{ id: "e1" }],
      classification: { id: "c1" },
      qualification: { id: "q1" },
      brief: { id: "b1" },
    });
    expect(findClassificationByRunId).toHaveBeenCalledWith({}, "run-1");
  });

  it("returns null classification/qualification/brief when there is no run yet", async () => {
    findLeadById.mockResolvedValue(makeLead());
    getLatestRunForLead.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/leads/lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });

    const body = await response.json();
    expect(body.run).toBeNull();
    expect(body.classification).toBeNull();
    expect(body.qualification).toBeNull();
    expect(body.brief).toBeNull();
    expect(findClassificationByRunId).not.toHaveBeenCalled();
  });

  it("returns 404 when the lead does not exist", async () => {
    findLeadById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/leads/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(getLatestRunForLead).not.toHaveBeenCalled();
  });
});
