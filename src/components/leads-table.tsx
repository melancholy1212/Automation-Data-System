import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { QualificationLevelBadge } from "@/components/qualification-level-badge";
import { StatusBadge } from "@/components/status-badge";
import { formatRelativeTime } from "@/lib/format";
import type { Lead } from "@/lib/types/domain";

export function LeadsTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <EmptyState message="No leads yet. Add your first company to start the pipeline." />;
  }

  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-muted text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-3 py-2 font-medium">Company</th>
            <th className="px-3 py-2 font-medium">Domain</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Qualification</th>
            <th className="px-3 py-2 font-medium">Industry</th>
            <th className="px-3 py-2 font-medium">Country</th>
            <th className="px-3 py-2 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
              <td className="px-3 py-2">
                <Link href={`/leads/${lead.id}`} className="font-medium text-foreground hover:text-accent">
                  {lead.company_name}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted">{lead.website_domain ?? "—"}</td>
              <td className="px-3 py-2">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <QualificationLevelBadge level={lead.qualification_level} />
                  {lead.qualification_score !== null ? (
                    <span className="font-mono text-xs text-muted">{lead.qualification_score}</span>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2 text-muted">{lead.industry ?? "—"}</td>
              <td className="px-3 py-2 text-muted">{lead.country ?? "—"}</td>
              <td className="px-3 py-2 text-muted">{formatRelativeTime(lead.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
