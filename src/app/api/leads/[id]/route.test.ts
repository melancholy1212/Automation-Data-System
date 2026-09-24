import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, LeadProcessingRun } from "@/lib/types/domain";

const findLeadById = vi.fn();
const getLatestRunForLead = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  getLatestRunForLead: (...args: unknown[]) => getLatestRunForLead(...args),
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
  });

  it("returns the lead and its latest processing run", async () => {
    const lead = makeLead();
    const run = { id: "run-1", lead_id: lead.id } as LeadProcessingRun;
    findLeadById.mockResolvedValue(lead);
    getLatestRunForLead.mockResolvedValue(run);

    const response = await GET(new Request("http://localhost/api/leads/lead-1"), {
      params: Promise.resolve({ id: "lead-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ lead, run });
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
