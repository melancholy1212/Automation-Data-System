import { AddLeadDialog } from "@/components/add-lead-dialog";
import { LeadsFilters } from "@/components/leads-filters";
import { LeadsTable } from "@/components/leads-table";
import { PaginationControls } from "@/components/pagination-controls";
import { parsePagination } from "@/lib/api/pagination";
import { listLeads, type LeadListFilters, type LeadListSort, type LeadSortField } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";
import type { LeadStatus, QualificationLevel } from "@/lib/types/domain";

export const metadata = { title: "Leads" };
// Always reflects live database state — never statically prerendered.
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const searchParamsObj = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]): string[][] =>
      value === undefined ? [] : Array.isArray(value) ? value.map((v) => [key, v]) : [[key, value]],
    ),
  );
  const pagination = parsePagination(searchParamsObj);

  const filters: LeadListFilters = {
    status: first(params.status) as LeadStatus | undefined,
    qualification_level: first(params.qualification_level) as QualificationLevel | undefined,
    search: first(params.search)?.trim() || undefined,
  };

  const sortField: LeadSortField = first(params.sort) === "qualification_score" ? "qualification_score" : "updated_at";
  const sort: LeadListSort = { field: sortField, ascending: first(params.order) === "asc" };

  const db = getSupabase();
  const { leads, total } = await listLeads(db, filters, pagination, sort);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Operations</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted">
            {total} lead{total === 1 ? "" : "s"} tracked across the intelligence pipeline
          </p>
        </div>
        <AddLeadDialog />
      </div>

      <LeadsFilters />

      <LeadsTable leads={leads} />

      <PaginationControls offset={pagination.offset} limit={pagination.limit} total={total} />
    </div>
  );
}
