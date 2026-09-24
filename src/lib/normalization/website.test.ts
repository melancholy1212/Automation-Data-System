import { describe, expect, it } from "vitest";

import { normalizeWebsite } from "./website";

describe("normalizeWebsite", () => {
  it("normalizes a bare https URL", () => {
    expect(normalizeWebsite("https://example.com")).toEqual({
      website: "https://example.com",
      websiteDomain: "example.com",
    });
  });

  it("normalizes an http URL", () => {
    expect(normalizeWebsite("http://example.com")).toEqual({
      website: "https://example.com",
      websiteDomain: "example.com",
    });
  });

  it("strips www", () => {
    expect(normalizeWebsite("https://www.example.com")).toEqual({
      website: "https://www.example.com",
      websiteDomain: "example.com",
    });
  });

  it("is case-insensitive", () => {
    expect(normalizeWebsite("EXAMPLE.COM")).toEqual({
      website: "https://example.com",
      websiteDomain: "example.com",
    });
  });

  it("strips a trailing slash and path/query", () => {
    expect(normalizeWebsite("https://www.example.com/about?ref=x")).toEqual({
      website: "https://www.example.com",
      websiteDomain: "example.com",
    });
  });

  it("resolves a subdomain to its registrable domain, keeping the host in `website`", () => {
    expect(normalizeWebsite("https://app.example.com")).toEqual({
      website: "https://app.example.com",
      websiteDomain: "example.com",
    });
  });

  it("resolves a multi-part public suffix correctly (not the last two labels)", () => {
    expect(normalizeWebsite("https://www.example.co.uk")).toEqual({
      website: "https://www.example.co.uk",
      websiteDomain: "example.co.uk",
    });
  });

  it("agrees on the registrable domain across all example.com variants", () => {
    const variants = [
      "https://example.com",
      "http://example.com/",
      "https://www.example.com/",
      "EXAMPLE.COM",
    ];
    const domains = variants.map((v) => normalizeWebsite(v)?.websiteDomain);
    expect(new Set(domains)).toEqual(new Set(["example.com"]));
  });

  it("returns null for an empty string", () => {
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("   ")).toBeNull();
  });

  it("returns null for input with no recognized public suffix", () => {
    expect(normalizeWebsite("not a url")).toBeNull();
    expect(normalizeWebsite("localhost")).toBeNull();
  });

  it("returns null for a bare IP address", () => {
    expect(normalizeWebsite("192.168.1.1")).toBeNull();
  });
});
