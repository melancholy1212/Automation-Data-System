import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseError } from "@/lib/db/errors";
import type { Lead } from "@/lib/types/domain";

const ingestLead = vi.fn();
const listLeads = vi.fn();

vi.mock("@/lib/services/lead-ingestion.service", () => ({
  ingestLead: (...args: unknown[]) => ingestLead(...args),
}));
vi.mock("@/lib/db/leads.repository", () => ({
  listLeads: (...args: unknown[]) => listLeads(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { POST, GET } = await import("./route");

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

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 and the created lead on success", async () => {
    const lead = makeLead();
    ingestLead.mockResolvedValue({ outcome: "created", lead });

    const response = await POST(postRequest({ company_name: "Acme Corp", website: "acme.com" }));

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ lead });
  });

  it("returns 409 with the existing lead id for a duplicate domain", async () => {
    const existingLead = makeLead({ id: "lead-existing" });
    ingestLead.mockResolvedValue({ outcome: "duplicate", existingLead });

    const response = await POST(postRequest({ company_name: "Acme Corp", website: "acme.com" }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toEqual({
      duplicate: true,
      existing_lead_id: "lead-existing",
      existing_lead: existingLead,
    });
  });

  it("returns 400 with structured errors for a missing company_name", async () => {
    const response = await POST(postRequest({ website: "acme.com" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("validation_error");
    expect(ingestLead).not.toHaveBeenCalled();
  });

  it("returns 400 for an unparseable JSON body", async () => {
    const request = new NextRequest("http://localhost/api/leads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_json");
  });

  it("returns 500 when the database layer fails", async () => {
    ingestLead.mockRejectedValue(new DatabaseError("insert failed"));

    const response = await POST(postRequest({ company_name: "Acme Corp" }));

    expect(response.status).toBe(500);
    expect((await response.json()).error.code).toBe("database_error");
  });
});

describe("GET /api/leads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a paginated list of leads", async () => {
    const leads = [makeLead(), makeLead({ id: "lead-2" })];
    listLeads.mockResolvedValue({ leads, total: 2 });

    const response = await GET(new NextRequest("http://localhost/api/leads?limit=10&offset=0"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      leads,
      pagination: { limit: 10, offset: 0, total: 2 },
    });
  });

  it("passes status/industry/country filters through to the repository", async () => {
    listLeads.mockResolvedValue({ leads: [], total: 0 });

    await GET(
      new NextRequest(
        "http://localhost/api/leads?status=pending&industry=Manufacturing&country=US",
      ),
    );

    expect(listLeads).toHaveBeenCalledWith(
      {},
      { status: "pending", industry: "Manufacturing", country: "US", qualification_level: undefined },
      { limit: 25, offset: 0 },
    );
  });

  it("rejects an unknown status filter", async () => {
    const response = await GET(new NextRequest("http://localhost/api/leads?status=bogus"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_filter");
  });
});
