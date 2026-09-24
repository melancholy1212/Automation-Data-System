const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export interface Pagination {
  limit: number;
  offset: number;
}

export function parsePagination(searchParams: URLSearchParams): Pagination {
  const rawLimit = Number(searchParams.get("limit"));
  const rawOffset = Number(searchParams.get("offset"));

  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.floor(rawLimit), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;

  return { limit, offset };
}
