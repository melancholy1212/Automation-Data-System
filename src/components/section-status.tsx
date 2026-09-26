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
  const className = "h-4 w-4";
  if (tone === "info") return <IconLoader className={`${className} animate-spin-slow`} />;
  if (tone === "warning") return <IconRetry className={className} />;
  if (tone === "error") return <IconAlert className={className} />;
  return <IconClock className={className} />;
}

export function SectionStatusPanel({ status }: { status: SectionStatus }) {
  const color = TONE_COLOR[status.tone];

  return (
    <div
      className="flex gap-3 rounded-md border px-3.5 py-3"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, var(--border))`,
        backgroundColor: `color-mix(in srgb, ${color} 7%, transparent)`,
      }}
    >
      <span className="mt-0.5 shrink-0" style={{ color }}>
        <ToneIcon tone={status.tone} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium text-foreground">{status.headline}</p>
        <p className="text-sm text-muted">{status.body}</p>
        {status.rawFailureReason ? (
          <details className="mt-1 text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-muted">Technical details</summary>
            <p className="mt-1 rounded bg-surface-muted px-2 py-1.5 font-mono">{status.rawFailureReason}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
