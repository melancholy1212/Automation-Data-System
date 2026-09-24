import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./email";

describe("normalizeEmail", () => {
  it("lowercases and extracts the domain", () => {
    expect(normalizeEmail("Jane@Example.COM")).toEqual({
      email: "jane@example.com",
      emailDomain: "example.com",
    });
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEmail("  jane@example.com  ")).toEqual({
      email: "jane@example.com",
      emailDomain: "example.com",
    });
  });

  it("returns null for input with no @", () => {
    expect(normalizeEmail("not-an-email")).toBeNull();
  });

  it("returns null for input with no domain", () => {
    expect(normalizeEmail("jane@")).toBeNull();
  });

  it("returns null for input with a domain missing a dot", () => {
    expect(normalizeEmail("jane@localhost")).toBeNull();
  });

  it("returns null for input containing spaces", () => {
    expect(normalizeEmail("jane doe@example.com")).toBeNull();
  });
});
