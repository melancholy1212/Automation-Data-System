import { describe, expect, it } from "vitest";

import { leadInputSchema } from "./lead-input.schema";

describe("leadInputSchema", () => {
  it("accepts a valid, fully-populated lead", () => {
    const result = leadInputSchema.safeParse({
      company_name: "Acme Corp",
      website: "https://www.acme.com/",
      contact_name: "Jane Doe",
      email: "jane@acme.com",
      linkedin_url: "https://www.linkedin.com/company/acme",
      industry: "Manufacturing",
      country: "US",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a lead with only a company name", () => {
    const result = leadInputSchema.safeParse({ company_name: "Acme Corp" });
    expect(result.success).toBe(true);
  });

  it("rejects a missing company name", () => {
    const result = leadInputSchema.safeParse({ website: "https://acme.com" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank company name", () => {
    const result = leadInputSchema.safeParse({ company_name: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid website", () => {
    const result = leadInputSchema.safeParse({
      company_name: "Acme Corp",
      website: "not a url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const result = leadInputSchema.safeParse({
      company_name: "Acme Corp",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects unexpected fields", () => {
    const result = leadInputSchema.safeParse({
      company_name: "Acme Corp",
      unexpected_field: "should not be here",
    });
    expect(result.success).toBe(false);
  });
});
