import { SectionStatusPanel } from "@/components/section-status";
import { describeSectionState } from "@/lib/status-copy";
import type { LeadProcessingRun, LeadQualification } from "@/lib/types/domain";

interface QualificationReason {
  factor: string;
  contribution: number;
  detail: string;
  source: string;
}

function isReason(value: unknown): value is QualificationReason {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.factor === "string" && typeof v.contribution === "number" && typeof v.source === "string";
}

// Defensive parsing of the jsonb `reasons` column — in practice always
// written by qualifyStage in exactly this shape, but this is untrusted JSON
// from the database's point of view, not a TypeScript-checked value.
function parseReasons(reasons: unknown): QualificationReason[] {
  if (!Array.isArray(reasons)) return [];
  return reasons.filter(isReason);
}

const SOURCE_LABEL: Record<string, string> = {
  deterministic: "Deterministic",
  ai: "AI relevance",
  evidence: "Evidence",
};

function ComponentBar({ label, weightLabel, value }: { label: string; weightLabel: string; value: number }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">{value}</span>/100 · {weightLabel}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function QualificationBreakdown({
  qualification,
  run = null,
}: {
  qualification: LeadQualification | null;
  run?: LeadProcessingRun | null;
}) {
  if (!qualification) {
    const status = describeSectionState(run, "qualifying", "Qualification");
    return status ? (
      <SectionStatusPanel status={status} />
    ) : (
      <p className="text-sm text-muted">The breakdown will appear once qualification completes.</p>
    );
  }

  const reasons = parseReasons(qualification.reasons);
  const evidencePercent = Math.round(qualification.evidence_confidence * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ComponentBar label="Deterministic" weightLabel="40%" value={qualification.deterministic_score} />
        <ComponentBar label="AI relevance" weightLabel="40%" value={qualification.ai_score} />
        <ComponentBar label="Evidence confidence" weightLabel="20%" value={evidencePercent} />
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Contributing factors</h4>
        {reasons.length === 0 ? (
          <p className="text-sm text-muted">No individual factors were recorded for this qualification.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-md border border-border">
            {reasons.map((reason, index) => (
              <li
                key={`${reason.factor}-${index}`}
                className="flex items-start justify-between gap-3 bg-surface-muted px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="text-foreground">{reason.detail || reason.factor}</p>
                  <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {SOURCE_LABEL[reason.source] ?? reason.source}
                  </span>
                </div>
                <span
                  className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-xs tabular-nums"
                  style={
                    reason.contribution >= 0
                      ? { color: "var(--status-completed)", backgroundColor: "color-mix(in srgb, var(--status-completed) 12%, transparent)" }
                      : { color: "var(--status-failed)", backgroundColor: "color-mix(in srgb, var(--status-failed) 12%, transparent)" }
                  }
                >
                  {reason.contribution > 0 ? "+" : ""}
                  {reason.contribution}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {Array.isArray(qualification.opportunity_signals) && qualification.opportunity_signals.length > 0 ? (
        <div>
          <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">Opportunity signals</h4>
          <ul className="flex flex-col gap-1 text-sm text-foreground">
            {(qualification.opportunity_signals as unknown[])
              .filter((s): s is string => typeof s === "string")
              .map((signal, index) => (
                <li key={index} className="flex gap-2">
                  <span className="text-accent">·</span>
                  {signal}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
