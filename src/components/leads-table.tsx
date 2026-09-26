import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { QualificationLevelBadge } from "@/components/qualification-level-badge";
import { StatusBadge } from "@/components/status-badge";
import { formatRelativeTime } from "@/lib/format";
import type { Lead } from "@/lib/types/domain";

const MONOGRAM_HUES = ["#60a5fa", "#34d399", "#f59e0b", "#f472b6", "#a78bfa", "#38bdf8", "#fb7185", "#4ade80"];

function monogramHue(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return MONOGRAM_HUES[hash % MONOGRAM_HUES.length];
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function CompanyMonogram({ name }: { name: string }) {
  const hue = monogramHue(name);
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
      style={{ color: hue, backgroundColor: `color-mix(in srgb, ${hue} 16%, var(--surface-muted))` }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function LeadsTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <EmptyState message="No leads yet. Add your first company to start the pipeline." />;
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Company</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Qualification</th>
              <th className="px-3 py-2.5">Industry</th>
              <th className="px-3 py-2.5">Country</th>
              <th className="px-4 py-2.5 text-right">Updated</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} className="group border-b border-border last:border-b-0 hover:bg-surface-hover">
                <td className="px-4 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="flex min-w-0 items-center gap-2.5">
                    <CompanyMonogram name={lead.company_name} />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium text-foreground group-hover:text-accent">
                        {lead.company_name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{lead.website_domain ?? "no domain on file"}</span>
                    </span>
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <QualificationLevelBadge level={lead.qualification_level} />
                    {lead.qualification_score !== null ? (
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {lead.qualification_score}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-muted">{lead.industry ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 text-muted">{lead.country ?? <span className="text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                  {formatRelativeTime(lead.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
