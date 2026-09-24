import type { Stage } from "@/lib/pipeline/types";

// Re-confirms the lead's own persisted invariants before advancing. Phase 2
// already validates shape at ingestion (Zod, .strict()), so in the normal
// path this always succeeds — its value is as a safety net for leads that
// might one day arrive through a path other than POST /api/leads (e.g. a
// future bulk loader) that bypasses that check.
export const validateStage: Stage = {
  name: "validating",
  timeoutMs: 5_000,
  async execute({ lead }) {
    if (!lead.company_name || lead.company_name.trim() === "") {
      return { kind: "invalid", message: "company_name is blank" };
    }
    return { kind: "success" };
  },
};
