import { z } from "zod";

import { normalizeEmail } from "@/lib/normalization/email";
import { normalizeWebsite } from "@/lib/normalization/website";

const LEAD_SOURCE_VALUES = ["manual", "csv_import", "api"] as const;

// .strict() rejects any key not listed here, so arbitrary client-supplied
// fields never reach the database (docs/architecture.md §11).
export const leadInputSchema = z
  .object({
    company_name: z.string().trim().min(1, "company_name is required"),
    website: z
      .string()
      .trim()
      .min(1, "website must not be empty")
      .optional()
      .refine((value) => value === undefined || normalizeWebsite(value) !== null, {
        message: "website is not a valid URL or domain",
      }),
    contact_name: z.string().trim().min(1).optional(),
    email: z
      .string()
      .trim()
      .min(1, "email must not be empty")
      .optional()
      .refine((value) => value === undefined || normalizeEmail(value) !== null, {
        message: "email is not a valid email address",
      }),
    linkedin_url: z.string().trim().url("linkedin_url must be a valid URL").optional(),
    industry: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    source: z.enum(LEAD_SOURCE_VALUES).optional(),
  })
  .strict();

export type LeadInput = z.infer<typeof leadInputSchema>;
