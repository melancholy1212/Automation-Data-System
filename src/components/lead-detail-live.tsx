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

const TERMINAL_LEAD_STATUSES = new Set(["completed", "failed", "duplicate", "invalid", "needs_review"]);
const POLL_INTERVAL_MS = 3_000;

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
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-accent" aria-hidden />
                Live
              </span>
            ) : null}
            <StatusBadge status={lead.status} />
            {canRetry ? <RetryButton leadId={lead.id} onRetried={refresh} /> : null}
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
        {run ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Attempt {run.attempt_count} of {run.max_attempts}
            {run.status !== "completed" && !["failed", "blocked", "invalid", "duplicate"].includes(run.status)
              ? ` · next attempt ${formatDateTime(run.next_attempt_at)}`
              : ""}
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
