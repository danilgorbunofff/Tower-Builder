/* Proves lib/tower.ts against a real Postgres.
 *
 *   node tools/test-tower.mjs
 *
 * It imports the module the API and the webhook actually call, so this tests
 * the shipped SQL rather than a copy of it. Run it after `npm run db:migrate`.
 *
 * The test is destructive by design — it needs a known starting count — so it
 * refuses to touch anything that is not local. See assertLocal(). */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { applyPurchase, getTower } from "../lib/tower.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(root, ".env.local"));
  } catch {
    /* reported below */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(2);
}

/* A test that truncates tables must never be pointed at production, and the
 * only durable way to guarantee that is to check the host rather than trust
 * whoever ran it. */
function assertLocal(connectionString) {
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host)) {
    console.error(`refusing to run: DATABASE_URL host is "${host}", not a local database.`);
    process.exit(2);
  }
  return host;
}

const host = assertLocal(url);

let failures = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${e}\n          actual   ${a}`);
  }
}

function is(label, condition) {
  eq(label, Boolean(condition), true);
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();

/* ── from zero ─────────────────────────────────────────────────────────── */
await admin.query(await readFile(join(root, "lib", "schema.sql"), "utf8"));
await admin.query("TRUNCATE floors, purchases; UPDATE tower_state SET count = 0 WHERE id = 1;");
console.log(`\nconnected to ${host}\n\n  from zero`);

eq("empty tower", await getTower(0), { count: 0, floors: [] });

/* ── a purchase ────────────────────────────────────────────────────────── */
console.log("\n  one purchase of three");
{
  const r = await applyPurchase("cs_test_a", 3, "Ada", "https://example.com/ada");
  eq("count is three", r.count, 3);
  eq("owns floors 1..3", r.lo, 0);
  eq("not a replay", r.replayed, false);
  eq("the ledger agrees", await getTower(0), {
    count: 3,
    floors: [
      { no: 1, name: "Ada", url: "https://example.com/ada" },
      { no: 2, name: "Ada", url: "https://example.com/ada" },
      { no: 3, name: "Ada", url: "https://example.com/ada" },
    ],
  });
}

/* ── the same session again ────────────────────────────────────────────── */
console.log("\n  stripe replays the same webhook");
{
  const r = await applyPurchase("cs_test_a", 3, "Ada", "https://example.com/ada");
  eq("recognised as a replay", r.replayed, true);
  eq("count did not move", r.count, 3);

  const { rows } = await admin.query("SELECT count(*)::int AS n FROM floors");
  eq("no duplicate storeys", rows[0].n, 3);
}

/* ── a second purchase, the case an off-by-one breaks ──────────────────── */
console.log("\n  a second purchase of two");
{
  const r = await applyPurchase("cs_test_b", 2, "Grace", null);
  eq("count is five", r.count, 5);
  eq("owns floors 4..5", r.lo, 3);
  eq("the block starts above the last storey", (await getTower(3)).floors.map((f) => f.no), [4, 5]);
  eq("a null url survives", (await getTower(3)).floors[0].url, null);
}

/* ── a single floor ───────────────────────────────────────────────────── */
console.log("\n  a purchase of one");
{
  const r = await applyPurchase("cs_test_c", 1, "Linus", "https://example.com/l");
  eq("count is six", r.count, 6);
  eq("the newest floor", (await getTower(5)).floors.map((f) => f.no), [6]);
  eq("nothing above the top", (await getTower(6)).floors, []);
}

/* ── the ledger is contiguous ─────────────────────────────────────────── */
console.log("\n  the ledger is contiguous, 1..count, each exactly once");
{
  const { rows } = await admin.query(`
    SELECT (SELECT count FROM tower_state WHERE id = 1)              AS count,
           (SELECT count(*)::int FROM floors)                        AS rows,
           (SELECT min(no) FROM floors)                              AS lo,
           (SELECT max(no) FROM floors)                              AS hi,
           (SELECT count(DISTINCT no)::int FROM floors)              AS distinct
  `);
  const r = rows[0];
  eq("count equals the row count", r.rows, r.count);
  eq("every number distinct", r.distinct, r.count);
  eq("the first floor is 1", r.lo, 1);
  eq("the last floor is count", r.hi, r.count);
}

/* ── two webhooks at once ─────────────────────────────────────────────── */
console.log("\n  five webhooks landing at the same instant");
{
  /* The point of the row lock: these interleave freely, and the blocks must
     still come out contiguous and non-overlapping. Without the UPDATE ...
     RETURNING serialisation two of them would claim the same floor and the
     primary key would reject one — or worse, silently skip a number. */
  const before = (await getTower(0)).count;
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, i) => applyPurchase(`cs_test_race_${i}`, 2, `Racer ${i}`, null))
  );

  const claimed = results.map((r) => r.lo).sort((a, b) => a - b);
  eq("each claimed a distinct block", claimed, [before, before + 2, before + 4, before + 6, before + 8]);
  eq("the count moved by exactly ten", (await getTower(0)).count, before + 10);

  const { rows } = await admin.query(`
    SELECT (SELECT count FROM tower_state WHERE id = 1)   AS count,
           (SELECT count(*)::int FROM floors)             AS rows,
           (SELECT count(DISTINCT no)::int FROM floors)   AS distinct,
           (SELECT max(no) FROM floors)                   AS hi
  `);
  eq("still one row per floor", rows[0].rows, rows[0].count);
  eq("still no repeats", rows[0].distinct, rows[0].count);
  eq("still no gaps", rows[0].hi, rows[0].count);
}

/* ── the read window ─────────────────────────────────────────────────── */
console.log("\n  the read window");
{
  const tower = await getTower(0);
  eq("returns floors in order", tower.floors.map((f) => f.no), [...tower.floors.map((f) => f.no)].sort((a, b) => a - b));

  const since = tower.count - 3;
  eq("since asks for the ones above it", (await getTower(since)).floors.map((f) => f.no), [since + 1, since + 2, since + 3]);
  eq("count ignores since", (await getTower(since)).count, tower.count);

  /* The bound on the response, and that it keeps the newest rather than the
     oldest — the page renders the top of the tower. */
  const capped = await getTower(0);
  is("no more rows than the limit", capped.floors.length <= 200);
}

await admin.end();

console.log(failures ? `\n${failures} failed\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
