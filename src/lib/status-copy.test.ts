import { describe, expect, it } from "vitest";

import { describeSectionState, humanizeFailureReason, stageLabel } from "./status-copy";
import type { LeadProcessingRun } from "@/lib/types/domain";

function makeRun(overrides: Partial<LeadProcessingRun> = {}): LeadProcessingRun {
  return {
    id: "run-1",
    lead_id: "lead-1",
    status: "qualifying",
    current_stage: "qualifying",
    attempt_count: 1,
    max_attempts: 5,
    locked_at: null,
    locked_by: null,
    lease_expires_at: null,
    next_attempt_at: "2026-09-27T00:00:00.000Z",
    failure_reason: null,
    started_at: "2026-09-26T23:00:00.000Z",
    completed_at: null,
    created_at: "2026-09-26T22:00:00.000Z",
    updated_at: "2026-09-26T23:00:00.000Z",
    ...overrides,
  };
}

describe("humanizeFailureReason", () => {
  it("falls back to a generic message when there's no reason", () => {
    expect(humanizeFailureReason(null)).toBe("A temporary processing error occurred.");
    expect(humanizeFailureReason(undefined)).toBe("A temporary processing error occurred.");
  });

  it("maps known provider error shapes to a human-readable message", () => {
    expect(humanizeFailureReason("Groq returned 429")).toBe("The AI provider's rate limit was reached.");
    expect(humanizeFailureReason("Gemini returned 503")).toBe("The AI provider was temporarily overloaded.");
  });

  it("falls back to the generic message for an unrecognized reason", () => {
    expect(humanizeFailureReason("something bespoke went wrong")).toBe("A temporary processing error occurred.");
  });
});

describe("stageLabel", () => {
  it("maps known stages to their display label", () => {
    expect(stageLabel("generating_brief")).toBe("Intelligence brief");
  });

  it("title-cases an unrecognized stage rather than throwing", () => {
    expect(stageLabel("some_new_stage")).toBe("Some New Stage");
  });
});

describe("describeSectionState", () => {
  it("returns a neutral pending status for a stage not yet reached", () => {
    const run = makeRun({ current_stage: "enriching", status: "enriching", attempt_count: 1 });
    const status = describeSectionState(run, "qualifying", "Qualification");
    expect(status).toMatchObject({ tone: "neutral", headline: "Qualification pending" });
  });

  it("returns an info status while the stage is actively running (attempt 1)", () => {
    const run = makeRun({ attempt_count: 1 });
    const status = describeSectionState(run, "qualifying", "Qualification");
    expect(status).toMatchObject({ tone: "info", headline: "Qualification in progress" });
  });

  it("returns a warning status while retrying, naming the attempt count and both retry paths", () => {
    const run = makeRun({ attempt_count: 3, max_attempts: 5, failure_reason: "Groq returned 429" });
    const status = describeSectionState(run, "qualifying", "Qualification");
    expect(status?.tone).toBe("warning");
    expect(status?.headline).toBe("Qualification temporarily unavailable");
    expect(status?.body).toContain("attempt 3 of 5");
    expect(status?.body).toContain("within a few minutes");
    expect(status?.body).toContain("Process now");
    expect(status?.rawFailureReason).toBe("Groq returned 429");
  });

  it("returns a neutral 'not applicable' status for duplicate, without exposing it as an error", () => {
    const run = makeRun({ status: "duplicate", current_stage: "deduplicating" });
    const status = describeSectionState(run, "deduplicating", "Deduplication");
    expect(status).toMatchObject({ tone: "neutral", headline: "Deduplication not applicable" });
  });

  it("returns an error status for invalid, explicitly saying it won't resolve on retry", () => {
    const run = makeRun({
      status: "invalid",
      current_stage: "validating",
      failure_reason: "Company name did not pass validation heuristics",
    });
    const status = describeSectionState(run, "validating", "Validation");
    expect(status?.tone).toBe("error");
    expect(status?.body).toContain("won't resolve on retry");
  });

  it("returns a generic error status for a permanently failed stage", () => {
    const run = makeRun({ status: "failed", failure_reason: "Groq returned 503" });
    const status = describeSectionState(run, "qualifying", "Qualification");
    expect(status?.tone).toBe("error");
    expect(status?.headline).toBe("Qualification did not complete");
    expect(status?.body).toContain("This run stopped and needs attention");
  });

  it("returns null once the run has completed — the caller renders real data instead", () => {
    const run = makeRun({ status: "completed", current_stage: "generating_brief" });
    expect(describeSectionState(run, "qualifying", "Qualification")).toBeNull();
  });

  it("treats a null run as every stage being pending", () => {
    const status = describeSectionState(null, "validating", "Validation");
    expect(status).toMatchObject({ tone: "neutral", headline: "Validation pending" });
  });
});
