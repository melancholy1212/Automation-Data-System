import { apiError, apiOk } from "@/lib/api/response";
import { DatabaseError } from "@/lib/db/errors";
import { findLeadById, listEventsForLead } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const db = getSupabase();
    const lead = await findLeadById(db, id);

    if (!lead) {
      return apiError(404, "lead_not_found", `No lead with id ${id}`);
    }

    const events = await listEventsForLead(db, id);

    return apiOk({ events });
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while retrieving events");
  }
}
