import "server-only";

import type { DbClient } from "@/lib/supabase/client";
import { DatabaseError, isUniqueViolation } from "@/lib/db/errors";
import type { LeadEvidence, LeadEvidenceInsert } from "@/lib/types/domain";

export interface InsertEvidenceResult {
  inserted: boolean;
  evidence: LeadEvidence;
}

// Idempotent by (lead_id, idempotency_key) — the unique constraint from
// Phase 2 is the actual dedup authority; this just makes a conflict a normal
// "here's the existing row" result instead of an error, so a stage can call
// it freely for every candidate URL without checking existence first.
export async function insertEvidenceIfNew(
  db: DbClient,
  insert: LeadEvidenceInsert,
): Promise<InsertEvidenceResult> {
  const { data, error } = await db.from("lead_evidence").insert(insert).select().single();

  if (!error) {
    return { inserted: true, evidence: data };
  }

  if (!isUniqueViolation(error)) {
    throw new DatabaseError("Failed to insert lead_evidence row", error);
  }

  const { data: existing, error: lookupError } = await db
    .from("lead_evidence")
    .select("*")
    .eq("lead_id", insert.lead_id)
    .eq("idempotency_key", insert.idempotency_key ?? "")
    .maybeSingle();

  if (lookupError) {
    throw new DatabaseError("Failed to look up existing lead_evidence row after conflict", lookupError);
  }
  if (!existing) {
    throw new DatabaseError("Unique violation on lead_evidence insert but no matching row found");
  }
  return { inserted: false, evidence: existing };
}

export async function listEvidenceForLead(
  db: DbClient,
  leadId: string,
  limit?: number,
): Promise<LeadEvidence[]> {
  let query = db
    .from("lead_evidence")
    .select("*")
    .eq("lead_id", leadId)
    .order("collected_at", { ascending: false });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw new DatabaseError("Failed to list lead_evidence for lead", error);
  }
  return data ?? [];
}

export async function countEvidenceForLead(db: DbClient, leadId: string): Promise<number> {
  const { count, error } = await db
    .from("lead_evidence")
    .select("*", { count: "exact", head: true })
    .eq("lead_id", leadId);

  if (error) {
    throw new DatabaseError("Failed to count lead_evidence for lead", error);
  }
  return count ?? 0;
}
