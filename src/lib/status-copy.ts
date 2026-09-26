// Presentation-only copy: turns the pipeline's real, already-computed state
// (never re-derived or guessed here — see pipeline-view.ts) into
// operator-friendly language. The raw technical string is never discarded;
// callers that show this copy also surface the original via
// rawFailureReason so nothing is hidden, only reworded (docs/architecture.md
// Phase 5 UI rule: never invent or hide pipeline state in the frontend).
import { deriveStageViews, type StageDisplayState } from "@/lib/pipeline-view";
import { formatDateTime, titleCase } from "@/lib/format";
import type { LeadProcessingRun, PipelineStage } from "@/lib/types/domain";

export type StatusTone = "neutral" | "info" | "warning" | "error" | "success";

export interface SectionStatus {
  tone: StatusTone;
  headline: string;
  body: string;
  rawFailureReason?: string | null;
}

const PROVIDER_PATTERNS: Array<{ test: RegExp; message: string }> = [
  { test: /returned 503|overloaded|unavailable/i, message: "The AI provider was temporarily overloaded." },
  { test: /returned 429|rate limit/i, message: "The AI provider's rate limit was reached." },
  { test: /timed out/i, message: "The AI provider took too long to respond." },
  { test: /schema validation/i, message: "The AI provider returned a response in an unexpected format." },
  { test: /rejected the configured api key|401|403/i, message: "The AI provider rejected the configured API key." },
  { test: /tavily|search provider/i, message: "The evidence search provider had an issue." },
];

export function humanizeFailureReason(reason: string | null | undefined): string {
  if (!reason) return "A temporary processing error occurred.";
  const match = PROVIDER_PATTERNS.find((p) => p.test.test(reason));
  return match?.message ?? "A temporary processing error occurred.";
}

const STAGE_LABEL: Record<string, string> = {
  validating: "Validation",
  normalizing: "Normalization",
  deduplicating: "Deduplication",
  enriching: "Enrichment",
  classifying: "Classification",
  qualifying: "Qualification",
  generating_brief: "Intelligence brief",
};

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? titleCase(stage);
}

const STOPPED_STATES = new Set<StageDisplayState>(["failed", "blocked", "invalid", "duplicate", "needs_review"]);

// The section-level status a given stage's card/panel should present, given
// only what the backend already stores on the run row — mirrors the
// per-stage state deriveStageViews already computes, so a stage view and its
// detail-page section can never disagree.
export function describeSectionState(
  run: LeadProcessingRun | null,
  stage: PipelineStage,
  sectionLabel: string,
): SectionStatus | null {
  const view = deriveStageViews(run).find((v) => v.stage === stage);
  if (!view || view.state === "pending") {
    return {
      tone: "neutral",
      headline: `${sectionLabel} pending`,
      body: `Waiting for the ${stageLabel(stage).toLowerCase()} stage to run.`,
    };
  }

  if (view.state === "active") {
    return {
      tone: "info",
      headline: `${sectionLabel} in progress`,
      body: "The pipeline is working on this stage right now.",
    };
  }

  if (view.state === "retrying") {
    const attemptText = run ? ` — attempt ${run.attempt_count} of ${run.max_attempts}` : "";
    const nextText = run?.next_attempt_at ? `, next attempt ${formatDateTime(run.next_attempt_at)}` : "";
    return {
      tone: "warning",
      headline: `${sectionLabel} temporarily unavailable`,
      body: `${humanizeFailureReason(run?.failure_reason)} The pipeline will retry automatically${attemptText}${nextText}.`,
      rawFailureReason: run?.failure_reason,
    };
  }

  if (STOPPED_STATES.has(view.state)) {
    if (view.state === "duplicate" || view.state === "needs_review") {
      return {
        tone: "neutral",
        headline: `${sectionLabel} not applicable`,
        body:
          view.state === "duplicate"
            ? "This lead was identified as a duplicate before reaching this stage."
            : "This lead was flagged for manual review before reaching this stage.",
      };
    }
    if (view.state === "invalid") {
      const reason = run?.failure_reason ?? "This lead's data did not pass validation";
      return {
        tone: "error",
        headline: `${sectionLabel} did not complete`,
        body: `${reason}. This isn't a transient error — it won't resolve on retry; the lead needs to be re-submitted with corrected data.`,
        rawFailureReason: run?.failure_reason,
      };
    }
    return {
      tone: "error",
      headline: `${sectionLabel} did not complete`,
      body: `${humanizeFailureReason(run?.failure_reason)} This run stopped and needs attention.`,
      rawFailureReason: run?.failure_reason,
    };
  }

  // "completed" — the caller has real data to render instead of this status.
  return null;
}
