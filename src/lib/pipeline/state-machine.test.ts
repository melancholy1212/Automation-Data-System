import { describe, expect, it } from "vitest";

import { STAGE_ORDER, assertValidTransition, isTerminal, nextStage } from "./state-machine";

describe("nextStage", () => {
  it("walks the stage order in sequence", () => {
    for (let i = 0; i < STAGE_ORDER.length - 1; i += 1) {
      expect(nextStage(STAGE_ORDER[i])).toBe(STAGE_ORDER[i + 1]);
    }
  });

  it("returns 'completed' after the last stage", () => {
    expect(nextStage(STAGE_ORDER[STAGE_ORDER.length - 1])).toBe("completed");
  });
});

describe("isTerminal", () => {
  it("treats completed/failed/duplicate/invalid as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("duplicate")).toBe(true);
    expect(isTerminal("invalid")).toBe(true);
  });

  it("does not treat in-progress or blocked as terminal", () => {
    expect(isTerminal("validating")).toBe(false);
    expect(isTerminal("blocked")).toBe(false);
    expect(isTerminal("needs_review")).toBe(false);
  });
});

describe("assertValidTransition", () => {
  it("allows each stage to advance to its successor", () => {
    expect(() => assertValidTransition("pending", "validating")).not.toThrow();
    expect(() => assertValidTransition("validating", "normalizing")).not.toThrow();
    expect(() => assertValidTransition("normalizing", "deduplicating")).not.toThrow();
    expect(() => assertValidTransition("deduplicating", "enriching")).not.toThrow();
    expect(() => assertValidTransition("generating_brief", "completed")).not.toThrow();
  });

  it("allows a self-transition to represent a same-stage retry", () => {
    expect(() => assertValidTransition("validating", "validating")).not.toThrow();
  });

  it("allows any in-progress stage to fail", () => {
    expect(() => assertValidTransition("enriching", "failed")).not.toThrow();
  });

  it("allows deduplicating to resolve as a duplicate", () => {
    expect(() => assertValidTransition("deduplicating", "duplicate")).not.toThrow();
  });

  it("allows a not-implemented stage to park as blocked", () => {
    expect(() => assertValidTransition("enriching", "blocked")).not.toThrow();
  });

  it("rejects skipping straight from pending to completed", () => {
    expect(() => assertValidTransition("pending", "completed")).toThrow(/Illegal run status transition/);
  });

  it("rejects skipping a stage (validating straight to deduplicating)", () => {
    expect(() => assertValidTransition("validating", "deduplicating")).toThrow(
      /Illegal run status transition/,
    );
  });

  it("rejects any transition out of a terminal status", () => {
    expect(() => assertValidTransition("completed", "validating")).toThrow();
    expect(() => assertValidTransition("failed", "pending")).toThrow();
    expect(() => assertValidTransition("duplicate", "enriching")).toThrow();
  });

  it("rejects moving backward in the stage order", () => {
    expect(() => assertValidTransition("enriching", "validating")).toThrow();
  });
});
