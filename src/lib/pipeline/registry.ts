import { classifyStage } from "@/lib/pipeline/stages/classify";
import { dedupeStage } from "@/lib/pipeline/stages/dedupe";
import { enrichStage } from "@/lib/pipeline/stages/enrich";
import { generateBriefStage } from "@/lib/pipeline/stages/generate-brief";
import { normalizeStage } from "@/lib/pipeline/stages/normalize";
import { qualifyStage } from "@/lib/pipeline/stages/qualify";
import { validateStage } from "@/lib/pipeline/stages/validate";
import type { Stage } from "@/lib/pipeline/types";
import type { PipelineStage } from "@/lib/types/domain";

// The stage registry is the only thing a later phase needs to touch to plug
// in a real implementation (Phase 4 replaced every notImplementedStage()
// placeholder here with a real one) — runner.ts dispatches purely by
// `STAGE_REGISTRY[run.current_stage]` and never branches on stage name.
export const STAGE_REGISTRY: Record<PipelineStage, Stage> = {
  validating: validateStage,
  normalizing: normalizeStage,
  deduplicating: dedupeStage,
  enriching: enrichStage,
  classifying: classifyStage,
  qualifying: qualifyStage,
  generating_brief: generateBriefStage,
};
