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

export const companyClassificationSchema = z.object({
  company_type: z.enum(COMPANY_TYPE_VALUES),
  industry: z.string().nullable(),
  business_model: z.string().nullable(),
  geography: z.string().nullable(),
  target_market: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(800),
  signals_used: z.array(z.string()).default([]),
});

export type CompanyClassification = z.infer<typeof companyClassificationSchema>;
