import type { PostgrestError } from "@supabase/supabase-js";

export const PG_UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: PostgrestError | null): boolean {
  return error?.code === PG_UNIQUE_VIOLATION;
}

export class DatabaseError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}
