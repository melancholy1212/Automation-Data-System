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

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const color = STATUS_COLOR[status] ?? "var(--muted)";
  const pulsing = PULSING_STATUSES.has(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-border bg-surface-muted px-2 py-0.5 text-xs font-medium tracking-wide text-foreground ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulsing ? "animate-pulse-dot" : ""}`}
        style={{ backgroundColor: color }}
        aria-hidden
      />
      {titleCase(status)}
    </span>
  );
}
