import type { LeadQualification } from "@/lib/types/domain";

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
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted">
          <span className="font-mono tabular-nums">{value}</span>/100 · {weightLabel}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full bg-accent"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}

export function QualificationBreakdown({ qualification }: { qualification: LeadQualification | null }) {
  if (!qualification) {
    return (
      <p className="text-sm text-muted">
        Qualification has not run for this lead yet — the breakdown appears once it completes.
      </p>
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
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Contributing factors</h4>
        {reasons.length === 0 ? (
          <p className="text-sm text-muted">No individual factors were recorded for this qualification.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reasons.map((reason, index) => (
              <li
                key={`${reason.factor}-${index}`}
                className="flex items-start justify-between gap-3 rounded border border-border bg-surface-muted px-3 py-2 text-sm"
              >
                <div>
                  <p className="text-foreground">{reason.detail || reason.factor}</p>
                  <span className="text-xs uppercase tracking-wide text-muted">
                    {SOURCE_LABEL[reason.source] ?? reason.source}
                  </span>
                </div>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
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
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Opportunity signals</h4>
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
