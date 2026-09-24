export interface SearchResult {
  url: string;
  title: string | null;
  snippet: string | null;
  publishedAt: string | null;
}

export interface SearchProvider {
  name: string;
  search(query: string, opts?: { maxResults?: number }): Promise<SearchResult[]>;
}
