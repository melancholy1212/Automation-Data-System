import { z } from "zod";

// Must match the `classification_category` Postgres enum exactly (see
// supabase/migrations/20260924020000_enrichment_ai_stages.sql).
export const COMPANY_TYPE_VALUES = [
  "startup",
  "established_company",
  "agency",
  "consultancy",
  "software_company",
  "marketplace",
  "investor",
  "nonprofit",
  "research_institution",
  "other",
  "unknown",
] as const;

// The model reliably returns an array instead of a single string here for
// any company with more than one of these (e.g. a conglomerate's
// industries, a multi-country company's geography) — schema-invalid on the
// very first attempt for exactly the evidence-rich leads this product is
// supposed to shine on (see src/lib/schemas/brief.schema.ts's identical
// helper, found live via a stuck multi-country lead). Accept either shape
// and normalize to one descriptive string.
const flexibleStringField = z
  .union([z.string(), z.array(z.string())])
  .nullable()
  .transform((value) => (Array.isArray(value) ? value.join(", ") : value));

// Models sometimes answer on a 0-100 scale here instead of the 0-1 fraction
// asked for (qualification's ai_score is 0-100, a convention collision
// across schemas) — normalize rather than reject an answer that's clearly
// just on the wrong scale.
const confidenceField = z.number().transform((value) => {
  const normalized = value > 1 ? value / 100 : value;
  return Math.max(0, Math.min(1, normalized));
});

export const companyClassificationSchema = z.object({
  company_type: z.enum(COMPANY_TYPE_VALUES),
  industry: flexibleStringField,
  business_model: flexibleStringField,
  geography: flexibleStringField,
  target_market: flexibleStringField,
  confidence: confidenceField,
  // Truncated rather than schema-rejected — the "<=800 chars" instruction
  // in the prompt is a strong hint, not a guarantee the model honors
  // exactly, and a slightly-over-length reasoning string is still a
  // perfectly good answer.
  reasoning: z.string().transform((value) => value.slice(0, 800)),
  signals_used: z.array(z.string()).default([]),
});

export type CompanyClassification = z.infer<typeof companyClassificationSchema>;
