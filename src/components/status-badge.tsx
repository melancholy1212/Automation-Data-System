import { IconAlert, IconCheck, IconClock, IconLoader, IconLock } from "@/components/icons";
import { titleCase } from "@/lib/format";

// Covers every value either leads.status or lead_processing_runs.status can
// take, so one component renders both without the caller needing to know
// which enum it's looking at.
const STATUS_COLOR: Record<string, string> = {
  pending: "var(--status-pending)",
  processing: "var(--status-processing)",
  validating: "var(--status-processing)",
  normalizing: "var(--status-processing)",
  deduplicating: "var(--status-processing)",
  enriching: "var(--status-processing)",
  classifying: "var(--status-processing)",
  qualifying: "var(--status-processing)",
  generating_brief: "var(--status-processing)",
  completed: "var(--status-completed)",
  failed: "var(--status-failed)",
  blocked: "var(--status-blocked)",
  duplicate: "var(--status-duplicate)",
  invalid: "var(--status-invalid)",
  needs_review: "var(--status-needs-review)",
};

const PULSING_STATUSES = new Set(["processing", "validating", "normalizing", "deduplicating", "enriching", "classifying", "qualifying", "generating_brief"]);
const FAILURE_STATUSES = new Set(["failed", "invalid", "needs_review"]);

function StatusIcon({ status, className }: { status: string; className: string }) {
  if (status === "completed") return <IconCheck className={className} />;
  if (FAILURE_STATUSES.has(status)) return <IconAlert className={className} />;
  if (status === "blocked") return <IconLock className={className} />;
  if (PULSING_STATUSES.has(status)) return <IconLoader className={`${className} animate-spin-slow`} />;
  return <IconClock className={className} />;
}

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const color = STATUS_COLOR[status] ?? "var(--muted)";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium tracking-wide ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 32%, var(--border))`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <StatusIcon status={status} className="h-3 w-3" />
      {titleCase(status)}
    </span>
  );
}
