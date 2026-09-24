import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations",
);

// Resets a scratch Postgres instance to a clean slate and applies every
// migration in order, so integration tests always run against the actual
// current schema rather than a snapshot of just one migration file.
export async function resetAndMigrate(client: Client): Promise<void> {
  await client.query("drop schema public cascade; create schema public;");

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await client.query(sql);
  }
}
