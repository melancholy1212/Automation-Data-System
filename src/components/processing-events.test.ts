import { describe, expect, it } from "vitest";

import type { ProcessingEvent } from "@/lib/types/domain";
import { describeEvent } from "./processing-events";

function makeEvent(overrides: Partial<ProcessingEvent> = {}): ProcessingEvent {
  return {
    id: "e1",
    lead_id: "lead-1",
    run_id: "run-1",
    event_type: "lead_imported",
    metadata: {},
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("describeEvent", () => {
  it("describes a stage.failed event with the sanitized reason, never a raw stack trace", () => {
    const { title, detail } = describeEvent(
      makeEvent({ event_type: "stage.failed", metadata: { stage: "enriching", reason: "Tavily returned 500" } }),
    );
    expect(title).toBe("Stage failed");
    expect(detail).toBe("enriching — Tavily returned 500");
  });

  it("distinguishes a manual retry from an automatic one", () => {
    expect(describeEvent(makeEvent({ event_type: "run_retried", metadata: { manual: true } })).title).toBe(
      "Manual retry requested",
    );
    expect(describeEvent(makeEvent({ event_type: "run_retried", metadata: {} })).title).toBe("Retry scheduled");
  });

  it("falls back to a title-cased label for an unrecognized event type", () => {
    expect(describeEvent(makeEvent({ event_type: "some_future_event" })).title).toBe("Some Future Event");
  });

  it("does not throw on malformed metadata", () => {
    expect(() => describeEvent(makeEvent({ metadata: "not an object" as never }))).not.toThrow();
    expect(() => describeEvent(makeEvent({ metadata: null }))).not.toThrow();
  });
});
