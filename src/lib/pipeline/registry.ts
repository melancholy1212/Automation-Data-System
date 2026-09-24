import { dedupeStage } from "@/lib/pipeline/stages/dedupe";
import { normalizeStage } from "@/lib/pipeline/stages/normalize";
import { notImplementedStage } from "@/lib/pipeline/stages/not-implemented";
import { validateStage } from "@/lib/pipeline/stages/validate";
import type { Stage } from "@/lib/pipeline/types";
import type { PipelineStage } from "@/lib/types/domain";

// The stage registry is the only thing a later phase needs to touch to plug
// in a real implementation (e.g. replace notImplementedStage("enriching")
// with an EnrichmentStage) — runner.ts dispatches purely by
// `STAGE_REGISTRY[run.current_stage]` and never branches on stage name.
export const STAGE_REGISTRY: Record<PipelineStage, Stage> = {
  validating: validateStage,
  normalizing: normalizeStage,
  deduplicating: dedupeStage,
  enriching: notImplementedStage("enriching"),
  classifying: notImplementedStage("classifying"),
  qualifying: notImplementedStage("qualifying"),
  generating_brief: notImplementedStage("generating_brief"),
};
