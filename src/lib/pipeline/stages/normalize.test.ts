import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types/domain";
import { normalizeStage } from "./normalize";

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

describe("normalizeStage", () => {
  it("succeeds when there is no website", async () => {
    const outcome = await normalizeStage.execute({ lead: makeLead(), db: {} as never, run: {} as never });
    expect(outcome).toEqual({ kind: "success" });
  });

  it("succeeds when website and website_domain are both set", async () => {
    const lead = makeLead({ website: "https://acme.com", website_domain: "acme.com" });
    const outcome = await normalizeStage.execute({ lead, db: {} as never, run: {} as never });
    expect(outcome).toEqual({ kind: "success" });
  });

  it("returns invalid when website is set but website_domain is missing", async () => {
    const lead = makeLead({ website: "https://acme.com", website_domain: null });
    const outcome = await normalizeStage.execute({ lead, db: {} as never, run: {} as never });
    expect(outcome.kind).toBe("invalid");
  });
});
