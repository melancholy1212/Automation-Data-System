import { parse } from "tldts";

export interface NormalizedWebsite {
  /** Canonical form to store: scheme + lowercased hostname, no path/query/fragment. */
  website: string;
  /** Registrable domain (eTLD+1) per the public suffix list — the dedup key. */
  websiteDomain: string;
}

/**
 * Normalizes a user-supplied website/URL into a canonical form and its
 * registrable domain, using the public suffix list (via `tldts`) rather than
 * naive string stripping — required to get multi-part suffixes right (e.g.
 * "example.co.uk", not "co.uk") and to collapse scheme/www/case/trailing-
 * slash variants of the same site to one value.
 *
 * `app.example.com` normalizes to hostname `app.example.com` but
 * websiteDomain `example.com` — the subdomain is preserved in `website` for
 * display, but the dedup key is always the registrable domain, since
 * `app.example.com` and `example.com` are (almost always) the same company.
 *
 * Limitation: a small number of registrable domains sit on private/custom
 * PSL suffixes (e.g. some `*.github.io` project sites) that `tldts` treats
 * as public suffixes without `allowPrivateDomains`, which would otherwise
 * make every project subdomain look like a distinct "company". Kept off by
 * default; revisit if lead data includes many PaaS-hosted subdomains.
 *
 * Returns null for input that isn't a usable hostname (empty, malformed, a
 * bare IP address, or missing a recognized public suffix) — callers treat
 * that as a validation failure, not as "no website".
 */
export function normalizeWebsite(input: string): NormalizedWebsite | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = parse(trimmed, { allowPrivateDomains: false });

  if (!parsed.hostname || !parsed.domain || parsed.isIp) {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const websiteDomain = parsed.domain.toLowerCase();

  return {
    website: `https://${hostname}`,
    websiteDomain,
  };
}
