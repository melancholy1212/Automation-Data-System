"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "duplicate", label: "Duplicate" },
  { value: "invalid", label: "Invalid" },
  { value: "needs_review", label: "Needs review" },
];

const QUALIFICATION_OPTIONS = [
  { value: "", label: "Any qualification" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "unqualified", label: "Unqualified" },
];

const SORT_OPTIONS = [
  { value: "updated_at:desc", label: "Recently updated" },
  { value: "updated_at:asc", label: "Least recently updated" },
  { value: "qualification_score:desc", label: "Score: high to low" },
  { value: "qualification_score:asc", label: "Score: low to high" },
];

export function LeadsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParams(patch: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    router.push(`/?${params.toString()}`);
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (search !== (searchParams.get("search") ?? "")) {
        updateParams({ search: search || null });
      }
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const sortValue = `${searchParams.get("sort") ?? "updated_at"}:${searchParams.get("order") ?? "desc"}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search company or domain…"
        className="w-56 rounded border border-border bg-surface-muted px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      />
      <select
        value={searchParams.get("status") ?? ""}
        onChange={(event) => updateParams({ status: event.target.value || null })}
        className="rounded border border-border bg-surface-muted px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={searchParams.get("qualification_level") ?? ""}
        onChange={(event) => updateParams({ qualification_level: event.target.value || null })}
        className="rounded border border-border bg-surface-muted px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      >
        {QUALIFICATION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <select
        value={sortValue}
        onChange={(event) => {
          const [field, order] = event.target.value.split(":");
          updateParams({ sort: field, order });
        }}
        className="rounded border border-border bg-surface-muted px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-accent"
      >
        {SORT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="rounded border border-border px-2.5 py-1.5 text-sm text-muted hover:border-border-strong hover:text-foreground"
        title="Refresh"
      >
        ↻ Refresh
      </button>
    </div>
  );
}
