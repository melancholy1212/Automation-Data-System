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

export async function updateLeadStatus(db: DbClient, leadId: string, status: LeadStatus): Promise<void> {
  const { error } = await db.from("leads").update({ status }).eq("id", leadId);
  if (error) {
    throw new DatabaseError("Failed to update lead status", error);
  }
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

// A human-initiated reset (via POST /api/leads/:id/retry), not a worker-
// owned update — it doesn't go through updateProcessingRun's lock-ownership
// guard, since a failed/blocked run has no active lease to check against.
// Resumes from the same stage it stopped at (current_stage), with a fresh
// attempt budget.
export async function resetRunForRetry(
  db: DbClient,
  run: LeadProcessingRun,
): Promise<LeadProcessingRun> {
  const { data, error } = await db
    .from("lead_processing_runs")
    .update({
      status: run.current_stage,
      attempt_count: 0,
      failure_reason: null,
      completed_at: null,
      next_attempt_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      lease_expires_at: null,
    })
    .eq("id", run.id)
    .select()
    .single();

  if (error) {
    throw new DatabaseError("Failed to reset run for retry", error);
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
  /** Matches company_name or website_domain (case-insensitive, substring). */
  search?: string;
}

export type LeadSortField = "updated_at" | "qualification_score";

export interface LeadListSort {
  field: LeadSortField;
  ascending: boolean;
}

export interface LeadListResult {
  leads: Lead[];
  total: number;
}

const DEFAULT_SORT: LeadListSort = { field: "updated_at", ascending: false };

export async function listLeads(
  db: DbClient,
  filters: LeadListFilters,
  pagination: Pagination,
  sort: LeadListSort = DEFAULT_SORT,
): Promise<LeadListResult> {
  let query = db.from("leads").select("*", { count: "exact" });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.industry) query = query.eq("industry", filters.industry);
  if (filters.country) query = query.eq("country", filters.country);
  if (filters.qualification_level) {
    query = query.eq("qualification_level", filters.qualification_level);
  }
  if (filters.search) {
    const term = `%${filters.search}%`;
    query = query.or(`company_name.ilike.${term},website_domain.ilike.${term}`);
  }

  const { data, error, count } = await query
    .order(sort.field, { ascending: sort.ascending, nullsFirst: sort.ascending })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  if (error) {
    throw new DatabaseError("Failed to list leads", error);
  }

  return { leads: data ?? [], total: count ?? 0 };
}

export interface LeadStatusCounts {
  total: number;
  byStatus: Record<LeadStatus, number>;
  byQualificationLevel: Record<QualificationLevel, number>;
}

const LEAD_STATUSES: readonly LeadStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "duplicate",
  "needs_review",
  "invalid",
];
const QUALIFICATION_LEVELS: readonly QualificationLevel[] = ["unqualified", "low", "medium", "high"];

// Powers the pipeline overview (Phase 5) with a handful of cheap counting
// queries rather than pulling every lead into the browser to tally them
// client-side.
export async function getLeadStatusCounts(db: DbClient): Promise<LeadStatusCounts> {
  const { count: total, error: totalError } = await db
    .from("leads")
    .select("*", { count: "exact", head: true });
  if (totalError) {
    throw new DatabaseError("Failed to count leads", totalError);
  }

  const byStatus = {} as Record<LeadStatus, number>;
  await Promise.all(
    LEAD_STATUSES.map(async (status) => {
      const { count, error } = await db
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("status", status);
      if (error) {
        throw new DatabaseError(`Failed to count leads with status ${status}`, error);
      }
      byStatus[status] = count ?? 0;
    }),
  );

  const byQualificationLevel = {} as Record<QualificationLevel, number>;
  await Promise.all(
    QUALIFICATION_LEVELS.map(async (level) => {
      const { count, error } = await db
        .from("leads")
        .select("*", { count: "exact", head: true })
        .eq("qualification_level", level);
      if (error) {
        throw new DatabaseError(`Failed to count leads with qualification_level ${level}`, error);
      }
      byQualificationLevel[level] = count ?? 0;
    }),
  );

  return { total: total ?? 0, byStatus, byQualificationLevel };
}
