-- Fixes a real bug caught via live end-to-end verification (Phase 5): a
-- freshly-created run has status='pending', current_stage='validating'.
-- claim_lead_processing_runs locked it and bumped attempt_count, but never
-- set status to match current_stage — so the moment validateStage
-- succeeded, the runner's resolveOutcome tried
-- assertValidTransition('pending', 'normalizing'), which is correctly
-- illegal per the transition map (only 'pending' -> 'validating' is
-- allowed), and every brand-new lead failed on its very first tick with
-- "Illegal run status transition: pending -> normalizing".
--
-- The fix belongs in the claim step: claiming a run for stage X means it is
-- now actively at stage X, so status should become current_stage at claim
-- time, not stay 'pending' until some later success. For a run already
-- mid-pipeline (status already equals current_stage, e.g. a retry or a
-- stale-lease recovery) this is a no-op.
create or replace function claim_lead_processing_runs(
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
      started_at = coalesce(r.started_at, now()),
      status = r.current_stage::text::run_status
  from claimable c
  where r.id = c.id
  returning
    r.id, r.lead_id, r.status, r.current_stage, r.attempt_count, r.max_attempts,
    r.locked_at, r.locked_by, r.lease_expires_at, r.next_attempt_at, r.failure_reason,
    r.started_at, r.completed_at, r.created_at, r.updated_at,
    (c.previous_locked_by is not null) as was_recovered;
$$;
