"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EvidenceList } from "@/components/evidence-list";
import { IntelligenceBrief } from "@/components/intelligence-brief";
import { PipelineStages } from "@/components/pipeline-stages";
import { ProcessingEvents } from "@/components/processing-events";
import { QualificationBreakdown } from "@/components/qualification-breakdown";
import { QualificationScore } from "@/components/qualification-score";
import { RetryButton } from "@/components/retry-button";
import { StatusBadge } from "@/components/status-badge";
import { formatDateTime, formatHostname, titleCase } from "@/lib/format";
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

const TERMINAL_LEAD_STATUSES = new Set(["completed", "failed", "duplicate", "invalid", "needs_review"]);
const POLL_INTERVAL_MS = 3_000;

export function LeadDetailLive({ initialData, initialEvents }: { initialData: LeadDetailData; initialEvents: ProcessingEvent[] }) {
  const [data, setData] = useState(initialData);
  const [events, setEvents] = useState(initialEvents);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const [detailResponse, eventsResponse] = await Promise.all([
      fetch(`/api/leads/${initialData.lead.id}`),
      fetch(`/api/leads/${initialData.lead.id}/events`),
    ]);
    if (detailResponse.ok) {
      setData(await detailResponse.json());
    }
    if (eventsResponse.ok) {
      const body = await eventsResponse.json();
      setEvents(body.events);
    }
  }, [initialData.lead.id]);

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

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded border border-border bg-surface p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">{lead.company_name}</h1>
            <p className="text-sm text-muted">
              {lead.website ? (
                <a href={lead.website} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-accent">
                  {formatHostname(lead.website)} ↗
                </a>
              ) : (
                "No website on file"
              )}
            </p>
            {classification ? (
              <p className="mt-1 text-xs text-muted">
                Classified as <span className="text-foreground">{titleCase(classification.category)}</span>
                {" · "}
                {Math.round(classification.confidence * 100)}% confidence
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {isLive ? (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden />
                Live
              </span>
            ) : null}
            <StatusBadge status={lead.status} />
            {canRetry ? <RetryButton leadId={lead.id} onRetried={refresh} /> : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <QualificationScore score={lead.qualification_score} level={lead.qualification_level} />
          <dl className="flex gap-6 text-xs text-muted">
            <div>
              <dt className="uppercase tracking-wide">Industry</dt>
              <dd className="mt-0.5 text-foreground">{lead.industry ?? "—"}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Country</dt>
              <dd className="mt-0.5 text-foreground">{lead.country ?? "—"}</dd>
            </div>
            <div>
              <dt className="uppercase tracking-wide">Last updated</dt>
              <dd className="mt-0.5 text-foreground">{formatDateTime(lead.updated_at)}</dd>
            </div>
          </dl>
        </div>

        {run?.failure_reason ? (
          <p className="mt-4 rounded border border-border bg-surface-muted p-2.5 text-sm" style={{ color: "var(--status-failed)" }}>
            {run.failure_reason}
          </p>
        ) : null}
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Processing pipeline</h2>
        <PipelineStages run={run} />
        {run ? (
          <p className="mt-3 text-xs text-muted">
            Attempt {run.attempt_count} of {run.max_attempts}
            {run.status !== "completed" && !["failed", "blocked", "invalid", "duplicate"].includes(run.status)
              ? ` · next attempt ${formatDateTime(run.next_attempt_at)}`
              : ""}
          </p>
        ) : null}
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Qualification</h2>
        <QualificationBreakdown qualification={qualification} />
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Intelligence brief</h2>
        <IntelligenceBrief brief={brief} />
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Evidence</h2>
        <EvidenceList evidence={evidence} />
      </section>

      <section className="rounded border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold text-foreground">Processing history</h2>
        <ProcessingEvents events={events} />
      </section>
    </div>
  );
}
