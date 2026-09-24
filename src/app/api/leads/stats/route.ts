import { apiError, apiOk } from "@/lib/api/response";
import { DatabaseError } from "@/lib/db/errors";
import { getLeadStatusCounts } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";

// Backs the pipeline overview (Phase 5): a handful of count queries done in
// Postgres, not by fetching every lead into the browser to tally client-side.
export async function GET() {
  try {
    const db = getSupabase();
    const counts = await getLeadStatusCounts(db);
    return apiOk(counts);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while computing lead statistics");
  }
}
