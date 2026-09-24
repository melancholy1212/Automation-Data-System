import { apiError, apiOk } from "@/lib/api/response";
import { DatabaseError } from "@/lib/db/errors";
import {
  findLeadById,
  getLatestRunForLead,
  insertProcessingEvent,
  resetRunForRetry,
  updateLeadStatus,
} from "@/lib/db/leads.repository";
import { runStatusToLeadStatus } from "@/lib/pipeline/state-machine";
import { getSupabase } from "@/lib/supabase/client";
import { PROCESSING_EVENT_TYPES } from "@/lib/types/domain";
import type { RunStatus } from "@/lib/types/domain";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Only a run that has actually stopped can be retried — an active run has
// no "next attempt" for a human to force early, and a concluded-for-good run
// (completed/duplicate/invalid) shouldn't be resurrected through this path.
const RETRYABLE_STATUSES: ReadonlySet<RunStatus> = new Set(["failed", "blocked"]);

export async function POST(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const db = getSupabase();
    const lead = await findLeadById(db, id);
    if (!lead) {
      return apiError(404, "lead_not_found", `No lead with id ${id}`);
    }

    const run = await getLatestRunForLead(db, id);
    if (!run) {
      return apiError(404, "run_not_found", "This lead has no processing run to retry");
    }

    if (!RETRYABLE_STATUSES.has(run.status)) {
      return apiError(
        409,
        "not_retryable",
        `Lead is currently '${run.status}' and cannot be retried from this state`,
      );
    }

    const updatedRun = await resetRunForRetry(db, run);
    const leadStatus = runStatusToLeadStatus(updatedRun.status);
    await updateLeadStatus(db, id, leadStatus);
    await insertProcessingEvent(db, {
      lead_id: id,
      run_id: run.id,
      event_type: PROCESSING_EVENT_TYPES.RUN_RETRIED,
      metadata: { manual: true, resumed_stage: updatedRun.current_stage },
    });

    return apiOk({ lead: { ...lead, status: leadStatus }, run: updatedRun });
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while retrying the lead");
  }
}
