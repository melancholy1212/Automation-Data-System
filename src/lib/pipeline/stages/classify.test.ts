import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/lib/providers/errors";
import type { Lead, LeadClassification, LeadEvidence } from "@/lib/types/domain";

const findClassificationByRunId = vi.fn();
const insertClassificationOnce = vi.fn();
const listEvidenceForLead = vi.fn();
const classify = vi.fn();
const getAIProvider = vi.fn();
const getConfiguredModelName = vi.fn();

vi.mock("@/lib/db/ai-outputs.repository", () => ({
  findClassificationByRunId: (...args: unknown[]) => findClassificationByRunId(...args),
  insertClassificationOnce: (...args: unknown[]) => insertClassificationOnce(...args),
}));
vi.mock("@/lib/db/evidence.repository", () => ({
  listEvidenceForLead: (...args: unknown[]) => listEvidenceForLead(...args),
}));
vi.mock("@/lib/providers/ai", () => ({
  getAIProvider: (...args: unknown[]) => getAIProvider(...args),
  getConfiguredModelName: (...args: unknown[]) => getConfiguredModelName(...args),
}));

const { classifyStage } = await import("./classify");

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

function makeEvidence(): LeadEvidence {
  return {
    id: "e1",
    lead_id: "lead-1",
    run_id: "run-1",
    source_url: "https://acme.com",
    source_type: "search_result",
    provider: "tavily",
    idempotency_key: "https://acme.com",
    title: "Acme",
    snippet: "Acme builds workflow software.",
    extracted_data: null,
    relevance: "primary",
    collected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

const RUN = { id: "run-1" } as never;

describe("classifyStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredModelName.mockReturnValue("gemini-3.5-flash");
    insertClassificationOnce.mockImplementation(async (_db, insert) => ({
      id: "c1",
      ...insert,
    }) as LeadClassification);
  });

  it("skips the AI call when a classification already exists for this run (idempotent)", async () => {
    findClassificationByRunId.mockResolvedValue({ id: "c1" } as LeadClassification);

    const outcome = await classifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(getAIProvider).not.toHaveBeenCalled();
  });

  it("classifies as unknown without calling the AI when there is no evidence", async () => {
    findClassificationByRunId.mockResolvedValue(null);
    listEvidenceForLead.mockResolvedValue([]);

    const outcome = await classifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(getAIProvider).not.toHaveBeenCalled();
    expect(insertClassificationOnce).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ category: "unknown", confidence: 0 }),
    );
  });

  it("persists a valid AI classification", async () => {
    findClassificationByRunId.mockResolvedValue(null);
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    classify.mockResolvedValue({
      company_type: "software_company",
      industry: "SaaS",
      business_model: "subscription",
      geography: "US",
      target_market: "SMB",
      confidence: 0.8,
      reasoning: "Workflow software for teams.",
      signals_used: ["e1"],
    });
    getAIProvider.mockReturnValue({ classify });

    const outcome = await classifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(insertClassificationOnce).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ category: "software_company", confidence: 0.8 }),
    );
  });

  it("returns a retryable failure on a transient provider error", async () => {
    findClassificationByRunId.mockResolvedValue(null);
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    classify.mockRejectedValue(new ProviderError("Gemini returned 500", true));
    getAIProvider.mockReturnValue({ classify });

    const outcome = await classifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "failure", retryable: true, message: "Gemini returned 500" });
    expect(insertClassificationOnce).not.toHaveBeenCalled();
  });

  it("returns a non-retryable failure when the AI provider isn't configured", async () => {
    findClassificationByRunId.mockResolvedValue(null);
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    getAIProvider.mockImplementation(() => {
      throw new ProviderError("GEMINI_API_KEY is not configured", false);
    });

    const outcome = await classifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({
      kind: "failure",
      retryable: false,
      message: "GEMINI_API_KEY is not configured",
    });
  });
});
