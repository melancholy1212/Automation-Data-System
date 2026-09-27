import { apiError, apiOk } from "@/lib/api/response";
import { getWorkerConfig } from "@/lib/env";
import { runWorkerTick } from "@/lib/pipeline/runner";
import { getSupabase } from "@/lib/supabase/client";

// Unauthenticated on-demand nudge for the UI's "Process now" and "Retry"
// actions — same runWorkerTick as the cron-gated /api/worker/tick, but
// without the shared secret, consistent with every other lead-facing route
// in this app having no auth system (docs/architecture.md, Phase 1-5). This
// exists because Vercel Hobby's cron can only fire once a day (vercel.json),
// which otherwise leaves a freshly ingested lead sitting in `pending` with
// nothing to advance it until the next scheduled run. It is a supplement to
// that cron, not a replacement for it.
//
// Also the target of an external cron-ping service (cron-job.org), for the
// same reason /api/worker/tick answers both GET and POST for Vercel Cron's
// own sake: some external schedulers default to GET, or make POST awkward
// to configure, so this answers both rather than assuming which one a given
// service will actually send.
async function handleTick() {
  try {
    const db = getSupabase();
    const result = await runWorkerTick(db, getWorkerConfig());
    return apiOk(result);
  } catch {
    return apiError(500, "internal_error", "Worker tick failed unexpectedly");
  }
}

export const GET = handleTick;
export const POST = handleTick;
