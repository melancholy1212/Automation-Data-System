-- Phase 3: durable worker / queue / crash recovery.
--
-- Fixes a concrete inconsistency found while implementing the worker: the
-- Phase 2 `run_status` enum had a "quiet success" value for some stages
-- (normalized, unique, enriched, classified, qualified/disqualified) but not
-- others (no "validated" between validating and normalizing), and separate
-- `_failed` variants (enrichment_failed, classification_failed, brief_failed)
-- that were never actually distinguishable from a generic retryable failure
-- at the worker level — that distinction is stage-specific business logic
-- that belongs to the stage itself once implemented (e.g. "enrichment failed
-- but we degrade forward anyway" is a decision the enrichment stage makes by
-- returning success with low-confidence evidence, not a status the generic
-- worker needs to know about).
--
-- Simplified model, matching the transition map the worker actually
-- enforces (see src/lib/pipeline/state-machine.ts): `status` while non-
-- terminal is always exactly the stage currently executing or awaiting
-- retry (== current_stage); the two columns diverge only for `blocked`
-- (stage not implemented yet — current_stage says which one) and the
-- terminals. `failed_stage` is dropped as redundant: `current_stage` already
-- says where a `failed`/`blocked` run got stuck, since it's never advanced
-- past that point. See docs/architecture.md's Phase 3 notes for the full
-- explanation.

-- These two partial indexes' WHERE predicates embed enum literals resolved
-- against the *current* run_status type at CREATE INDEX time. Left in place,
-- Postgres's automatic index rebuild during the column type change below
-- tries to evaluate that old predicate against the new type and fails with
-- "operator does not exist: run_status <> run_status_old" — a real gotcha
-- hit while writing this migration. Dropping them first, before the type
-- swap, avoids it; they're recreated afterward with the new exclusion list.
drop index if exists runs_worker_poll_idx;
drop index if exists runs_one_active_per_lead;

alter type run_status rename to run_status_old;

create type run_status as enum (
  'pending',
  'validating',
  'normalizing',
  'deduplicating',
  'enriching',
  'classifying',
  'qualifying',
  'generating_brief',
  'blocked',
  'duplicate',
  'invalid',
  'failed',
  'needs_review',
  'completed'
);

-- Separate statements deliberately: combining TYPE ... USING with SET
-- DEFAULT in one multi-action ALTER TABLE made Postgres try to compare the
-- old and new enum types directly ("operator does not exist: run_status <>
-- run_status_old") — a real gotcha hit while implementing this migration.
alter table lead_processing_runs alter column status drop default;
alter table lead_processing_runs
  alter column status type run_status using status::text::run_status;
alter table lead_processing_runs alter column status set default 'pending'::run_status;

drop type run_status_old;

alter table lead_processing_runs drop column failed_stage;
alter table lead_processing_runs add column lease_expires_at timestamptz;

-- Recreated with the new exclusion list: 'blocked' and 'needs_review' are
-- now excluded from the worker poll but remain "active" for the
-- one-run-per-lead constraint, since they haven't concluded.

create index runs_worker_poll_idx
  on lead_processing_runs (next_attempt_at)
  where status not in ('completed', 'failed', 'duplicate', 'invalid', 'blocked', 'needs_review');

create unique index runs_one_active_per_lead
  on lead_processing_runs (lead_id)
  where status not in ('completed', 'failed', 'duplicate', 'invalid');

-- ---------------------------------------------------------------------------
-- Atomic job claiming
-- ---------------------------------------------------------------------------
-- The canonical "claim N jobs" pattern: SELECT ... FOR UPDATE SKIP LOCKED
-- inside a CTE, feeding an UPDATE ... FROM in the same statement, so the
-- claim (find eligible rows, lock them, skip anything already locked by
-- another worker, mark ownership, commit) is one atomic operation — never a
-- separate SELECT-then-UPDATE, which would race between the two steps.
--
-- attempt_count is incremented here, at claim time, not on failure: a worker
-- that crashes mid-execution still consumes an attempt once claimed, so a
-- stage that reliably crashes the whole process still exhausts max_attempts
-- and eventually reaches `failed` instead of retrying forever.
--
-- `was_recovered` distinguishes a stale-lease recovery (the row had a
-- previous, non-null locked_by — the only way it could have matched the
-- WHERE clause is if that lease had since expired) from a first claim, so
-- the caller can record a `run.recovered` event instead of `run.claimed`.
create function claim_lead_processing_runs(
  p_limit int,
  p_worker_id text,
  p_lease_seconds int
)
returns table (
  id uuid,
  lead_id uuid,
  status run_status,
  current_stage pipeline_stage,
  attempt_count int,
  max_attempts int,
  locked_at timestamptz,
  locked_by text,
  lease_expires_at timestamptz,
  next_attempt_at timestamptz,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  was_recovered boolean
)
language sql
as $$
  with claimable as (
    select r.id, r.locked_by as previous_locked_by
    from lead_processing_runs r
    where r.status not in ('completed', 'failed', 'duplicate', 'invalid', 'blocked', 'needs_review')
      and r.next_attempt_at <= now()
      and (r.lease_expires_at is null or r.lease_expires_at < now())
    order by r.next_attempt_at
    limit p_limit
    for update skip locked
  )
  update lead_processing_runs r
  set locked_at = now(),
      locked_by = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      attempt_count = r.attempt_count + 1,
      started_at = coalesce(r.started_at, now())
  from claimable c
  where r.id = c.id
  returning
    r.id, r.lead_id, r.status, r.current_stage, r.attempt_count, r.max_attempts,
    r.locked_at, r.locked_by, r.lease_expires_at, r.next_attempt_at, r.failure_reason,
    r.started_at, r.completed_at, r.created_at, r.updated_at,
    (c.previous_locked_by is not null) as was_recovered;
$$;

-- This function is a highly privileged operation (it advances pipeline
-- state and must only ever be invoked by the worker's service-role
-- connection) — PostgREST exposes every public function to PostgREST
-- callers by default regardless of table RLS, so it must be explicitly
-- locked down rather than relying on RLS alone. Revoking from PUBLIC blocks
-- every role that doesn't have an explicit grant (anon, authenticated,
-- anything else), on Supabase or on a bare Postgres instance alike; the
-- grant to service_role is conditional because that role only exists on a
-- real Supabase project, not on a plain Postgres used for local/CI testing.
revoke execute on function claim_lead_processing_runs(int, text, int) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function claim_lead_processing_runs(int, text, int) to service_role';
  end if;
end $$;
