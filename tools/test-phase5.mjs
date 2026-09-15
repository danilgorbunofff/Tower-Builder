/* The Phase 5 gate: what happens to money.
 *
 *   node tools/test-phase5.mjs
 *
 * Three things have to hold, and this proves each one:
 *
 *   1. the same webhook replayed twice creates no duplicate floors
 *   2. two purchases landing at the same instant produce contiguous numbering
 *      with no holes and no repeats
 *   3. `n` is clamped server-side, and an order the client should never have
 *      sent is refused before it reaches Stripe
 *
 * It imports lib/fulfil.ts -- the function the webhook and the reconcile route
 * both call -- so this exercises the shipped path rather than a copy of it. The
 * database part is destructive by design and refuses to touch anything that is
 * not local; see assertLocal().
 *
 * The HTTP part runs against a server if one is reachable, and says so either
 * way. Point it somewhere else with TOWER_TEST_ORIGIN. On a server with no
 * Stripe key (which is how the repo runs by default, and how baseline/ was
 * captured) it asserts the demo answers; on one with a key it goes on to sign a
 * real webhook payload and post it. */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { fulfil } from "../lib/fulfil.ts";
import { getStripe } from "../lib/stripe.ts";
import {
  MAX_BATCH,
  PLACEHOLDER_NAME,
  floorCountFor,
  readOrder,
} from "../lib/order.ts";

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

/* The webhook route refuses to do anything without a key, and lib/stripe.ts
 * builds its client from one, so the signature checks below need the variable
 * to be present. It is never sent anywhere: constructEvent is pure HMAC. */
process.env.STRIPE_SECRET_KEY ||= "sk_test_not_a_real_key";
process.env.STRIPE_WEBHOOK_SECRET ||= "whsec_test_only_signature_secret";

function assertLocal(connectionString) {
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host)) {
    console.error(`refusing to run: DATABASE_URL host is "${host}", not a local database.`);
    process.exit(2);
  }
  return host;
}

const host = assertLocal(url);
const origin = process.env.TOWER_TEST_ORIGIN ?? "http://127.0.0.1:3000";

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

/* Every problem at once is the shape readOrder promises, so the assertions can
 * name the field rather than match a message. */
function problemsFor(order) {
  const reading = readOrder(order);
  return reading.ok ? [] : reading.problems.map((p) => p.field).sort();
}

const admin = new pg.Client({ connectionString: url });
await admin.connect();

await admin.query(await readFile(join(root, "lib", "schema.sql"), "utf8"));

/* One reset for the whole file, and one at the end, so a crashed run does not
 * leave a tower standing that the next run has to reason about. */
async function reset() {
  await admin.query("TRUNCATE floors, purchases; UPDATE tower_state SET count = 0 WHERE id = 1;");
}

async function standing() {
  const { rows } = await admin.query(`
    SELECT (SELECT count FROM tower_state WHERE id = 1)      AS count,
           (SELECT count(*)::int FROM floors)                AS rows,
           (SELECT count(DISTINCT no)::int FROM floors)      AS distinct,
           (SELECT COALESCE(max(no), 0) FROM floors)         AS hi
  `);
  return rows[0];
}

await reset();
console.log(`\nconnected to ${host}\n`);

/* ── the server-side clamp ────────────────────────────────────────────────
   amount_total is cents and it is the only number in the flow a client cannot
   write, so this function is the real cap. It has to be total: anything it is
   handed comes back as a number between 0 and MAX_BATCH. */
console.log("  the clamp: amount_total in cents, whatever it is");
{
  eq("one dollar is one floor", floorCountFor(100), 1);
  eq("fifty dollars is fifty floors", floorCountFor(5000), 50);
  eq("a thousand dollars is still fifty", floorCountFor(100_000), MAX_BATCH);
  eq("ninety-nine cents buys nothing", floorCountFor(99), 0);
  eq("zero buys nothing", floorCountFor(0), 0);
  eq("a negative amount buys nothing", floorCountFor(-100), 0);
  eq("fractional cents buy nothing", floorCountFor(150.5), 0);
  eq("NaN buys nothing", floorCountFor(Number.NaN), 0);
  eq("Infinity buys nothing", floorCountFor(Number.POSITIVE_INFINITY), 0);
  eq("a string buys nothing", floorCountFor("100"), 0);
  eq("undefined buys nothing", floorCountFor(undefined), 0);
  eq("an object buys nothing", floorCountFor({ amount_total: 100 }), 0);
}

/* ── the order, before any of it reaches Stripe ─────────────────────────── */
console.log("\n  the order: refused here, so it never reaches the till");
{
  const good = { n: 1, name: "Ada", url: "", attempt: "abcdefgh" };
  eq("a good order has no problems", problemsFor(good), []);

  eq("above the cap", problemsFor({ ...good, n: MAX_BATCH + 1 }), ["n"]);
  eq("the cap itself is allowed", problemsFor({ ...good, n: MAX_BATCH }), []);
  eq("zero floors", problemsFor({ ...good, n: 0 }), ["n"]);
  eq("a fractional number of floors", problemsFor({ ...good, n: 1.5 }), ["n"]);
  eq("a string of digits is accepted", problemsFor({ ...good, n: "3" }), []);
  eq("a hand-written name of no length", problemsFor({ ...good, name: "   " }), ["name"]);
  eq("a name past the limit", problemsFor({ ...good, name: "x".repeat(25) }), ["name"]);

  /* The one field where a mistake is a browser-level hole rather than a bad
     word, so it gets an allowlist of two schemes. */
  eq("a javascript: link", problemsFor({ ...good, url: "javascript:alert(1)" }), ["url"]);
  eq("a data: link", problemsFor({ ...good, url: "data:text/html,<b>x" }), ["url"]);
  eq("a bare hostname", problemsFor({ ...good, url: "example.com" }), ["url"]);
  eq("credentials in the link", problemsFor({ ...good, url: "https://real.test@evil.test/" }), ["url"]);
  eq("an https link", problemsFor({ ...good, url: "https://example.com/ada" }), []);

  eq("a stale attempt id", problemsFor({ ...good, attempt: "short" }), ["attempt"]);
  eq("a missing attempt id", problemsFor({ n: 1, name: "Ada", url: "" }), ["attempt"]);
  eq("nothing at all", readOrder(null).ok, false);

  /* Every problem, not the first: someone with two mistakes fixes both in one
     pass instead of discovering the second after fixing the first. */
  const both = readOrder({ n: 0, name: "", url: "javascript:1", attempt: "no" });
  eq("a bad order reports every problem", both.ok ? [] : both.problems.length, 4);
}

/* ── a paid session becomes floors ──────────────────────────────────────── */
console.log("\n  one webhook, three floors");
{
  const done = await fulfil("cs_test_one", 300, { name: "Ada", url: "https://example.com/ada" });
  eq("three floors", done.floors, 3);
  eq("the tower is three high", done.count, 3);
  eq("not a replay", done.replayed, false);
  eq("the ledger agrees", await standing(), { count: 3, rows: 3, distinct: 3, hi: 3 });

  const { rows } = await admin.query("SELECT no, name, url FROM floors ORDER BY no");
  eq("numbered 1..3", rows.map((r) => r.no), [1, 2, 3]);
  eq("all carrying the name", rows.map((r) => r.name), ["Ada", "Ada", "Ada"]);
}

/* ── the same delivery again ─────────────────────────────────────────────
   At-least-once delivery is Stripe's contract, so a second arrival is normal
   rather than suspicious, and it has to be a no-op. */
console.log("\n  stripe replays the same delivery");
{
  const again = await fulfil("cs_test_one", 300, { name: "Ada", url: "https://example.com/ada" });
  eq("recognised as a replay", again.replayed, true);
  eq("the count did not move", again.count, 3);
  eq("no duplicate storeys", (await standing()).rows, 3);

  /* Twice more, concurrently, because "safe to run twice" has to mean safe to
     run at the same instant too. */
  const storm = await Promise.all(
    Array.from({ length: 4 }, () => fulfil("cs_test_one", 300, { name: "Ada", url: null }))
  );
  is("all four are replays", storm.every((r) => r.replayed && r.count === 3));
  eq("still no duplicate storeys", (await standing()).rows, 3);
}

/* ── the metadata is read back later, by someone else ────────────────────
   A paid floor always lands. Refusing would take someone's dollar and give
   them nothing, which is the only unforgivable outcome here -- so the text is
   what gives way, not the height. */
console.log("\n  a paid session whose metadata will not validate");
{
  const named = await fulfil("cs_test_bad", 200, { name: "", url: "javascript:alert(1)" });
  eq("the floors were built anyway", named.floors, 2);
  eq("the name fell back", named.name, PLACEHOLDER_NAME);
  eq("the link was dropped", named.url, null);
  eq("the count moved", named.count, 5);

  const { rows } = await admin.query("SELECT name, url FROM floors WHERE no = 5");
  eq("and the fallback is what is stored", rows[0], { name: PLACEHOLDER_NAME, url: null });
}

/* ── an amount that buys no floor ────────────────────────────────────────
   Not an error: nothing is wrong, there is simply nothing to build, and
   telling Stripe to retry would not change that. */
console.log("\n  an amount that buys no floor");
{
  const before = await standing();
  eq("ninety-nine cents", await fulfil("cs_test_tiny", 99, { name: "Nobody" }), null);
  eq("no session id", await fulfil("", 100, { name: "Nobody" }), null);
  eq("a session id that is not a string", await fulfil(42, 100, { name: "Nobody" }), null);
  eq("nothing was written", await standing(), before);
}

/* ── a paid session with no metadata at all ──────────────────────────────
   Not hostile, just absent -- a session created by hand against the same live
   key, or by some future code path that forgot to attach metadata. There is
   still a dollar behind it, so there is still a floor; only the sign is blank,
   and that is what the placeholder is for. */
console.log("\n  a paid session with no metadata at all");
{
  const before = (await standing()).count;
  const bare = await fulfil("cs_test_nometa", 100, null);

  is("a floor was built", bare !== null);
  eq("with the placeholder for a name", bare?.name, PLACEHOLDER_NAME);
  eq("and no link", bare?.url, null);
  eq("the count moved by one", bare?.count, before + 1);

  const { rows } = await admin.query("SELECT name, url FROM floors ORDER BY no DESC LIMIT 1");
  eq("and that is what is on the floor", rows[0], { name: PLACEHOLDER_NAME, url: null });
}

/* ── four purchases at the same instant ──────────────────────────────────
   The row lock in applyPurchase is what this is really testing: blocks that
   interleave must still come out contiguous, with nothing doubled and no hole
   where one of them guessed a floor another was about to take. */
console.log("\n  four purchases landing at the same instant");
{
  const before = (await standing()).count;
  const done = await Promise.all([
    fulfil("cs_test_race_a", 100, { name: "A" }),
    fulfil("cs_test_race_b", 200, { name: "B" }),
    fulfil("cs_test_race_c", 300, { name: "C" }),
    fulfil("cs_test_race_d", 400, { name: "D" }),
  ]);

  eq("every one of them landed", done.length, 4);

  const s = await standing();
  eq("the count moved by exactly ten", s.count, before + 10);
  eq("one row per floor", s.rows, s.count);
  eq("no repeats", s.distinct, s.count);
  eq("no holes: the highest floor is the count", s.hi, s.count);

  /* ── why this is a shape and not a list ────────────────────────────────
     Promise.all starts the four transactions in array order but does not make
     them queue in it: the row lock decides who goes first, and the database is
     free to hand it to the fourth call first. So asserting a particular
     interleaving would be asserting something the code never promised, and it
     would pass or fail depending on the scheduler.

     Sorted by position, they must tile the range without a gap or an overlap --
     each block starting exactly where the previous one ended, the first
     starting where the tower ended, the last ending at the count. That is the
     whole invariant, and it holds whatever order they were granted in. */
  const blocks = done.map((r) => ({ lo: r.lo, size: r.floors })).sort((a, b) => a.lo - b.lo);
  eq("they asked for one, two, three and four floors", blocks.map((b) => b.size).sort(), [1, 2, 3, 4]);
  eq("the first block starts where the tower ended", blocks[0].lo, before);
  eq(
    "each block begins exactly where the last one ended",
    blocks.map((b, i) => b.lo + b.size - (blocks[i + 1]?.lo ?? s.count)),
    [0, 0, 0, 0]
  );
  eq(
    "and they add up to the whole range",
    blocks.reduce((sum, b) => sum + b.size, 0),
    s.count - before
  );

  /* A hole would be a floor number with no row, which is exactly what a broken
     lock produces and what `distinct === count === hi` cannot show on its own. */
  const { rows } = await admin.query(
    "SELECT generate_series(1, (SELECT count FROM tower_state WHERE id = 1)) AS gs EXCEPT SELECT no FROM floors"
  );
  eq("every number in 1..count has a row", rows.length, 0);
}

/* ── the signature ───────────────────────────────────────────────────────
   The webhook's whole authentication is this, and it is over the exact bytes
   Stripe sent -- which is why the route reads request.text() and must never
   read request.json() first. These assert the property the route depends on
   rather than the route itself, which needs a server: see below. */
console.log("\n  the signature, checked the way the route checks it");
{
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = getStripe();

  const event = {
    id: "evt_test_one",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_signed",
        payment_status: "paid",
        amount_total: 200,
        metadata: { name: "Signed", url: "" },
      },
    },
  };
  const body = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload: body, secret });

  const verified = stripe.webhooks.constructEvent(body, header, secret);
  eq("a correctly signed body verifies", verified.data.object.id, "cs_test_signed");

  function rejects(label, payload, signature) {
    let threw = false;
    try {
      stripe.webhooks.constructEvent(payload, signature, secret);
    } catch {
      threw = true;
    }
    is(label, threw);
  }

  rejects("signed with a different secret", body, stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_someone_else" }));
  rejects("the body changed after signing", JSON.stringify({ ...event, id: "evt_test_two" }), header);
  rejects("a payload that is not JSON", "not json at all", stripe.webhooks.generateTestHeaderString({ payload: "not json at all", secret }));
  rejects("no signature at all", body, "");
  rejects("a signature that is not a signature", body, "t=1,v1=deadbeef");
}

/* ── over HTTP, if there is a server to talk to ───────────────────────────
   The route's own wiring -- which header it reads, that it reads the raw body,
   which status it answers -- cannot be checked from inside the process that
   defines it. */
console.log(`\n  over HTTP at ${origin}`);
{
  const reachable = await fetch(`${origin}/api/tower`, { cache: "no-store" })
    .then((r) => r.ok)
    .catch(() => false);

  if (!reachable) {
    console.log(`  SKIP  nothing answering at ${origin} -- start the dev server to include this part`);
  } else {
    const post = (path, body, headers = {}) =>
      fetch(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

    const order = { n: 1, name: "Ada", url: "", attempt: "abcdefgh1234" };

    /* Validation runs before the key check, deliberately, so this is a 400 on
       a deployment that has no Stripe key at all. That ordering is a design
       decision and this is what keeps it one. */
    const over = await post("/api/checkout", { ...order, n: MAX_BATCH + 1 });
    eq("an over-cap order is a 400", over.status, 400);
    eq("and it names the field", ((await over.json()).problems ?? []).map((p) => p.field), ["n"]);

    const bad = await post("/api/checkout", { ...order, url: "javascript:alert(1)" });
    eq("a bad link is a 400", bad.status, 400);

    /* A valid order only goes as far as the key check on a demo server, which
       is what the repo runs as by default and how baseline/ was captured. With
       a key present it would talk to Stripe for real, so the response is
       reported rather than asserted -- a live run must not depend on what a
       real account answers. */
    const valid = await post("/api/checkout", order).catch(() => null);
    const configured = valid !== null && valid.status !== 503;
    if (valid === null) {
      console.log("  SKIP  could not reach /api/checkout at all");
    } else if (configured) {
      console.log(`  ok    the server has a Stripe key (a valid order answered ${valid.status})`);
    } else {
      console.log("  ok    the server has no Stripe key, so a valid order is a 503 (demo mode)");
      eq("a valid order is refused for want of a key", valid.status, 503);
    }

    const unsigned = await post("/api/stripe/webhook", { hello: "world" });
    eq("an unsigned delivery is refused", unsigned.status, configured ? 400 : 503);

    if (configured) {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      const stripe = getStripe();
      await reset();

      const make = (id, amount) =>
        JSON.stringify({
          id: `evt_test_${id}`,
          type: "checkout.session.completed",
          data: {
            object: {
              id: `cs_test_http_${id}`,
              payment_status: "paid",
              amount_total: amount,
              metadata: { name: "Over HTTP", url: "" },
            },
          },
        });

      const deliver = (payload, signed = true) =>
        post("/api/stripe/webhook", payload, {
          "stripe-signature": stripe.webhooks.generateTestHeaderString({
            payload,
            secret: signed ? secret : "whsec_someone_else",
          }),
        });

      const payload = make("a", 200);
      const first = await deliver(payload);
      eq("a signed delivery is accepted", first.status, 200);
      eq("and built two floors", (await first.json()).floors, 2);

      const again = await deliver(payload);
      eq("the replay is accepted too", again.status, 200);
      eq("and is recognised as a replay", (await again.json()).replayed, true);
      eq("with no duplicate storeys", (await standing()).rows, 2);

      const forged = await deliver(make("b", 100), false);
      eq("a delivery signed with the wrong secret is a 400", forged.status, 400);
      eq("and built nothing", (await standing()).count, 2);
    }
  }
}

await reset();
await admin.end();

console.log(failures ? `\n${failures} failed\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
