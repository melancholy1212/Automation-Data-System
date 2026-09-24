import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/lib/providers/errors";
import type { Lead } from "@/lib/types/domain";

const countEvidenceForLead = vi.fn();
const insertEvidenceIfNew = vi.fn();
const search = vi.fn();
const getSearchProvider = vi.fn();

vi.mock("@/lib/db/evidence.repository", () => ({
  countEvidenceForLead: (...args: unknown[]) => countEvidenceForLead(...args),
  insertEvidenceIfNew: (...args: unknown[]) => insertEvidenceIfNew(...args),
}));
vi.mock("@/lib/providers/search", () => ({
  getSearchProvider: (...args: unknown[]) => getSearchProvider(...args),
}));

const { enrichStage } = await import("./enrich");

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

const RUN = { id: "run-1" } as never;

describe("enrichStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSearchProvider.mockReturnValue({ name: "tavily", search });
    insertEvidenceIfNew.mockImplementation(async (_db, insert) => ({
      inserted: true,
      evidence: { id: crypto.randomUUID(), ...insert },
    }));
  });

  it("collects and persists evidence from a successful search", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search.mockResolvedValue([
      { url: "https://acme.com/about", title: "About Acme", snippet: "Acme makes widgets", publishedAt: null },
    ]);

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(insertEvidenceIfNew).toHaveBeenCalled();
  });

  it("skips searching entirely when enough evidence already exists (idempotent reuse)", async () => {
    countEvidenceForLead.mockResolvedValue(5);

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(getSearchProvider).not.toHaveBeenCalled();
    expect(insertEvidenceIfNew).not.toHaveBeenCalled();
  });

  it("bounds the number of search calls to at most 3 queries", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search.mockResolvedValue([]);

    await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(search.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it("succeeds with zero evidence when search returns nothing (not a failure)", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search.mockResolvedValue([]);

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(insertEvidenceIfNew).not.toHaveBeenCalled();
  });

  it("deduplicates the same URL discovered by more than one query within one attempt", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search.mockResolvedValue([
      { url: "https://acme.com/about", title: "About", snippet: "s", publishedAt: null },
    ]);

    await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    // 3 queries each return the same URL; insertEvidenceIfNew should only be
    // asked about it once per attempt (the loop's in-memory de-dup), and the
    // unique(lead_id, idempotency_key) constraint is the second line of
    // defense for cross-attempt duplicates.
    const urls = insertEvidenceIfNew.mock.calls.map(([, insert]) => insert.idempotency_key);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("returns a retryable failure on a transient provider error", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search.mockRejectedValue(new ProviderError("Tavily returned 503", true));

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "failure", retryable: true, message: "Tavily returned 503" });
  });

  it("returns a non-retryable failure when the provider isn't configured", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    getSearchProvider.mockImplementation(() => {
      throw new ProviderError("TAVILY_API_KEY is not configured", false);
    });

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({
      kind: "failure",
      retryable: false,
      message: "TAVILY_API_KEY is not configured",
    });
  });

  it("keeps evidence already collected this attempt when a later query fails", async () => {
    countEvidenceForLead.mockResolvedValue(0);
    search
      .mockResolvedValueOnce([{ url: "https://acme.com/1", title: "t", snippet: "s", publishedAt: null }])
      .mockRejectedValueOnce(new ProviderError("Tavily returned 503", true));

    const outcome = await enrichStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(insertEvidenceIfNew).toHaveBeenCalledTimes(1);
  });
});
