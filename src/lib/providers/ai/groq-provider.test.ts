import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Lead } from "@/lib/types/domain";
import { createGroqProvider } from "./groq-provider";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function groqResponse(text: string, status = 200): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: text } }] }), { status });
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

describe("createGroqProvider.classify", () => {
  it("returns a validated CompanyClassification on the first valid response", async () => {
    fetchMock.mockResolvedValue(groqResponse(JSON.stringify(VALID_CLASSIFICATION)));

    const result = await createGroqProvider({ apiKey: "test-key" }).classify({
      lead: makeLead(),
      evidence: [{ id: "evidence-1", source_url: "https://acme.com", title: "Acme", snippet: "SaaS for teams", source_type: "website", relevance: "primary" }],
    });

    expect(result).toEqual(VALID_CLASSIFICATION);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("repairs once when the first response fails validation, then succeeds", async () => {
    fetchMock
      .mockResolvedValueOnce(groqResponse(JSON.stringify({ company_type: "not-a-real-type" })))
      .mockResolvedValueOnce(groqResponse(JSON.stringify(VALID_CLASSIFICATION)));

    const result = await createGroqProvider({ apiKey: "test-key" }).classify({ lead: makeLead(), evidence: [] });

    expect(result).toEqual(VALID_CLASSIFICATION);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a retryable ProviderError when the repair attempt also fails validation", async () => {
    fetchMock
      .mockResolvedValueOnce(groqResponse("not json at all"))
      .mockResolvedValueOnce(groqResponse("still not json"));

    await expect(createGroqProvider({ apiKey: "test-key" }).classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      name: "ProviderError",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a non-retryable ProviderError on a 401", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));

    await expect(createGroqProvider({ apiKey: "bad-key" }).classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      retryable: false,
    });
  });

  it("throws a retryable ProviderError on a 429", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));

    await expect(createGroqProvider({ apiKey: "test-key" }).classify({ lead: makeLead(), evidence: [] })).rejects.toMatchObject({
      retryable: true,
    });
  });

  it("caps completion length so a rich lead can't produce an unbounded response", async () => {
    fetchMock.mockResolvedValue(groqResponse(JSON.stringify(VALID_CLASSIFICATION)));

    await createGroqProvider({ apiKey: "test-key" }).classify({ lead: makeLead(), evidence: [] });

    const [, init] = fetchMock.mock.calls[0];
    const requestBody = JSON.parse(init.body as string);
    expect(requestBody.max_tokens).toBeGreaterThan(0);
  });

  it("truncates a CJK-script snippet far shorter than a same-length Latin-script one — found live on a real Japanese company whose classify prompt kept exceeding Groq's rate limit", async () => {
    fetchMock.mockResolvedValue(groqResponse(JSON.stringify(VALID_CLASSIFICATION)));

    const latinSnippet = "a".repeat(1000);
    const japaneseSnippet = "楽".repeat(1000);

    await createGroqProvider({ apiKey: "test-key" }).classify({
      lead: makeLead(),
      evidence: [{ id: "e1", source_url: "https://acme.com", title: "t", snippet: latinSnippet, source_type: "website", relevance: "primary" }],
    });
    const latinPrompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content as string;

    fetchMock.mockClear();
    fetchMock.mockResolvedValue(groqResponse(JSON.stringify(VALID_CLASSIFICATION)));
    await createGroqProvider({ apiKey: "test-key" }).classify({
      lead: makeLead(),
      evidence: [{ id: "e1", source_url: "https://rakuten.co.jp", title: "t", snippet: japaneseSnippet, source_type: "website", relevance: "primary" }],
    });
    const japanesePrompt = JSON.parse(fetchMock.mock.calls[0][1].body as string).messages[0].content as string;

    const latinKept = (latinPrompt.match(/a+/g) ?? [""]).sort((a: string, b: string) => b.length - a.length)[0].length;
    const japaneseKept = (japanesePrompt.match(/楽+/g) ?? [""]).sort((a: string, b: string) => b.length - a.length)[0].length;
    expect(latinKept).toBeLessThan(1000);
    expect(japaneseKept).toBeLessThan(latinKept);
  });
});
