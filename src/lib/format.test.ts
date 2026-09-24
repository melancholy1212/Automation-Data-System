import { describe, expect, it } from "vitest";

import { formatDateTime, formatHostname, formatRelativeTime, titleCase } from "./format";

describe("titleCase", () => {
  it("converts a snake_case stage name into a display label", () => {
    expect(titleCase("generating_brief")).toBe("Generating Brief");
  });

  it("handles a single word", () => {
    expect(titleCase("completed")).toBe("Completed");
  });
});

describe("formatHostname", () => {
  it("strips the scheme and www", () => {
    expect(formatHostname("https://www.acme.com/about")).toBe("acme.com");
  });

  it("returns an em dash for null/undefined", () => {
    expect(formatHostname(null)).toBe("—");
    expect(formatHostname(undefined)).toBe("—");
  });

  it("falls back to the raw string for an unparseable URL", () => {
    expect(formatHostname("not a url")).toBe("not a url");
  });
});

describe("formatDateTime", () => {
  it("returns an em dash for null/undefined/invalid input", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("not a date")).toBe("—");
  });

  it("formats a valid ISO date to a non-empty string", () => {
    expect(formatDateTime("2026-01-15T09:41:12.000Z")).not.toBe("—");
  });
});

describe("formatRelativeTime", () => {
  it("returns an em dash for null/undefined/invalid input", () => {
    expect(formatRelativeTime(null)).toBe("—");
    expect(formatRelativeTime(undefined)).toBe("—");
    expect(formatRelativeTime("not a date")).toBe("—");
  });

  it("describes a moment a few seconds ago", () => {
    const fiveSecondsAgo = new Date(Date.now() - 5_000).toISOString();
    const result = formatRelativeTime(fiveSecondsAgo);
    expect(result).not.toBe("—");
  });
});
