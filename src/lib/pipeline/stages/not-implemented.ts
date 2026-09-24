import type { PipelineStage } from "@/lib/types/domain";
import type { Stage } from "@/lib/pipeline/types";

// Placeholder for a stage that hasn't been built yet (enrichment, AI
// classification/qualification, brief generation — all later phases).
// Returns `not_implemented` explicitly rather than `success`, so the worker
// parks the run in `blocked` instead of pretending the stage ran. Replacing
// this with a real Stage in the registry is the only change a later phase
// needs to make — the worker itself never changes.
export function notImplementedStage(name: PipelineStage, timeoutMs = 1_000): Stage {
  return {
    name,
    timeoutMs,
    async execute() {
      return { kind: "not_implemented" };
    },
  };
}
