import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function apiError(status: number, code: string, message: string, details?: unknown) {
  const body: ApiErrorBody = { error: { code, message, details } };
  return NextResponse.json(body, { status });
}

export function apiOk<T>(body: T, status = 200) {
  return NextResponse.json(body, { status });
}
