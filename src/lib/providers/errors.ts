// Thrown by provider implementations (search, AI) to tell a calling stage
// whether the failure is worth retrying. `retryable: true` covers timeouts,
// rate limits (429), and 5xx — conditions that plausibly succeed on a later
// attempt. `retryable: false` covers static misconfiguration (missing API
// key, 401/403) that won't fix itself before the next worker tick.
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
