const MAX_MESSAGE_LENGTH = 500;

// Stored in lead_processing_runs.failure_reason and returned from
// GET /api/leads/:id, so this must never leak a stack trace or (once
// external providers exist) anything from a request/response that could
// carry an API key. A plain Error's `.message` only, truncated, is
// deliberately conservative for now — revisit if a future stage's errors
// can embed provider payloads.
export function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.length > MAX_MESSAGE_LENGTH ? `${message.slice(0, MAX_MESSAGE_LENGTH)}…` : message;
}
