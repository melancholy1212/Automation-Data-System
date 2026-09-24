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
