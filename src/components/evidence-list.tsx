"use client";

import { useMemo, useState } from "react";

import { EmptyState } from "@/components/empty-state";
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
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${
              filter === value
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            {value === "all" ? "All" : RELEVANCE_LABEL[value]} ({counts[value]})
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.map((item) => (
          <li key={item.id} className="rounded border border-border bg-surface-muted p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{item.title ?? "Untitled source"}</p>
                {item.source_url ? (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-xs text-accent hover:underline"
                  >
                    {formatHostname(item.source_url)} ↗
                  </a>
                ) : null}
              </div>
              <span
                className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] font-medium"
                style={{ color: RELEVANCE_COLOR[item.relevance] }}
              >
                {RELEVANCE_LABEL[item.relevance]}
              </span>
            </div>
            {item.snippet ? <p className="mt-2 text-sm text-muted">{item.snippet}</p> : null}
            <p className="mt-2 text-[11px] text-muted-foreground">
              {item.source_type} · collected {formatDateTime(item.collected_at)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
