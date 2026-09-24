import { z } from "zod";

const knownInferredUnknownSchema = z.object({
  known: z.array(z.string()).default([]),
  inferred: z.array(z.string()).default([]),
  unknown: z.array(z.string()).default([]),
});

export const intelligenceBriefSchema = z.object({
  company_summary: z.string(),
  what_they_do: z.string().nullable(),
  products_services: z.array(z.string()).default([]),
  geography: z.string().nullable(),
  target_market: z.string().nullable(),
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
  confidence: z.number().min(0).max(1),
  // Explicit known/inferred/unknown split so the brief never presents a
  // guess as a fact (docs/architecture.md's Phase 4 notes, §11).
  facts: knownInferredUnknownSchema,
});

export type IntelligenceBrief = z.infer<typeof intelligenceBriefSchema>;
