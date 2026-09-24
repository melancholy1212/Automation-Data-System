import type { NextRequest } from "next/server";

import { apiError, apiOk } from "@/lib/api/response";
import { parsePagination } from "@/lib/api/pagination";
import { DatabaseError } from "@/lib/db/errors";
import { listLeads, type LeadListFilters, type LeadListSort, type LeadSortField } from "@/lib/db/leads.repository";
import { leadInputSchema } from "@/lib/schemas/lead-input.schema";
import { ingestLead } from "@/lib/services/lead-ingestion.service";
import { getSupabase } from "@/lib/supabase/client";
import type { LeadStatus, QualificationLevel } from "@/lib/types/domain";

const LEAD_STATUS_VALUES: readonly LeadStatus[] = [
  "pending",
  "processing",
  "completed",
  "failed",
  "duplicate",
  "needs_review",
  "invalid",
];

const QUALIFICATION_LEVEL_VALUES: readonly QualificationLevel[] = [
  "unqualified",
  "low",
  "medium",
  "high",
];

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Request body must be valid JSON");
  }

  const parsed = leadInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      400,
      "validation_error",
      "Lead payload failed validation",
      parsed.error.flatten(),
    );
  }

  try {
    const db = getSupabase();
    const result = await ingestLead(db, parsed.data);

    if (result.outcome === "duplicate") {
      return apiOk(
        {
          duplicate: true,
          existing_lead_id: result.existingLead.id,
          existing_lead: result.existingLead,
        },
        409,
      );
    }

    return apiOk({ lead: result.lead }, 201);
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while creating the lead");
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pagination = parsePagination(searchParams);

  const statusParam = searchParams.get("status");
  const qualificationParam = searchParams.get("qualification_level");

  if (statusParam && !LEAD_STATUS_VALUES.includes(statusParam as LeadStatus)) {
    return apiError(400, "invalid_filter", `Unknown status filter: ${statusParam}`);
  }
  if (
    qualificationParam &&
    !QUALIFICATION_LEVEL_VALUES.includes(qualificationParam as QualificationLevel)
  ) {
    return apiError(
      400,
      "invalid_filter",
      `Unknown qualification_level filter: ${qualificationParam}`,
    );
  }

  const filters: LeadListFilters = {
    status: (statusParam as LeadStatus) ?? undefined,
    industry: searchParams.get("industry") ?? undefined,
    country: searchParams.get("country") ?? undefined,
    qualification_level: (qualificationParam as QualificationLevel) ?? undefined,
    search: searchParams.get("search")?.trim() || undefined,
  };

  const sortParam = searchParams.get("sort");
  const sortField: LeadSortField = sortParam === "qualification_score" ? "qualification_score" : "updated_at";
  const sort: LeadListSort = {
    field: sortField,
    ascending: searchParams.get("order") === "asc",
  };

  try {
    const db = getSupabase();
    const { leads, total } = await listLeads(db, filters, pagination, sort);
    return apiOk({
      leads,
      pagination: { limit: pagination.limit, offset: pagination.offset, total },
    });
  } catch (error) {
    if (error instanceof DatabaseError) {
      return apiError(500, "database_error", error.message);
    }
    return apiError(500, "internal_error", "Unexpected error while listing leads");
  }
}
