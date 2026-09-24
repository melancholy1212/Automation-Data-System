# AI Lead Intelligence & Outreach Pipeline — Architecture (Phase 1)

Portfolio Project 2. Turns raw business leads into structured, evidence-backed,
qualified lead intelligence via a resumable background pipeline. Deliberately
distinct from Project 1 (AI Market Research Platform): Project 1 is a
single-shot, ephemeral "ask a question → get a report" flow with a live
in-request progress log. This project is a durable, multi-stage,
crash-resumable **operations pipeline** over persistent records — a different
shape of problem (batch/ops data system vs. single-request research tool) and
a different UI language (dense B2B ops console vs. editorial report reader).

This document is the Phase 1 deliverable: architecture only. No application
code is implemented yet.

---

## 1. Application architecture

Solo-developer scope. No Kafka, no Kubernetes, no Redis, no bespoke AWS infra.

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind | Dark-mode-first ops console, not a chat UI |
| API/server | Next.js Route Handlers (`app/api/**`) | Same boundary style as Project 1, different domain |
| Database | Supabase Postgres | Single source of truth; also backs the queue (see §1.1) |
| Background processing | Postgres-as-queue + Vercel Cron | No external broker; `SELECT ... FOR UPDATE SKIP LOCKED` |
| External data providers | Adapter interfaces, one reference impl each | See §8 |
| AI layer | Provider-agnostic interface, structured outputs only | Zod-validated, never raw text into DB |
| Persistence | Supabase Postgres only | Evidence stored as text/jsonb, no object storage needed |
| Logging | `processing_events` table + Vercel function logs | No external APM; the audit log doubles as the UI's timeline data |
| Deploy | Vercel (app) + Supabase (db) | Matches the stated deployment constraint |

### 1.1 Why Postgres-as-queue instead of a real queue

At solo-dev/portfolio scale, a `lead_processing_runs` row with `status`,
`next_attempt_at`, `locked_at`, `locked_by` columns *is* a job queue. A Vercel
Cron job hits `/api/worker/tick` on a short interval; the handler claims a
small batch of due rows with `SKIP LOCKED`, advances each **one stage**, and
commits. This avoids introducing Redis/SQS while still getting: durability,
resumability, visibility (it's just SQL), and idempotency.

Each invocation processes exactly one stage per lead, not the whole pipeline,
so it comfortably fits inside a Vercel function's execution budget and makes
every step independently retryable.

---

## 2. Pipeline state machine

```
pending
  → validating       → invalid (terminal)
  → validated
  → normalizing
  → normalized
  → deduplicating
  → duplicate (terminal, duplicate_of_lead_id set)
  → unique
  → enriching         → enrichment_failed (non-terminal, degrades forward)
  → enriched
  → classifying        → classification_failed (retriable)
  → classified
  → qualifying
  → qualified | disqualified
  → generating_brief   → brief_failed (non-terminal, degrades forward)
  → completed

cross-cutting: failed (terminal after max_attempts on a retriable stage)
```

Design rules:

- **One active run per lead** (`lead_processing_runs`), holding
  `status`, `current_stage`, `attempt_count`, `locked_at`, `locked_by`,
  `next_attempt_at`, `failure_reason`, `failed_stage`. Historical runs are
  kept (a manual "reprocess from scratch" creates a new run row) so the audit
  trail survives retries.
- **Claiming**: `UPDATE lead_processing_runs SET locked_at = now(), locked_by = $worker_id WHERE id = (SELECT id FROM lead_processing_runs WHERE status NOT IN (terminal) AND next_attempt_at <= now() AND (locked_at IS NULL OR locked_at < now() - interval '2 minutes') ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`. A stale lock (worker crashed) self-heals after the timeout — this is how an interrupted job resumes, with zero special-case recovery code.
- **Idempotency**: every external call (enrichment fetch, AI call) is keyed by `run_id || ':' || stage`. Results are upserted into `lead_evidence`/output tables on that key, so re-running a stage after a crash never double-calls a paid API or double-inserts evidence.
- **Retry/backoff**: per-stage `attempt_count` with backoff schedule (immediate → +1m → +5m → +30m → +2h), `max_attempts` per stage (default 5). Exhausting retries on a *retriable* stage (enrichment, classification, brief) does **not** delete the lead — it degrades forward (enrichment/brief) or lands in `failed` with `failed_stage` recorded (classification, since qualification depends on it) so a human can retry via `POST /api/leads/:id/retry`.
- **No reprocessing the same lead twice concurrently**: enforced by the claim query itself (a locked row can't be claimed again) plus a partial unique index ensuring at most one non-terminal run per `lead_id`.

---

## 3. Database schema

Seven tables — the smallest set that represents the domain without collapsing
distinct, independently-queried concerns into a junk-drawer JSON blob.

```sql
-- Canonical business entity
create table leads (
  id                  uuid primary key default gen_random_uuid(),
  raw_company_name    text not null,
  company_name        text not null,            -- normalized display name
  website             text,                      -- normalized (scheme/www/trailing-slash stripped)
  website_domain      text,                      -- registrable domain (eTLD+1), dedup key
  contact_name        text,
  email               text,
  email_domain        text,
  linkedin_url        text,
  industry            text,
  country             text,                       -- ISO 3166-1 alpha-2 preferred
  status              text not null default 'pending'
                        check (status in ('pending','processing','completed','failed','duplicate','needs_review')),
  qualification_level text check (qualification_level in ('unqualified','low','medium','high')),
  qualification_score int check (qualification_score between 0 and 100),
  duplicate_of_lead_id uuid references leads(id),
  source              text not null default 'manual', -- csv_import | manual | api
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index leads_website_domain_unique
  on leads (website_domain)
  where website_domain is not null and duplicate_of_lead_id is null;
create extension if not exists pg_trgm;
create index leads_company_name_trgm on leads using gin (company_name gin_trgm_ops);
create index leads_status_idx on leads (status);

-- One row per processing attempt/lifecycle
create table lead_processing_runs (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id),
  status         text not null default 'pending',
  current_stage  text not null default 'validating',
  attempt_count  int not null default 0,
  max_attempts   int not null default 5,
  locked_at      timestamptz,
  locked_by      text,
  next_attempt_at timestamptz not null default now(),
  failure_reason text,
  failed_stage   text,
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index runs_worker_poll_idx on lead_processing_runs (next_attempt_at)
  where status not in ('completed','failed','duplicate','invalid');
create unique index runs_one_active_per_lead
  on lead_processing_runs (lead_id)
  where status not in ('completed','failed','duplicate','invalid');

-- Every fact the pipeline collected, with provenance
create table lead_evidence (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id),
  run_id          uuid references lead_processing_runs(id),
  source_url      text,
  source_type     text not null check (source_type in
                    ('website','search_result','linkedin','social','directory','enrichment','manual','other')),
  provider        text,                       -- e.g. 'website-scrape', null for manual
  idempotency_key text,                        -- run_id:stage, dedupes retried fetches
  title           text,
  snippet         text,
  extracted_data  jsonb,
  relevance       text not null default 'supporting' check (relevance in ('primary','supporting','contextual')),
  collected_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  unique (lead_id, idempotency_key)
);
create index evidence_lead_idx on lead_evidence (lead_id);

-- Typed AI output: classification
create table lead_classifications (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id),
  run_id       uuid not null references lead_processing_runs(id),
  category     text not null check (category in
                 ('startup','established_company','agency','consultancy','investor','nonprofit','research_institution','other')),
  confidence   numeric not null check (confidence between 0 and 1),
  reasoning    text not null,
  signals_used jsonb not null default '[]',   -- evidence ids referenced
  model        text not null,
  model_version text,
  raw_output   jsonb not null,                 -- full validated payload, for audit
  created_at   timestamptz not null default now()
);
create index classifications_lead_idx on lead_classifications (lead_id, created_at desc);

-- Typed output: qualification (composite, see §6)
create table lead_qualifications (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references leads(id),
  run_id             uuid not null references lead_processing_runs(id),
  score              int not null check (score between 0 and 100),
  level              text not null check (level in ('unqualified','low','medium','high')),
  deterministic_score int not null check (deterministic_score between 0 and 100),
  ai_score           int not null check (ai_score between 0 and 100),
  evidence_confidence numeric not null check (evidence_confidence between 0 and 1),
  reasons            jsonb not null,           -- [{factor, weight, contribution, source, detail}]
  opportunity_signals jsonb not null default '[]',
  created_at         timestamptz not null default now()
);
create index qualifications_lead_idx on lead_qualifications (lead_id, created_at desc);

-- Typed output: intelligence brief
create table lead_intelligence_briefs (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references leads(id),
  run_id                   uuid not null references lead_processing_runs(id),
  company_summary          text not null,
  signals                  jsonb not null default '[]',
  pain_points              jsonb not null default '[]',
  automation_opportunities jsonb not null default '[]', -- [{opportunity, rationale, evidence_refs}]
  outreach_angle           text not null,
  confidence               numeric not null check (confidence between 0 and 1),
  model                    text not null,
  raw_output               jsonb not null,
  created_at               timestamptz not null default now()
);
create index briefs_lead_idx on lead_intelligence_briefs (lead_id, created_at desc);

-- Append-only audit/event log — powers the UI timeline
create table processing_events (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id),
  run_id     uuid references lead_processing_runs(id),
  event_type text not null,   -- lead_imported, validation_failed, enrichment_completed, ...
  metadata   jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index events_lead_idx on processing_events (lead_id, created_at);
```

### 3.1 Deduplication

- **Website normalization** (deterministic, code not AI): strip scheme,
  strip leading `www.`, strip trailing slash/path/query/fragment, lowercase,
  then resolve the **registrable domain** (eTLD+1) via a public-suffix-list
  library. `https://www.example.com/about?ref=x` and `example.com` and
  `EXAMPLE.COM/` all normalize to `website_domain = 'example.com'`.
- **Primary key for dedup**: `website_domain`. Enforced by the partial unique
  index above — a second lead with the same domain is marked
  `status='duplicate'`, `duplicate_of_lead_id` set to the existing canonical
  lead, and excluded from the active pipeline while remaining visible.
- **Secondary signal (no website, or a name collision)**: normalized company
  name (lowercase, punctuation stripped, legal suffixes like
  `Inc|LLC|Ltd|GmbH|Pty` stripped) compared via Postgres `pg_trgm`
  `similarity()` against existing leads. A collision does **not**
  auto-merge — two real companies can share a name across countries. Above a
  high similarity threshold *and* matching country/industry, the lead is
  flagged `status='needs_review'` for a human decision rather than silently
  merged or silently kept.

---

## 4. Evidence model

`lead_evidence` (§3) is the single feed for two consumers: the AI prompts
(classification/qualification/brief are built only from rows in this table
plus the `leads` row itself — never from unconstrained model memory) and the
"why" viewer in the Lead Detail UI. `source_type` + `provider` give
provenance; `idempotency_key` prevents a retried fetch from duplicating
evidence; `relevance` lets the UI and the prompt-builder both prioritize
primary evidence over contextual noise.

---

## 5. AI output contracts

All three are Zod schemas enforced server-side immediately after the model
call; mirrored as a JSON Schema passed to the provider for structured output.
A failed validation never reaches the database (see §7).

```ts
const CompanyClassification = z.object({
  category: z.enum(['startup','established_company','agency','consultancy',
                     'investor','nonprofit','research_institution','other']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(500),
  signals_used: z.array(z.string()),      // evidence row ids the model cited
});

const AIQualificationSignal = z.object({
  ai_score: z.number().int().min(0).max(100),
  reasons: z.array(z.object({
    factor: z.string(), contribution: z.number(), detail: z.string(),
  })),
  opportunity_signals: z.array(z.string()),
});

const IntelligenceBrief = z.object({
  company_summary: z.string(),
  signals: z.array(z.string()),
  pain_points: z.array(z.string()),
  automation_opportunities: z.array(z.object({
    opportunity: z.string(), rationale: z.string(), evidence_refs: z.array(z.string()),
  })),
  outreach_angle: z.string(),
  confidence: z.number().min(0).max(1),
});
```

`Qualification` as stored (`lead_qualifications`) is a superset produced by
combining `AIQualificationSignal` with the deterministic score — see §6. The
AI never emits a final `score`/`level` directly; those are always computed in
code.

---

## 6. Qualification logic (explainable, not "AI said 87")

```
final_score = round(
    deterministic_score * 0.4
  + ai_score             * 0.4
  + evidence_confidence * 100 * 0.2
)
level = score→level bucket: <30 unqualified · 30-59 low · 60-79 medium · 80-100 high
```

- **`deterministic_score`** — pure code, zero AI, computed from concrete
  signals on the lead/evidence: has website (+10), has verifiable contact
  (+10), industry on target list (+15), country in target market (+10),
  company-size signal present (+10), evidence_count ≥ 3 (+10), recent-activity
  signal present (+15), no disqualifying signal (+10, capped at 100).
- **`ai_score`** — the model's own judgment given the *same* evidence set,
  with its per-factor reasoning captured in `AIQualificationSignal.reasons`.
- **`evidence_confidence`** — also deterministic: a function of evidence
  count, relevance mix (primary vs. contextual), and recency. Zero evidence
  ⇒ confidence 0, regardless of what the model claims, which pulls the final
  score down even if the AI is overconfident.
- Weights are named constants in `lib/scoring/combine.ts`, not hidden inside
  a prompt — changing them is a code review, not a prompt-archaeology
  exercise.
- Every contributing factor is written into `lead_qualifications.reasons`
  with a `source` tag (`deterministic` | `ai` | `evidence`), which is exactly
  what the Lead Detail "score breakdown" panel renders. This is the literal
  answer to "why did this lead get 87/100."

---

## 7. Failure handling

| Failure | Behavior |
|---|---|
| Enrichment API failure (timeout/5xx/rate-limit) | Retry w/ backoff up to `max_attempts`; on exhaustion mark `enrichment_failed` and **proceed** with whatever evidence exists (possibly none) — `evidence_confidence` absorbs the gap. Lead is never dropped. |
| AI provider failure (down/rate-limited) | Retry w/ backoff; on exhaustion, run moves to `failed` at that stage (classification/brief can't be faked), lead + evidence stay visible and retriable via `POST /api/leads/:id/retry`. |
| Malformed AI output (fails Zod) | One repair re-prompt (send the validation error back to the model); repeated failure follows the "AI provider failure" path above. |
| Timeout | Per-stage timeout constants (enrichment 15s, AI 30s) via `AbortController`; one stage per invocation keeps every attempt inside Vercel's function budget. |
| Database failure mid-stage | Stage work commits transactionally or not at all; an uncommitted claim's lock simply expires and the next tick retries — safe because external calls are idempotency-keyed. |
| Duplicate lead | Not an error — terminal `status='duplicate'`, no failure surfaced. |
| Missing website | Allowed. Validation only requires `company_name`. Deterministic score loses the "has website" points; dedup falls back to name similarity; pipeline still completes. |
| Unavailable evidence entirely | Classification defaults toward low-confidence `other`; qualification skews low via `evidence_confidence=0`; brief generation still runs on whatever exists, explicitly noting low confidence rather than inventing facts. |

Graceful degradation is the throughline: only classification/brief provider
outages that exhaust retries produce a `failed` run; every other failure mode
degrades the *quality* of the result, not its existence.

---

## 8. Provider abstraction

```ts
interface EnrichmentProvider {
  name: string;
  enrich(lead: LeadInput): Promise<EnrichmentResult>; // → lead_evidence rows
}

interface AIProvider {
  classify(input: ClassificationInput): Promise<CompanyClassification>;
  qualify(input: QualificationInput): Promise<AIQualificationSignal>;
  generateBrief(input: BriefInput): Promise<IntelligenceBrief>;
}
```

Phase 1 defines interfaces + types only. One reference implementation of each
is planned for the implementation phases: a no-API-key `WebsiteScrapeProvider`
(fetches the homepage, pulls meta description/title/basic tech signals) so
the deployed demo runs without paid enrichment keys, and one `AIProvider`
adapter (reusing whichever model provider proved reliable in Project 1),
selected via env var so a second adapter can be added later without touching
pipeline code.

---

## 9. Observability

`processing_events` (§3) is the entire observability layer: every stage
transition writes one row. The Leads Dashboard's stat tiles are aggregate
counts by `leads.status`; the Lead Detail page renders `processing_events`
for that lead as a vertical timeline. No external APM — Vercel's built-in
function logs cover operator-side debugging, keeping the infra list honest to
the "no unnecessary infrastructure" constraint.

---

## 10. API boundaries

| Endpoint | Responsibility |
|---|---|
| `POST /api/leads` | Create lead(s) — single object or batch array; runs validation+normalization inline; enqueues a `pending` run |
| `GET /api/leads` | List with filters (status, qualification_level, industry, country) + pagination |
| `GET /api/leads/:id` | Full detail: lead + latest classification/qualification/brief + evidence + run history |
| `GET /api/leads/:id/events` | `processing_events` timeline for one lead |
| `POST /api/leads/:id/retry` | Reset a `failed` run's bookkeeping to retry from `failed_stage` (not from scratch) |
| `POST /api/worker/tick` | Internal only (bearer-secret protected); claims + advances a batch of due runs, invoked by Vercel Cron |

CSV batch import is a UI-layer concern on top of `POST /api/leads`
(client parses CSV → posts the array) rather than a separate endpoint, unless
volume later demands server-side streaming parse.

---

## 11. Security

- **RLS**: single-operator internal tool, no multi-tenant end users yet. RLS
  enabled on all tables; the app talks to Supabase exclusively with the
  service-role key from server-only code (`server-only` import guard, same
  pattern as Project 1) — the browser never gets a Supabase client or anon
  key with table access. If a login is added later, add an
  authenticated-staff RLS policy at that point.
- **Secrets**: AI/enrichment provider keys live in Vercel env vars, read only
  in server-only modules.
- **Input validation**: every `POST` body validated with Zod before touching
  the DB; malformed rows are reported back, not silently dropped.
- **Worker endpoint**: `/api/worker/tick` requires a bearer secret compared
  with a constant-time check; not reachable without it.

---

## 12. UI architecture

Deliberately different visual/architectural language from Project 1's light,
editorial "read a report" page: this is a **dense operations console** —
dark-mode-first, monospace for ids/scores/timestamps, colored status pills
(`pending`=gray, `processing`=blue/pulsing, `qualified`=green,
`disqualified`=amber, `failed`=red, `duplicate`=slate).

- **Leads Dashboard** — stat tiles (total / processing / qualified / rejected
  / failed) above a sortable, filterable data table (company, domain, status
  pill, qualification score+level, industry, country, updated). Row click →
  detail.
- **Lead Detail** — header (name, domain, status); qualification score with
  a visual deterministic/AI/evidence-confidence breakdown; classification
  badge + reasoning; intelligence brief as structured cards (summary /
  signals / pain points / opportunities / outreach angle); evidence list
  (source, snippet, link-out); processing timeline from `processing_events`.
- **Import / Processing** — a form for a single lead plus CSV upload for
  batch; after import, a polling view (`GET /api/leads?status=processing`)
  showing rows advance through stages. Short-interval polling is sufficient
  at this scale — no websockets/SSE needed.

Not a chatbot anywhere in this surface — the only free-text AI content shown
is the structured brief fields, always rendered next to their supporting
evidence.

---

## 13. Portfolio-quality requirements — how this satisfies them

Evidence-grounded outputs (§4–5), explainable scoring (§6), real failure/retry
handling (§7) with the lead never silently disappearing, typed AI contracts
validated in code (§5), a genuine resumable state machine rather than a
progress bar (§2), and clean provider boundaries (§8) — the same engineering
signal Project 1 demonstrates, applied to a structurally different problem
(durable batch pipeline vs. ephemeral single-shot research) so the two
portfolio pieces don't read as reskins of each other.

---

## Recommended folder structure

```
Automation-Data-System/
  src/
    app/
      (dashboard)/
        page.tsx                    # Leads Dashboard
        leads/[id]/page.tsx          # Lead Detail
        import/page.tsx              # Import screen
      api/
        leads/route.ts
        leads/[id]/route.ts
        leads/[id]/events/route.ts
        leads/[id]/retry/route.ts
        worker/tick/route.ts
    lib/
      db/                            # Supabase client, typed queries
      pipeline/
        stages/
          validate.ts
          normalize.ts
          dedupe.ts
          enrich.ts
          classify.ts
          qualify.ts
          brief.ts
        runner.ts                    # claims a run, advances exactly one stage
        state-machine.ts             # status transition table + guards
      providers/
        ai/
          types.ts
          <chosen-provider>.ts
        enrichment/
          types.ts
          website-scrape-provider.ts
      schemas/                       # Zod contracts: lead input, classification, qualification, brief
      scoring/
        deterministic.ts
        combine.ts
    components/
      dashboard/
      lead-detail/
      ui/                            # design-system primitives, distinct from Project 1's
  supabase/
    migrations/
  docs/
    architecture.md                  # this document
```

---

## Implementation phases (for the next prompt)

1. **Schema & types** — Supabase migration for the seven tables above, generated TypeScript types, seed script.
2. **Ingestion** — `POST/GET /api/leads`, validation + normalization + dedup stages (no AI/enrichment yet), bare Leads Dashboard table.
3. **Runner & worker** — state-machine runner, claim/lock query, Vercel Cron wiring to `/api/worker/tick`; one enrichment provider + evidence storage.
4. **AI stages** — classification + qualification (deterministic + AI combine) behind Zod-validated contracts.
5. **Brief & detail UI** — intelligence brief generation, full Lead Detail page (breakdown, evidence, timeline).
6. **Import UI & polish** — CSV import flow, retry endpoint wired to the UI, dark-theme design pass, README, Vercel deploy.

Stopping here per Phase 1 scope — no application code has been written.

---

## Phase 2 implementation notes (database foundation + ingestion)

Implemented: the migration, hand-maintained DB types, website/email
normalization, the ingestion service, and `POST/GET /api/leads`,
`GET /api/leads/:id`, `GET /api/leads/:id/events` — per the Phase 2 scope.
Worker, enrichment, AI stages, scoring, and the dashboard are still
unimplemented, as scoped.

Deliberate deviations from the Phase 1 draft above, found while implementing:

1. **`leads.status` was missing `'invalid'`.** The state machine (§2) defines
   an `invalid` terminal for a lead that fails validation, but the original
   `leads` DDL sketch omitted it from the status enum. Added.
2. **`lead_processing_runs.status` is now a real Postgres enum**, not
   unconstrained `text` as originally sketched — it enforces exactly the
   state list in §2 (including per-stage failure variants and `needs_review`)
   at the database level, not just in application code.
3. **Exact-domain duplicates are rejected before insert, not stored as a
   `status = 'duplicate'` row.** `POST /api/leads` looks up `website_domain`
   first; a match short-circuits into a `409` response carrying the existing
   lead's id (`{ duplicate: true, existing_lead_id, existing_lead }`) — a
   normal business outcome, not an error envelope. A concurrent race that
   slips past the lookup is caught by the unique index and resolved the same
   way. `duplicate_of_lead_id` and `status = 'duplicate'` remain in the schema
   for a later, explicit dedup-linking action (e.g. an operator merging two
   leads discovered to be the same company after the fact) rather than for
   this ingestion-time path.
4. **Validation, normalization, and the exact-domain dedup check run
   synchronously inside `POST /api/leads`**, not as worker-advanced pipeline
   stages — they're cheap, deterministic, and need no external I/O, unlike
   enrichment/classification/qualification/brief. A newly created lead's
   `lead_processing_runs` row starts at `status = 'pending'`,
   `current_stage = 'validating'`, ready for the Phase 3 worker to begin
   advancing from there.
5. **Company-name similarity is schema-prepared, not wired.** The `pg_trgm`
   extension and trigram index on `leads.company_name` exist so a future
   phase can add the `needs_review` similarity check without a migration;
   Phase 2 intentionally does not compute or act on similarity, per its scope
   boundary (no auto-merge, no `needs_review` yet).
6. **`POST /api/leads` accepts one lead per call, not a batch array.**
   Batch/CSV import is explicitly a later-phase deliverable in the Phase 2
   scope boundary, so the array-payload option mentioned in the Phase 1 draft
   is deferred rather than half-built now.

### Testing approach

Unit tests cover normalization (`website.test.ts`, `email.test.ts`), input
validation (`lead-input.schema.test.ts`), the ingestion service's dedup
orchestration with a mocked repository (`lead-ingestion.service.test.ts`),
and the route handlers' HTTP-layer behavior with mocked services
(`route.test.ts` under each `api/leads` path).

Database *constraints* — the unique domain index, the one-active-run partial
unique index, and check constraints — are tested directly against a real
Postgres instance in `src/test/db/constraints.test.ts`, applying
`supabase/migrations/*.sql` to a scratch schema and asserting on the raw
constraint violations, independent of the application layer. This suite is
skipped unless `TEST_DATABASE_URL` is set (see `.env.example`); it was run
and verified in this session against a throwaway `postgres:17` Docker
container, but isn't required for `npm test` to pass so the default test run
stays portable for anyone without a local Postgres.

---

## Phase 3: durable worker / queue / crash recovery

Implements the durable background processing infrastructure described in §2
and §8 — a real Postgres-backed job queue, atomic claiming, lease-based crash
recovery, retry/backoff, and a stage registry — **without** implementing
enrichment, AI classification/qualification, briefs, or the dashboard. Those
stages exist as explicit `not_implemented` placeholders (see below), never as
fake successes.

### Concrete inconsistency fixed before implementing

The Phase 1/2 `run_status` enum was asymmetric: some stages had a distinct
"quiet success" value between stages (`normalized`, `unique`, `enriched`,
`classified`, `qualified`/`disqualified`) and separate `_failed` variants
(`enrichment_failed`, `classification_failed`, `brief_failed`), but others
didn't (no `validated` between `validating` and `normalizing`). Worse, the
`_failed` variants conflated two different concerns: "this stage failed" is
generic worker infrastructure, but "degrade forward anyway despite the
failure" is stage-specific business logic that belongs inside the stage's own
`execute()` once implemented (e.g. a future enrichment stage can simply
return `success` with a low `evidence_confidence` instead of ever surfacing a
failure to the worker).

**Fix** (`supabase/migrations/20260924010000_worker_infrastructure.sql`):
`run_status` is now flat — while a run is active, `status` is always exactly
its `current_stage`'s name (`validating`, `normalizing`, ... `generating_brief`),
plus `blocked` (a stage not implemented yet — `current_stage` says which
one) and the terminals (`completed`, `failed`, `duplicate`, `invalid`,
reserved `needs_review`). `failed_stage` is dropped as redundant: `current_stage`
already says where a `failed`/`blocked` run got stuck, since it's never
advanced past that point once either happens. This matches the transition
map actually enforced in `src/lib/pipeline/state-machine.ts`.

A second, smaller gotcha found and fixed in the same migration: combining
`ALTER COLUMN ... TYPE new_enum` with `SET DEFAULT` in one multi-action
`ALTER TABLE` statement made Postgres try to compare the old and new enum
types directly. Split into separate statements. Relatedly, the two partial
indexes on `lead_processing_runs.status` had to be dropped *before* the enum
swap and recreated after — left in place, Postgres's automatic index rebuild
evaluates the old predicate (with enum literals bound to the old type)
against the new column type and fails the same way.

### Claiming mechanism

`claim_lead_processing_runs(p_limit, p_worker_id, p_lease_seconds)` is a SQL
function: a CTE selects eligible rows with `FOR UPDATE SKIP LOCKED`, and an
`UPDATE ... FROM` in the *same statement* claims them — one atomic operation,
never a separate select-then-update. `attempt_count` increments at claim
time (not on failure), so a stage that crashes the whole process still
consumes an attempt and eventually reaches `failed` instead of retrying
forever. The function is locked down with `REVOKE EXECUTE FROM PUBLIC` (a
PostgREST function is otherwise callable by any client with an anon key,
regardless of table RLS) and granted only to `service_role` where that role
exists.

`src/lib/db/leads.repository.ts`'s `claimProcessingRuns()` is the only way
the application claims work — there is no separate list-then-update path.

### Lease model

A claim sets `lease_expires_at = now() + lease_seconds`. A run is only
claimable when its lease is `null` or already expired. Lease duration
(`WORKER_LEASE_SECONDS`, default 120s) is chosen to comfortably outlast one
tick's execution budget (`WORKER_EXECUTION_BUDGET_MS`, default 8s) so a
healthy worker's own claim never expires mid-tick, while still recovering a
genuinely crashed worker's job within a couple of cron intervals. Phase 3's
real stages (validate/normalize/dedupe) are near-instant local DB checks, so
there's no lease-renewal heartbeat yet — add one when a genuinely long-running
stage (e.g. a slow enrichment fetch) is introduced.

### Stale-run recovery

Recovery isn't a separate code path — it falls out of the claim query's own
`WHERE` clause (`lease_expires_at IS NULL OR lease_expires_at < now()`). The
claim function additionally reports `was_recovered = true` when the claimed
row previously had a non-null `locked_by` (the only way it could have
matched the `WHERE` clause is if that lease had since expired), so the
runner records a `run.recovered` event instead of `run.claimed` — auditable,
without a distinct recovery algorithm to get wrong.

### Transition rules

`src/lib/pipeline/state-machine.ts` defines `STAGE_ORDER` and an explicit
`ALLOWED_TRANSITIONS` map, checked by `assertValidTransition()` before every
persisted status change. A self-transition (e.g. `validating -> validating`)
represents retrying the same stage; anything not in the map throws rather
than silently persisting — the worker cannot jump `pending -> completed` or
skip a stage.

### Stage registry

`src/lib/pipeline/registry.ts` maps each `PipelineStage` to a `Stage`
(`{ name, timeoutMs, execute(context) }`). Phase 3 implements real stages for
`validating`/`normalizing`/`deduplicating` — lightweight, idempotent
re-confirmations of what `POST /api/leads` already did at ingestion, valuable
as the pipeline's own authoritative check for a lead reaching this stage by
any future path. `enriching`/`classifying`/`qualifying`/`generating_brief`
are `notImplementedStage()` placeholders that return `{ kind: "not_implemented" }`;
the worker parks the run in `blocked` rather than pretending they succeeded.
A later phase's only change is replacing a registry entry — the worker itself
never changes.

### Retry / backoff

`src/lib/pipeline/backoff.ts`'s `computeBackoffMs(attempt)` is exponential
(1 minute base, doubling, capped at 30 minutes) with +/-20% jitter. A stage
outcome of `{ kind: "failure", retryable }` schedules a retry (same stage,
`next_attempt_at` pushed out by the backoff) while `attempt_count < max_attempts`;
once exhausted, or when `retryable` is `false`, the run becomes `failed`.
`{ kind: "invalid" }` (a validating/normalizing business-rule failure) goes
straight to the `invalid` terminal, since retrying won't fix bad stored data.

### Idempotency

Two boundaries, both already established in Phase 1/2, not a new mechanism:
a run's lease (`lead_processing_runs.id` + `locked_by`) is the boundary for
"is this claim still mine" — every persisting write is guarded by
`WHERE locked_by = <this worker's execution id>`, so a worker that loses its
lease (`LostLeaseError`) can never overwrite a result another worker already
produced. The `runs_one_active_per_lead` partial unique index remains the
boundary for "has this lead already got an active run" (Phase 2). A duplicate
cron invocation is safe because both ticks race for the same claimable rows
via `SKIP LOCKED`: whichever wins processes them, the other simply claims
nothing.

### Concurrency and worker endpoint

`POST`/`GET /api/worker/tick` (Vercel Cron invokes with `GET`; both are
wired to the same handler) authenticates via `Authorization: Bearer <CRON_SECRET>` —
named to match Vercel's own convention, so Vercel Cron works with zero extra
wiring once `CRON_SECRET` is set. Configurable via env
(`src/lib/env.ts#getWorkerConfig`), defaults sized for a serverless function:
`WORKER_BATCH_SIZE=5`, `WORKER_CONCURRENCY=3` (via a small in-process worker
pool, `src/lib/pipeline/concurrency.ts` — no unbounded `Promise.all`),
`WORKER_LEASE_SECONDS=120`, `WORKER_EXECUTION_BUDGET_MS=8000`. A claimed run
not started within the budget is treated as a retryable failure (consistent
with "the worker was too busy," not a free no-cost skip) rather than left
locked until its lease expires. The endpoint returns structured stats
(`{ execution_id, claimed, completed, retried, blocked, failed, lease_lost, duration_ms }`)
and never exposes internal error detail.

### Vercel Cron

`vercel.json` schedules `GET /api/worker/tick` once daily (`0 6 * * *`).
Confirmed by an actual deploy attempt (Phase 6): Vercel rejects the deploy
outright if `vercel.json` requests a sub-daily schedule on a Hobby plan
("Hobby accounts are limited to daily cron jobs") — not just a soft limit,
a hard deploy-time validation error. Since a single daily tick isn't enough
to process leads promptly, `POST/GET /api/worker/tick` remains callable
directly (with the `CRON_SECRET` bearer header) from any external scheduler
you control — a cheap one is a free-tier cron pinger (e.g. cron-job.org) or
GitHub Actions on a schedule, hitting the same authenticated endpoint every
minute or two, no Vercel plan upgrade required. Upgrading to Vercel Pro and
tightening `vercel.json`'s schedule is the alternative if/when that's worth
paying for.

---

## Phase 4: enrichment, classification, qualification, intelligence brief

Replaces the four `not_implemented` placeholders from Phase 3 with real
stages, turning `raw lead → validation → normalization → dedupe → BLOCKED`
into the full pipeline through `completed`. The worker, claiming, leasing,
retry/backoff, and transition-map infrastructure from Phase 3 are unchanged —
every new stage is just a `Stage` plugged into the existing registry.

### Provider abstraction

Two single-provider abstractions, both server-only singletons (`getSearchProvider()`
in `src/lib/providers/search`, `getAIProvider()` in `src/lib/providers/ai`),
so a stage never depends on a concrete implementation and a later phase can
swap either without touching pipeline code:

- **Search**: `SearchProvider { name, search(query, opts) }`. One
  implementation, Tavily (`TAVILY_API_KEY`) — the same env var name as this
  user's sibling portfolio project, reused deliberately rather than inventing
  a new convention.
- **AI**: `AIProvider { classify, qualify, generateBrief }` — exactly the
  interface sketched in Phase 1's §8. One implementation, Gemini
  (`GEMINI_API_KEY`, optional `GEMINI_MODEL`, default `gemini-3.5-flash`),
  using `responseMimeType: "application/json"` (JSON mode) rather than a
  hand-maintained parallel JSON Schema — the Zod schema is the single source
  of truth for shape, enforced after the fact.
- **`ProviderError(message, retryable)`** (`src/lib/providers/errors.ts`) is
  how both providers tell a stage whether a failure is worth retrying:
  timeouts/429/5xx → `retryable: true`; a missing/rejected API key →
  `retryable: false` (won't fix itself before the next tick). A stage that
  lets any other exception propagate gets the existing runner's default
  (retryable) behavior from Phase 3 — no second error-classification system
  was added.

### Enrichment flow

`enrichStage` (`src/lib/pipeline/stages/enrich.ts`) runs up to 3 bounded,
targeted Tavily queries (`"<company> <domain>"`, `"<company> products
services"`, `"<company> news"` — never a generic/open-ended search), capped
at 4 results per query and 12 evidence rows total per lead. Before searching
at all, it checks whether the lead already has >= 3 evidence rows and skips
the provider call entirely if so — idempotent reuse, not just row-level
dedup, so a retried attempt (or a second attempt after a lease-expiry
recovery) never re-pays for the same searches. Zero results is a valid
outcome (`success`, not a failure) — only a genuine provider error produces
a `failure`; a mid-attempt provider error after some results were already
collected still returns `success`, keeping whatever was found rather than
discarding it.

### Evidence lifecycle

Reuses the `lead_evidence` model exactly as Phase 1/2 designed it — no
migration was needed. Each result becomes one row: `source_type =
'search_result'`, `provider = 'tavily'`, `idempotency_key` = the result URL
normalized (fragment stripped, bare trailing slash on `/` stripped,
lowercased — `src/lib/pipeline/evidence-utils.ts`), which is what the
existing `unique(lead_id, idempotency_key)` constraint dedups against: the
same URL found by two different query variants inserts once. `relevance` is
a small heuristic (`classifyRelevance`): the lead's own domain →
`primary`; a short curated list of reputable business/news domains (Reuters,
Bloomberg, TechCrunch, Crunchbase, LinkedIn, etc.) → `supporting`; anything
else → `contextual`. This is what later stages use to weight evidence, and
what a human reviewing the evidence list would use to judge it.

### Classification contract

`companyClassificationSchema` (`src/lib/schemas/classification.schema.ts`):
`{ company_type, industry, business_model, geography, target_market,
confidence, reasoning, signals_used }`. `company_type` reuses the existing
`classification_category` column/enum, extended with three additive values
(`software_company`, `marketplace`, `unknown` — see migration notes below).
Only `company_type`/`confidence`/`reasoning`/`signals_used` get dedicated
columns (matching the Phase 1/2 table); `industry`/`business_model`/
`geography`/`target_market` live in the existing `raw_output` jsonb (already
designed as "the full validated payload, for audit") rather than four new
narrow columns — a later phase reading them just reads `raw_output`.
`classifyStage` skips the AI call entirely with zero evidence, inserting a
deterministic `category: 'unknown', confidence: 0` row instead — the honest
answer when there's nothing to reason over, not a wasted call.

### Qualification formula and stored factors

Unchanged from the Phase 1 architecture, now actually implemented in
`src/lib/pipeline/scoring.ts`:

```
final_score = round(0.4 * deterministic_score + 0.4 * ai_score + 0.2 * evidence_confidence * 100)
level = <30 unqualified · 30-59 low · 60-79 medium · 80-100 high
```

- `computeDeterministicScore` — pure code, zero AI: a factor per concrete,
  present signal only (`has_website`, `contactable`, `industry_provided`,
  `country_provided`, `evidence_present`, `evidence_rich`,
  `company_type_known`, `classification_confident`), capped at 100. A missing
  field contributes nothing — never a fabricated value.
- `computeEvidenceConfidence` — also deterministic: a weighted function of
  evidence count and relevance mix (`primary` 0.4, `supporting` 0.2,
  `contextual` 0.1, capped at 1). Zero evidence ⇒ 0, regardless of what the
  AI claims.
- The AI's contribution (`aiQualificationSignalSchema`:
  `{ ai_score, reasons, opportunity_signals }`) is skipped (stays 0) when
  there's no evidence for it to reason over, for the same reason as
  classification.
- All three feed `lead_qualifications.reasons` (already jsonb) tagged by
  `source: 'deterministic' | 'ai' | 'evidence'` — this is the literal answer
  to "why did this lead get N/100," already the exact design from Phase 1's
  §6, now populated for real. `leads.qualification_score`/`qualification_level`
  are updated at the same time, since `GET /api/leads` already filters on them.

### Intelligence brief

`intelligenceBriefSchema` (`src/lib/schemas/brief.schema.ts`) covers every
field from the Phase 4 spec (`company_summary`, `what_they_do`,
`products_services`, `geography`, `target_market`, `signals`,
`recent_developments`, `pain_points`, `automation_opportunities`,
`qualification_summary`, `key_evidence`, `risks_and_uncertainty`,
`outreach_angle`, `confidence`) plus an explicit `facts: { known, inferred,
unknown }` split so the brief can never present a guess as a fact. Only the
fields that already have dedicated `lead_intelligence_briefs` columns
(`company_summary`, `signals`, `pain_points`, `automation_opportunities`,
`outreach_angle`, `confidence`) are promoted; the complete object is also
stored whole in `raw_output`, so nothing is lost without a schema rewrite.
With zero evidence, `generateBriefStage` skips the AI call and persists a
deterministic "no public evidence was found" brief (`model: 'none'`,
`confidence: 0`) — the product still gets one brief per lead, honestly.

### Retry / degradation behavior

No second retry system — every stage returns the same `StageOutcome` union
the Phase 3 runner already knows how to interpret:
`{ kind: 'failure', retryable }` for a `ProviderError`-classified failure
(scheduled for backoff/retry, or straight to `failed` once `max_attempts` is
exhausted — unchanged Phase 3 mechanics); `{ kind: 'invalid' }` is reserved
for validating/normalizing's own business-rule failures and isn't used by
the Phase 4 stages. A Zod validation failure that survives one repair
re-prompt (inside the Gemini provider — see below) throws a *retryable*
`ProviderError`: an LLM is non-deterministic, so the worker's existing
backoff genuinely has a chance of succeeding on a later attempt, rather than
this needing its own unbounded retry loop.

### Idempotency strategy

Two boundaries, both extending what Phase 1-3 already established, not a
new mechanism:

1. **Evidence**: `unique(lead_id, idempotency_key)` (Phase 2) — a retried
   enrichment attempt's re-discovered URLs simply conflict-and-skip via
   `insertEvidenceIfNew`.
2. **AI outputs**: a new `unique(run_id)` constraint on each of
   `lead_classifications`/`lead_qualifications`/`lead_intelligence_briefs`
   (Phase 4 migration) — a stage checks `findByRunId` first (avoiding a
   redundant, costly AI call on a retried stage) and `insertXOnce` is a
   belt-and-suspenders fallback against the constraint for the race where a
   lease-expiry recovery somehow overlaps a still-finishing attempt.

### External API cost / rate-limit strategy

Bounded by construction, not by a governor: at most 3 search queries per
enrichment attempt (skipped entirely once enough evidence exists), at most 4
results per query, at most 12 evidence rows per lead ever, at most 15
evidence rows included in any AI prompt, exactly one AI call per
classify/qualify/brief stage execution (plus at most one repair re-prompt
inside the provider), and the AI call is skipped outright when there's no
evidence to reason over. There is no agent loop, no "keep searching until
satisfied," and no unlimited retry — `ProviderError.retryable` classifies
429/5xx as retryable (bounded by the existing `max_attempts`) and a bad/missing
key as an immediate non-retryable failure.

### Migration notes (`20260924020000_enrichment_ai_stages.sql`)

Additive only, per the Phase 4 scope boundary ("do not rewrite the existing
schema"): three new `classification_category` enum values
(`software_company`, `marketplace`, `unknown`), and a `unique(run_id)`
constraint on each of the three AI-output tables. No new tables, no new
columns — the richer Phase 4 fields live in the existing `raw_output` jsonb
columns, as detailed above.

### Known limitations

The concrete `TavilyProvider`/`GeminiProvider` HTTP-calling code is unit-tested
against mocked `fetch` responses (request shape, status-code classification,
the repair-reprompt flow), not against the live APIs — this sandbox has no
API keys configured, and the Phase 4 spec explicitly prohibits live paid
calls in tests. The end-to-end pipeline flow (evidence → classification →
qualification → brief → completed, plus a failure/retry scenario) was
verified against a real Postgres instance at the schema level (`src/test/db/phase4-schema.test.ts`)
and via mocked-provider unit tests of every stage's orchestration logic; it
was not verified against a live Supabase project with live provider keys,
since neither was available in this environment. Before relying on this in
production, run one real lead through a deployed instance with real
`TAVILY_API_KEY`/`GEMINI_API_KEY` values.

---

## Phase 5: the operations console (dashboard)

A dark B2B ops-console UI on top of the unchanged Phase 1-4 backend — no
worker, queue, or pipeline-stage changes; only new UI, two new read-only
endpoints, one new mutation endpoint, and small backend fixes required to
make the dashboard tell the truth.

### UI architecture

Next.js App Router, server components for the three pages (`/`, `/leads/[id]`,
`/pipeline`) fetching directly through the existing repository layer (no
internal HTTP round-trip for the initial render), client components only
where interaction/state requires them: `AddLeadDialog`, `RetryButton`,
`LeadsFilters`, `PaginationControls`, `EvidenceList` (local filter state),
and `LeadDetailLive` (polling). `src/lib/pipeline-view.ts#deriveStageViews`
is the one piece of real "frontend logic": a pure, unit-tested function
mapping `(run.status, run.current_stage, run.attempt_count)` to a per-stage
display state (`pending/active/retrying/completed/blocked/failed/invalid/duplicate`)
— a deterministic reflection of stored fields, never an invented percentage,
per the "never calculate or infer pipeline state in the frontend" rule.

### API changes

- **Extended** `GET /api/leads/:id` to also return `evidence`, `classification`,
  `qualification`, `brief` in one response, rather than adding four small
  endpoints — the detail page's whole data need in one round-trip.
- **Extended** `GET /api/leads` with `search` (ILIKE on company_name/website_domain)
  and `sort`/`order` (`updated_at` | `qualification_score`).
- **Added** `POST /api/leads/:id/retry` — this genuinely didn't exist before
  Phase 5 (Phase 3 deferred it, and no later phase built it). Only
  `failed`/`blocked` runs are retryable; resets `attempt_count`, clears
  `failure_reason`/lock fields, and resumes from `current_stage` (not from
  scratch) via a new `resetRunForRetry` repository function — a human-
  initiated reset, not a worker-owned update, so it doesn't go through
  `updateProcessingRun`'s lock-ownership guard.
- **Added** `GET /api/leads/stats` — the pipeline overview's counts, computed
  with a handful of `count: exact, head: true` queries in Postgres rather
  than fetching every lead into the browser to tally client-side.

### Three real bugs found via live end-to-end verification

Caught by actually running the app against a local Supabase stack
(`supabase start`), not by the mocked test suite — worth recording because
none of them were hypothetical:

1. **`leads.status` never synced with pipeline progress.** Every stage
   transition updated `lead_processing_runs.status` but nothing ever wrote
   to `leads.status` — every lead would have shown "pending" forever on the
   dashboard regardless of real progress. Fixed by syncing it in
   `runner.ts#persistResolved` via a new `runStatusToLeadStatus` mapping
   (`src/lib/pipeline/state-machine.ts`) on every persisted transition.
2. **`service_role` had no table privileges.** RLS bypass and SQL `GRANT`s
   are different mechanisms — every query failed with "permission denied for
   table X" until `supabase/migrations/20260924030000_service_role_grants.sql`
   explicitly granted SELECT/INSERT/UPDATE/DELETE. This would have affected
   every phase's backend the first time it ran against a real Supabase
   project; only visible once something actually connected to one.
3. **The claim function never set `status = current_stage` on a fresh claim.**
   A brand-new run has `status='pending'`, `current_stage='validating'`;
   claiming it bumped `attempt_count` and lock fields but left `status`
   untouched, so the runner's own transition check
   (`assertValidTransition('pending', 'normalizing')`) correctly rejected the
   very first successful stage and every new lead failed on tick one. Fixed
   in `supabase/migrations/20260924040000_fix_claim_status_sync.sql` (claim
   now sets `status = current_stage`) with a regression test added to
   `src/test/db/worker-queue.test.ts` — the existing mocked `runner.test.ts`
   fixtures never exposed this because they always constructed an already-
   consistent `status`/`current_stage` pair.

A fourth, cosmetic issue (a literal `&amp;` string used as a JSX prop value,
which double-escapes to visible `&amp;` text in the browser) was also caught
this way and fixed in `intelligence-brief.tsx`.

### Manual verification performed

Against a local `supabase start` stack + `npm run dev`: created a real lead
through the running app, advanced it through the worker tick by tick,
watched it fail cleanly at enrichment (no `TAVILY_API_KEY` configured, an
honest and expected failure in this environment), retried it through the
actual UI/API, and confirmed the duplicate-detection flow with a second
POST to the same domain. Took real Playwright screenshots of the leads
list, the failed lead's detail page (pipeline stages, failure reason, full
retry history in the event timeline), the pipeline overview, and the add-lead
dialog's duplicate state. Seeded one fully "completed" lead directly via SQL
(the same technique as the Phase 4 schema tests) to verify the qualification
breakdown, intelligence brief, known/inferred/unknown split, and evidence
list all render correctly with realistic data — screenshotted and reviewed.
No live Tavily/Gemini calls were made (no keys in this environment); the
enrichment failure above is the honest result of that, not a bug.

### Known limitations

The dashboard has not been exercised against a lead that went all the way
through *live* enrichment/classification/qualification/brief generation —
only against a SQL-seeded "completed" lead standing in for that outcome.
No authentication exists (out of scope per the strict boundary), so every
API route, including the mutating ones, is reachable by anyone who can
reach the deployment.
