import { EmptyState } from "@/components/empty-state";
import { IconAlert, IconCheck, IconClock, IconLock, IconRetry } from "@/components/icons";
import { formatDateTime, titleCase } from "@/lib/format";
import type { ProcessingEvent } from "@/lib/types/domain";

function metadataString(event: ProcessingEvent, key: string): string | undefined {
  const metadata = event.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function metadataBoolean(event: ProcessingEvent, key: string): boolean {
  const metadata = event.metadata;
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return false;
  }
  return Boolean((metadata as Record<string, unknown>)[key]);
}

// Turns a raw event_type + metadata pair into a human-readable line. Never
// surfaces internal error text beyond what the backend already sanitized
// into `reason` (see sanitizeErrorMessage — no stack traces reach this far).
export function describeEvent(event: ProcessingEvent): { title: string; detail?: string } {
  const stage = metadataString(event, "stage");
  const reason = metadataString(event, "reason");

  switch (event.event_type) {
    case "lead_imported":
      return { title: "Lead imported" };
    case "run.claimed":
      return { title: "Run claimed by worker" };
    case "run.recovered":
      return { title: "Run recovered", detail: "A previous worker's lease had expired" };
    case "stage.started":
      return { title: "Stage started", detail: stage };
    case "stage.completed":
      return {
        title: "Stage completed",
        detail: metadataString(event, "outcome") === "duplicate" ? `${stage} — duplicate detected` : stage,
      };
    case "stage.blocked":
      return { title: "Stage blocked", detail: stage ? `${stage} is not implemented yet` : undefined };
    case "stage.failed":
      return { title: "Stage failed", detail: [stage, reason].filter(Boolean).join(" — ") || undefined };
    case "run_retried":
      return {
        title: metadataBoolean(event, "manual") ? "Manual retry requested" : "Retry scheduled",
        detail: stage,
      };
    case "run.completed":
      return { title: "Pipeline completed" };
    case "run.lease_lost":
      return { title: "Worker lost ownership of this run", detail: "Another worker had already reclaimed it" };
    default:
      return { title: titleCase(event.event_type) };
  }
}

function eventTone(event: ProcessingEvent): { color: string; Icon: typeof IconCheck } {
  switch (event.event_type) {
    case "stage.completed":
    case "run.completed":
      return { color: "var(--status-completed)", Icon: IconCheck };
    case "stage.failed":
      return { color: "var(--status-failed)", Icon: IconAlert };
    case "stage.blocked":
      return { color: "var(--status-blocked)", Icon: IconLock };
    case "run_retried":
    case "run.recovered":
    case "run.lease_lost":
      return { color: "var(--status-blocked)", Icon: IconRetry };
    default:
      return { color: "var(--status-processing)", Icon: IconClock };
  }
}

export function ProcessingEvents({ events }: { events: ProcessingEvent[] }) {
  if (events.length === 0) {
    return <EmptyState message="No processing events recorded." />;
  }

  return (
    <ol className="flex flex-col gap-0">
      {events.map((event, index) => {
        const { title, detail } = describeEvent(event);
        const { color, Icon } = eventTone(event);
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < events.length - 1 ? (
              <span className="absolute top-6 left-[11px] h-[calc(100%-0.5rem)] w-px bg-border" aria-hidden />
            ) : null}
            <span
              className="relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
              style={{ color, backgroundColor: `color-mix(in srgb, ${color} 14%, var(--surface))` }}
              aria-hidden
            >
              <Icon className="h-3 w-3" />
            </span>
            <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-medium text-foreground">{title}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{formatDateTime(event.created_at)}</span>
              </div>
              {detail ? <span className="text-xs text-muted">{detail}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
