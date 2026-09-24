import type { DbClient } from "@/lib/supabase/client";
import type { ClaimedRun, Lead, PipelineStage } from "@/lib/types/domain";

export interface StageContext {
  db: DbClient;
  lead: Lead;
  run: ClaimedRun;
}

// Every way a stage can conclude. The worker never infers success from the
// absence of an error — a stage must say explicitly what happened.
export type StageOutcome =
  | { kind: "success" }
  | { kind: "duplicate"; existingLeadId: string }
  | { kind: "invalid"; message: string }
  // A stage that isn't implemented yet (Phase 4+). The worker parks the run
  // in `blocked` rather than pretending this succeeded — see registry.ts.
  | { kind: "not_implemented" }
  | { kind: "failure"; retryable: boolean; message: string };

export interface Stage {
  name: PipelineStage;
  timeoutMs: number;
  execute(context: StageContext): Promise<StageOutcome>;
}
