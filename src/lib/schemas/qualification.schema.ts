import { z } from "zod";

// Models sometimes answer on a 0-1 fraction scale here instead of the 0-100
// integer asked for (classification/brief's `confidence` fields are 0-1, a
// convention collision across schemas) — normalize rather than reject an
// answer that's clearly just on the wrong scale. A genuine 0-100 answer of
// exactly 1 stays an integer and is never strictly between 0 and 1, so this
// can't be confused with a real "score of 1" — only an actual 0-1-scale
// fraction (e.g. 0.85) ever lands in that range.
const aiScoreField = z.number().transform((value) => {
  const normalized = value > 0 && value < 1 ? value * 100 : value;
  return Math.round(Math.max(0, Math.min(100, normalized)));
});

// The AI's contribution to qualification only — never the final score. The
// final score is always computed in code from this plus the deterministic
// score and evidence confidence (see src/lib/pipeline/scoring.ts).
export const aiQualificationSignalSchema = z.object({
  ai_score: aiScoreField,
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
