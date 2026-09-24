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

function Card({ href, label, value, color }: { href: string; label: string; value: number; color: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-1 rounded border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover"
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </span>
    </Link>
  );
}

export default async function PipelinePage() {
  const db = getSupabase();
  const counts = await getLeadStatusCounts(db);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Pipeline overview</h1>
        <p className="mt-1 text-sm text-muted">Operational visibility across every lead currently tracked.</p>
      </div>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Total leads</h2>
        <div className="rounded border border-border bg-surface p-4">
          <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">{counts.total}</span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">By processing status</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STATUS_CARDS.map((card) => (
            <Card
              key={card.status}
              href={`/?status=${card.status}`}
              label={card.label}
              value={counts.byStatus[card.status]}
              color={card.color}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">By qualification level</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {QUALIFICATION_CARDS.map((card) => (
            <Card
              key={card.level}
              href={`/?qualification_level=${card.level}`}
              label={card.label}
              value={counts.byQualificationLevel[card.level]}
              color={card.color}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
