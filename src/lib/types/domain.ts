// Domain-facing type aliases over the generated database Row shapes. Kept as
// direct aliases (not a separate camelCase/mapped model) so there is exactly
// one shape to keep in sync with the schema — see database.types.ts.

import type { Database } from "@/lib/supabase/database.types";

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type LeadProcessingRun = Database["public"]["Tables"]["lead_processing_runs"]["Row"];
export type LeadProcessingRunInsert =
  Database["public"]["Tables"]["lead_processing_runs"]["Insert"];

export type LeadEvidence = Database["public"]["Tables"]["lead_evidence"]["Row"];
export type LeadEvidenceInsert = Database["public"]["Tables"]["lead_evidence"]["Insert"];

export type LeadClassification = Database["public"]["Tables"]["lead_classifications"]["Row"];
export type LeadQualification = Database["public"]["Tables"]["lead_qualifications"]["Row"];
export type LeadIntelligenceBrief =
  Database["public"]["Tables"]["lead_intelligence_briefs"]["Row"];

export type ProcessingEvent = Database["public"]["Tables"]["processing_events"]["Row"];
export type ProcessingEventInsert = Database["public"]["Tables"]["processing_events"]["Insert"];

export type {
  LeadStatus,
  RunStatus,
  PipelineStage,
  EvidenceSourceType,
  EvidenceRelevance,
  ClassificationCategory,
  QualificationLevel,
  LeadSource,
} from "@/lib/supabase/database.types";

// Event types recorded to processing_events. Phase 2 only ever writes
// LEAD_IMPORTED; the rest are reserved here so later phases don't invent ad
// hoc strings (see docs/architecture.md §9).
export const PROCESSING_EVENT_TYPES = {
  LEAD_IMPORTED: "lead_imported",
  VALIDATION_FAILED: "validation_failed",
  NORMALIZED: "normalized",
  DEDUP_CHECKED: "dedup_checked",
  ENRICHMENT_STARTED: "enrichment_started",
  ENRICHMENT_COMPLETED: "enrichment_completed",
  ENRICHMENT_FAILED: "enrichment_failed",
  CLASSIFICATION_STARTED: "classification_started",
  CLASSIFICATION_COMPLETED: "classification_completed",
  QUALIFICATION_COMPLETED: "qualification_completed",
  BRIEF_GENERATION_STARTED: "brief_generation_started",
  BRIEF_GENERATED: "brief_generated",
  RUN_FAILED: "run_failed",
  RUN_RETRIED: "run_retried",
} as const;

export type ProcessingEventType =
  (typeof PROCESSING_EVENT_TYPES)[keyof typeof PROCESSING_EVENT_TYPES];
