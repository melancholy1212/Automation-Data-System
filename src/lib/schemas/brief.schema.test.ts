import { describe, expect, it } from "vitest";

import { intelligenceBriefSchema } from "./brief.schema";

function validBrief(overrides: Record<string, unknown> = {}) {
  return {
    company_summary: "Acme is a widget maker.",
    what_they_do: "Makes widgets.",
    geography: null,
    target_market: null,
    qualification_summary: "Qualifies.",
    outreach_angle: "Widgets are great.",
    confidence: 0.8,
    facts: { known: [], inferred: [], unknown: [] },
    ...overrides,
  };
}

describe("intelligenceBriefSchema — geography/target_market", () => {
  it("accepts a plain string unchanged", () => {
    const result = intelligenceBriefSchema.safeParse(
      validBrief({ geography: "Egypt", target_market: "SMEs" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geography).toBe("Egypt");
      expect(result.data.target_market).toBe("SMEs");
    }
  });

  it("normalizes an array of strings into one comma-separated string — the shape a multi-country lead's model response actually returns", () => {
    const result = intelligenceBriefSchema.safeParse(
      validBrief({
        geography: ["Egypt", "Saudi Arabia (planned)", "Sudan (investment)"],
        target_market: ["B2C consumers", "B2B merchants"],
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geography).toBe("Egypt, Saudi Arabia (planned), Sudan (investment)");
      expect(result.data.target_market).toBe("B2C consumers, B2B merchants");
    }
  });

  it("accepts null for both fields", () => {
    const result = intelligenceBriefSchema.safeParse(
      validBrief({ geography: null, target_market: null }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.geography).toBeNull();
      expect(result.data.target_market).toBeNull();
    }
  });

  it("also normalizes what_they_do — a multi-line-of-business company risks the same array mismatch", () => {
    const result = intelligenceBriefSchema.safeParse(
      validBrief({ what_they_do: ["Payments processing", "Wallet SaaS", "Micro-finance"] }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.what_they_do).toBe("Payments processing, Wallet SaaS, Micro-finance");
    }
  });
});

describe("intelligenceBriefSchema — confidence scale", () => {
  it("passes a native 0-1 fraction through unchanged", () => {
    const result = intelligenceBriefSchema.safeParse(validBrief({ confidence: 0.92 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confidence).toBe(0.92);
  });

  it("normalizes a 0-100 percentage-scale answer down to a 0-1 fraction", () => {
    const result = intelligenceBriefSchema.safeParse(validBrief({ confidence: 92 }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.confidence).toBeCloseTo(0.92);
  });
});
