import { describe, expect, it } from "vitest";

import { aiQualificationSignalSchema } from "./qualification.schema";

describe("aiQualificationSignalSchema — ai_score scale", () => {
  it("passes a native 0-100 integer through unchanged", () => {
    const result = aiQualificationSignalSchema.safeParse({ ai_score: 85 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ai_score).toBe(85);
  });

  it("normalizes a 0-1 fraction-scale answer up to 0-100", () => {
    const result = aiQualificationSignalSchema.safeParse({ ai_score: 0.85 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ai_score).toBe(85);
  });

  it("rounds a non-integer 0-100 answer", () => {
    const result = aiQualificationSignalSchema.safeParse({ ai_score: 72.4 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ai_score).toBe(72);
  });

  it("does not confuse a genuine low integer score (1) with a 0-1 fraction meaning 100", () => {
    const result = aiQualificationSignalSchema.safeParse({ ai_score: 1 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ai_score).toBe(1);
  });

  it("clamps an out-of-range answer instead of rejecting it", () => {
    const result = aiQualificationSignalSchema.safeParse({ ai_score: 150 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.ai_score).toBe(100);
  });
});
