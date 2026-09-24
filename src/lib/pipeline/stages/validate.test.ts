import { describe, expect, it } from "vitest";

import type { Lead } from "@/lib/types/domain";
import { validateStage } from "./validate";

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

describe("validateStage", () => {
  it("succeeds for a lead with a non-blank company name", async () => {
    // db/run are unused by this stage.
    const outcome = await validateStage.execute({ lead: makeLead(), db: {} as never, run: {} as never });
    expect(outcome).toEqual({ kind: "success" });
  });

  it("returns invalid for a blank company name", async () => {
    const outcome = await validateStage.execute({
      lead: makeLead({ company_name: "   " }),
      db: {} as never,
      run: {} as never,
    });
    expect(outcome.kind).toBe("invalid");
  });
});
