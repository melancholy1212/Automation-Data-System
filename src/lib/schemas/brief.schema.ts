import { z } from "zod";

const knownInferredUnknownSchema = z.object({
  known: z.array(z.string()).default([]),
  inferred: z.array(z.string()).default([]),
  unknown: z.array(z.string()).default([]),
});

// The model reliably returns an array here instead of a string for any
// multi-country/multi-segment company (e.g. "Egypt, Saudi Arabia, Sudan")
// — schema-invalid on the very first attempt, every time, for exactly the
// evidence-rich leads this product is supposed to shine on. Accept either
// shape and normalize to the single descriptive string the UI already
// renders (intelligence-brief.tsx), rather than trying to force the model
// to never do this via prompt wording alone.
const flexibleStringField = z
  .union([z.string(), z.array(z.string())])
  .nullable()
  .transform((value) => (Array.isArray(value) ? value.join(", ") : value));

// Models sometimes answer on a 0-100 scale here instead of the 0-1 fraction
// asked for (the same field is 0-100 in qualification's ai_score, a
// convention collision across schemas) — normalize rather than reject an
// answer that's clearly just on the wrong scale.
const confidenceField = z.number().transform((value) => {
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
});

export const intelligenceBriefSchema = z.object({
  company_summary: z.string(),
  // A company with several distinct lines of business risks the same
  // array-instead-of-string mismatch as geography/target_market below.
  what_they_do: flexibleStringField,
  products_services: z.array(z.string()).default([]),
  geography: flexibleStringField,
  target_market: flexibleStringField,
  signals: z.array(z.string()).default([]),
  recent_developments: z.array(z.string()).default([]),
  pain_points: z.array(z.string()).default([]),
  automation_opportunities: z
    .array(
      z.object({
        opportunity: z.string(),
        rationale: z.string(),
        evidence_refs: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  qualification_summary: z.string(),
  key_evidence: z
    .array(
      z.object({
        evidence_id: z.string(),
        summary: z.string(),
      }),
    )
    .default([]),
  risks_and_uncertainty: z.array(z.string()).default([]),
  outreach_angle: z.string(),
  confidence: confidenceField,
  // Explicit known/inferred/unknown split so the brief never presents a
  // guess as a fact (docs/architecture.md's Phase 4 notes, §11).
  facts: knownInferredUnknownSchema,
});

export type IntelligenceBrief = z.infer<typeof intelligenceBriefSchema>;
