import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runWorkerTick = vi.fn();

vi.mock("@/lib/pipeline/runner", () => ({
  runWorkerTick: (...args: unknown[]) => runWorkerTick(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { GET, POST } = await import("./route");

function tickRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost/api/worker/tick", { method: "POST", headers });
}

describe("POST/GET /api/worker/tick", () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(tickRequest());
    expect(response.status).toBe(401);
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(tickRequest({ authorization: "Bearer wrong-secret" }));
    expect(response.status).toBe(401);
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("rejects a request when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(tickRequest({ authorization: "Bearer anything" }));
    expect(response.status).toBe(401);
  });

  it("accepts a correctly authorized POST and returns worker statistics", async () => {
    runWorkerTick.mockResolvedValue({
      execution_id: "exec-1",
      claimed: 3,
      completed: 2,
      retried: 1,
      blocked: 0,
      failed: 0,
      lease_lost: 0,
      duration_ms: 42,
    });

    const response = await POST(tickRequest({ authorization: "Bearer test-secret" }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      execution_id: "exec-1",
      claimed: 3,
      completed: 2,
      retried: 1,
      blocked: 0,
      failed: 0,
      lease_lost: 0,
      duration_ms: 42,
    });
  });

  it("accepts a correctly authorized GET (Vercel Cron invokes with GET)", async () => {
    runWorkerTick.mockResolvedValue({
      execution_id: "exec-2",
      claimed: 0,
      completed: 0,
      retried: 0,
      blocked: 0,
      failed: 0,
      lease_lost: 0,
      duration_ms: 5,
    });

    const request = new NextRequest("http://localhost/api/worker/tick", {
      method: "GET",
      headers: { authorization: "Bearer test-secret" },
    });
    const response = await GET(request);

    expect(response.status).toBe(200);
  });

  it("does not leak internal error detail when the tick throws", async () => {
    runWorkerTick.mockRejectedValue(new Error("connection string contains a secret"));

    const response = await POST(tickRequest({ authorization: "Bearer test-secret" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.error.code).toBe("internal_error");
  });
});
