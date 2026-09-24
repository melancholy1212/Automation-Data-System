export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16 font-mono">
      <h1 className="text-lg text-foreground">AI Lead Intelligence &amp; Outreach Pipeline</h1>
      <p className="text-sm text-muted">
        Phase 2: database foundation and lead ingestion API. The operations
        dashboard lands in a later phase — see docs/architecture.md.
      </p>
      <ul className="text-sm text-muted">
        <li>POST /api/leads</li>
        <li>GET /api/leads</li>
        <li>GET /api/leads/:id</li>
        <li>GET /api/leads/:id/events</li>
      </ul>
    </main>
  );
}
