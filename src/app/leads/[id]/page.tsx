import { notFound } from "next/navigation";

import { findBriefByRunId, findClassificationByRunId, findQualificationByRunId } from "@/lib/db/ai-outputs.repository";
import { listEvidenceForLead } from "@/lib/db/evidence.repository";
import { findLeadById, getLatestRunForLead, listEventsForLead } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";
import { LeadDetailLive } from "@/components/lead-detail-live";

// Always reflects live database state — never statically prerendered.
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params;
  const db = getSupabase();

  const lead = await findLeadById(db, id);
  if (!lead) {
    notFound();
  }

  const run = await getLatestRunForLead(db, id);
  const [evidence, events, classification, qualification, brief] = await Promise.all([
    listEvidenceForLead(db, id),
    listEventsForLead(db, id),
    run ? findClassificationByRunId(db, run.id) : Promise.resolve(null),
    run ? findQualificationByRunId(db, run.id) : Promise.resolve(null),
    run ? findBriefByRunId(db, run.id) : Promise.resolve(null),
  ]);

  return (
    <LeadDetailLive
      initialData={{ lead, run, evidence, classification, qualification, brief }}
      initialEvents={events}
    />
  );
}
