/* The Phase 6 gate: what stays off the tower, and what a takedown costs.
 *
 *   node tools/test-phase6.mjs
 *
 * The plan's §9 asks for two things and this proves both:
 *
 *   1. a known-bad name is refused at the modal, and refused again server-side
 *   2. a redacted floor keeps its height
 *
 * "Refused at the modal" is the same judgement as "refused server-side", and
 * that is the design rather than a coincidence: lib/order.ts is imported by the
 * browser bundle and by the serverless function, so readOrder() is literally the
 * function the modal calls on submit (components/order-modal.tsx returns early
 * when it fails, before any fetch) and the function app/api/checkout calls
 * before it ever speaks to Stripe. The in-process part below is the whole of
 * that judgement; the modal's own wiring is driven separately through
 * tools/shoot.mjs, because a form is not a function.
 *
 * The database part is destructive by design and refuses to touch anything that
 * is not local; see assertLocal(). Only the text of a floor is ever hidden --
 * this file is also the proof that nothing is deleted, by reading the row back
 * after the takedown and finding it unchanged.
 *
 * The HTTP part runs against a server if one is reachable and says what it found
 * either way. Point it somewhere else with TOWER_TEST_ORIGIN, and start that
 * server with the same TOWER_ADMIN_SECRET this process has or the authenticated
 * half of the route can only be skipped. */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import { fulfil } from "../lib/fulfil.ts";
import { applyPurchase, getTower, hideFloor } from "../lib/tower.ts";
import {
  NAME_MAX,
  PLACEHOLDER_NAME,
  URL_MAX,
  blockedName,
  normaliseName,
  readName,
  readOrder,
  readUrl,
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

/* The route's own secret, which has to be the same one the server was started
 * with. Absent here it is a local default so the shape of the header can still
 * be exercised, and the HTTP section reports honestly when the server answers
 * that this is not its secret. */
const ADMIN_HEADER = "x-admin-secret";
const adminSecret = process.env.TOWER_ADMIN_SECRET ?? "test_only_takedown_secret";

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

await admin.query(await readFile(join(root, "lib", "schema.sql"), "utf8"));

async function reset() {
  await admin.query("TRUNCATE floors, purchases; UPDATE tower_state SET count = 0 WHERE id = 1;");
}

/* The row as the database holds it, which is the half of a takedown that has to
 * still be there afterwards. */
async function rowFor(no) {
  const { rows } = await admin.query(
    "SELECT no, name, url, hidden FROM floors WHERE no = $1",
    [no]
  );
  return rows[0] ?? null;
}

await reset();
console.log(`\nconnected to ${host}\n`);

/* ── the judge ────────────────────────────────────────────────────────────
   Every trick in the book is spelling, so the name is folded to a shape before
   anything is compared: accents off, lowercased, digits swapped for the letters
   they stand in for, everything that is not a letter or digit deleted, then runs
   of the same character collapsed. These first three assertions are that
   sentence, and they are why the blocklist can be written in ordinary
   spelling. */
console.log("  the judge, which the modal and the server both run");
{
  eq("digits fold onto letters", normaliseName("n4z1"), "nazi");
  eq("accents and separators fold away", normaliseName("N \u00c1 Z I"), "nazi");
  eq("and repeated letters collapse", normaliseName("nnaaazzziii"), "nazi");

  /* Includes the two shapes that are not a substring test: `kkk` collapses to
     one letter, and `rapist` is inside therapist. */
  const bad = [
    "n4z1",
    "n a z i",
    "xXnaziXx",
    "N\u00c1ZI",
    "KKK",
    "coon88",
    "Negro",
    "rapist",
    "A quiet floor",
  ];
  for (const name of bad) {
    const reading = readName(name);
    is(`refused: ${JSON.stringify(name)}`, !reading.ok);
    if (!reading.ok) {
      eq("  and it says only that", reading.message, "pick a different name");
    }
  }

  eq("the term is available to the log", blockedName("n4z1"), "nazi");
  const refusal = readName("n4z1");
  is(
    "but the refusal never repeats it back",
    !refusal.ok && !refusal.message.toLowerCase().includes("nazi")
  );

  /* Each of these is a word that contains a blocked sequence. The escape is
     spent whole, so it cannot shield the rest of the name -- which is the two
     assertions after the list. */
  const good = [
    "Ada",
    "Connor",
    "Scunthorpe",
    "Spicules",
    "Nigeria",
    "Nigerian",
    "Negroni",
    "Auspicious",
    "Therapist",
    "Pedometer",
    "Grape",
    "K\u00f6ln",
    "Aussie Spice",
  ];
  for (const name of good) {
    const reading = readName(name);
    is(`kept: ${JSON.stringify(name)}`, reading.ok && reading.name === name);
  }

  is("a spared word does not shield the rest of its own name", !readName("spice n4z1").ok);
  is("nor does one that stands alone", !readName("scunthorpe kkk").ok);

  is("a name has a ceiling", !readName("x".repeat(NAME_MAX + 1)).ok);
  is("whitespace is not a name", !readName("   ").ok);
  is("nor is something that is not a string", !readName(7).ok);
}

/* ── the link rule ────────────────────────────────────────────────────────
   An allowlist of two schemes, because `new URL` happily parses javascript:,
   data: and blob: -- all three have a protocol, so a blocklist of the famous
   ones is a blocklist of the ones somebody thought of. A floor's link is drawn
   into an <a href> that any stranger can click, which makes this the one field
   where a mistake is a browser-level hole rather than a bad word. */
console.log("\n  the link rule");
{
  const refused = [
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "blob:https://example.com/abc",
    "ftp://example.com",
    "example.com",
    "https://real-site.com@evil.example/",
    `https://example.com/${"a".repeat(URL_MAX)}`,
  ];
  for (const link of refused) {
    is(`refused: ${link.slice(0, 44)}`, !readUrl(link).ok);
  }

  eq("no link is a supported answer", readUrl(""), { ok: true, url: null });
  eq("and so is a link that is only whitespace", readUrl("  "), { ok: true, url: null });

  const http = readUrl("http://example.com");
  is("http is allowed", http.ok);
  const https = readUrl("  https://example.com/a?b=1  ");
  eq("https is allowed and trimmed", https.ok && https.url, "https://example.com/a?b=1");

  const order = readOrder({ n: 1, name: "Ada", url: "javascript:alert(1)", attempt: "abcdefgh1234" });
  eq(
    "a bad link is a problem with a field on it",
    order.ok ? [] : order.problems.map((p) => p.field),
    ["url"]
  );
}

/* ── the redaction ────────────────────────────────────────────────────────
   §8 chose redaction over deletion for one reason: the floor was paid for. The
   height is the promise, so the storey keeps its number and keeps counting --
   what goes is the words, and they go on the way out of the database rather than
   in the browser. If they went in the browser the real name and the real link
   would still be sitting in the JSON where anyone can read them, which is not a
   takedown, only the appearance of one. */
console.log("\n  a taken-down floor keeps its height");
{
  await reset();

  await applyPurchase("cs_test_p6_ada", 1, "Ada", "https://ada.example/");
  await applyPurchase("cs_test_p6_bad", 1, "Verboten", "https://verboten.example/leaked");
  await applyPurchase("cs_test_p6_bea", 1, "Bea", "https://bea.example/");

  const before = await getTower(0);
  eq("three floors stand", before.count, 3);
  eq("and all three are shipped", before.floors.map((f) => f.no), [1, 2, 3]);

  const hidden = await hideFloor(2);
  eq("the takedown reports the count it did not change", hidden, { no: 2, count: 3 });

  const after = await getTower(0);
  const byNo = Object.fromEntries(after.floors.map((f) => [f.no, f]));

  /* Deep equality, so this is also the assertion that no `hidden` flag and no
     other field travelled with it. */
  eq("the storey is still there, redacted to exactly this", byNo[2], {
    no: 2,
    name: PLACEHOLDER_NAME,
    url: null,
  });
  eq("its height is unchanged", after.count, 3);
  eq("every number still has a storey", after.floors.map((f) => f.no), [1, 2, 3]);
  eq("the floor below is untouched", byNo[1], { no: 1, name: "Ada", url: "https://ada.example/" });
  eq("and the floor above is too", byNo[3], { no: 3, name: "Bea", url: "https://bea.example/" });

  /* The leak, asserted on the payload itself rather than on what the page
     chooses to draw. */
  const payload = JSON.stringify(after);
  is("the name is not in the response at all", !payload.includes("Verboten"));
  is("nor is the link", !payload.includes("verboten.example"));

  /* Nothing was deleted -- hiding a floor is a change to what it says, not to
     whether it exists. This is the row that makes that a fact. */
  eq("nothing was deleted, only hidden", await rowFor(2), {
    no: 2,
    name: "Verboten",
    url: "https://verboten.example/leaked",
    hidden: true,
  });

  /* A redaction is not a delay: the very next read is already redacted, and a
     poll still counts the hidden floor it does not send. */
  const polled = await getTower(2);
  eq("a poll keeps counting it", polled.count, 3);
  eq("while sending only what stands above", polled.floors.map((f) => f.no), [3]);

  eq("hiding a floor that never stood finds nothing", await hideFloor(99), null);
  eq("and asking twice is the same answer", await hideFloor(2), { no: 2, count: 3 });
}

/* ── the second gate, for the money that is already spent ─────────────────
   The checkout route validates before it speaks to Stripe, but metadata is read
   back later by a different process against whatever the rules are *then* -- so
   lib/fulfil.ts reads it again, and a name that will not validate becomes the
   placeholder rather than a refusal. Refusing here would take someone's dollar
   and give them nothing, which is the one genuinely unforgivable outcome in this
   app. */
console.log("\n  a paid floor lands even when the name will not");
{
  await reset();

  const landed = await fulfil("cs_test_p6_fulfil", 100, {
    name: "n4z1",
    url: "javascript:alert(1)",
  });
  eq("the payment still builds its floor", landed?.floors, 1);
  eq("under the placeholder name", landed?.name, PLACEHOLDER_NAME);
  eq("with no link", landed?.url, null);

  const tower = await getTower(0);
  eq("which is what the tower then shows", tower.floors[0], {
    no: 1,
    name: PLACEHOLDER_NAME,
    url: null,
  });
  eq("and it is a floor like any other", tower.count, 1);
}

/* ── nothing at all, for money that buys nothing ──────────────────────────
   The clamp is not a range check on a field: `amount_total` is cents and the
   only number in the flow a client cannot write, so a session that does not add
   up builds no floor rather than a floor of unknown height. */
console.log("\n  and does not when the amount buys nothing");
{
  await reset();
  eq("ninety-nine cents is not a floor", await fulfil("cs_test_p6_short", 99, { name: "Ada" }), null);
  eq("nothing was built", (await getTower(0)).count, 0);
}

/* ── the takedown door, over HTTP ─────────────────────────────────────────
   Which header the route reads and which status it answers with cannot be
   checked from inside the process that defines them. */
console.log(`\n  the takedown door at ${origin}`);
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

    const hide = (body, secret) =>
      post("/api/admin/hide", body, secret ? { [ADMIN_HEADER]: secret } : {});

    const anonymous = await hide({ no: 1 });

    if (anonymous.status === 503) {
      /* Unset configuration is a supported state everywhere in this app, and it
         is how the repo runs by default: the tower can only be moderated from
         psql until somebody sets the variable. */
      console.log("  ok    this server has no takedown secret (or no database), so the route is off");
      eq("and a wrong secret is the same 503", (await hide({ no: 1 }, "nope")).status, 503);
    } else {
      eq("a request with no secret is refused", anonymous.status, 403);

      eq("a wrong secret is refused too", (await hide({ no: 1 }, "not-it")).status, 403);

      /* 404 is the answer that proves *this* process knows the secret: the floor
         does not exist, so the request got past the header and reached the
         database. */
      const probe = await hide({ no: 999999 }, adminSecret);

      if (probe.status === 403) {
        console.log(
          "  SKIP  the server's TOWER_ADMIN_SECRET is not this process's -- start it with the\n" +
            "        same value to include the authenticated half of this section"
        );
      } else {
        eq("a floor that never stood is a 404, not a takedown", probe.status, 404);

        const noBody = await post("/api/admin/hide", "", { [ADMIN_HEADER]: adminSecret });
        eq("a body that is not JSON is a 400", noBody.status, 400);

        for (const body of [{}, { no: 0 }, { no: "3" }, { no: 1.5 }, { no: null }]) {
          eq(
            `a body of ${JSON.stringify(body)} is a 400`,
            (await hide(body, adminSecret)).status,
            400
          );
        }

        /* The whole thing, through the door somebody would actually use. */
        await reset();
        await applyPurchase("cs_test_p6_http", 1, "Ada", null);
        await applyPurchase("cs_test_p6_http_bad", 1, "Verboten", null);
        await applyPurchase("cs_test_p6_http_3", 1, "Bea", null);

        const taken = await hide({ no: 2 }, adminSecret);
        if (taken.status === 404) {
          console.log(
            "  SKIP  the server's DATABASE_URL is not this process's -- the floor was built\n" +
              "        locally, so the route cannot see it"
          );
        } else {
          eq("a standing floor is taken down", taken.status, 200);
          eq("and the door reports the height it left alone", await taken.json(), {
            hidden: 2,
            count: 3,
          });
          eq(
            "the tower the route serves is redacted",
            (await getTower(0)).floors.map((f) => f.name),
            ["Ada", PLACEHOLDER_NAME, "Bea"]
          );
        }

        const wrongWay = await fetch(`${origin}/api/admin/hide`, { cache: "no-store" });
        eq("a GET is not the way to do it", wrongWay.status, 405);
      }
    }

    /* The server-side half of the gate: the same name the modal refuses, sent
       straight at the endpoint the modal would have posted to. */
    const order = { n: 1, name: "n4z1", url: "", attempt: "abcdefgh1234" };
    const refused = await post("/api/checkout", order);
    const problems = await refused.json().catch(() => ({}));
    eq("the server refuses the name on its own", refused.status, 400);
    eq("and names the field", (problems.problems ?? []).map((p) => p.field), ["name"]);
    is(
      "without repeating the word back",
      !JSON.stringify(problems).toLowerCase().includes("nazi")
    );
  }
}

await reset();
await admin.end();

console.log(failures ? `\n${failures} failed\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
