import { describe, expect, it } from "vitest";

import { companyClassificationSchema } from "./classification.schema";

function validClassification(overrides: Record<string, unknown> = {}) {
  return {
    company_type: "established_company",
    industry: "Payments",
    business_model: "Transaction fees",
    geography: "Egypt",
    target_market: "SMEs",
    confidence: 0.8,
    reasoning: "Solid evidence.",
    ...overrides,
  };
}

describe("companyClassificationSchema — geography/industry/business_model/target_market", () => {
  it("accepts plain strings unchanged", () => {
    const result = companyClassificationSchema.safeParse(validClassification());
    expect(result.success).toBe(true);
  });

  it("normalizes an array of strings into one comma-separated string", () => {
    const result = companyClassificationSchema.safeParse(
      validClassification({
        industry: ["Payments", "Micro-finance"],
        geography: ["Egypt", "Saudi Arabia (planned)"],
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.industry).toBe("Payments, Micro-finance");
      expect(result.data.geography).toBe("Egypt, Saudi Arabia (planned)");
    }
  });
});

describe("companyClassificationSchema — confidence", () => {
  it("passes a native 0-1 fraction through unchanged", () => {
    const result = companyClassificationSchema.safeParse(validClassification({ confidence: 0.93 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confidence).toBe(0.93);
  });

  it("normalizes a 0-100 percentage-scale answer down to a 0-1 fraction", () => {
    const result = companyClassificationSchema.safeParse(validClassification({ confidence: 93 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confidence).toBeCloseTo(0.93);
  });
});

describe("companyClassificationSchema — reasoning", () => {
  it("truncates an over-length reasoning string instead of rejecting it", () => {
    const result = companyClassificationSchema.safeParse(
      validClassification({ reasoning: "x".repeat(1000) }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.reasoning.length).toBe(800);
  });
});
