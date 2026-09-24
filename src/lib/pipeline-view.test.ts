import { describe, expect, it } from "vitest";

import { STAGE_ORDER } from "@/lib/pipeline/state-machine";
import type { LeadProcessingRun } from "@/lib/types/domain";
import { deriveStageViews } from "./pipeline-view";

function makeRun(overrides: Partial<LeadProcessingRun> = {}): LeadProcessingRun {
  return {
    id: "run-1",
    lead_id: "lead-1",
    status: "pending",
    current_stage: "validating",
    attempt_count: 0,
    max_attempts: 5,
    locked_at: null,
    locked_by: null,
    lease_expires_at: null,
    next_attempt_at: new Date().toISOString(),
    failure_reason: null,
    started_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("deriveStageViews", () => {
  it("shows every stage as pending when there is no run", () => {
    const views = deriveStageViews(null);
    expect(views).toHaveLength(STAGE_ORDER.length);
    expect(views.every((v) => v.state === "pending")).toBe(true);
  });

  it("shows the first stage as pending before it's ever been claimed (attempt_count 0)", () => {
    const views = deriveStageViews(makeRun({ status: "pending", current_stage: "validating", attempt_count: 0 }));
    expect(views[0]).toEqual({ stage: "validating", state: "pending" });
    expect(views.slice(1).every((v) => v.state === "pending")).toBe(true);
  });

  it("shows the current stage as active on its first attempt", () => {
    const views = deriveStageViews(makeRun({ status: "enriching", current_stage: "enriching", attempt_count: 1 }));
    const enriching = views.find((v) => v.stage === "enriching");
    expect(enriching?.state).toBe("active");
  });

  it("shows the current stage as retrying after more than one attempt", () => {
    const views = deriveStageViews(makeRun({ status: "enriching", current_stage: "enriching", attempt_count: 3 }));
    const enriching = views.find((v) => v.stage === "enriching");
    expect(enriching?.state).toBe("retrying");
  });

  it("marks every stage before the current one as completed", () => {
    const views = deriveStageViews(
      makeRun({ status: "classifying", current_stage: "classifying", attempt_count: 1 }),
    );
    const before = STAGE_ORDER.slice(0, STAGE_ORDER.indexOf("classifying"));
    for (const stage of before) {
      expect(views.find((v) => v.stage === stage)?.state).toBe("completed");
    }
  });

  it("marks every stage after the current one as pending", () => {
    const views = deriveStageViews(
      makeRun({ status: "classifying", current_stage: "classifying", attempt_count: 1 }),
    );
    const after = STAGE_ORDER.slice(STAGE_ORDER.indexOf("classifying") + 1);
    for (const stage of after) {
      expect(views.find((v) => v.stage === stage)?.state).toBe("pending");
    }
  });

  it("shows the stuck stage as blocked, and nothing after it", () => {
    const views = deriveStageViews(makeRun({ status: "blocked", current_stage: "enriching", attempt_count: 5 }));
    expect(views.find((v) => v.stage === "enriching")?.state).toBe("blocked");
    expect(views.find((v) => v.stage === "classifying")?.state).toBe("pending");
  });

  it("shows the stuck stage as failed once retries are exhausted", () => {
    const views = deriveStageViews(makeRun({ status: "failed", current_stage: "enriching", attempt_count: 5 }));
    expect(views.find((v) => v.stage === "enriching")?.state).toBe("failed");
  });

  it("marks every stage completed once the run has completed", () => {
    const views = deriveStageViews(
      makeRun({ status: "completed", current_stage: "generating_brief", attempt_count: 1 }),
    );
    expect(views.every((v) => v.state === "completed")).toBe(true);
  });

  it("shows the deduplicating stage as duplicate when that's the resolution", () => {
    const views = deriveStageViews(makeRun({ status: "duplicate", current_stage: "deduplicating" }));
    expect(views.find((v) => v.stage === "deduplicating")?.state).toBe("duplicate");
    expect(views.find((v) => v.stage === "enriching")?.state).toBe("pending");
  });

  it("shows the validating stage as invalid when validation failed", () => {
    const views = deriveStageViews(makeRun({ status: "invalid", current_stage: "validating" }));
    expect(views.find((v) => v.stage === "validating")?.state).toBe("invalid");
  });
});
