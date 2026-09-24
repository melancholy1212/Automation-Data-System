import { describe, expect, it } from "vitest";

import { classifyRelevance, normalizeEvidenceUrl } from "./evidence-utils";

describe("classifyRelevance", () => {
  it("treats the lead's own domain as primary", () => {
    expect(classifyRelevance("https://acme.com/about", "acme.com")).toBe("primary");
  });

  it("treats a subdomain of the lead's own domain as primary", () => {
    expect(classifyRelevance("https://blog.acme.com/post", "acme.com")).toBe("primary");
  });

  it("treats a reputable source as supporting", () => {
    expect(classifyRelevance("https://techcrunch.com/2026/acme-raises-funding", "acme.com")).toBe("supporting");
  });

  it("treats everything else as contextual", () => {
    expect(classifyRelevance("https://random-blog.example/post", "acme.com")).toBe("contextual");
  });

  it("treats a malformed URL as contextual rather than throwing", () => {
    expect(classifyRelevance("not a url", "acme.com")).toBe("contextual");
  });

  it("falls back to supporting/contextual rules when there is no website domain", () => {
    expect(classifyRelevance("https://acme.com/about", null)).not.toBe("primary");
  });
});

describe("normalizeEvidenceUrl", () => {
  it("strips the fragment", () => {
    expect(normalizeEvidenceUrl("https://acme.com/about#team")).toBe("https://acme.com/about");
  });

  it("strips a bare trailing slash on the root path", () => {
    expect(normalizeEvidenceUrl("https://acme.com/")).toBe("https://acme.com");
  });

  it("lowercases the result", () => {
    expect(normalizeEvidenceUrl("https://ACME.com/About")).toBe("https://acme.com/about");
  });

  it("treats scheme/case/fragment variants of the same URL identically", () => {
    const a = normalizeEvidenceUrl("https://ACME.com/about#x");
    const b = normalizeEvidenceUrl("https://acme.com/about");
    expect(a).toBe(b);
  });
});
