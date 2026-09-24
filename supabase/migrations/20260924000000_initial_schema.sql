-- AI Lead Intelligence & Outreach Pipeline — initial schema (Phase 2).
-- See docs/architecture.md for the design rationale. Deviations from the
-- Phase 1 draft are called out inline and summarized in
-- docs/architecture.md's "Phase 2 implementation notes" section.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- future name-similarity dedup signal (not wired yet)

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

-- Coarse, dashboard-facing status. Deviation from the Phase 1 draft: 'invalid'
-- was missing even though the pipeline state machine defines an invalid
-- terminal state. Added here for consistency; Phase 2's ingestion path never
-- produces it (bad input is rejected before a row is ever created — see
-- docs/architecture.md), but the worker's future validating stage may.
create type lead_status as enum (
  'pending',
  'processing',
  'completed',
  'failed',
  'duplicate',
  'needs_review',
  'invalid'
);

-- Fine-grained pipeline lifecycle status, one per lead_processing_runs row.
-- Deviation from the Phase 1 draft: the draft's DDL left this column as
-- unconstrained text even though architecture.md §2 defines the full state
-- list. Enforced here as a real enum.
create type run_status as enum (
  'pending',
  'validating', 'invalid',
  'normalizing', 'normalized',
  'deduplicating', 'duplicate', 'unique',
  'enriching', 'enrichment_failed', 'enriched',
  'classifying', 'classification_failed', 'classified',
  'qualifying', 'qualified', 'disqualified',
  'generating_brief', 'brief_failed',
  'completed', 'failed',
  'needs_review'
);

-- The stage a run is currently on, independent of whether that stage
-- succeeded, failed, or is still pending — kept separate from run_status so
-- "which step" and "what happened at that step" don't have to be encoded in
-- one combinatorial enum.
create type pipeline_stage as enum (
  'validating',
  'normalizing',
  'deduplicating',
  'enriching',
  'classifying',
  'qualifying',
  'generating_brief'
);

create type evidence_source_type as enum (
  'website', 'search_result', 'linkedin', 'social', 'directory', 'enrichment', 'manual', 'other'
);

create type evidence_relevance as enum ('primary', 'supporting', 'contextual');

create type classification_category as enum (
  'startup', 'established_company', 'agency', 'consultancy',
  'investor', 'nonprofit', 'research_institution', 'other'
);

create type qualification_level as enum ('unqualified', 'low', 'medium', 'high');

create type lead_source as enum ('manual', 'csv_import', 'api');

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------

create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ---------------------------------------------------------------------------
-- leads
-- ---------------------------------------------------------------------------

create table leads (
  id                   uuid primary key default gen_random_uuid(),
  raw_company_name     text not null,
  company_name         text not null,
  website              text,
  website_domain       text,
  contact_name         text,
  email                text,
  email_domain         text,
  linkedin_url         text,
  industry             text,
  country              text,
  status               lead_status not null default 'pending',
  qualification_level  qualification_level,
  qualification_score  int check (qualification_score between 0 and 100),
  duplicate_of_lead_id uuid references leads(id),
  source               lead_source not null default 'manual',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint leads_company_name_not_blank check (btrim(company_name) <> '')
);

-- website_domain is the hard dedup key. Enforced as a normal unique index
-- (not partial): Phase 2 rejects exact-domain duplicates at ingestion time
-- before a row is ever inserted (see docs/architecture.md), so a second row
-- sharing a domain should never occur. The index remains the backstop against
-- a race between two concurrent ingestion requests.
create unique index leads_website_domain_unique
  on leads (website_domain)
  where website_domain is not null;

create index leads_company_name_trgm on leads using gin (company_name gin_trgm_ops);
create index leads_status_idx on leads (status);
create index leads_email_domain_idx on leads (email_domain) where email_domain is not null;

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- lead_processing_runs
-- ---------------------------------------------------------------------------

create table lead_processing_runs (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id),
  status          run_status not null default 'pending',
  current_stage   pipeline_stage not null default 'validating',
  attempt_count   int not null default 0 check (attempt_count >= 0),
  max_attempts    int not null default 5 check (max_attempts > 0),
  locked_at       timestamptz,
  locked_by       text,
  next_attempt_at timestamptz not null default now(),
  failure_reason  text,
  failed_stage    pipeline_stage,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index runs_lead_idx on lead_processing_runs (lead_id);

-- Worker poll index (used from Phase 4 on): only non-terminal runs are ever
-- claimed, ordered by due time.
create index runs_worker_poll_idx
  on lead_processing_runs (next_attempt_at)
  where status not in ('completed', 'failed', 'duplicate', 'invalid');

-- A lead cannot have more than one active (non-terminal) processing run at a
-- time — enforced at the database level, not just in application code.
create unique index runs_one_active_per_lead
  on lead_processing_runs (lead_id)
  where status not in ('completed', 'failed', 'duplicate', 'invalid');

create trigger runs_set_updated_at
  before update on lead_processing_runs
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- lead_evidence
-- ---------------------------------------------------------------------------

create table lead_evidence (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id),
  run_id          uuid references lead_processing_runs(id),
  source_url      text,
  source_type     evidence_source_type not null,
  provider        text,
  idempotency_key text,
  title           text,
  snippet         text,
  extracted_data  jsonb,
  relevance       evidence_relevance not null default 'supporting',
  collected_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (lead_id, idempotency_key)
);

create index evidence_lead_idx on lead_evidence (lead_id);

-- ---------------------------------------------------------------------------
-- lead_classifications
-- ---------------------------------------------------------------------------

create table lead_classifications (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references leads(id),
  run_id        uuid not null references lead_processing_runs(id),
  category      classification_category not null,
  confidence    numeric not null check (confidence between 0 and 1),
  reasoning     text not null,
  signals_used  jsonb not null default '[]'::jsonb,
  model         text not null,
  model_version text,
  raw_output    jsonb not null,
  created_at    timestamptz not null default now()
);

create index classifications_lead_idx on lead_classifications (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- lead_qualifications
-- ---------------------------------------------------------------------------

create table lead_qualifications (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid not null references leads(id),
  run_id               uuid not null references lead_processing_runs(id),
  score                int not null check (score between 0 and 100),
  level                qualification_level not null,
  deterministic_score  int not null check (deterministic_score between 0 and 100),
  ai_score             int not null check (ai_score between 0 and 100),
  evidence_confidence  numeric not null check (evidence_confidence between 0 and 1),
  reasons              jsonb not null,
  opportunity_signals  jsonb not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);

create index qualifications_lead_idx on lead_qualifications (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- lead_intelligence_briefs
-- ---------------------------------------------------------------------------

create table lead_intelligence_briefs (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references leads(id),
  run_id                   uuid not null references lead_processing_runs(id),
  company_summary          text not null,
  signals                  jsonb not null default '[]'::jsonb,
  pain_points              jsonb not null default '[]'::jsonb,
  automation_opportunities jsonb not null default '[]'::jsonb,
  outreach_angle           text not null,
  confidence               numeric not null check (confidence between 0 and 1),
  model                    text not null,
  raw_output               jsonb not null,
  created_at               timestamptz not null default now()
);

create index briefs_lead_idx on lead_intelligence_briefs (lead_id, created_at desc);

-- ---------------------------------------------------------------------------
-- processing_events (append-only audit log)
-- ---------------------------------------------------------------------------

create table processing_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id),
  run_id     uuid references lead_processing_runs(id),
  event_type text not null,
  metadata   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_lead_idx on processing_events (lead_id, created_at);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Single-operator internal tool: the app talks to Supabase exclusively with
-- the service-role key from server-only code, which bypasses RLS by design.
-- RLS is enabled with no policies, so the anon/authenticated roles (i.e. any
-- direct browser access) get zero rows from any table.

alter table leads enable row level security;
alter table lead_processing_runs enable row level security;
alter table lead_evidence enable row level security;
alter table lead_classifications enable row level security;
alter table lead_qualifications enable row level security;
alter table lead_intelligence_briefs enable row level security;
alter table processing_events enable row level security;
