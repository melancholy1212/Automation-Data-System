import { IconAlert, IconCheck, IconClock, IconLoader, IconLock, IconRetry } from "@/components/icons";
import { deriveStageViews, type StageDisplayState } from "@/lib/pipeline-view";
import { titleCase } from "@/lib/format";
import type { LeadProcessingRun } from "@/lib/types/domain";

const STATE_COLOR: Record<StageDisplayState, string> = {
  pending: "var(--muted)",
  active: "var(--status-processing)",
  retrying: "var(--status-blocked)",
  completed: "var(--status-completed)",
  blocked: "var(--status-blocked)",
  failed: "var(--status-failed)",
  invalid: "var(--status-invalid)",
  duplicate: "var(--status-duplicate)",
  needs_review: "var(--status-needs-review)",
};

const STAGE_LABEL: Record<string, string> = {
  validating: "Validate",
  normalizing: "Normalize",
  deduplicating: "Deduplicate",
  enriching: "Enrich",
  classifying: "Classify",
  qualifying: "Qualify",
  generating_brief: "Brief",
};

function StageIcon({ state, className }: { state: StageDisplayState; className: string }) {
  if (state === "completed") return <IconCheck className={className} />;
  if (state === "active") return <IconLoader className={`${className} animate-spin-slow`} />;
  if (state === "retrying") return <IconRetry className={className} />;
  if (state === "blocked") return <IconLock className={className} />;
  if (state === "failed" || state === "invalid") return <IconAlert className={className} />;
  if (state === "pending") return null;
  return <IconClock className={className} />;
}

export function PipelineStages({ run }: { run: LeadProcessingRun | null }) {
  const views = deriveStageViews(run);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex items-start overflow-x-auto pb-1">
        {views.map((view, index) => {
          const color = STATE_COLOR[view.state];
          const filled = view.state !== "pending";
          return (
            <li key={view.stage} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold"
                  style={
                    filled
                      ? {
                          color,
                          borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${color} 14%, var(--surface))`,
                        }
                      : { borderColor: "var(--border)", color: "var(--muted-foreground)" }
                  }
                >
                  <StageIcon state={view.state} className="h-3.5 w-3.5" />
                  {view.state === "pending" ? index + 1 : null}
                </span>
                <span className="whitespace-nowrap text-[11px] font-medium tracking-wide text-muted uppercase">
                  {STAGE_LABEL[view.stage] ?? titleCase(view.stage)}
                </span>
                <span
                  className={`text-[11px] font-medium ${view.state === "active" ? "animate-pulse-dot" : ""}`}
                  style={{ color }}
                >
                  {titleCase(view.state)}
                </span>
              </div>
              {index < views.length - 1 ? (
                <div
                  className="mt-4 h-px flex-1 rounded-full"
                  style={{
                    backgroundColor:
                      index < views.findIndex((v) => v.stage === run?.current_stage)
                        ? "color-mix(in srgb, var(--status-completed) 60%, transparent)"
                        : "var(--border)",
                    minWidth: "1.5rem",
                  }}
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {run?.status === "completed" ? (
        <p className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--status-completed)" }}>
          <IconCheck className="h-3.5 w-3.5" />
          Pipeline completed.
        </p>
      ) : null}
    </div>
  );
}
