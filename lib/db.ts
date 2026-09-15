import { Pool } from "pg";

/* ── the one connection pool ────────────────────────────────────────────────
   The same driver talks to the local container in development and to Neon in
   production; DATABASE_URL is the only difference. That is deliberate — the
   row-locked transaction in lib/tower.ts is the part that must be right, and a
   second driver for production would mean it was only ever tested in its
   development shape.

   The pool is module-scoped so a warm serverless invocation reuses it. max is
   small because Neon's pooled endpoint, not this process, is what multiplexes;
   four connections is plenty for a page that reads one row and writes one. */

let pool: Pool | undefined;

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see .env.example");
  }

  /* pg reads `sslmode` out of the URL itself, so Neon's ?sslmode=require works
     with no extra wiring here. */
  pool = new Pool({ connectionString, max: 4 });
  return pool;
}
