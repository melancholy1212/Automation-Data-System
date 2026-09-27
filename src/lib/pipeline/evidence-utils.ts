import { parse } from "tldts";

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

// A small, deliberately non-exhaustive list of corporate-structure suffix
// words — enough to recognize a company's own group/holding/international
// domain (e.g. bmwgroup.com, for a lead whose primary domain is bmw.com) as
// the same first-party brand, without loosely matching on any substring
// (which would also match an unrelated look-alike domain, e.g. a fan site
// on bmwforum.com — "forum" isn't a corporate-structure word, so it's never
// stripped, and "bmwforum" never collapses down to "bmw").
const CORPORATE_SUFFIX_WORDS = [
  "group",
  "holding",
  "holdings",
  "corporation",
  "corp",
  "inc",
  "global",
  "worldwide",
  "international",
];

function coreBrandToken(sld: string): string {
  for (const suffix of CORPORATE_SUFFIX_WORDS) {
    if (sld.length > suffix.length && sld.endsWith(suffix)) {
      return sld.slice(0, -suffix.length).replace(/[-_]+$/, "");
    }
  }
  return sld;
}

// True for a domain that's obviously the same first-party company as the
// lead's own primary domain, even though it isn't a literal (sub)domain
// match — the common real-world case of a company's press/investor/
// regional site living on a related-but-different registrable domain
// (press.bmwgroup.com for a lead whose own website is bmw.com).
function isRelatedFirstPartyDomain(host: string, websiteDomain: string): boolean {
  const evidenceSld = parse(host, { allowPrivateDomains: false }).domainWithoutSuffix?.toLowerCase();
  const leadSld = parse(websiteDomain, { allowPrivateDomains: false }).domainWithoutSuffix?.toLowerCase();
  if (!evidenceSld || !leadSld) {
    return false;
  }
  return coreBrandToken(evidenceSld) === coreBrandToken(leadSld);
}

export function classifyRelevance(url: string, websiteDomain: string | null): EvidenceRelevance {
  const host = hostnameOf(url);
  if (!host) {
    return "contextual";
  }
  if (websiteDomain && (matchesDomain(host, websiteDomain) || isRelatedFirstPartyDomain(host, websiteDomain))) {
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
