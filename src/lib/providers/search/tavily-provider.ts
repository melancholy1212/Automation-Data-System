import { ProviderError } from "@/lib/providers/errors";
import type { SearchProvider, SearchResult } from "./types";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const DEFAULT_TIMEOUT_MS = 10_000;

// Single search provider, per Phase 4 scope — reuses the TAVILY_API_KEY
// convention already established in this user's sibling portfolio project
// (ai-market-research-platform), rather than inventing a new env var name.
export function createTavilyProvider(apiKey: string): SearchProvider {
  return {
    name: "tavily",
    async search(query, opts = {}) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(TAVILY_ENDPOINT, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: "basic",
            max_results: opts.maxResults ?? 5,
            include_answer: false,
          }),
          signal: controller.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw new ProviderError(`Tavily search timed out after ${DEFAULT_TIMEOUT_MS}ms`, true, error);
        }
        throw new ProviderError("Tavily search request failed", true, error);
      } finally {
        clearTimeout(timer);
      }

      if (response.status === 401 || response.status === 403) {
        throw new ProviderError("Tavily rejected the configured API key", false);
      }
      if (response.status === 429 || response.status >= 500) {
        throw new ProviderError(`Tavily search returned ${response.status}`, true);
      }
      if (!response.ok) {
        throw new ProviderError(`Tavily search returned ${response.status}`, false);
      }

      const body = (await response.json()) as {
        results?: Array<{ url?: string; title?: string; content?: string; published_date?: string }>;
      };

      return (body.results ?? [])
        .filter((r): r is { url: string; title?: string; content?: string; published_date?: string } =>
          Boolean(r.url),
        )
        .map(
          (r): SearchResult => ({
            url: r.url,
            title: r.title ?? null,
            snippet: r.content ?? null,
            publishedAt: r.published_date ?? null,
          }),
        );
    },
  };
}
