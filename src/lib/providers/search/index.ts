import "server-only";

import { ProviderError } from "@/lib/providers/errors";
import { createTavilyProvider } from "./tavily-provider";
import type { SearchProvider } from "./types";

export type { SearchProvider, SearchResult } from "./types";

let cached: SearchProvider | undefined;

// Stages always import from here, never from ./tavily-provider directly —
// swapping the concrete search provider later means changing this one
// function, not any pipeline stage.
export function getSearchProvider(): SearchProvider {
  if (!cached) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new ProviderError("TAVILY_API_KEY is not configured", false);
    }
    cached = createTavilyProvider(apiKey);
  }
  return cached;
}
