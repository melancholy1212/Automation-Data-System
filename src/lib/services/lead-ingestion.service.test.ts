import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DbClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/types/domain";

const findLeadByWebsiteDomain = vi.fn();
const insertLead = vi.fn();
const insertProcessingRun = vi.fn();
const insertProcessingEvent = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  findLeadByWebsiteDomain: (...args: unknown[]) => findLeadByWebsiteDomain(...args),
  insertLead: (...args: unknown[]) => insertLead(...args),
  insertProcessingRun: (...args: unknown[]) => insertProcessingRun(...args),
  insertProcessingEvent: (...args: unknown[]) => insertProcessingEvent(...args),
}));

const { ingestLead } = await import("./lead-ingestion.service");

const fakeDb = {} as DbClient;

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

describe("ingestLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a lead, its processing run, and a lead_imported event when the domain is new", async () => {
    findLeadByWebsiteDomain.mockResolvedValue(null);
    const lead = makeLead();
    insertLead.mockResolvedValue({ outcome: "inserted", lead });
    insertProcessingRun.mockResolvedValue({ id: "run-1" });
    insertProcessingEvent.mockResolvedValue({ id: "event-1" });

    const result = await ingestLead(fakeDb, { company_name: "Acme Corp", website: "acme.com" });

    expect(result).toEqual({ outcome: "created", lead });
    expect(insertLead).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ company_name: "Acme Corp", website_domain: "acme.com" }),
    );
    expect(insertProcessingRun).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ lead_id: lead.id, status: "pending", current_stage: "validating" }),
    );
    expect(insertProcessingEvent).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ lead_id: lead.id, event_type: "lead_imported" }),
    );
  });

  it("short-circuits into a duplicate result without inserting when the domain already exists", async () => {
    const existing = makeLead({ id: "lead-existing" });
    findLeadByWebsiteDomain.mockResolvedValue(existing);

    const result = await ingestLead(fakeDb, { company_name: "Acme Corp", website: "acme.com" });

    expect(result).toEqual({ outcome: "duplicate", existingLead: existing });
    expect(insertLead).not.toHaveBeenCalled();
    expect(insertProcessingRun).not.toHaveBeenCalled();
  });

  it("falls back to a duplicate result when insert loses a race on the unique index", async () => {
    findLeadByWebsiteDomain.mockResolvedValueOnce(null);
    insertLead.mockResolvedValue({ outcome: "conflict" });
    const existing = makeLead({ id: "lead-existing" });
    findLeadByWebsiteDomain.mockResolvedValueOnce(existing);

    const result = await ingestLead(fakeDb, { company_name: "Acme Corp", website: "acme.com" });

    expect(result).toEqual({ outcome: "duplicate", existingLead: existing });
    expect(insertProcessingRun).not.toHaveBeenCalled();
  });

  it("creates a lead with no website when none is provided", async () => {
    const lead = makeLead({ website: null, website_domain: null });
    insertLead.mockResolvedValue({ outcome: "inserted", lead });

    const result = await ingestLead(fakeDb, { company_name: "Acme Corp" });

    expect(findLeadByWebsiteDomain).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: "created", lead });
    expect(insertLead).toHaveBeenCalledWith(
      fakeDb,
      expect.objectContaining({ website: null, website_domain: null }),
    );
  });

  it("does not auto-merge on company-name similarity alone: two similar names, different domains, both create", async () => {
    findLeadByWebsiteDomain.mockResolvedValue(null);
    const leadA = makeLead({ id: "lead-a", company_name: "Acme Corp", website_domain: "acme.com" });
    const leadB = makeLead({
      id: "lead-b",
      company_name: "Acme Corporation",
      website_domain: "acme-corporation.com",
    });
    insertLead.mockResolvedValueOnce({ outcome: "inserted", lead: leadA });
    insertLead.mockResolvedValueOnce({ outcome: "inserted", lead: leadB });

    const resultA = await ingestLead(fakeDb, { company_name: "Acme Corp", website: "acme.com" });
    const resultB = await ingestLead(fakeDb, {
      company_name: "Acme Corporation",
      website: "acme-corporation.com",
    });

    expect(resultA).toEqual({ outcome: "created", lead: leadA });
    expect(resultB).toEqual({ outcome: "created", lead: leadB });
    expect(insertLead).toHaveBeenCalledTimes(2);
  });
});
