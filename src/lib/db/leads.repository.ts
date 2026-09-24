import "server-only";

import type { DbClient } from "@/lib/supabase/client";
import { DatabaseError, LostLeaseError, isUniqueViolation } from "@/lib/db/errors";
import type {
  ClaimedRun,
  Lead,
  LeadInsert,
  LeadProcessingRun,
  LeadProcessingRunInsert,
  LeadStatus,
  ProcessingEvent,
  ProcessingEventInsert,
  QualificationLevel,
} from "@/lib/types/domain";
import type { Pagination } from "@/lib/api/pagination";

export async function findLeadByWebsiteDomain(
  db: DbClient,
  websiteDomain: string,
): Promise<Lead | null> {
  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("website_domain", websiteDomain)
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to look up lead by website_domain", error);
  }
  return data;
}

export async function findLeadById(db: DbClient, id: string): Promise<Lead | null> {
  const { data, error } = await db.from("leads").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to look up lead by id", error);
  }
  return data;
}

export async function findOtherLeadWithDomain(
  db: DbClient,
  websiteDomain: string,
  excludeLeadId: string,
): Promise<Lead | null> {
  const { data, error } = await db
    .from("leads")
    .select("*")
    .eq("website_domain", websiteDomain)
    .neq("id", excludeLeadId)
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to look up other leads sharing a website_domain", error);
  }
  return data;
}

export type InsertLeadResult = { outcome: "inserted"; lead: Lead } | { outcome: "conflict" };

export async function insertLead(db: DbClient, insert: LeadInsert): Promise<InsertLeadResult> {
  const { data, error } = await db.from("leads").insert(insert).select().single();

  if (error) {
    if (isUniqueViolation(error)) {
      return { outcome: "conflict" };
    }
    throw new DatabaseError("Failed to insert lead", error);
  }

  return { outcome: "inserted", lead: data };
}

export async function insertProcessingRun(
  db: DbClient,
  insert: LeadProcessingRunInsert,
): Promise<LeadProcessingRun> {
  const { data, error } = await db.from("lead_processing_runs").insert(insert).select().single();

  if (error) {
    throw new DatabaseError("Failed to insert lead_processing_runs row", error);
  }
  return data;
}

export interface ClaimProcessingRunsArgs {
  limit: number;
  workerId: string;
  leaseSeconds: number;
}

// Atomically claims up to `limit` eligible runs via the
// claim_lead_processing_runs() RPC (FOR UPDATE SKIP LOCKED under the hood —
// see the Phase 3 migration). This is the only way runs are claimed; there
// is deliberately no separate "list then update" path, since that would let
// two workers select the same row before either one locks it.
export async function claimProcessingRuns(
  db: DbClient,
  args: ClaimProcessingRunsArgs,
): Promise<ClaimedRun[]> {
  const { data, error } = await db.rpc("claim_lead_processing_runs", {
    p_limit: args.limit,
    p_worker_id: args.workerId,
    p_lease_seconds: args.leaseSeconds,
  });

  if (error) {
    throw new DatabaseError("Failed to claim lead_processing_runs", error);
  }
  return data ?? [];
}

// Persists a run's outcome, guarded by `locked_by = expectedLockedBy` — a
// compare-and-swap so a worker can never overwrite a run whose lease it no
// longer holds (e.g. it took so long the lease expired and another worker
// already reclaimed and re-processed it). Throws LostLeaseError if the guard
// doesn't match anything, rather than silently updating 0 rows.
export async function updateProcessingRun(
  db: DbClient,
  id: string,
  expectedLockedBy: string,
  patch: Partial<LeadProcessingRunInsert>,
): Promise<LeadProcessingRun> {
  const { data, error } = await db
    .from("lead_processing_runs")
    .update(patch)
    .eq("id", id)
    .eq("locked_by", expectedLockedBy)
    .select()
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to update lead_processing_runs row", error);
  }
  if (!data) {
    throw new LostLeaseError(id);
  }
  return data;
}

export async function getLatestRunForLead(
  db: DbClient,
  leadId: string,
): Promise<LeadProcessingRun | null> {
  const { data, error } = await db
    .from("lead_processing_runs")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new DatabaseError("Failed to look up processing run for lead", error);
  }
  return data;
}

export async function insertProcessingEvent(
  db: DbClient,
  insert: ProcessingEventInsert,
): Promise<ProcessingEvent> {
  const { data, error } = await db.from("processing_events").insert(insert).select().single();

  if (error) {
    throw new DatabaseError("Failed to insert processing_events row", error);
  }
  return data;
}

export async function listEventsForLead(
  db: DbClient,
  leadId: string,
): Promise<ProcessingEvent[]> {
  const { data, error } = await db
    .from("processing_events")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new DatabaseError("Failed to list processing_events for lead", error);
  }
  return data;
}

export interface LeadListFilters {
  status?: LeadStatus;
  industry?: string;
  country?: string;
  qualification_level?: QualificationLevel;
}

export interface LeadListResult {
  leads: Lead[];
  total: number;
}

export async function listLeads(
  db: DbClient,
  filters: LeadListFilters,
  pagination: Pagination,
): Promise<LeadListResult> {
  let query = db.from("leads").select("*", { count: "exact" });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.industry) query = query.eq("industry", filters.industry);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.qualification_level) {
    query = query.eq("qualification_level", filters.qualification_level);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (error) {
    throw new DatabaseError("Failed to list leads", error);
  }

  return { leads: data ?? [], total: count ?? 0 };
}
