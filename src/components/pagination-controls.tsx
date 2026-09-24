"use client";

import { useRouter, useSearchParams } from "next/navigation";

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
    <div className="flex items-center justify-between text-sm text-muted">
      <span>
        {total === 0 ? "No leads" : `${start}–${end} of ${total}`}
      </span>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!hasPrev}
          onClick={() => goTo(offset - limit)}
          className="rounded border border-border px-2.5 py-1 disabled:opacity-40"
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={() => goTo(offset + limit)}
          className="rounded border border-border px-2.5 py-1 disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
