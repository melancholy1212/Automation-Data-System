"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EvidenceList } from "@/components/evidence-list";
import {
  IconArchive,
  IconClock,
  IconFileText,
  IconGauge,
  IconHistory,
  IconLayers,
  type IconProps,
} from "@/components/icons";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { PipelineStages } from "@/components/pipeline-stages";
import { ProcessingEvents } from "@/components/processing-events";
import { ProcessNowButton } from "@/components/process-now-button";
import { QualificationBreakdown } from "@/components/qualification-breakdown";
import { QualificationScore } from "@/components/qualification-score";
import { RetryButton } from "@/components/retry-button";
import { SectionStatusPanel } from "@/components/section-status";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatHostname, titleCase } from "@/lib/format";
import { describeSectionState, stageLabel } from "@/lib/status-copy";
import type {
  Lead,
  LeadClassification,
  LeadEvidence,
  LeadIntelligenceBrief,
  LeadProcessingRun,
  LeadQualification,
  ProcessingEvent,
} from "@/lib/types/domain";

export interface LeadDetailData {
  lead: Lead;
  run: LeadProcessingRun | null;
  evidence: LeadEvidence[];
  classification: LeadClassification | null;
  qualification: LeadQualification | null;
  brief: LeadIntelligenceBrief | null;
}

// "failed" is deliberately excluded — unlike duplicate/invalid/completed, a
// failed run is retryable (see RetryButton/canRetry below), so it isn't
// truly final. Retrying and reprocessing from *this* tab already re-arms
// polling on its own (refresh() updates data.lead.status, which this
// effect depends on) — the gap this closes is a failed lead getting
// retried from somewhere else (another tab, an API call, a scheduled
// job) while this tab just sits open on the stale "failed" view with
// nothing left to make it look again. `blocked` never even reaches this
// set: it maps to the coarse lead status "processing", not its own value
// (see runStatusToLeadStatus), so it was never a special case here.
const TERMINAL_LEAD_STATUSES = new Set(["completed", "duplicate", "invalid", "needs_review"]);
// Run statuses a click of "Process now" can't do anything for: already
// concluded (completed/duplicate/invalid/needs_review), or genuinely stopped
// and requiring the explicit Retry reset first (failed/blocked) rather than
// just another tick.
const NOT_PROCESSABLE_RUN_STATUSES = new Set([
  "completed",
  "failed",
  "blocked",
  "duplicate",
  "invalid",
  "needs_review",
]);
const POLL_INTERVAL_MS = 3_000;
// A full pipeline is 7 stages; a couple of spare iterations covers a
// duplicate/invalid/needs_review short-circuit landing partway through
// without looping unboundedly on something unexpected.
const MAX_AUTO_TICKS = 10;

function SectionHeader({ icon: Icon, title }: { icon: (props: IconProps) => React.ReactNode; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-surface-muted text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    </div>
  );
}

// A section that sits directly on the page — a divider-topped heading, no
// bounding card — used for the sections that are lists of many small rows
// (evidence, history) rather than a single dense block, so the page isn't
// card → card → card → card all the way down.
function PlainSection({
  icon: Icon,
  title,
  children,
}: {
  icon: (props: IconProps) => React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-6">
      <SectionHeader icon={Icon} title={title} />
      {children}
    </section>
  );
}

function Dot() {
  return <span className="text-border-strong">·</span>;
}

export function LeadDetailLive({ initialData, initialEvents }: { initialData: LeadDetailData; initialEvents: ProcessingEvent[] }) {
  const [data, setData] = useState(initialData);
  const [events, setEvents] = useState(initialEvents);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (): Promise<LeadDetailData | undefined> => {
    const [detailResponse, eventsResponse] = await Promise.all([
      fetch(`/api/leads/${initialData.lead.id}`),
      fetch(`/api/leads/${initialData.lead.id}/events`),
    ]);
    let freshData: LeadDetailData | undefined;
    if (detailResponse.ok) {
      freshData = await detailResponse.json();
      setData(freshData!);
    }
    if (eventsResponse.ok) {
      const body = await eventsResponse.json();
      setEvents(body.events);
    }
    return freshData;
  }, [initialData.lead.id]);

  // A single /api/worker/process call only ever advances one stage — same
  // as one Vercel Cron tick always has. "Process now"/"Retry" call this
  // instead of a single nudge so the *button* delivers what its label
  // promises, without changing that underlying one-tick-per-call contract.
  // Stops the moment anything needs a human to look at it — a stage that
  // just failed once (attempt_count > 0, mid-backoff) is not silently
  // retried through; the user sees that state and can click again
  // themselves. Never loops past a genuinely stopped run (failed/blocked/
  // etc.) or once nothing was left to claim.
  const processUntilStuck = useCallback(async () => {
    for (let i = 0; i < MAX_AUTO_TICKS; i++) {
      const tickResponse = await fetch("/api/worker/process", { method: "POST" });
      if (!tickResponse.ok) return;
      const tickResult = (await tickResponse.json().catch(() => null)) as { claimed?: number } | null;
      const fresh = await refresh();
      if (!fresh?.run) return;
      if (tickResult?.claimed === 0) return;
      if (NOT_PROCESSABLE_RUN_STATUSES.has(fresh.run.status)) return;
      if (fresh.run.attempt_count > 0) return;
    }
  }, [refresh]);

  useEffect(() => {
    const isTerminal = TERMINAL_LEAD_STATUSES.has(data.lead.status);
    if (isTerminal) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [data.lead.status, refresh]);

  const { lead, run, evidence, classification, qualification, brief } = data;
  const isLive = !TERMINAL_LEAD_STATUSES.has(lead.status);
  const canRetry = run && (run.status === "failed" || run.status === "blocked");
  const canProcessNow = run && !NOT_PROCESSABLE_RUN_STATUSES.has(run.status);

  const runStatus = run ? describeSectionState(run, run.current_stage, stageLabel(run.current_stage)) : null;
  const showRunBanner = runStatus && (runStatus.tone === "warning" || runStatus.tone === "error");

  const metaFields = [
    classification ? titleCase(classification.category) : null,
    classification ? `${Math.round(classification.confidence * 100)}% confidence` : null,
    lead.industry,
    lead.country,
  ].filter((v): v is string => Boolean(v));

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-border bg-surface p-6" style={{ boxShadow: "var(--elevation-sm)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[26px] leading-tight font-semibold tracking-tight text-foreground">
              {lead.company_name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
              {lead.website ? (
                <a
                  href={lead.website}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 hover:text-accent"
                >
                  {formatHostname(lead.website)}
                </a>
              ) : (
                <span>No website on file</span>
              )}
              {metaFields.map((field, index) => (
                <span key={index} className="flex items-center gap-2">
                  <Dot />
                  <span>{field}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-xs text-muted" title="This page refreshes itself automatically — it doesn't mean the pipeline is actively running right now">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden />
                Auto-updating
              </span>
            ) : null}
            <StatusBadge status={lead.status} />
            {canRetry ? <RetryButton leadId={lead.id} onRetried={processUntilStuck} /> : null}
            {!canRetry && canProcessNow ? <ProcessNowButton onProcess={processUntilStuck} /> : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-6 border-t border-border pt-5">
          <QualificationScore score={lead.qualification_score} level={lead.qualification_level} />
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconClock className="h-3 w-3" />
            Updated {formatDateTime(lead.updated_at)}
          </span>
        </div>

        {showRunBanner ? (
          <div className="mt-4">
            <SectionStatusPanel status={runStatus} />
          </div>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <SectionHeader icon={IconLayers} title="Processing pipeline" />
        <PipelineStages run={run} />
        {run && !NOT_PROCESSABLE_RUN_STATUSES.has(run.status) && run.attempt_count === 0 ? (
          // Distinct from the "Attempt X of Y" caption below — that one
          // covers a stage that's already been tried at least once.
          // Nothing has touched this run yet, so saying "next attempt" here
          // would imply the backend is already counting down to it, when
          // nothing invokes that next attempt on its own except the
          // external cron-ping schedule (every few minutes) or a manual
          // click — this says so plainly instead.
          <p className="mt-3 text-xs text-muted-foreground">
            Not started yet — picked up automatically within a few minutes, or click &quot;Process now&quot; to start immediately.
          </p>
        ) : run ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Attempt {run.attempt_count} of {run.max_attempts}
            {!NOT_PROCESSABLE_RUN_STATUSES.has(run.status) ? ` · next attempt ${formatDateTime(run.next_attempt_at)}` : ""}
          </p>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-surface p-5">
        <SectionHeader icon={IconGauge} title="Qualification" />
        <QualificationBreakdown qualification={qualification} run={run} />
      </section>

      <section className="rounded-lg border border-border-strong bg-surface p-6">
        <SectionHeader icon={IconFileText} title="Intelligence brief" />
        <IntelligenceBrief brief={brief} run={run} />
      </section>

      <PlainSection icon={IconArchive} title="Evidence">
        <EvidenceList evidence={evidence} />
      </PlainSection>

      <PlainSection icon={IconHistory} title="Processing history">
        <ProcessingEvents events={events} />
      </PlainSection>
    </div>
  );
}
