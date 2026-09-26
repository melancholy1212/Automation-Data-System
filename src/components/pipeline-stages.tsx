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

const EMPHASIZED = new Set<StageDisplayState>(["active", "retrying", "blocked", "failed", "invalid", "duplicate", "needs_review"]);

function StageIcon({ state, className }: { state: StageDisplayState; className: string }) {
  if (state === "completed") return <IconCheck className={className} />;
  if (state === "active") return <IconLoader className={`${className} animate-spin-slow`} />;
  if (state === "retrying") return <IconRetry className={className} />;
  if (state === "blocked") return <IconLock className={className} />;
  if (state === "failed" || state === "invalid") return <IconAlert className={className} />;
  if (state === "pending") return null;
  return <IconClock className={className} />;
}

// A single plain-language line naming exactly where this lead is right now —
// derived only from data deriveStageViews already computed, never guessed.
function currentStageHeadline(run: LeadProcessingRun | null, views: ReturnType<typeof deriveStageViews>): string | null {
  if (!run) return "Not yet started.";
  if (run.status === "completed") return "Pipeline completed.";
  const current = views.find((v) => v.stage === run.current_stage);
  if (!current) return null;
  const label = STAGE_LABEL[current.stage] ?? titleCase(current.stage);
  switch (current.state) {
    case "active":
      return `In progress — ${label}`;
    case "retrying":
      return `Retrying — ${label}`;
    case "blocked":
      return `Blocked — ${label}`;
    case "failed":
      return `Stopped — ${label}`;
    case "invalid":
      return `Invalid — ${label}`;
    case "duplicate":
      return "Duplicate — stopped at deduplication";
    case "needs_review":
      return `Needs review — ${label}`;
    default:
      return null;
  }
}

export function PipelineStages({ run }: { run: LeadProcessingRun | null }) {
  const views = deriveStageViews(run);
  const currentIndex = views.findIndex((v) => v.stage === run?.current_stage);
  const headline = currentStageHeadline(run, views);

  return (
    <div className="flex flex-col gap-4">
      {headline ? (
        <p className="text-sm font-medium text-foreground">
          {headline}
        </p>
      ) : null}
      <ol className="flex items-start overflow-x-auto pb-1">
        {views.map((view, index) => {
          const color = STATE_COLOR[view.state];
          const filled = view.state !== "pending";
          const emphasized = EMPHASIZED.has(view.state);
          const size = emphasized ? "h-10 w-10" : view.state === "pending" ? "h-7 w-7" : "h-8 w-8";
          return (
            <li key={view.stage} className="flex flex-1 items-start last:flex-none">
              <div className="flex flex-col items-center gap-2">
                <span
                  className={`flex ${size} shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-[width,height]`}
                  style={
                    filled
                      ? {
                          color,
                          borderColor: `color-mix(in srgb, ${color} 50%, transparent)`,
                          backgroundColor: `color-mix(in srgb, ${color} 16%, var(--surface))`,
                          boxShadow: emphasized ? `0 0 0 3px color-mix(in srgb, ${color} 16%, transparent)` : undefined,
                        }
                      : { borderColor: "var(--border)", color: "var(--muted-foreground)", opacity: 0.7 }
                  }
                >
                  <StageIcon state={view.state} className={emphasized ? "h-4 w-4" : "h-3.5 w-3.5"} />
                  {view.state === "pending" ? index + 1 : null}
                </span>
                <span
                  className={`whitespace-nowrap text-[11px] tracking-wide uppercase ${
                    emphasized ? "font-semibold text-foreground" : "font-medium text-muted"
                  }`}
                >
                  {STAGE_LABEL[view.stage] ?? titleCase(view.stage)}
                </span>
                <span
                  className={`text-[11px] font-medium ${view.state === "active" ? "animate-pulse-dot" : ""} ${
                    view.state === "pending" ? "opacity-60" : ""
                  }`}
                  style={{ color }}
                >
                  {titleCase(view.state)}
                </span>
              </div>
              {index < views.length - 1 ? (
                <div
                  className="mt-[18px] h-0 flex-1 border-t"
                  style={
                    index < currentIndex
                      ? { borderColor: "color-mix(in srgb, var(--status-completed) 55%, transparent)", borderTopWidth: "1.5px", minWidth: "1.5rem" }
                      : { borderColor: "var(--border)", borderTopWidth: "1.5px", borderStyle: "dashed", minWidth: "1.5rem" }
                  }
                  aria-hidden
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
