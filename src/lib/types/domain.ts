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
export type LeadClassificationInsert =
  Database["public"]["Tables"]["lead_classifications"]["Insert"];

export type LeadQualification = Database["public"]["Tables"]["lead_qualifications"]["Row"];
export type LeadQualificationInsert =
  Database["public"]["Tables"]["lead_qualifications"]["Insert"];

export type LeadIntelligenceBrief =
  Database["public"]["Tables"]["lead_intelligence_briefs"]["Row"];
export type LeadIntelligenceBriefInsert =
  Database["public"]["Tables"]["lead_intelligence_briefs"]["Insert"];

export type ProcessingEvent = Database["public"]["Tables"]["processing_events"]["Row"];
export type ProcessingEventInsert = Database["public"]["Tables"]["processing_events"]["Insert"];

// A row returned by the claim_lead_processing_runs() RPC (Phase 3): a normal
// LeadProcessingRun plus a flag telling the caller whether this claim
// recovered an abandoned (lease-expired) run from a different worker.
export type ClaimedRun = LeadProcessingRun & { was_recovered: boolean };

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

  // Worker/queue events (Phase 3) — named to match docs/architecture.md's
  // worker design section.
  RUN_CLAIMED: "run.claimed",
  RUN_RECOVERED: "run.recovered",
  RUN_COMPLETED: "run.completed",
  RUN_LEASE_LOST: "run.lease_lost",
  STAGE_STARTED: "stage.started",
  STAGE_COMPLETED: "stage.completed",
  STAGE_BLOCKED: "stage.blocked",
  STAGE_FAILED: "stage.failed",
} as const;

export type ProcessingEventType =
  (typeof PROCESSING_EVENT_TYPES)[keyof typeof PROCESSING_EVENT_TYPES];
