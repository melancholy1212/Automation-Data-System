import { findBriefByRunId, findClassificationByRunId, findQualificationByRunId } from "@/lib/db/ai-outputs.repository";
import { apiError, apiOk } from "@/lib/api/response";
import { DatabaseError } from "@/lib/db/errors";
import { listEvidenceForLead } from "@/lib/db/evidence.repository";
import { findLeadById, getLatestRunForLead } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// One response for the whole lead detail page (docs/architecture.md's Phase
// 5 notes): extending this existing endpoint rather than adding four more
// small ones, since it's all data about a single lead the page needs at once.
export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const db = getSupabase();
    const lead = await findLeadById(db, id);

    if (!lead) {
      return apiError(404, "lead_not_found", `No lead with id ${id}`);
    }

    const run = await getLatestRunForLead(db, id);
    const evidence = await listEvidenceForLead(db, id);
    const [classification, qualification, brief] = run
      ? await Promise.all([
          findClassificationByRunId(db, run.id),
          findQualificationByRunId(db, run.id),
          findBriefByRunId(db, run.id),
        ])
      : [null, null, null];

    return apiOk({ lead, run, evidence, classification, qualification, brief });
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while retrieving the lead");
  }
}
