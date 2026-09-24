import { EmptyState } from "@/components/empty-state";
import { KnownInferredUnknown } from "@/components/known-inferred-unknown";
import { intelligenceBriefSchema } from "@/lib/schemas/brief.schema";
import type { LeadIntelligenceBrief } from "@/lib/types/domain";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h4>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted">None recorded.</p>;
  }
  return (
    <ul className="flex flex-col gap-1 text-sm text-foreground">
      {items.map((item, index) => (
        <li key={index} className="flex gap-2">
          <span className="text-accent">·</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function IntelligenceBrief({ brief }: { brief: LeadIntelligenceBrief | null }) {
  if (!brief) {
    return <EmptyState message="Intelligence brief is not available yet." />;
  }

  // raw_output is the full, validated brief object (the typed columns are a
  // subset promoted for other views) — re-parsed with the same Zod schema
  // the pipeline validated it with, rather than assuming its shape.
  const parsed = intelligenceBriefSchema.safeParse(brief.raw_output);
  const full = parsed.success ? parsed.data : null;

  return (
    <div className="flex flex-col gap-5">
      <Section title="Company overview">
        <p className="text-sm leading-relaxed text-foreground">{brief.company_summary}</p>
      </Section>

      {full ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <p className="text-sm text-foreground">Target market: {full.target_market ?? "Unknown"}</p>
            </Section>
          </div>

          <Section title="Signals">
            <BulletList items={full.signals} />
          </Section>

          <Section title="Recent developments">
            <BulletList items={full.recent_developments} />
          </Section>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Section title="Pain points">
              <BulletList items={full.pain_points} />
            </Section>
            <Section title="Automation opportunities">
              {full.automation_opportunities.length === 0 ? (
                <p className="text-sm text-muted">None recorded.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {full.automation_opportunities.map((opp, index) => (
                    <li key={index} className="rounded border border-border bg-surface-muted p-2 text-sm">
                      <p className="font-medium text-foreground">{opp.opportunity}</p>
                      <p className="text-muted">{opp.rationale}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section title="Qualification summary">
            <p className="text-sm text-foreground">{full.qualification_summary}</p>
          </Section>

          <Section title="Risks & uncertainty">
            <BulletList items={full.risks_and_uncertainty} />
          </Section>
        </>
      ) : (
        <p className="text-sm text-muted">
          The full structured brief could not be read; showing the summary only.
        </p>
      )}

      <Section title="Outreach angle">
        <p className="rounded border border-accent/30 bg-accent/5 p-3 text-sm text-foreground">
          {brief.outreach_angle}
        </p>
      </Section>

      <Section title="Evidence confidence">
        <KnownInferredUnknown facts={full?.facts ?? null} />
      </Section>
    </div>
  );
}
