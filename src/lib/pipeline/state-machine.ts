import type { PipelineStage, RunStatus } from "@/lib/types/domain";

// The pipeline's fixed stage order. `current_stage` always points at the
// stage most recently executed or currently in progress — never a
// prediction of what's next, so it can't drift out of sync with `status`.
export const STAGE_ORDER: readonly PipelineStage[] = [
  "validating",
  "normalizing",
  "deduplicating",
  "enriching",
  "classifying",
  "qualifying",
  "generating_brief",
];

export type NextStep = PipelineStage | "completed";

export function nextStage(stage: PipelineStage): NextStep {
  const index = STAGE_ORDER.indexOf(stage);
  if (index === -1) {
    throw new Error(`Unknown pipeline stage: ${stage}`);
  }
  return index === STAGE_ORDER.length - 1 ? "completed" : STAGE_ORDER[index + 1];
}

// A run that has concluded one way or another; a new active run for the
// same lead is only possible once its current run is in one of these.
export const TERMINAL_RUN_STATUSES: readonly RunStatus[] = [
  "completed",
  "failed",
  "duplicate",
  "invalid",
];

// Terminal, plus paused states that shouldn't be picked up by the worker
// poll even though the lead's pipeline hasn't concluded (blocked: the stage
// isn't implemented yet; needs_review: reserved for a future human-review
// dedup signal, never set in Phase 3).
export const NON_POLLABLE_RUN_STATUSES: readonly RunStatus[] = [
  ...TERMINAL_RUN_STATUSES,
  "blocked",
  "needs_review",
];

export function isTerminal(status: RunStatus): boolean {
  return (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

// Explicit allow-list of status transitions, enforced in code as a defense-
// in-depth check (in addition to the fact that only the worker ever writes
// to this column). A self-transition (e.g. validating -> validating)
// represents retrying the same stage after a failed attempt.
const ALLOWED_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  pending: ["validating"],
  validating: ["validating", "normalizing", "invalid", "failed"],
  normalizing: ["normalizing", "deduplicating", "invalid", "failed"],
  deduplicating: ["deduplicating", "enriching", "duplicate", "failed"],
  enriching: ["enriching", "classifying", "blocked", "failed"],
  classifying: ["classifying", "qualifying", "blocked", "failed"],
  qualifying: ["qualifying", "generating_brief", "blocked", "failed"],
  generating_brief: ["generating_brief", "completed", "blocked", "failed"],
  blocked: ["blocked"],
  duplicate: [],
  invalid: [],
  failed: [],
  needs_review: ["needs_review"],
  completed: [],
};

export function assertValidTransition(from: RunStatus, to: RunStatus): void {
  const allowed = ALLOWED_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new Error(`Illegal run status transition: ${from} -> ${to}`);
  }
}
