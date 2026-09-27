-- Deletes a lead and everything derived from it in one atomic statement,
-- rather than several sequential DELETEs from application code that could
-- leave a lead half-deleted if one of them failed partway. Added for the
-- dashboard's own "Delete lead" action and the "Rerun" action in the
-- duplicate-lead dialog (which deletes the existing lead for a domain, then
-- resubmits the same payload as a genuinely fresh lead — the ingestion
-- service's duplicate check has no other way to let the same domain be
-- reprocessed from scratch, see docs/architecture.md's Phase 2 notes on
-- why an exact-domain duplicate is rejected rather than stored).
--
-- Nulls any *other* lead's duplicate_of_lead_id pointing at this one rather
-- than cascading that deletion too — a lead recorded as "a duplicate of X"
-- shouldn't itself vanish just because X did.
create or replace function delete_lead_cascade(p_lead_id uuid)
returns void
language sql
as $$
  update leads set duplicate_of_lead_id = null where duplicate_of_lead_id = p_lead_id;
  delete from processing_events where lead_id = p_lead_id;
  delete from lead_intelligence_briefs where lead_id = p_lead_id;
  delete from lead_qualifications where lead_id = p_lead_id;
  delete from lead_classifications where lead_id = p_lead_id;
  delete from lead_evidence where lead_id = p_lead_id;
  delete from lead_processing_runs where lead_id = p_lead_id;
  delete from leads where id = p_lead_id;
$$;

-- Same lockdown as claim_lead_processing_runs (Phase 3 migration): a
-- privileged, destructive operation that must only ever be invoked by the
-- worker/app's service-role connection, not left at PostgREST's default of
-- exposing every public function to every role.
revoke execute on function delete_lead_cascade(uuid) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function delete_lead_cascade(uuid) to service_role';
  end if;
end $$;
