import type { Lead, LeadClassification, LeadEvidence, QualificationLevel } from "@/lib/types/domain";

export interface QualificationFactor {
  factor: string;
  contribution: number;
  detail: string;
}

export interface DeterministicScoreResult {
  score: number;
  factors: QualificationFactor[];
}

// Every factor here is a plain read of a field that either exists or
// doesn't — nothing is inferred or guessed. A missing field simply
// contributes nothing (docs/architecture.md §10: "if a signal is unknown,
// represent it as unknown, reduce confidence, do not invent a value").
export function computeDeterministicScore(input: {
  lead: Lead;
  classification: LeadClassification;
  evidenceCount: number;
}): DeterministicScoreResult {
  const { lead, classification, evidenceCount } = input;
  const factors: QualificationFactor[] = [];
  const add = (factor: string, contribution: number, detail: string) => {
    factors.push({ factor, contribution, detail });
  };

  if (lead.website_domain) {
    add("has_website", 15, "Lead has a verified website domain");
  }
  if (lead.email || lead.contact_name) {
    add("contactable", 15, "Lead has a contact name or email on file");
  }
  if (lead.industry) {
    add("industry_provided", 10, "Industry was provided at ingestion");
  }
  if (lead.country) {
    add("country_provided", 10, "Country was provided at ingestion");
  }
  if (evidenceCount > 0) {
    add("evidence_present", 15, `${evidenceCount} evidence item(s) were collected`);
  }
  if (evidenceCount >= 3) {
    add("evidence_rich", 10, "Three or more evidence items were collected");
  }
  if (classification.category !== "unknown") {
    add("company_type_known", 15, `Classified as ${classification.category}`);
  }
  if (classification.confidence >= 0.6) {
    add("classification_confident", 10, "Classification confidence was 0.6 or higher");
  }

  const score = Math.min(
    100,
    factors.reduce((sum, f) => sum + f.contribution, 0),
  );
  return { score, factors };
}

export interface EvidenceConfidenceResult {
  confidence: number;
  detail: string;
}

const RELEVANCE_WEIGHT: Record<LeadEvidence["relevance"], number> = {
  primary: 0.4,
  supporting: 0.2,
  contextual: 0.1,
};

// Deterministic, independent of what the AI claims — evidence_confidence
// reflects the quality/coverage of what was actually collected, so an
// overconfident AI qualification can't inflate the final score past what
// the evidence itself supports.
export function computeEvidenceConfidence(evidence: readonly LeadEvidence[]): EvidenceConfidenceResult {
  if (evidence.length === 0) {
    return { confidence: 0, detail: "No evidence was collected for this lead" };
  }
  const raw = evidence.reduce((sum, e) => sum + RELEVANCE_WEIGHT[e.relevance], 0);
  const confidence = Math.min(1, raw);
  return {
    confidence,
    detail: `${evidence.length} evidence item(s) collected; weighted confidence ${confidence.toFixed(2)}`,
  };
}

export interface FinalQualification {
  score: number;
  level: QualificationLevel;
}

function levelFor(score: number): QualificationLevel {
  if (score >= 80) return "high";
  if (score >= 60) return "medium";
  if (score >= 30) return "low";
  return "unqualified";
}

// final_score = 0.4 * deterministic + 0.4 * ai + 0.2 * evidence_confidence,
// per docs/architecture.md §6/§9 — fixed weights, named here rather than
// scattered through the qualification stage.
export function combineQualification(
  deterministicScore: number,
  aiScore: number,
  evidenceConfidence: number,
): FinalQualification {
  const raw = Math.round(deterministicScore * 0.4 + aiScore * 0.4 + evidenceConfidence * 100 * 0.2);
  const score = Math.max(0, Math.min(100, raw));
  return { score, level: levelFor(score) };
}
