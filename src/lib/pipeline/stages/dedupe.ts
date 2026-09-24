import { findOtherLeadWithDomain } from "@/lib/db/leads.repository";
import type { Stage } from "@/lib/pipeline/types";

// The pipeline's own authoritative dedup check, independent of the
// ingestion-time pre-insert check in lead-ingestion.service.ts (which
// prevents most duplicates from ever being created). This exists as the
// worker-owned source of truth for leads that reach it by any other path,
// and is what would run the (still-unwired) name-similarity check in a
// later phase.
export const dedupeStage: Stage = {
  name: "deduplicating",
  timeoutMs: 5_000,
  async execute({ db, lead }) {
    if (!lead.website_domain) {
      return { kind: "success" };
    }
    const other = await findOtherLeadWithDomain(db, lead.website_domain, lead.id);
    if (other) {
      return { kind: "duplicate", existingLeadId: other.id };
    }
    return { kind: "success" };
  },
};
