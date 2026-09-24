import { describe, expect, it } from "vitest";

import { computeBackoffMs } from "./backoff";

describe("computeBackoffMs", () => {
  it("increases with each attempt", () => {
    // Jitter is +/-20% per attempt; consecutive attempts double the base
    // delay, so their jittered ranges never overlap — this holds for any
    // random seed, not just on average.
    expect(computeBackoffMs(2)).toBeGreaterThan(computeBackoffMs(1));
    expect(computeBackoffMs(3)).toBeGreaterThan(computeBackoffMs(2));
    expect(computeBackoffMs(4)).toBeGreaterThan(computeBackoffMs(3));
  });

  it("stays within +/-20% of the first attempt's 1 minute base delay", () => {
    const delay = computeBackoffMs(1);
    expect(delay).toBeGreaterThanOrEqual(48_000);
    expect(delay).toBeLessThanOrEqual(72_000);
  });

  it("caps at 30 minutes (+/-20%) for large attempt numbers", () => {
    const delay = computeBackoffMs(20);
    expect(delay).toBeGreaterThanOrEqual(1_440_000);
    expect(delay).toBeLessThanOrEqual(2_160_000);
  });

  it("never returns a negative delay", () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(computeBackoffMs(attempt)).toBeGreaterThanOrEqual(0);
    }
  });
});
