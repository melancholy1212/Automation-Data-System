import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/lib/providers/errors";
import type { Lead, LeadClassification, LeadEvidence, LeadQualification } from "@/lib/types/domain";

const findClassificationByRunId = vi.fn();
const findQualificationByRunId = vi.fn();
const insertQualificationOnce = vi.fn();
const updateLeadQualificationSummary = vi.fn();
const listEvidenceForLead = vi.fn();
const qualify = vi.fn();
const getAIProvider = vi.fn();

vi.mock("@/lib/db/ai-outputs.repository", () => ({
  findClassificationByRunId: (...args: unknown[]) => findClassificationByRunId(...args),
  findQualificationByRunId: (...args: unknown[]) => findQualificationByRunId(...args),
  insertQualificationOnce: (...args: unknown[]) => insertQualificationOnce(...args),
  updateLeadQualificationSummary: (...args: unknown[]) => updateLeadQualificationSummary(...args),
}));
vi.mock("@/lib/db/evidence.repository", () => ({
  listEvidenceForLead: (...args: unknown[]) => listEvidenceForLead(...args),
}));
vi.mock("@/lib/providers/ai", () => ({
  getAIProvider: (...args: unknown[]) => getAIProvider(...args),
}));

const { qualifyStage } = await import("./qualify");

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    raw_company_name: "Acme Corp",
    company_name: "Acme Corp",
    website: "https://acme.com",
    website_domain: "acme.com",
    contact_name: "Jane",
    email: "jane@acme.com",
    email_domain: "acme.com",
    linkedin_url: null,
    industry: "SaaS",
    country: "US",
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

function makeClassification(overrides: Partial<LeadClassification> = {}): LeadClassification {
  return {
    id: "c1",
    lead_id: "lead-1",
    run_id: "run-1",
    category: "software_company",
    confidence: 0.8,
    reasoning: "SaaS product",
    signals_used: [],
    model: "gemini-3.5-flash",
    model_version: null,
    raw_output: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(relevance: LeadEvidence["relevance"] = "primary"): LeadEvidence {
  return {
    id: crypto.randomUUID(),
    lead_id: "lead-1",
    run_id: "run-1",
    source_url: "https://acme.com",
    source_type: "search_result",
    provider: "tavily",
    idempotency_key: crypto.randomUUID(),
    title: "Acme",
    snippet: "s",
    extracted_data: null,
    relevance,
    collected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

const RUN = { id: "run-1" } as never;

describe("qualifyStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertQualificationOnce.mockImplementation(async (_db, insert) => ({
      id: "q1",
      ...insert,
    }) as LeadQualification);
  });

  it("skips work when a qualification already exists for this run (idempotent)", async () => {
    findQualificationByRunId.mockResolvedValue({ id: "q1" } as LeadQualification);

    const outcome = await qualifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(findClassificationByRunId).not.toHaveBeenCalled();
  });

  it("fails (non-retryable) when no classification exists for this run", async () => {
    findQualificationByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(null);

    const outcome = await qualifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({
      kind: "failure",
      retryable: false,
      message: "No classification found for this run",
    });
  });

  it("skips the AI call and scores ai_score 0 when there is no evidence", async () => {
    findQualificationByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(makeClassification());
    listEvidenceForLead.mockResolvedValue([]);

    const outcome = await qualifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(getAIProvider).not.toHaveBeenCalled();
    const [, insert] = insertQualificationOnce.mock.calls[0];
    expect(insert.ai_score).toBe(0);
    expect(insert.evidence_confidence).toBe(0);
  });

  it("combines deterministic, AI, and evidence-confidence components into the final score and persists all of them", async () => {
    findQualificationByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(makeClassification());
    listEvidenceForLead.mockResolvedValue([makeEvidence("primary"), makeEvidence("primary")]);
    qualify.mockResolvedValue({
      ai_score: 80,
      reasons: [{ factor: "ICP fit", contribution: 20, detail: "Matches target profile" }],
      opportunity_signals: ["hiring for growth roles"],
    });
    getAIProvider.mockReturnValue({ qualify });

    const outcome = await qualifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    const [, insert] = insertQualificationOnce.mock.calls[0];
    expect(insert.ai_score).toBe(80);
    expect(insert.deterministic_score).toBeGreaterThan(0);
    expect(insert.evidence_confidence).toBeGreaterThan(0);
    expect(insert.score).toBe(
      Math.round(insert.deterministic_score * 0.4 + 80 * 0.4 + insert.evidence_confidence * 100 * 0.2),
    );

    const sources = insert.reasons.map((r: { source: string }) => r.source);
    expect(sources).toContain("deterministic");
    expect(sources).toContain("ai");
    expect(sources).toContain("evidence");
    expect(updateLeadQualificationSummary).toHaveBeenCalledWith({}, "lead-1", insert.score, insert.level);
  });

  it("returns a retryable failure on a transient AI provider error", async () => {
    findQualificationByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(makeClassification());
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    qualify.mockRejectedValue(new ProviderError("Gemini returned 500", true));
    getAIProvider.mockReturnValue({ qualify });

    const outcome = await qualifyStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "failure", retryable: true, message: "Gemini returned 500" });
    expect(insertQualificationOnce).not.toHaveBeenCalled();
  });
});
