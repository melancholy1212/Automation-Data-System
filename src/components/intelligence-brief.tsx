import { KnownInferredUnknown } from "@/components/known-inferred-unknown";
import { SectionStatusPanel } from "@/components/section-status";
import { intelligenceBriefSchema } from "@/lib/schemas/brief.schema";
import { describeSectionState } from "@/lib/status-copy";
import type { LeadIntelligenceBrief, LeadProcessingRun } from "@/lib/types/domain";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h4>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">None recorded.</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5 text-sm text-foreground">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceBrief({
  brief,
  run = null,
}: {
  brief: LeadIntelligenceBrief | null;
  run?: LeadProcessingRun | null;
}) {
  if (!brief) {
    const status = describeSectionState(run, "generating_brief", "Intelligence brief");
    return status ? (
      <SectionStatusPanel status={status} />
    ) : (
      <p className="text-sm text-muted">The brief will appear once the pipeline finishes generating it.</p>
    );
  }

  // raw_output is the full, validated brief object (the typed columns are a
  // subset promoted for other views) — re-parsed with the same Zod schema
  // the pipeline validated it with, rather than assuming its shape.
  const parsed = intelligenceBriefSchema.safeParse(brief.raw_output);
  const full = parsed.success ? parsed.data : null;

  return (
    <div className="flex flex-col gap-6">
      <Section title="Company overview">
        <p className="text-sm leading-relaxed text-foreground">{brief.company_summary}</p>
      </Section>

      {full ? (
        <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-y border-border py-6 lg:grid-cols-2">
            <div className="flex flex-col gap-5">
              <Section title="What they do">
                <p className="text-sm text-foreground">{full.what_they_do ?? "Unknown"}</p>
                {full.products_services.length > 0 ? (
                  <div className="mt-2">
                    <BulletList items={full.products_services} />
                  </div>
                ) : null}
              </Section>
              <Section title="Geography & target market">
                <p className="text-sm text-foreground">Geography: {full.geography ?? "Unknown"}</p>
                <p className="mt-0.5 text-sm text-foreground">Target market: {full.target_market ?? "Unknown"}</p>
              </Section>
            </div>

            <div className="flex flex-col gap-5">
              <Section title="Signals">
                <BulletList items={full.signals} />
              </Section>
              <Section title="Recent developments">
                <BulletList items={full.recent_developments} />
              </Section>
              <Section title="Pain points">
                <BulletList items={full.pain_points} />
              </Section>
              <Section title="Automation opportunities">
                {full.automation_opportunities.length === 0 ? (
                  <p className="text-sm text-muted">None recorded.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {full.automation_opportunities.map((opp, index) => (
                      <li key={index} className="rounded-md border border-border bg-surface-muted p-2.5 text-sm">
                        <p className="font-medium text-foreground">{opp.opportunity}</p>
                        <p className="mt-0.5 text-muted">{opp.rationale}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
              <Section title="Outreach angle">
                <p
                  className="rounded-md border p-3 text-sm text-foreground"
                  style={{ borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border))", backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" }}
                >
                  {brief.outreach_angle}
                </p>
              </Section>
            </div>
          </div>

          <Section title="Qualification summary">
            <p className="text-sm text-foreground">{full.qualification_summary}</p>
          </Section>

          <Section title="Risks & uncertainty">
            <BulletList items={full.risks_and_uncertainty} />
          </Section>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">The full structured brief could not be read; showing the summary only.</p>
          <Section title="Outreach angle">
            <p
              className="rounded-md border p-3 text-sm text-foreground"
              style={{ borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border))", backgroundColor: "color-mix(in srgb, var(--accent) 6%, transparent)" }}
            >
              {brief.outreach_angle}
            </p>
          </Section>
        </>
      )}

      <Section title="Known, inferred & unknown">
        <KnownInferredUnknown facts={full?.facts ?? null} />
      </Section>
    </div>
  );
}
