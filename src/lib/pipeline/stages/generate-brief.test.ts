import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderError } from "@/lib/providers/errors";
import type {
  Lead,
  LeadClassification,
  LeadEvidence,
  LeadIntelligenceBrief,
  LeadQualification,
} from "@/lib/types/domain";

const findBriefByRunId = vi.fn();
const findClassificationByRunId = vi.fn();
const findQualificationByRunId = vi.fn();
const insertBriefOnce = vi.fn();
const listEvidenceForLead = vi.fn();
const generateBrief = vi.fn();
const getAIProvider = vi.fn();
const getConfiguredModelName = vi.fn();

vi.mock("@/lib/db/ai-outputs.repository", () => ({
  findBriefByRunId: (...args: unknown[]) => findBriefByRunId(...args),
  findClassificationByRunId: (...args: unknown[]) => findClassificationByRunId(...args),
  findQualificationByRunId: (...args: unknown[]) => findQualificationByRunId(...args),
  insertBriefOnce: (...args: unknown[]) => insertBriefOnce(...args),
}));
vi.mock("@/lib/db/evidence.repository", () => ({
  listEvidenceForLead: (...args: unknown[]) => listEvidenceForLead(...args),
}));
vi.mock("@/lib/providers/ai", () => ({
  getAIProvider: (...args: unknown[]) => getAIProvider(...args),
  getConfiguredModelName: (...args: unknown[]) => getConfiguredModelName(...args),
}));

const { generateBriefStage } = await import("./generate-brief");

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

const CLASSIFICATION = {
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
} satisfies LeadClassification;

const QUALIFICATION = {
  id: "q1",
  lead_id: "lead-1",
  run_id: "run-1",
  score: 60,
  level: "medium",
  deterministic_score: 50,
  ai_score: 70,
  evidence_confidence: 0.5,
  reasons: [],
  opportunity_signals: [],
  created_at: new Date().toISOString(),
} satisfies LeadQualification;

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
    snippet: "s",
    extracted_data: null,
    relevance: "primary",
    collected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

const RUN = { id: "run-1" } as never;

const VALID_BRIEF = {
  company_summary: "Acme is a SaaS company.",
  what_they_do: "Workflow software.",
  products_services: ["Workflow platform"],
  geography: "US",
  target_market: "SMB",
  signals: [],
  recent_developments: [],
  pain_points: [],
  automation_opportunities: [],
  qualification_summary: "Medium fit.",
  key_evidence: [],
  risks_and_uncertainty: [],
  outreach_angle: "Ask about workflow bottlenecks.",
  confidence: 0.6,
  facts: { known: ["Has a website"], inferred: [], unknown: [] },
};

describe("generateBriefStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredModelName.mockReturnValue("gemini-3.5-flash");
    insertBriefOnce.mockImplementation(async (_db, insert) => ({
      id: "b1",
      ...insert,
    }) as LeadIntelligenceBrief);
  });

  it("skips work when a brief already exists for this run (idempotent)", async () => {
    findBriefByRunId.mockResolvedValue({ id: "b1" } as LeadIntelligenceBrief);

    const outcome = await generateBriefStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(findClassificationByRunId).not.toHaveBeenCalled();
  });

  it("fails (non-retryable) when classification or qualification is missing", async () => {
    findBriefByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(null);
    findQualificationByRunId.mockResolvedValue(QUALIFICATION);

    const outcome = await generateBriefStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toMatchObject({ kind: "failure", retryable: false });
  });

  it("produces a deterministic insufficient-evidence brief without calling the AI when there is no evidence", async () => {
    findBriefByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(CLASSIFICATION);
    findQualificationByRunId.mockResolvedValue(QUALIFICATION);
    listEvidenceForLead.mockResolvedValue([]);

    const outcome = await generateBriefStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    expect(getAIProvider).not.toHaveBeenCalled();
    const [, insert] = insertBriefOnce.mock.calls[0];
    expect(insert.model).toBe("none");
    expect(insert.confidence).toBe(0);
    expect(insert.raw_output.facts.unknown.length).toBeGreaterThan(0);
  });

  it("persists a valid AI-generated brief, preserving the known/inferred/unknown split", async () => {
    findBriefByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(CLASSIFICATION);
    findQualificationByRunId.mockResolvedValue(QUALIFICATION);
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    generateBrief.mockResolvedValue(VALID_BRIEF);
    getAIProvider.mockReturnValue({ generateBrief });

    const outcome = await generateBriefStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "success" });
    const [, insert] = insertBriefOnce.mock.calls[0];
    expect(insert.company_summary).toBe(VALID_BRIEF.company_summary);
    expect(insert.raw_output.facts).toEqual(VALID_BRIEF.facts);
    expect(insert.model).toBe("gemini-3.5-flash");
  });

  it("returns a retryable failure on a transient AI provider error", async () => {
    findBriefByRunId.mockResolvedValue(null);
    findClassificationByRunId.mockResolvedValue(CLASSIFICATION);
    findQualificationByRunId.mockResolvedValue(QUALIFICATION);
    listEvidenceForLead.mockResolvedValue([makeEvidence()]);
    generateBrief.mockRejectedValue(new ProviderError("Gemini timed out", true));
    getAIProvider.mockReturnValue({ generateBrief });

    const outcome = await generateBriefStage.execute({ db: {} as never, lead: makeLead(), run: RUN });

    expect(outcome).toEqual({ kind: "failure", retryable: true, message: "Gemini timed out" });
    expect(insertBriefOnce).not.toHaveBeenCalled();
  });
});
