import { describe, expect, it } from "vitest";

import { notImplementedStage } from "./not-implemented";

describe("notImplementedStage", () => {
  it("always returns not_implemented rather than pretending to succeed", async () => {
    const stage = notImplementedStage("enriching");
    const outcome = await stage.execute({} as never);
    expect(outcome).toEqual({ kind: "not_implemented" });
  });

  it("is named after the stage it stands in for", () => {
    expect(notImplementedStage("classifying").name).toBe("classifying");
  });
});
