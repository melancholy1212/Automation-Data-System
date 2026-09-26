import Link from "next/link";

import { getLeadStatusCounts } from "@/lib/db/leads.repository";
import { getSupabase } from "@/lib/supabase/client";
import type { LeadStatus, QualificationLevel } from "@/lib/types/domain";

export const metadata = { title: "Pipeline" };
// Always reflects live database state — never statically prerendered.
export const dynamic = "force-dynamic";

const STATUS_CARDS: Array<{ status: LeadStatus; label: string; color: string }> = [
  { status: "pending", label: "Pending", color: "var(--status-pending)" },
  { status: "processing", label: "Processing", color: "var(--status-processing)" },
  { status: "completed", label: "Completed", color: "var(--status-completed)" },
  { status: "failed", label: "Failed", color: "var(--status-failed)" },
  { status: "duplicate", label: "Duplicate", color: "var(--status-duplicate)" },
  { status: "invalid", label: "Invalid", color: "var(--status-invalid)" },
];

const QUALIFICATION_CARDS: Array<{ level: QualificationLevel; label: string; color: string }> = [
  { level: "high", label: "High", color: "var(--level-high)" },
  { level: "medium", label: "Medium", color: "var(--level-medium)" },
  { level: "low", label: "Low", color: "var(--level-low)" },
  { level: "unqualified", label: "Unqualified", color: "var(--level-unqualified)" },
];

function SegmentedBar({ segments, total }: { segments: Array<{ value: number; color: string }>; total: number }) {
  if (total === 0) {
    return <div className="h-2 w-full rounded-full bg-surface-muted" />;
  }
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-surface-muted">
      {segments
        .filter((s) => s.value > 0)
        .map((segment, index) => (
          <div
            key={index}
            style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.color }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  total,
  color,
}: {
  href: string;
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2.5 rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
          {label}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground">{pct}%</span>
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </Link>
  );
}

export default async function PipelinePage() {
  const db = getSupabase();
  const counts = await getLeadStatusCounts(db);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Operations</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground">Pipeline overview</h1>
        <p className="mt-1 text-sm text-muted">Operational visibility across every lead currently tracked.</p>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Total leads</h2>
          <span className="mt-1 block font-mono text-4xl font-semibold tabular-nums text-foreground">{counts.total}</span>
        </div>
        <div className="w-full max-w-md sm:w-80">
          <SegmentedBar
            total={counts.total}
            segments={STATUS_CARDS.map((c) => ({ value: counts.byStatus[c.status], color: c.color }))}
          />
          <p className="mt-2 text-xs text-muted-foreground">Distribution by current processing status</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">By processing status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_CARDS.map((card) => (
            <StatCard
              key={card.status}
              href={`/?status=${card.status}`}
              label={card.label}
              value={counts.byStatus[card.status]}
              total={counts.total}
              color={card.color}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted uppercase">By qualification level</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUALIFICATION_CARDS.map((card) => (
            <StatCard
              key={card.level}
              href={`/?qualification_level=${card.level}`}
              label={card.label}
              value={counts.byQualificationLevel[card.level]}
              total={counts.total}
              color={card.color}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
