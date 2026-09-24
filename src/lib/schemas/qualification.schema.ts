import { z } from "zod";

// The AI's contribution to qualification only — never the final score. The
// final score is always computed in code from this plus the deterministic
// score and evidence confidence (see src/lib/pipeline/scoring.ts).
export const aiQualificationSignalSchema = z.object({
  ai_score: z.number().int().min(0).max(100),
  reasons: z
    .array(
      z.object({
        factor: z.string(),
        contribution: z.number(),
        detail: z.string(),
      }),
    )
    .default([]),
  opportunity_signals: z.array(z.string()).default([]),
});

export type AIQualificationSignal = z.infer<typeof aiQualificationSignalSchema>;
