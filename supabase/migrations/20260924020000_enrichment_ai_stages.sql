-- Phase 4: enrichment, classification, qualification, and intelligence
-- brief. Small, additive changes only — no rewrite of the Phase 1-3 schema.
--
-- 1. classification_category gains three values the Phase 1 draft didn't
--    anticipate: 'software_company' and 'marketplace' (common lead-gen
--    categories that don't fit the original list) and 'unknown' (evidence
--    was too thin to classify — explicitly allowed rather than forcing a
--    guess, per docs/architecture.md's Phase 4 notes).
alter type classification_category add value if not exists 'software_company';
alter type classification_category add value if not exists 'marketplace';
alter type classification_category add value if not exists 'unknown';

-- 2. Each of these three tables holds at most one row per processing run —
-- enforced at the database level, not just by the stage checking first, so
-- a retry after a crash between "AI call succeeded" and "run status
-- advanced" can never insert a second competing row for the same run.
alter table lead_classifications add constraint lead_classifications_run_id_unique unique (run_id);
alter table lead_qualifications add constraint lead_qualifications_run_id_unique unique (run_id);
alter table lead_intelligence_briefs add constraint lead_intelligence_briefs_run_id_unique unique (run_id);
