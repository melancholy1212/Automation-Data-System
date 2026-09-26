const GROUPS = [
  { key: "known" as const, label: "Known", color: "var(--status-completed)", hint: "Supported by evidence" },
  { key: "inferred" as const, label: "Inferred", color: "var(--status-blocked)", hint: "A reasonable interpretation" },
  { key: "unknown" as const, label: "Unknown", color: "var(--muted)", hint: "Not enough evidence" },
];

export function KnownInferredUnknown({
  facts,
}: {
  facts: { known: string[]; inferred: string[]; unknown: string[] } | null;
}) {
  if (!facts || (facts.known.length === 0 && facts.inferred.length === 0 && facts.unknown.length === 0)) {
    return <p className="text-sm text-muted">No known/inferred/unknown breakdown is available.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {GROUPS.map((group) => (
        <div key={group.key} className="border-l-2 pl-3" style={{ borderColor: `color-mix(in srgb, ${group.color} 45%, transparent)` }}>
          <h4 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wide uppercase" style={{ color: group.color }}>
            {group.label}
          </h4>
          <p className="mb-2 text-[11px] text-muted-foreground">{group.hint}</p>
          {facts[group.key].length === 0 ? (
            <p className="text-sm text-muted">None recorded.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm text-foreground">
              {facts[group.key].map((item, index) => (
                <li key={index} className={group.key === "inferred" ? "text-muted italic" : undefined}>
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
