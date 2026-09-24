import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getSupabaseEnv(): { url: string; serviceRoleKey: string } {
  return {
    url: requireEnv("SUPABASE_URL"),
    serviceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

// Named CRON_SECRET (not WORKER_SECRET) to match Vercel's own convention:
// when a project has a CRON_SECRET env var set, Vercel automatically sends
// `Authorization: Bearer <CRON_SECRET>` on its own Cron-triggered requests,
// so this endpoint authenticates Vercel Cron with zero extra configuration.
// See docs/architecture.md's Phase 3 notes.
export function getCronSecret(): string {
  return requireEnv("CRON_SECRET");
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface WorkerEnvConfig {
  batchSize: number;
  concurrency: number;
  leaseSeconds: number;
  executionBudgetMs: number;
}

// Conservative defaults sized for a Vercel serverless function, not a
// long-running process: a small batch and modest concurrency keep a single
// tick well inside typical execution limits, and the lease comfortably
// outlasts one tick so a healthy worker never has its own claim expire out
// from under it. See docs/architecture.md's Phase 3 notes for the full
// reasoning and how to tune these for a paid Vercel plan with a longer
// function timeout.
export function getWorkerConfig(): WorkerEnvConfig {
  return {
    batchSize: envInt("WORKER_BATCH_SIZE", 5),
    concurrency: envInt("WORKER_CONCURRENCY", 3),
    leaseSeconds: envInt("WORKER_LEASE_SECONDS", 120),
    executionBudgetMs: envInt("WORKER_EXECUTION_BUDGET_MS", 8_000),
  };
}
