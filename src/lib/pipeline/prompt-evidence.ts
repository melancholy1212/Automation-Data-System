import type { EvidenceForPrompt } from "@/lib/providers/ai";
import type { LeadEvidence } from "@/lib/types/domain";

// Shared by the classify/qualify/brief stages: the exact, bounded view of
// evidence handed to the AI provider — never the full LeadEvidence row.
export function toPromptEvidence(evidence: readonly LeadEvidence[]): EvidenceForPrompt[] {
  return evidence.map((e) => ({
    id: e.id,
    source_url: e.source_url,
    title: e.title,
    snippet: e.snippet,
    source_type: e.source_type,
    relevance: e.relevance,
  }));
}
