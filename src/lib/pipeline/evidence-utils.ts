import type { EvidenceRelevance } from "@/lib/types/domain";

// A small, deliberately non-exhaustive list of reputable business/news
// sources — enough to distinguish "an official or credible source" from
// "some other page a search happened to return" (docs/architecture.md §5).
// Anything not on this list and not the lead's own domain is 'contextual':
// visible to later stages, but not treated as strong evidence.
const REPUTABLE_DOMAINS = [
  "reuters.com",
  "bloomberg.com",
  "techcrunch.com",
  "forbes.com",
  "businesswire.com",
  "prnewswire.com",
  "crunchbase.com",
  "linkedin.com",
  "wsj.com",
  "ft.com",
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function matchesDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function classifyRelevance(url: string, websiteDomain: string | null): EvidenceRelevance {
  const host = hostnameOf(url);
  if (!host) {
    return "contextual";
  }
  if (websiteDomain && matchesDomain(host, websiteDomain)) {
    return "primary";
  }
  if (REPUTABLE_DOMAINS.some((domain) => matchesDomain(host, domain))) {
    return "supporting";
  }
  return "contextual";
}

// Canonical form used as the evidence idempotency key: strips the fragment
// and a bare trailing slash, lowercases — enough to collapse the common
// "same URL, different casing/fragment" duplicates a search API returns
// across query variants, without being so aggressive it merges genuinely
// different pages.
export function normalizeEvidenceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let normalized = parsed.toString();
    if (parsed.pathname === "/" && normalized.endsWith("/")) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}
