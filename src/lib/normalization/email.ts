export interface NormalizedEmail {
  email: string;
  emailDomain: string;
}

// Deliberately simple (not RFC 5322): good enough to catch obviously
// malformed input at ingestion without rejecting valid-but-unusual real
// addresses. Consistent with the architecture's "practical for a solo
// developer" scope.
const EMAIL_PATTERN = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/;

export function normalizeEmail(input: string): NormalizedEmail | null {
  const trimmed = input.trim().toLowerCase();
  const match = EMAIL_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }
  return { email: trimmed, emailDomain: match[1] };
}
