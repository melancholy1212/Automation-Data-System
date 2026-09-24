import type { Stage } from "@/lib/pipeline/types";

// Confirms website/website_domain are consistent (both set or both absent).
// Like validateStage, the real normalization work already happened in
// lead-ingestion.service.ts at insert time; this stage is the pipeline's own
// authoritative check for leads that reach it by any other path.
export const normalizeStage: Stage = {
  name: "normalizing",
  timeoutMs: 5_000,
  async execute({ lead }) {
    if (lead.website && !lead.website_domain) {
      return { kind: "invalid", message: "website is set but website_domain is missing" };
    }
    return { kind: "success" };
  },
};
