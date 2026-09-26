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
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-4xl font-semibold tabular-nums tracking-tight" style={{ color }}>
          {score ?? "—"}
          <span className="ml-0.5 text-base font-medium text-muted-foreground">/100</span>
        </span>
        <QualificationLevelBadge level={level} />
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-surface-muted">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${score ?? 0}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
