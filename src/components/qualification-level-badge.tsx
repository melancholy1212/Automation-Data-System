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
    return <span className={`text-xs text-muted ${className}`}>Not yet scored</span>;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded border border-border px-2 py-0.5 text-xs font-semibold tracking-wide ${className}`}
      style={{ color: LEVEL_COLOR[level] }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: LEVEL_COLOR[level] }}
        aria-hidden
      />
      {titleCase(level)}
    </span>
  );
}
