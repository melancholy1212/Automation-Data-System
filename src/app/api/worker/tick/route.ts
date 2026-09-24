import type { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api/response";
import { getCronSecret, getWorkerConfig } from "@/lib/env";
import { runWorkerTick } from "@/lib/pipeline/runner";
import { getSupabase } from "@/lib/supabase/client";

// Privileged: this is the only path that advances pipeline state, so it must
// never be reachable without the shared secret. Vercel Cron sends
// `Authorization: Bearer <CRON_SECRET>` automatically when CRON_SECRET is
// set on the project — see docs/architecture.md's Phase 3 notes for the
// intended vercel.json cron entry and invocation model.
function isAuthorized(request: NextRequest): boolean {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  const token = header.slice("Bearer ".length);
  let expected: string;
  try {
    expected = getCronSecret();
  } catch {
    return false;
  }
  return token === expected;
}

async function handleTick(request: NextRequest) {
  if (!isAuthorized(request)) {
    return apiError(401, "unauthorized", "Missing or invalid worker credentials");
  }

  try {
    const db = getSupabase();
    const result = await runWorkerTick(db, getWorkerConfig());
    return apiOk(result);
  } catch {
    // Never surface internal error detail (queries, stack traces) from a
    // privileged endpoint.
    return apiError(500, "internal_error", "Worker tick failed unexpectedly");
  }
}

// Vercel Cron invokes the scheduled path with GET, not POST — this endpoint
// answers both so `vercel.json`'s cron entry works unmodified while manual/
// scripted invocations (curl -X POST, another scheduler) also work.
export const GET = handleTick;
export const POST = handleTick;
