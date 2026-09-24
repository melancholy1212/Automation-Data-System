import { describe, expect, it } from "vitest";

import type { Lead, LeadClassification, LeadEvidence } from "@/lib/types/domain";
import { combineQualification, computeDeterministicScore, computeEvidenceConfidence } from "./scoring";

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

function makeClassification(overrides: Partial<LeadClassification> = {}): LeadClassification {
  return {
    id: "c1",
    lead_id: "lead-1",
    run_id: "run-1",
    category: "unknown",
    confidence: 0,
    reasoning: "",
    signals_used: [],
    model: "gemini-3.5-flash",
    model_version: null,
    raw_output: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeEvidence(relevance: LeadEvidence["relevance"]): LeadEvidence {
  return {
    id: crypto.randomUUID(),
    lead_id: "lead-1",
    run_id: "run-1",
    source_url: "https://acme.com",
    source_type: "website",
    provider: "tavily",
    idempotency_key: "https://acme.com",
    title: "Acme",
    snippet: "Acme makes widgets",
    extracted_data: null,
    relevance,
    collected_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
}

describe("computeDeterministicScore", () => {
  it("gives a bare lead with no data none of the optional factors", () => {
    const result = computeDeterministicScore({
      lead: makeLead(),
      classification: makeClassification(),
      evidenceCount: 0,
    });
    expect(result.score).toBe(0);
    expect(result.factors).toEqual([]);
  });

  it("accumulates a factor per real, present signal — never fabricated", () => {
    const result = computeDeterministicScore({
      lead: makeLead({ website_domain: "acme.com", email: "jane@acme.com", industry: "SaaS", country: "US" }),
      classification: makeClassification({ category: "software_company", confidence: 0.8 }),
      evidenceCount: 4,
    });

    const names = result.factors.map((f) => f.factor).sort();
    expect(names).toEqual(
      [
        "has_website",
        "contactable",
        "industry_provided",
        "country_provided",
        "evidence_present",
        "evidence_rich",
        "company_type_known",
        "classification_confident",
      ].sort(),
    );
    expect(result.score).toBe(100);
  });

  it("caps the total at 100", () => {
    const result = computeDeterministicScore({
      lead: makeLead({
        website_domain: "acme.com",
        contact_name: "Jane",
        email: "jane@acme.com",
        industry: "SaaS",
        country: "US",
      }),
      classification: makeClassification({ category: "software_company", confidence: 0.9 }),
      evidenceCount: 10,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("does not award company_type_known for an unknown classification", () => {
    const result = computeDeterministicScore({
      lead: makeLead(),
      classification: makeClassification({ category: "unknown" }),
      evidenceCount: 0,
    });
    expect(result.factors.some((f) => f.factor === "company_type_known")).toBe(false);
  });
});

describe("computeEvidenceConfidence", () => {
  it("is zero with no evidence", () => {
    expect(computeEvidenceConfidence([]).confidence).toBe(0);
  });

  it("weighs primary evidence more than contextual", () => {
    const primaryOnly = computeEvidenceConfidence([makeEvidence("primary")]);
    const contextualOnly = computeEvidenceConfidence([makeEvidence("contextual")]);
    expect(primaryOnly.confidence).toBeGreaterThan(contextualOnly.confidence);
  });

  it("caps at 1 with abundant evidence", () => {
    const many = Array.from({ length: 10 }, () => makeEvidence("primary"));
    expect(computeEvidenceConfidence(many).confidence).toBe(1);
  });
});

describe("combineQualification", () => {
  it("weights deterministic 40% / ai 40% / evidence confidence 20%", () => {
    const result = combineQualification(100, 100, 1);
    expect(result.score).toBe(100);
    expect(result.level).toBe("high");
  });

  it("produces 0/unqualified when every component is zero", () => {
    const result = combineQualification(0, 0, 0);
    expect(result.score).toBe(0);
    expect(result.level).toBe("unqualified");
  });

  it("buckets scores into the documented level thresholds", () => {
    expect(combineQualification(20, 20, 0.2).level).toBe("unqualified"); // ~20
    expect(combineQualification(50, 50, 0.5).level).toBe("low"); // 50
    expect(combineQualification(75, 75, 0.75).level).toBe("medium"); // 75
    expect(combineQualification(95, 95, 0.95).level).toBe("high"); // 95
  });

  it("never returns a score outside 0-100", () => {
    expect(combineQualification(100, 100, 1).score).toBeLessThanOrEqual(100);
    expect(combineQualification(0, 0, 0).score).toBeGreaterThanOrEqual(0);
  });
});
