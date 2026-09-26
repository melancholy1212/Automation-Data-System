"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { IconExternal } from "@/components/icons";
import { formatDateTime, formatHostname } from "@/lib/format";
import type { EvidenceRelevance, LeadEvidence } from "@/lib/types/domain";

const RELEVANCE_LABEL: Record<EvidenceRelevance, string> = {
  primary: "Official",
  supporting: "Supporting",
  contextual: "Other",
};

const RELEVANCE_COLOR: Record<EvidenceRelevance, string> = {
  primary: "var(--status-completed)",
  supporting: "var(--status-processing)",
  contextual: "var(--muted)",
};

type FilterValue = "all" | EvidenceRelevance;

export function EvidenceList({ evidence }: { evidence: LeadEvidence[] }) {
  const [filter, setFilter] = useState<FilterValue>("all");

  const counts = useMemo(() => {
    const base: Record<FilterValue, number> = { all: evidence.length, primary: 0, supporting: 0, contextual: 0 };
    for (const item of evidence) {
      base[item.relevance] += 1;
    }
    return base;
  }, [evidence]);

  const filtered = filter === "all" ? evidence : evidence.filter((item) => item.relevance === filter);

  if (evidence.length === 0) {
    return <EmptyState message="No supporting evidence was collected." />;
  }

  const filters: FilterValue[] = ["all", "primary", "supporting", "contextual"];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {filters.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === value
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {value === "all" ? "All" : RELEVANCE_LABEL[value]} ({counts[value]})
          </button>
        ))}
      </div>

      <ul className="flex flex-col divide-y divide-border">
        {filtered.map((item) => {
          const color = RELEVANCE_COLOR[item.relevance];
          return (
            <li key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="truncate text-sm font-medium text-foreground">{item.title ?? "Untitled source"}</p>
                  <span className="shrink-0 text-[11px] font-semibold tracking-wide uppercase" style={{ color }}>
                    {RELEVANCE_LABEL[item.relevance]}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {item.source_type} · {formatHostname(item.source_url)} · {formatDateTime(item.collected_at)}
                </p>
                {item.snippet ? <p className="mt-1 line-clamp-1 text-xs text-muted">{item.snippet}</p> : null}
              </div>
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="mt-0.5 flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:text-accent-strong hover:underline"
                >
                  View
                  <IconExternal className="h-3 w-3" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
