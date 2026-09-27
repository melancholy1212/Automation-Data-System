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

  it("treats a company's own group/holding domain as primary — e.g. press.bmwgroup.com for a lead on bmw.com", () => {
    expect(classifyRelevance("https://press.bmwgroup.com/global/article", "bmw.com")).toBe("primary");
    expect(classifyRelevance("https://www.bmwgroup.com/en/investors", "bmw.com")).toBe("primary");
  });

  it("also matches the reverse direction — lead's own domain is the group/holding form", () => {
    expect(classifyRelevance("https://www.bmw.com/en/index.html", "bmwgroup.com")).toBe("primary");
  });

  it("does not treat an unrelated look-alike domain as primary just because it shares a prefix", () => {
    // "forum" is not a corporate-structure suffix, so "bmwforum" never
    // collapses down to "bmw" the way "bmwgroup" does.
    expect(classifyRelevance("https://www.bmwforum.example/thread/1", "bmw.com")).not.toBe("primary");
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
