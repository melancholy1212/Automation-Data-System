import { countEvidenceForLead, insertEvidenceIfNew } from "@/lib/db/evidence.repository";
import { classifyRelevance, normalizeEvidenceUrl } from "@/lib/pipeline/evidence-utils";
import type { Stage, StageOutcome } from "@/lib/pipeline/types";
import { ProviderError } from "@/lib/providers/errors";
import { getSearchProvider } from "@/lib/providers/search";
import type { Lead } from "@/lib/types/domain";

// Bounds — deliberately conservative, per docs/architecture.md §15 ("a
// predictable pipeline, not an autonomous research agent"): a fixed,
// small number of targeted queries, a cap on results per query, and a cap
// on total evidence a lead will ever accumulate from this stage.
const MAX_QUERIES = 3;
const MAX_RESULTS_PER_QUERY = 4;
const MIN_EVIDENCE_TARGET = 3;
const MAX_EVIDENCE_TOTAL = 12;

function buildQueries(lead: Lead): string[] {
  const queries = [
    lead.website_domain
      ? `${lead.company_name} ${lead.website_domain}`
      : `${lead.company_name} official website`,
    `${lead.company_name} products services`,
    `${lead.company_name} news`,
  ];
  return queries.slice(0, MAX_QUERIES);
}

export const enrichStage: Stage = {
  name: "enriching",
  timeoutMs: 20_000,
  async execute({ db, lead, run }): Promise<StageOutcome> {
    const existingCount = await countEvidenceForLead(db, lead.id);
    // Idempotent at the "already did this" level, not just row-level dedup:
    // a retried attempt (or a second lead sharing enough public evidence)
    // reuses what's there instead of paying for the same searches again.
    if (existingCount >= MIN_EVIDENCE_TARGET) {
      return { kind: "success" };
    }

    let provider;
    try {
      provider = getSearchProvider();
    } catch (error) {
      if (error instanceof ProviderError) {
        return { kind: "failure", retryable: error.retryable, message: error.message };
      }
      throw error;
    }

    const queries = buildQueries(lead);
    const seenThisAttempt = new Set<string>();
    let inserted = 0;

    for (const query of queries) {
      if (existingCount + inserted >= MAX_EVIDENCE_TOTAL) {
        break;
      }

      let results;
      try {
        results = await provider.search(query, { maxResults: MAX_RESULTS_PER_QUERY });
      } catch (error) {
        if (error instanceof ProviderError) {
          if (inserted > 0) {
            // Keep the partial evidence already collected this attempt
            // rather than discarding it; the run still succeeds — the next
            // query's failure doesn't undo useful work already persisted.
            break;
          }
          return { kind: "failure", retryable: error.retryable, message: error.message };
        }
        throw error;
      }

      for (const result of results) {
        if (existingCount + inserted >= MAX_EVIDENCE_TOTAL) {
          break;
        }
        const idempotencyKey = normalizeEvidenceUrl(result.url);
        if (seenThisAttempt.has(idempotencyKey)) {
          continue;
        }
        seenThisAttempt.add(idempotencyKey);

        const { inserted: wasNew } = await insertEvidenceIfNew(db, {
          lead_id: lead.id,
          run_id: run.id,
          source_url: result.url,
          source_type: "search_result",
          provider: provider.name,
          idempotency_key: idempotencyKey,
          title: result.title,
          snippet: result.snippet,
          extracted_data: { query, published_at: result.publishedAt },
          relevance: classifyRelevance(result.url, lead.website_domain),
          collected_at: new Date().toISOString(),
        });
        if (wasNew) {
          inserted += 1;
        }
      }
    }

    // Zero evidence found is a valid (if weak) outcome, not a failure — the
    // qualification stage's evidence_confidence naturally reflects this.
    return { kind: "success" };
  },
};
