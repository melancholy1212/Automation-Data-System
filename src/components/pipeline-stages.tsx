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

export function PipelineStages({ run }: { run: LeadProcessingRun | null }) {
  const views = deriveStageViews(run);

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-3">
        {views.map((view, index) => (
          <li key={view.stage} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5 px-1">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  view.state === "pending" ? "border-border text-muted" : "border-transparent text-background"
                }`}
                style={view.state === "pending" ? undefined : { backgroundColor: STATE_COLOR[view.state] }}
              >
                {index + 1}
              </span>
              <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-muted">
                {STAGE_LABEL[view.stage] ?? titleCase(view.stage)}
              </span>
              <span
                className={`text-[11px] font-medium ${view.state === "active" ? "animate-pulse-dot" : ""}`}
                style={{ color: STATE_COLOR[view.state] }}
              >
                {titleCase(view.state)}
              </span>
            </div>
            {index < views.length - 1 ? (
              <span className="mx-1 mb-6 h-px w-6 shrink-0 bg-border sm:w-10" aria-hidden />
            ) : null}
          </li>
        ))}
      </ol>
      {run?.status === "completed" ? (
        <p className="text-xs text-status-completed" style={{ color: "var(--status-completed)" }}>
          Pipeline completed.
        </p>
      ) : null}
    </div>
  );
}
