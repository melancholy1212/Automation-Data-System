"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { IconRefresh, IconSearch } from "@/components/icons";

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

const controlClass =
  "h-8 rounded-md border border-border bg-surface-muted px-2.5 text-sm text-foreground outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/25";

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
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
      <div className="relative">
        <IconSearch className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search company or domain…"
          className={`${controlClass} w-60 pl-8`}
        />
      </div>
      <span className="hidden h-5 w-px bg-border sm:block" aria-hidden />
      <select
        value={searchParams.get("status") ?? ""}
        onChange={(event) => updateParams({ status: event.target.value || null })}
        className={controlClass}
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
        className={controlClass}
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
        className={controlClass}
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
        className="ml-auto flex h-8 w-8 items-center justify-center rounded-md border border-border text-muted transition-colors hover:border-border-strong hover:text-foreground"
        title="Refresh"
      >
        <IconRefresh className="h-4 w-4" />
      </button>
    </div>
  );
}
