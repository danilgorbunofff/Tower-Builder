/* Applies lib/schema.sql. Idempotent, so it is safe to run at any time.
 *
 *   node tools/migrate.mjs
 *
 * Reads DATABASE_URL from .env.local (or the environment, which wins). */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* Next loads .env.local for the app; a bare node script has to ask. An
 * already-set DATABASE_URL wins, so `DATABASE_URL=… node tools/migrate.mjs`
 * still points somewhere else deliberately. */
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(root, ".env.local"));
  } catch {
    /* no .env.local — fall through to the check below */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(2);
}

const sql = await readFile(join(root, "lib", "schema.sql"), "utf8");

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query(sql);
  const { rows } = await client.query(
    "SELECT count, (SELECT count(*) FROM floors) AS floors, (SELECT count(*) FROM purchases) AS purchases FROM tower_state WHERE id = 1"
  );
  const r = rows[0];
  console.log(`schema ok — ${r.count} floors, ${r.floors} rows in floors, ${r.purchases} purchases`);
} finally {
  await client.end();
}
