import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, ProcessingEvent } from "@/lib/types/domain";

const findLeadById = vi.fn();
const listEventsForLead = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findLeadById: (...args: unknown[]) => findLeadById(...args),
  listEventsForLead: (...args: unknown[]) => listEventsForLead(...args),
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

describe("GET /api/leads/:id/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the lead's events in chronological order", async () => {
    findLeadById.mockResolvedValue(makeLead());
    const events = [
      { id: "e1", lead_id: "lead-1", run_id: null, event_type: "lead_imported", metadata: {}, created_at: "t1" },
    ] as ProcessingEvent[];
    listEventsForLead.mockResolvedValue(events);

    const response = await GET(new Request("http://localhost/api/leads/lead-1/events"), {
      params: Promise.resolve({ id: "lead-1" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ events });
  });

  it("returns 404 when the lead does not exist", async () => {
    findLeadById.mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/leads/missing/events"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    expect(listEventsForLead).not.toHaveBeenCalled();
  });
});
