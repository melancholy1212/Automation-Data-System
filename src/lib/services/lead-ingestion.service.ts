import "server-only";

import type { DbClient } from "@/lib/supabase/client";
import { normalizeEmail } from "@/lib/normalization/email";
import { normalizeWebsite } from "@/lib/normalization/website";
import {
  findLeadByWebsiteDomain,
  insertLead,
  insertProcessingEvent,
  insertProcessingRun,
} from "@/lib/db/leads.repository";
import { PROCESSING_EVENT_TYPES } from "@/lib/types/domain";
import type { Lead, LeadSource } from "@/lib/types/domain";
import type { LeadInput } from "@/lib/schemas/lead-input.schema";

export type LeadIngestionResult =
  | { outcome: "created"; lead: Lead }
  | { outcome: "duplicate"; existingLead: Lead };

/**
 * Turns a validated lead payload into a persisted lead + its initial
 * processing run, or short-circuits into a duplicate result.
 *
 * Exact website-domain duplicates are rejected *before* insert (a lookup,
 * then an insert guarded by the unique index as a race backstop) rather than
 * inserted as a `status = 'duplicate'` row — per the approved Phase 2 scope,
 * this is a normal business outcome, not a stored entity. `duplicate_of_lead_id`
 * / `status = 'duplicate'` remain in the schema for a later, manual dedup
 * workflow (e.g. linking two leads whose relationship is discovered after the
 * fact), not for this path. See docs/architecture.md's Phase 2 notes.
 */
export async function ingestLead(db: DbClient, input: LeadInput): Promise<LeadIngestionResult> {
  const website = input.website ? normalizeWebsite(input.website) : null;
  const email = input.email ? normalizeEmail(input.email) : null;
  const companyName = input.company_name.trim().replace(/\s+/g, " ");
  const source: LeadSource = input.source ?? "api";

  if (website) {
    const existing = await findLeadByWebsiteDomain(db, website.websiteDomain);
    if (existing) {
      return { outcome: "duplicate", existingLead: existing };
    }
  }

  const insertResult = await insertLead(db, {
    raw_company_name: input.company_name,
    company_name: companyName,
    website: website?.website ?? null,
    website_domain: website?.websiteDomain ?? null,
    contact_name: input.contact_name ?? null,
    email: email?.email ?? null,
    email_domain: email?.emailDomain ?? null,
    linkedin_url: input.linkedin_url ?? null,
    industry: input.industry ?? null,
    country: input.country ?? null,
    source,
  });

  if (insertResult.outcome === "conflict") {
    // Lost a race against a concurrent request for the same domain.
    const existing = website ? await findLeadByWebsiteDomain(db, website.websiteDomain) : null;
    if (!existing) {
      throw new Error(
        "Unique violation on lead insert but no existing lead found for the domain",
      );
    }
    return { outcome: "duplicate", existingLead: existing };
  }

  const lead = insertResult.lead;

  await insertProcessingRun(db, {
    lead_id: lead.id,
    status: "pending",
    current_stage: "validating",
  });

  await insertProcessingEvent(db, {
    lead_id: lead.id,
    event_type: PROCESSING_EVENT_TYPES.LEAD_IMPORTED,
    metadata: { source },
  });

  return { outcome: "created", lead };
}
