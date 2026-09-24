import {
  findBriefByRunId,
  findClassificationByRunId,
  findQualificationByRunId,
  insertBriefOnce,
} from "@/lib/db/ai-outputs.repository";
import { listEvidenceForLead } from "@/lib/db/evidence.repository";
import { toPromptEvidence } from "@/lib/pipeline/prompt-evidence";
import type { Stage, StageOutcome } from "@/lib/pipeline/types";
import { getAIProvider, getConfiguredModelName } from "@/lib/providers/ai";
import { ProviderError } from "@/lib/providers/errors";
import type { IntelligenceBrief } from "@/lib/schemas/brief.schema";

const MAX_EVIDENCE_FOR_PROMPT = 15;

function insufficientEvidenceBrief(companyName: string, score: number, level: string): IntelligenceBrief {
  return {
    company_summary: `No public evidence was found for ${companyName}; qualification could not be meaningfully established.`,
    what_they_do: null,
    products_services: [],
    geography: null,
    target_market: null,
    signals: [],
    recent_developments: [],
    pain_points: [],
    automation_opportunities: [],
    qualification_summary: `Score ${score}/100 (${level}) — based on lead metadata only; no external evidence was available.`,
    key_evidence: [],
    risks_and_uncertainty: ["No public evidence was available for this company."],
    outreach_angle: "Insufficient evidence to suggest a specific outreach angle.",
    confidence: 0,
    facts: { known: [], inferred: [], unknown: ["Company activities, size, and market position"] },
  };
}

export const generateBriefStage: Stage = {
  name: "generating_brief",
  timeoutMs: 30_000,
  async execute({ db, lead, run }): Promise<StageOutcome> {
    const existing = await findBriefByRunId(db, run.id);
    if (existing) {
      return { kind: "success" };
    }

    const classification = await findClassificationByRunId(db, run.id);
    const qualification = await findQualificationByRunId(db, run.id);
    if (!classification || !qualification) {
      return {
        kind: "failure",
        retryable: false,
        message: "Missing classification or qualification for this run",
      };
    }

    const allEvidence = await listEvidenceForLead(db, lead.id);
    const promptEvidence = allEvidence.slice(0, MAX_EVIDENCE_FOR_PROMPT);

    let brief: IntelligenceBrief;
    let model: string;

    // A brief is still produced with zero evidence — the product itself
    // requires one per lead — but it's a deterministic, honest "we don't
    // know" artifact rather than spending an AI call to invent one
    // (docs/architecture.md §11/§13).
    if (allEvidence.length === 0) {
      brief = insufficientEvidenceBrief(lead.company_name, qualification.score, qualification.level);
      model = "none";
    } else {
      try {
        brief = await getAIProvider().generateBrief({
          lead,
          evidence: toPromptEvidence(promptEvidence),
          classification,
          qualification,
        });
      } catch (error) {
        if (error instanceof ProviderError) {
          return { kind: "failure", retryable: error.retryable, message: error.message };
        }
        throw error;
      }
      model = getConfiguredModelName();
    }

    await insertBriefOnce(db, {
      lead_id: lead.id,
      run_id: run.id,
      company_summary: brief.company_summary,
      signals: brief.signals,
      pain_points: brief.pain_points,
      automation_opportunities: brief.automation_opportunities,
      outreach_angle: brief.outreach_angle,
      confidence: brief.confidence,
      model,
      raw_output: brief,
    });

    return { kind: "success" };
  },
};
