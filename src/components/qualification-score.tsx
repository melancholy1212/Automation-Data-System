import { QualificationLevelBadge } from "@/components/qualification-level-badge";
import type { QualificationLevel } from "@/lib/types/domain";

const LEVEL_COLOR: Record<QualificationLevel, string> = {
  high: "var(--level-high)",
  medium: "var(--level-medium)",
  low: "var(--level-low)",
  unqualified: "var(--level-unqualified)",
};

export function QualificationScore({
  score,
  level,
}: {
  score: number | null;
  level: QualificationLevel | null;
}) {
  const color = level ? LEVEL_COLOR[level] : "var(--muted)";

  return (
    <div className="flex items-baseline gap-3">
      <span className="font-mono text-4xl font-semibold tabular-nums" style={{ color }}>
        {score ?? "—"}
        <span className="text-lg text-muted">/100</span>
      </span>
      <QualificationLevelBadge level={level} />
    </div>
  );
}
