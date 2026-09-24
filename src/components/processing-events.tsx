import { EmptyState } from "@/components/empty-state";
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

export function ProcessingEvents({ events }: { events: ProcessingEvent[] }) {
  if (events.length === 0) {
    return <EmptyState message="No processing events recorded." />;
  }

  return (
    <ol className="flex flex-col gap-0">
      {events.map((event, index) => {
        const { title, detail } = describeEvent(event);
        return (
          <li key={event.id} className="relative flex gap-3 pb-4 pl-1 last:pb-0">
            {index < events.length - 1 ? (
              <span className="absolute top-3 left-[7px] h-full w-px bg-border" aria-hidden />
            ) : null}
            <span
              className="relative z-10 mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
              aria-hidden
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-xs text-muted">{formatDateTime(event.created_at)}</span>
                <span className="text-sm font-medium text-foreground">{title}</span>
              </div>
              {detail ? <span className="text-xs text-muted">{detail}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
