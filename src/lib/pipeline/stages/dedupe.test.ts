import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead } from "@/lib/types/domain";

const findOtherLeadWithDomain = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findOtherLeadWithDomain: (...args: unknown[]) => findOtherLeadWithDomain(...args),
}));

const { dedupeStage } = await import("./dedupe");

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

describe("dedupeStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("succeeds immediately when the lead has no website", async () => {
    const outcome = await dedupeStage.execute({
      lead: makeLead({ website: null, website_domain: null }),
      db: {} as never,
      run: {} as never,
    });
    expect(outcome).toEqual({ kind: "success" });
    expect(findOtherLeadWithDomain).not.toHaveBeenCalled();
  });

  it("succeeds when no other lead shares the domain", async () => {
    findOtherLeadWithDomain.mockResolvedValue(null);
    const outcome = await dedupeStage.execute({ lead: makeLead(), db: {} as never, run: {} as never });
    expect(outcome).toEqual({ kind: "success" });
  });

  it("returns duplicate with the existing lead id when another lead shares the domain", async () => {
    findOtherLeadWithDomain.mockResolvedValue(makeLead({ id: "lead-existing" }));
    const outcome = await dedupeStage.execute({ lead: makeLead(), db: {} as never, run: {} as never });
    expect(outcome).toEqual({ kind: "duplicate", existingLeadId: "lead-existing" });
  });
});
