import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead, LeadClassification, LeadQualification } from "@/lib/types/domain";
import { createGeminiProvider } from "./gemini-provider";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function geminiResponse(text: string, status = 200): Response {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }),
    { status },
  );
}

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

const VALID_CLASSIFICATION = {
  company_type: "software_company",
  industry: "B2B SaaS",
  business_model: "subscription",
  geography: "United States",
  target_market: "mid-market",
  confidence: 0.7,
  reasoning: "The homepage describes a SaaS product for mid-market companies.",
  signals_used: ["evidence-1"],
};

describe("createGeminiProvider.classify", () => {
  it("returns a validated CompanyClassification on the first valid response", async () => {
    fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(VALID_CLASSIFICATION)));

    const provider = createGeminiProvider({ apiKey: "test-key" });
    const result = await provider.classify({
      lead: makeLead(),
      evidence: [{ id: "evidence-1", source_url: "https://acme.com", title: "Acme", snippet: "SaaS for teams", source_type: "website", relevance: "primary" }],
    });

    expect(result).toEqual(VALID_CLASSIFICATION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("repairs once when the first response fails validation, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(geminiResponse(JSON.stringify({ company_type: "not-a-real-type" })))
      .mockResolvedValueOnce(geminiResponse(JSON.stringify(VALID_CLASSIFICATION)));

    const provider = createGeminiProvider({ apiKey: "test-key" });
    const result = await provider.classify({ lead: makeLead(), evidence: [] });

    expect(result).toEqual(VALID_CLASSIFICATION);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a retryable ProviderError when the repair attempt also fails validation", async () => {
    fetchMock
      .mockResolvedValueOnce(geminiResponse("not json at all"))
      .mockResolvedValueOnce(geminiResponse("still not json"));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await expect(provider.classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      name: "ProviderError",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a non-retryable ProviderError on a 401", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

    const provider = createGeminiProvider({ apiKey: "bad-key" });

    await expect(provider.classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("throws a retryable ProviderError on a 500", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));

    const provider = createGeminiProvider({ apiKey: "test-key" });

    await expect(provider.classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("never includes anything beyond the lead and evidence in the prompt", async () => {
    fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(VALID_CLASSIFICATION)));

    await createGeminiProvider({ apiKey: "test-key" }).classify({
      lead: makeLead({ company_name: "Secret Corp" }),
      evidence: [{ id: "e1", source_url: "https://secretcorp.example", title: "t", snippet: "s", source_type: "website", relevance: "primary" }],
    });

    const [, init] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(init.body as string);
    const promptText = requestBody.contents[0].parts[0].text as string;
    expect(promptText).toContain("Secret Corp");
    expect(promptText).toContain("secretcorp.example");
    expect(promptText.toLowerCase()).not.toContain("research the company");
  });
});

describe("createGeminiProvider.qualify", () => {
  it("returns a validated AIQualificationSignal", async () => {
    const valid = {
      ai_score: 72,
      reasons: [{ factor: "ICP fit", contribution: 20, detail: "Matches target industry" }],
      opportunity_signals: ["recently expanded team"],
    };
    fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(valid)));

    const classification: LeadClassification = {
      id: "c1",
      lead_id: "lead-1",
      run_id: "run-1",
      category: "software_company",
      confidence: 0.7,
      reasoning: "SaaS product",
      signals_used: [],
      model: "gemini-3.5-flash",
      model_version: null,
      raw_output: {},
      created_at: new Date().toISOString(),
    };

    const result = await createGeminiProvider({ apiKey: "test-key" }).qualify({
      lead: makeLead(),
      evidence: [],
      classification,
    });

    expect(result).toEqual(valid);
  });
});

describe("createGeminiProvider.generateBrief", () => {
  it("returns a validated IntelligenceBrief", async () => {
    const valid = {
      company_summary: "Acme is a SaaS company.",
      what_they_do: "Provides workflow software.",
      products_services: ["Workflow platform"],
      geography: "United States",
      target_market: "Mid-market",
      signals: [],
      recent_developments: [],
      pain_points: [],
      automation_opportunities: [],
      qualification_summary: "Medium fit based on limited evidence.",
      key_evidence: [],
      risks_and_uncertainty: ["Limited public information"],
      outreach_angle: "Ask about workflow bottlenecks.",
      confidence: 0.5,
      facts: { known: ["Has a website"], inferred: [], unknown: ["Company size"] },
    };
    fetchMock.mockResolvedValue(geminiResponse(JSON.stringify(valid)));

    const classification: LeadClassification = {
      id: "c1",
      lead_id: "lead-1",
      run_id: "run-1",
      category: "software_company",
      confidence: 0.7,
      reasoning: "SaaS product",
      signals_used: [],
      model: "gemini-3.5-flash",
      model_version: null,
      raw_output: {},
      created_at: new Date().toISOString(),
    };
    const qualification: LeadQualification = {
      id: "q1",
      lead_id: "lead-1",
      run_id: "run-1",
      score: 60,
      level: "medium",
      deterministic_score: 50,
      ai_score: 72,
      evidence_confidence: 0.4,
      reasons: [],
      opportunity_signals: [],
      created_at: new Date().toISOString(),
    };

    const result = await createGeminiProvider({ apiKey: "test-key" }).generateBrief({
      lead: makeLead(),
      evidence: [],
      classification,
      qualification,
    });

    expect(result).toEqual(valid);
  });
});
