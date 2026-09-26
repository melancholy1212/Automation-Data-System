import { describe, expect, it, vi } from "vitest";

const runWorkerTick = vi.fn();

vi.mock("@/lib/pipeline/runner", () => ({
  runWorkerTick: (...args: unknown[]) => runWorkerTick(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { POST } = await import("./route");

describe("POST /api/worker/process", () => {
  it("requires no authorization — unlike /api/worker/tick, this is a public on-demand nudge", async () => {
    runWorkerTick.mockResolvedValue({
      execution_id: "exec-1",
      claimed: 1,
      completed: 1,
      retried: 0,
      blocked: 0,
      failed: 0,
      lease_lost: 0,
      duration_ms: 10,
    });

    const response = await POST();

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.claimed).toBe(1);
    expect(runWorkerTick).toHaveBeenCalledTimes(1);
  });

  it("does not leak internal error detail when the tick throws", async () => {
    runWorkerTick.mockRejectedValue(new Error("connection string contains a secret"));

    const response = await POST();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(body.error.code).toBe("internal_error");
  });
});
