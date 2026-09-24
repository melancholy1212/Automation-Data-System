// Reusable exponential backoff with a cap and +/-20% jitter (spreads out
// retries so a burst of failures doesn't all retry in lockstep). One place
// for this constant, rather than hard-coded delays scattered through the
// worker.
const BASE_DELAY_MS = 60_000; // 1 minute
const MAX_DELAY_MS = 30 * 60_000; // 30 minutes
const JITTER_RATIO = 0.2;

export function computeBackoffMs(attempt: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, MAX_DELAY_MS);
  const jitter = capped * JITTER_RATIO * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(capped + jitter));
}
