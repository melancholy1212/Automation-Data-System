import type { PostgrestError } from "@supabase/supabase-js";

export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === PG_UNIQUE_VIOLATION;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

// Thrown when a worker tries to persist a run it no longer owns (its lease
// was reclaimed by another worker between claim and persist). The update is
// guarded by `locked_by = <this worker>` so this is detected, not silently
// overwritten — see claimProcessingRuns / updateProcessingRun.
export class LostLeaseError extends Error {
  constructor(readonly runId: string) {
    super(`Lost the lease for lead_processing_runs row ${runId} before the result could be persisted`);
    this.name = "LostLeaseError";
  }
}
