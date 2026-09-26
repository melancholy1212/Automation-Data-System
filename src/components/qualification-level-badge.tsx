import { titleCase } from "@/lib/format";
import type { QualificationLevel } from "@/lib/types/domain";

const LEVEL_COLOR: Record<QualificationLevel, string> = {
  high: "var(--level-high)",
  medium: "var(--level-medium)",
  low: "var(--level-low)",
  unqualified: "var(--level-unqualified)",
};

export function QualificationLevelBadge({
  level,
  className = "",
}: {
  level: QualificationLevel | null;
  className?: string;
}) {
  if (!level) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden />
        Not yet scored
      </span>
    );
  }

  const color = LEVEL_COLOR[level];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide ${className}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 32%, var(--border))`,
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      {titleCase(level)}
    </span>
  );
}
