import "server-only";

import { randomUUID } from "node:crypto";

import {
  claimProcessingRuns,
  findLeadById,
  insertProcessingEvent,
  updateProcessingRun,
} from "@/lib/db/leads.repository";
import { LostLeaseError } from "@/lib/db/errors";
import { computeBackoffMs } from "@/lib/pipeline/backoff";
import { mapWithConcurrency } from "@/lib/pipeline/concurrency";
import { sanitizeErrorMessage } from "@/lib/pipeline/errors";
import { STAGE_REGISTRY } from "@/lib/pipeline/registry";
import { assertValidTransition, nextStage } from "@/lib/pipeline/state-machine";
import { withTimeout } from "@/lib/pipeline/timeout";
import type { StageOutcome } from "@/lib/pipeline/types";
import type { DbClient } from "@/lib/supabase/client";
import {
  PROCESSING_EVENT_TYPES,
  type ClaimedRun,
  type LeadProcessingRunInsert,
} from "@/lib/types/domain";
import type { Json } from "@/lib/supabase/database.types";

export interface WorkerConfig {
  /** Max runs claimed in a single tick. */
  batchSize: number;
  /** Max runs processed in parallel within a tick. */
  concurrency: number;
  /** How long a claim is held before another worker may treat it as abandoned. */
  leaseSeconds: number;
  /** Wall-clock budget for the tick; runs not started within it are treated as a retryable failure rather than left claimed. */
  executionBudgetMs: number;
}

export interface TickResult {
  execution_id: string;
  claimed: number;
  completed: number;
  retried: number;
  blocked: number;
  failed: number;
  lease_lost: number;
  duration_ms: number;
}

type RunOutcomeTag = "completed" | "retried" | "blocked" | "failed" | "lease_lost";

interface ResolvedOutcome {
  patch: Partial<LeadProcessingRunInsert>;
  events: ReadonlyArray<{ event_type: string; metadata: Record<string, Json> }>;
  tag: RunOutcomeTag;
}

const RELEASE_LOCK = { locked_at: null, locked_by: null, lease_expires_at: null } as const;

function nowIso(): string {
  return new Date().toISOString();
}

// Translates a stage's outcome into a DB patch + processing_events to write.
// This is where the state machine (docs/architecture.md) meets the concrete
// column values — every branch validates its own transition via
// assertValidTransition before returning, so an impossible jump throws here
// rather than silently persisting.
function resolveOutcome(run: ClaimedRun, outcome: StageOutcome): ResolvedOutcome {
  const stage = run.current_stage;

  if (outcome.kind === "success") {
    const upcoming = nextStage(stage);
    if (upcoming === "completed") {
      assertValidTransition(run.status, "completed");
      return {
        patch: {
          ...RELEASE_LOCK,
          status: "completed",
          failure_reason: null,
          completed_at: nowIso(),
          next_attempt_at: nowIso(),
        },
        events: [
          { event_type: PROCESSING_EVENT_TYPES.STAGE_COMPLETED, metadata: { stage, attempt: run.attempt_count } },
          { event_type: PROCESSING_EVENT_TYPES.RUN_COMPLETED, metadata: {} },
        ],
        tag: "completed",
      };
    }

    assertValidTransition(run.status, upcoming);
    return {
      patch: {
        ...RELEASE_LOCK,
        status: upcoming,
        current_stage: upcoming,
        failure_reason: null,
        next_attempt_at: nowIso(),
      },
      events: [
        {
          event_type: PROCESSING_EVENT_TYPES.STAGE_COMPLETED,
          metadata: { stage, attempt: run.attempt_count, next_stage: upcoming },
        },
      ],
      tag: "completed",
    };
  }

  if (outcome.kind === "duplicate") {
    assertValidTransition(run.status, "duplicate");
    return {
      patch: {
        ...RELEASE_LOCK,
        status: "duplicate",
        failure_reason: null,
        completed_at: nowIso(),
        next_attempt_at: nowIso(),
      },
      events: [
        {
          event_type: PROCESSING_EVENT_TYPES.STAGE_COMPLETED,
          metadata: { stage, attempt: run.attempt_count, outcome: "duplicate", existing_lead_id: outcome.existingLeadId },
        },
      ],
      tag: "completed",
    };
  }

  if (outcome.kind === "invalid") {
    assertValidTransition(run.status, "invalid");
    return {
      patch: {
        ...RELEASE_LOCK,
        status: "invalid",
        failure_reason: outcome.message,
        completed_at: nowIso(),
        next_attempt_at: nowIso(),
      },
      events: [
        {
          event_type: PROCESSING_EVENT_TYPES.STAGE_FAILED,
          metadata: { stage, attempt: run.attempt_count, permanent: true, reason: outcome.message },
        },
      ],
      tag: "failed",
    };
  }

  if (outcome.kind === "not_implemented") {
    assertValidTransition(run.status, "blocked");
    return {
      patch: { ...RELEASE_LOCK, status: "blocked", next_attempt_at: nowIso() },
      events: [
        { event_type: PROCESSING_EVENT_TYPES.STAGE_BLOCKED, metadata: { stage, reason: "not_implemented" } },
      ],
      tag: "blocked",
    };
  }

  // outcome.kind === "failure"
  const exhausted = run.attempt_count >= run.max_attempts;
  if (!outcome.retryable || exhausted) {
    assertValidTransition(run.status, "failed");
    return {
      patch: {
        ...RELEASE_LOCK,
        status: "failed",
        failure_reason: outcome.message,
        completed_at: nowIso(),
        next_attempt_at: nowIso(),
      },
      events: [
        {
          event_type: PROCESSING_EVENT_TYPES.STAGE_FAILED,
          metadata: { stage, attempt: run.attempt_count, retryable: outcome.retryable, exhausted, reason: outcome.message },
        },
      ],
      tag: "failed",
    };
  }

  assertValidTransition(run.status, stage);
  const delayMs = computeBackoffMs(run.attempt_count);
  return {
    patch: {
      ...RELEASE_LOCK,
      status: stage,
      failure_reason: outcome.message,
      next_attempt_at: new Date(Date.now() + delayMs).toISOString(),
    },
    events: [
      {
        event_type: PROCESSING_EVENT_TYPES.STAGE_FAILED,
        metadata: { stage, attempt: run.attempt_count, retryable: true, reason: outcome.message },
      },
      {
        event_type: PROCESSING_EVENT_TYPES.RUN_RETRIED,
        metadata: { stage, attempt: run.attempt_count, next_attempt_in_ms: delayMs },
      },
    ],
    tag: "retried",
  };
}

async function persistResolved(
  db: DbClient,
  run: ClaimedRun,
  executionId: string,
  resolved: ResolvedOutcome,
): Promise<void> {
  await updateProcessingRun(db, run.id, executionId, resolved.patch);
  for (const event of resolved.events) {
    await insertProcessingEvent(db, { lead_id: run.lead_id, run_id: run.id, ...event });
  }
}

// Processes exactly one claimed run through exactly one stage, then persists
// the outcome. Never throws: any unexpected error (a bug, a DB blip while
// recording events, an illegal transition) is caught and the run is forced
// to `failed` rather than left claimed forever or allowed to crash the tick.
export async function processClaimedRun(
  db: DbClient,
  run: ClaimedRun,
  executionId: string,
): Promise<RunOutcomeTag> {
  try {
    await insertProcessingEvent(db, {
      lead_id: run.lead_id,
      run_id: run.id,
      event_type: run.was_recovered ? PROCESSING_EVENT_TYPES.RUN_RECOVERED : PROCESSING_EVENT_TYPES.RUN_CLAIMED,
      metadata: { execution_id: executionId, stage: run.current_stage, attempt: run.attempt_count },
    });

    const lead = await findLeadById(db, run.lead_id);
    if (!lead) {
      throw new Error(`Claimed run ${run.id} references a missing lead ${run.lead_id}`);
    }

    const stage = STAGE_REGISTRY[run.current_stage];

    await insertProcessingEvent(db, {
      lead_id: run.lead_id,
      run_id: run.id,
      event_type: PROCESSING_EVENT_TYPES.STAGE_STARTED,
      metadata: { stage: stage.name, attempt: run.attempt_count },
    });

    let outcome: StageOutcome;
    try {
      outcome = await withTimeout(stage.execute({ db, lead, run }), stage.timeoutMs, `stage ${stage.name}`);
    } catch (error) {
      outcome = { kind: "failure", retryable: true, message: sanitizeErrorMessage(error) };
    }

    const resolved = resolveOutcome(run, outcome);
    await persistResolved(db, run, executionId, resolved);
    return resolved.tag;
  } catch (error) {
    if (error instanceof LostLeaseError) {
      await insertProcessingEvent(db, {
        lead_id: run.lead_id,
        run_id: run.id,
        event_type: PROCESSING_EVENT_TYPES.RUN_LEASE_LOST,
        metadata: { execution_id: executionId },
      }).catch(() => undefined);
      return "lease_lost";
    }

    await updateProcessingRun(db, run.id, executionId, {
      ...RELEASE_LOCK,
      status: "failed",
      failure_reason: sanitizeErrorMessage(error),
      completed_at: nowIso(),
    }).catch(() => undefined);
    return "failed";
  }
}

async function abandonDueToBudget(db: DbClient, run: ClaimedRun, executionId: string): Promise<RunOutcomeTag> {
  const resolved = resolveOutcome(run, {
    kind: "failure",
    retryable: true,
    message: "execution budget exceeded before this run could start",
  });
  await persistResolved(db, run, executionId, resolved).catch(() => undefined);
  return resolved.tag;
}

export async function runWorkerTick(db: DbClient, config: WorkerConfig): Promise<TickResult> {
  const executionId = randomUUID();
  const startedAt = Date.now();

  const claimed = await claimProcessingRuns(db, {
    limit: config.batchSize,
    workerId: executionId,
    leaseSeconds: config.leaseSeconds,
  });

  const tags = await mapWithConcurrency(claimed, config.concurrency, (run) => {
    const withinBudget = Date.now() - startedAt < config.executionBudgetMs;
    return withinBudget ? processClaimedRun(db, run, executionId) : abandonDueToBudget(db, run, executionId);
  });

  const stats: Record<RunOutcomeTag, number> = {
    completed: 0,
    retried: 0,
    blocked: 0,
    failed: 0,
    lease_lost: 0,
  };
  for (const tag of tags) {
    stats[tag] += 1;
  }

  return {
    execution_id: executionId,
    claimed: claimed.length,
    duration_ms: Date.now() - startedAt,
    ...stats,
  };
}
