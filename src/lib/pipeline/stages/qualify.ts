import {
  findClassificationByRunId,
  findQualificationByRunId,
  insertQualificationOnce,
  updateLeadQualificationSummary,
} from "@/lib/db/ai-outputs.repository";
import { listEvidenceForLead } from "@/lib/db/evidence.repository";
import { toPromptEvidence } from "@/lib/pipeline/prompt-evidence";
import { combineQualification, computeDeterministicScore, computeEvidenceConfidence } from "@/lib/pipeline/scoring";
import type { Stage, StageOutcome } from "@/lib/pipeline/types";
import { getAIProvider } from "@/lib/providers/ai";
import { ProviderError } from "@/lib/providers/errors";
import type { Json } from "@/lib/supabase/database.types";

const MAX_EVIDENCE_FOR_PROMPT = 15;

export const qualifyStage: Stage = {
  name: "qualifying",
  timeoutMs: 30_000,
  async execute({ db, lead, run }): Promise<StageOutcome> {
    const existing = await findQualificationByRunId(db, run.id);
    if (existing) {
      return { kind: "success" };
    }

    // Produced earlier in this same run by classifyStage — see
    // docs/architecture.md's Phase 3 notes: current_stage/status advance in
    // place on one lead_processing_runs row, so run.id is stable across the
    // whole pipeline pass.
    const classification = await findClassificationByRunId(db, run.id);
    if (!classification) {
      return { kind: "failure", retryable: false, message: "No classification found for this run" };
    }

    const allEvidence = await listEvidenceForLead(db, lead.id);
    const promptEvidence = allEvidence.slice(0, MAX_EVIDENCE_FOR_PROMPT);

    const deterministic = computeDeterministicScore({
      lead,
      classification,
      evidenceCount: allEvidence.length,
    });
    const evidenceConfidence = computeEvidenceConfidence(allEvidence);

    let aiScore = 0;
    let aiReasons: ReadonlyArray<{ factor: string; contribution: number; detail: string }> = [];
    let opportunitySignals: string[] = [];

    // No AI call when there's no evidence for it to reason over — an AI
    // guess with zero grounding would just be a hallucination risk for no
    // benefit; ai_score correctly stays 0 in that case.
    if (promptEvidence.length > 0) {
      try {
        const signal = await getAIProvider().qualify({
          lead,
          evidence: toPromptEvidence(promptEvidence),
          classification,
        });
        aiScore = signal.ai_score;
        aiReasons = signal.reasons;
        opportunitySignals = signal.opportunity_signals;
      } catch (error) {
        if (error instanceof ProviderError) {
          return { kind: "failure", retryable: error.retryable, message: error.message };
        }
        throw error;
      }
    }

    const final = combineQualification(deterministic.score, aiScore, evidenceConfidence.confidence);

    const reasons: Json = [
      ...deterministic.factors.map((f) => ({ ...f, source: "deterministic" })),
      ...aiReasons.map((r) => ({ ...r, source: "ai" })),
      {
        factor: "evidence_confidence",
        contribution: Math.round(evidenceConfidence.confidence * 100 * 0.2),
        detail: evidenceConfidence.detail,
        source: "evidence",
      },
    ];

    await insertQualificationOnce(db, {
      lead_id: lead.id,
      run_id: run.id,
      score: final.score,
      level: final.level,
      deterministic_score: deterministic.score,
      ai_score: aiScore,
      evidence_confidence: evidenceConfidence.confidence,
      reasons,
      opportunity_signals: opportunitySignals,
    });

    await updateLeadQualificationSummary(db, lead.id, final.score, final.level);

    return { kind: "success" };
  },
};
