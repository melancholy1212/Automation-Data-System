import type { CompanyClassification } from "@/lib/schemas/classification.schema";
import type { IntelligenceBrief } from "@/lib/schemas/brief.schema";
import type { AIQualificationSignal } from "@/lib/schemas/qualification.schema";
import type { Lead, LeadClassification, LeadQualification } from "@/lib/types/domain";

// A trimmed, prompt-ready view of an evidence row — deliberately not the
// full LeadEvidence type, so it's obvious at a glance which fields the AI
// actually sees (never anything beyond what the pipeline itself collected).
export interface EvidenceForPrompt {
  id: string;
  source_url: string | null;
  title: string | null;
  snippet: string | null;
  source_type: string;
  relevance: string;
}

export interface ClassificationInput {
  lead: Lead;
  evidence: EvidenceForPrompt[];
}

export interface QualificationInput {
  lead: Lead;
  evidence: EvidenceForPrompt[];
  classification: LeadClassification;
}

export interface BriefInput {
  lead: Lead;
  evidence: EvidenceForPrompt[];
  classification: LeadClassification;
  qualification: LeadQualification;
}

// Matches the interface sketched in docs/architecture.md §8 exactly. Every
// method returns an already-validated, typed result — a provider
// implementation owns its own parse/validate/repair loop (see
// gemini-provider.ts), so a stage never has to know how that works.
export interface AIProvider {
  classify(input: ClassificationInput): Promise<CompanyClassification>;
  qualify(input: QualificationInput): Promise<AIQualificationSignal>;
  generateBrief(input: BriefInput): Promise<IntelligenceBrief>;
}
