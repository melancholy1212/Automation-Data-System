"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { IconChevronLeft, IconChevronRight } from "@/components/icons";

export function PaginationControls({
  offset,
  limit,
  total,
}: {
  offset: number;
  limit: number;
  total: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  function goTo(newOffset: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("offset", String(Math.max(0, newOffset)));
    router.push(`/?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-between px-0.5 text-sm">
      <span className="font-mono text-xs text-muted-foreground">
        {total === 0 ? "No leads" : `${start}–${end} of ${total}`}
      </span>
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={() => goTo(offset - limit)}
          className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <IconChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => goTo(offset + limit)}
          className="flex h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          Next
          <IconChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
