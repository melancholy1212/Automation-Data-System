import { findClassificationByRunId, insertClassificationOnce } from "@/lib/db/ai-outputs.repository";
import { listEvidenceForLead } from "@/lib/db/evidence.repository";
import { toPromptEvidence } from "@/lib/pipeline/prompt-evidence";
import type { Stage, StageOutcome } from "@/lib/pipeline/types";
import { getAIProvider, getConfiguredModelName } from "@/lib/providers/ai";
import { ProviderError } from "@/lib/providers/errors";

const MAX_EVIDENCE_FOR_PROMPT = 15;

export const classifyStage: Stage = {
  name: "classifying",
  timeoutMs: 30_000,
  async execute({ db, lead, run }): Promise<StageOutcome> {
    // Idempotent: a retry after a crash between "AI call succeeded" and
    // "run advanced" reuses the row the unique(run_id) constraint already
    // guarantees is unique, instead of calling the AI again.
    const existing = await findClassificationByRunId(db, run.id);
    if (existing) {
      return { kind: "success" };
    }

    const evidence = await listEvidenceForLead(db, lead.id, MAX_EVIDENCE_FOR_PROMPT);

    if (evidence.length === 0) {
      // No AI call to make: with nothing to reason over, the honest answer
      // is "unknown", not a guess (docs/architecture.md §6/§10).
      await insertClassificationOnce(db, {
        lead_id: lead.id,
        run_id: run.id,
        category: "unknown",
        confidence: 0,
        reasoning: "No evidence was collected for this lead, so no classification could be made.",
        signals_used: [],
        model: "none",
        model_version: null,
        raw_output: { skipped: true, reason: "no_evidence" },
      });
      return { kind: "success" };
    }

    let result;
    try {
      result = await getAIProvider().classify({ lead, evidence: toPromptEvidence(evidence) });
    } catch (error) {
      if (error instanceof ProviderError) {
        return { kind: "failure", retryable: error.retryable, message: error.message };
      }
      throw error;
    }

    await insertClassificationOnce(db, {
      lead_id: lead.id,
      run_id: run.id,
      category: result.company_type,
      confidence: result.confidence,
      reasoning: result.reasoning,
      signals_used: result.signals_used,
      model: getConfiguredModelName(),
      model_version: null,
      raw_output: result,
    });

    return { kind: "success" };
  },
};
