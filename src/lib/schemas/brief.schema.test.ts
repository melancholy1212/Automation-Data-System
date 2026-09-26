import { describe, expect, it } from "vitest";

import { intelligenceBriefSchema } from "./brief.schema";

function validBrief(overrides: Record<string, unknown> = {}) {
  return {
    company_summary: "Acme is a widget maker.",
    what_they_do: "Makes widgets.",
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
});
