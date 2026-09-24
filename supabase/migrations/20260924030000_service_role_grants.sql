-- Fixes a real bug caught via live verification against a local Supabase
-- instance (Phase 5): every migration since Phase 2 assumed the service-role
-- key's RLS bypass also implied ordinary table privileges, but RLS bypass
-- and SQL GRANTs are separate mechanisms — bypassing RLS means "your rows
-- aren't filtered," not "you may touch this table at all." Postgres's grant
-- check happens before RLS is even evaluated, and `service_role` had never
-- been granted SELECT/INSERT/UPDATE/DELETE on any of these tables, only the
-- structural TRIGGER/REFERENCES/TRUNCATE privileges Postgres's own default
-- privileges provide. Every server-side query was failing with "permission
-- denied for table X" until this was granted explicitly.
-- Conditional because service_role only exists on a real Supabase project,
-- not on a bare Postgres instance used for local/CI integration tests (same
-- pattern as the Phase 3 migration's claim_lead_processing_runs grant).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on
      leads,
      lead_processing_runs,
      lead_evidence,
      lead_classifications,
      lead_qualifications,
      lead_intelligence_briefs,
      processing_events
    to service_role;
  end if;
end $$;
