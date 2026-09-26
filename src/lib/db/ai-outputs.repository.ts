import "server-only";

import type { DbClient } from "@/lib/supabase/client";
import { DatabaseError, isUniqueViolation } from "@/lib/db/errors";
import type {
  LeadClassification,
  LeadClassificationInsert,
  LeadIntelligenceBrief,
  LeadIntelligenceBriefInsert,
  LeadQualification,
  LeadQualificationInsert,
} from "@/lib/types/domain";

// Each of these three tables has a unique(run_id) constraint (Phase 4
// migration) — a stage checks findByRunId first (cheap, avoids a redundant
// AI call on a retried stage) and insertOnce below is a belt-and-suspenders
// fallback for the race where two claims of the same run somehow overlap.

export async function findClassificationByRunId(
  db: DbClient,
  runId: string,
): Promise<LeadClassification | null> {
  const { data, error } = await db
    .from("lead_classifications")
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();
  if (error) {
    throw new DatabaseError("Failed to look up lead_classifications by run_id", error);
  }
  return data;
}

export async function insertClassificationOnce(
  db: DbClient,
  insert: LeadClassificationInsert,
): Promise<LeadClassification> {
  const { data, error } = await db.from("lead_classifications").insert(insert).select().single();
  if (!error) {
    return data;
  }
  if (!isUniqueViolation(error)) {
    throw new DatabaseError("Failed to insert lead_classifications row", error);
  }
  const existing = await findClassificationByRunId(db, insert.run_id);
  if (!existing) {
    throw new DatabaseError("Unique violation on lead_classifications insert but no matching row found");
  }
  return existing;
}

export async function findQualificationByRunId(
  db: DbClient,
  runId: string,
): Promise<LeadQualification | null> {
  const { data, error } = await db
    .from("lead_qualifications")
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();
  if (error) {
    throw new DatabaseError("Failed to look up lead_qualifications by run_id", error);
  }
  return data;
}

export async function insertQualificationOnce(
  db: DbClient,
  insert: LeadQualificationInsert,
): Promise<LeadQualification> {
  const { data, error } = await db.from("lead_qualifications").insert(insert).select().single();
  if (!error) {
    return data;
  }
  if (!isUniqueViolation(error)) {
    throw new DatabaseError("Failed to insert lead_qualifications row", error);
  }
  const existing = await findQualificationByRunId(db, insert.run_id);
  if (!existing) {
    throw new DatabaseError("Unique violation on lead_qualifications insert but no matching row found");
  }
  return existing;
}

export async function findBriefByRunId(
  db: DbClient,
  runId: string,
): Promise<LeadIntelligenceBrief | null> {
  const { data, error } = await db
    .from("lead_intelligence_briefs")
    .select("*")
    .eq("run_id", runId)
    .maybeSingle();
  if (error) {
    throw new DatabaseError("Failed to look up lead_intelligence_briefs by run_id", error);
  }
  return data;
}

export async function insertBriefOnce(
  db: DbClient,
  insert: LeadIntelligenceBriefInsert,
): Promise<LeadIntelligenceBrief> {
  const { data, error } = await db.from("lead_intelligence_briefs").insert(insert).select().single();
  if (!error) {
    return data;
  }
  if (!isUniqueViolation(error)) {
    throw new DatabaseError("Failed to insert lead_intelligence_briefs row", error);
  }
  const existing = await findBriefByRunId(db, insert.run_id);
  if (!existing) {
    throw new DatabaseError("Unique violation on lead_intelligence_briefs insert but no matching row found");
  }
  return existing;
}

export async function updateLeadQualificationSummary(
  db: DbClient,
  leadId: string,
  score: number,
  level: LeadQualification["level"],
): Promise<void> {
  const { error } = await db
    .from("leads")
    .update({ qualification_score: score, qualification_level: level })
    .eq("id", leadId);
  if (error) {
    throw new DatabaseError("Failed to update lead qualification summary", error);
  }
}

// Only ever fills a currently-blank field — never overwrites a value the
// lead arrived with. `leads.industry`/`leads.country` are a provenance
// signal scoring.ts reads as "provided at ingestion" (a separate concept
// from whatever classification later determines from evidence), so the
// caller must only pass fields that were genuinely null before calling
// this, not just re-assert what's already there.
export async function backfillLeadIndustryCountry(
  db: DbClient,
  leadId: string,
  patch: { industry?: string; country?: string },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const { error } = await db.from("leads").update(patch).eq("id", leadId);
  if (error) {
    throw new DatabaseError("Failed to backfill lead industry/country", error);
  }
}
