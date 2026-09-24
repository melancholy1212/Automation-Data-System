import { STAGE_ORDER } from "@/lib/pipeline/state-machine";
import type { LeadProcessingRun, PipelineStage } from "@/lib/types/domain";

// Every state a single pipeline stage can be shown in — a direct,
// deterministic reflection of stored fields (run.status, run.current_stage,
// run.attempt_count), never an invented percentage or guess
// (docs/architecture.md's Phase 5 notes, §21: "never calculate or infer
// pipeline state in the frontend when the backend already stores it").
export type StageDisplayState =
  | "pending"
  | "active"
  | "retrying"
  | "completed"
  | "blocked"
  | "failed"
  | "invalid"
  | "duplicate"
  | "needs_review";

export interface StageView {
  stage: PipelineStage;
  state: StageDisplayState;
}

const STOPPED_STATUSES: ReadonlySet<string> = new Set([
  "blocked",
  "failed",
  "invalid",
  "duplicate",
  "needs_review",
]);

export function deriveStageViews(run: LeadProcessingRun | null): StageView[] {
  if (!run) {
    return STAGE_ORDER.map((stage) => ({ stage, state: "pending" as const }));
  }

  if (run.status === "completed") {
    return STAGE_ORDER.map((stage) => ({ stage, state: "completed" as const }));
  }

  const currentIndex = STAGE_ORDER.indexOf(run.current_stage);

  return STAGE_ORDER.map((stage, index) => {
    if (index < currentIndex) {
      return { stage, state: "completed" as const };
    }
    if (index > currentIndex) {
      return { stage, state: "pending" as const };
    }

    // index === currentIndex: the stage this run is currently at.
    if (STOPPED_STATUSES.has(run.status)) {
      return { stage, state: run.status as StageDisplayState };
    }
    if (run.attempt_count <= 0) {
      return { stage, state: "pending" as const };
    }
    return { stage, state: run.attempt_count === 1 ? ("active" as const) : ("retrying" as const) };
  });
}
