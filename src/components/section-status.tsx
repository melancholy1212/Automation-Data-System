import { IconAlert, IconClock, IconLoader, IconRetry } from "@/components/icons";
import type { SectionStatus, StatusTone } from "@/lib/status-copy";

const TONE_COLOR: Record<StatusTone, string> = {
  neutral: "var(--muted)",
  info: "var(--status-processing)",
  warning: "var(--status-blocked)",
  error: "var(--status-failed)",
  success: "var(--status-completed)",
};

function ToneIcon({ tone }: { tone: StatusTone }) {
  const className = "h-3.5 w-3.5";
  if (tone === "info") return <IconLoader className={`${className} animate-spin-slow`} />;
  if (tone === "warning") return <IconRetry className={className} />;
  if (tone === "error") return <IconAlert className={className} />;
  return <IconClock className={className} />;
}

export function SectionStatusPanel({ status }: { status: SectionStatus }) {
  const color = TONE_COLOR[status.tone];

  return (
    <div
      className="flex gap-3 rounded-r-md bg-surface-muted py-3 pr-3.5 pl-3.5"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <span
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ color, backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
      >
        <ToneIcon tone={status.tone} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{status.headline}</p>
        <p className="text-sm text-muted">{status.body}</p>
        {status.rawFailureReason ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-muted">Technical details</summary>
            <p className="mt-1 rounded bg-surface-hover px-2 py-1.5 font-mono">{status.rawFailureReason}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
