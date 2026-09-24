import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadStatusCounts = vi.fn();

vi.mock("@/lib/db/leads.repository", () => ({
  getLeadStatusCounts: (...args: unknown[]) => getLeadStatusCounts(...args),
}));
vi.mock("@/lib/supabase/client", () => ({
  getSupabase: () => ({}),
}));

const { GET } = await import("./route");

describe("GET /api/leads/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the lead status/qualification counts", async () => {
    const counts = {
      total: 10,
      byStatus: { pending: 1, processing: 2, completed: 5, failed: 1, duplicate: 0, needs_review: 0, invalid: 1 },
      byQualificationLevel: { unqualified: 1, low: 2, medium: 4, high: 3 },
    };
    getLeadStatusCounts.mockResolvedValue(counts);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(counts);
  });

  it("returns 500 without leaking internal error detail on failure", async () => {
    getLeadStatusCounts.mockRejectedValue(new Error("connection refused at 10.0.0.5"));

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain("10.0.0.5");
  });
});
