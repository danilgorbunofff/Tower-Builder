/* ── what an order is, and whether it is one ────────────────────────────────
   The one place an order is judged. The modal calls it so a mistake is caught
   before a card is ever asked for, and the server calls it again because the
   modal is not the authority on anything -- a request can be written by hand.

   Deliberately dependency-free: no `pg`, no `stripe`, no `next`. The modal
   imports this into the browser bundle and the webhook imports it into a
   serverless function, so it has to be plain arithmetic and string handling,
   and it has to mean exactly the same thing in both places. Anything that
   needs a database or a network does not belong here.

   Messages are written for the person typing, because that is where most of
   them end up: the modal prints them under the field they belong to. */

/* Mirrors MAX_BATCH in lib/engine.ts. That file's comment says the cap
   "mirrors the server-side cap on line_items[0][quantity]" -- this is the
   server-side cap it was talking about, so the two have to move together.
   If they ever disagree the engine would let someone charge up an order the
   server refuses, which is the one way holding the button can disappoint. */
export const MAX_BATCH = 50;

/* The signboard prints this name on one line and ellipsises it, and the floor
   element is about 90px wide at the tightest breakpoint. */
export const NAME_MAX = 24;
export const URL_MAX = 200;

/* The name a floor gets when there is no usable one to give it: a webhook whose
   metadata does not survive validation, and -- in Phase 6 -- a floor that has
   been taken down. A paid storey always lands, so this is what it says when its
   text cannot be used. Height is the economic proof; the text is decoration. */
export const PLACEHOLDER_NAME = "A quiet floor";

export type Order = {
  n: number;
  name: string;
  url: string | null;
  /* One id per attempt at ordering, not per request. The server turns it into a
     Stripe idempotency key, which is what stops a double-click from opening two
     Checkout Sessions for the same order. It has to come from the client,
     because only the client knows which two requests are the same attempt. */
  attempt: string;
};

export type Field = "n" | "name" | "url" | "attempt";
export type Problem = { field: Field; message: string };
export type Reading = { ok: true; order: Order } | { ok: false; problems: Problem[] };

const CONTROL = /[\u0000-\u001f\u007f]/g;
const SPACES = /\s+/g;
const ATTEMPT = /^[A-Za-z0-9_-]{8,64}$/;

/* Control characters are stripped rather than refused: they are almost always a
   paste artefact, and a name that reads correctly without them should not be
   rejected for containing them. Runs of whitespace collapse to one space for a
   different reason -- a name of forty spaces is one visible character wide and
   would otherwise sail past a length check as a way of taking up room. */
function cleanName(raw: string): string {
  return raw.replace(CONTROL, "").replace(SPACES, " ").trim();
}

/* Counted in code points, not UTF-16 units, so a name of twelve emoji is twelve
   characters rather than twenty-four. `[...s]` is the iterator, which walks
   code points. */
function chars(s: string): number {
  return [...s].length;
}

export function readName(raw: unknown): { ok: true; name: string } | { ok: false; message: string } {
  if (typeof raw !== "string") return { ok: false, message: "a floor needs a name" };
  const name = cleanName(raw);
  if (!name) return { ok: false, message: "a floor needs a name" };
  if (chars(name) > NAME_MAX) {
    return { ok: false, message: `${NAME_MAX} characters at most` };
  }
  return { ok: true, name };
}

/* ── the link rule ──────────────────────────────────────────────────────────
   An allowlist of two schemes, not a blocklist of the famous ones. `new URL`
   happily parses `javascript:alert(1)`, `data:text/html,...` and
   `blob:https://...` -- all three have a `protocol` -- so the test has to be
   what we do want, never what we have thought of. The list of things we have
   thought of is always the shorter one.

   Links are rendered into an `<a href>` that anyone can click, so this is the
   one field where a mistake is a browser-level hole rather than a bad word. */
export function readUrl(raw: unknown): { ok: true; url: string | null } | { ok: false; message: string } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, url: null };
  if (typeof raw !== "string") return { ok: false, message: "that does not look like a link" };

  const trimmed = raw.replace(CONTROL, "").trim();
  if (trimmed === "") return { ok: true, url: null };
  if (trimmed.length > URL_MAX) return { ok: false, message: "that link is too long" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    /* A bare "example.com" lands here. Refusing it is kinder than guessing at
       a scheme on the buyer's behalf: guessing wrong means pointing at
       something they did not write. */
    return { ok: false, message: "links need to start with http:// or https://" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, message: "links need to start with http:// or https://" };
  }

  /* `https://real-site.com@evil.example/` reads as a real-site link to anyone
     skimming and resolves to evil.example. This is a public signboard that any
     stranger can write on, so the shape has no legitimate use here. */
  if (parsed.username || parsed.password) {
    return { ok: false, message: "links cannot carry a username or password" };
  }

  return { ok: true, url: parsed.href };
}

/* `1.0` is one floor, `"3"` is three, `NaN` and `Infinity` are neither. The
   engine's own batch counter is an integer, so anything fractional here came
   from a hand-written request. */
export function readFloors(raw: unknown): { ok: true; n: number } | { ok: false; message: string } {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isFinite(n)) {
    return { ok: false, message: "how many floors?" };
  }
  if (!Number.isInteger(n)) return { ok: false, message: "whole floors only" };
  if (n < 1) return { ok: false, message: "an order is at least one floor" };
  if (n > MAX_BATCH) return { ok: false, message: `${MAX_BATCH} floors is the most in one order` };
  return { ok: true, n };
}

export function readAttempt(raw: unknown): { ok: true; attempt: string } | { ok: false; message: string } {
  if (typeof raw !== "string" || !ATTEMPT.test(raw)) {
    return { ok: false, message: "this order went stale -- close this and press the button again" };
  }
  return { ok: true, attempt: raw };
}

/* Every problem at once, not the first one. The modal shows all of them, so
   someone with a bad name and a bad link fixes both in one pass. */
export function readOrder(raw: unknown): Reading {
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, problems: [{ field: "n", message: "how many floors?" }] };
  }
  const body = raw as Record<string, unknown>;

  const n = readFloors(body.n);
  const name = readName(body.name);
  const url = readUrl(body.url);
  const attempt = readAttempt(body.attempt);

  const problems: Problem[] = [];
  if (!n.ok) problems.push({ field: "n", message: n.message });
  if (!name.ok) problems.push({ field: "name", message: name.message });
  if (!url.ok) problems.push({ field: "url", message: url.message });
  if (!attempt.ok) problems.push({ field: "attempt", message: attempt.message });
  if (problems.length) return { ok: false, problems };

  return {
    ok: true,
    order: {
      n: (n as { ok: true; n: number }).n,
      name: (name as { ok: true; name: string }).name,
      url: (url as { ok: true; url: string | null }).url,
      attempt: (attempt as { ok: true; attempt: string }).attempt,
    },
  };
}

/* ── how many floors this money bought ──────────────────────────────────────
   The whole point of the door this app sells. Every floor is exactly $1 and the
   Checkout line item is `unit_amount: 100` with `quantity: n`, so Stripe's own
   `amount_total` is the count -- in cents, and it is the only number in the
   flow that a client cannot write. A request body can claim `n: 50`; it cannot
   claim `amount_total`.

   So the server-side clamp is not a check that a field is in range. There is no
   field. `quantity` is validated once, when the session is created, and after
   that the amount paid *is* the number of floors.

   The clamp underneath is for a session created by something other than
   app/api/checkout -- a hand-made session against the same live key, or a
   future price change. It keeps this function total: whatever it is handed, it
   answers with a number between 0 and MAX_BATCH, and 0 means "this payment does
   not buy a floor". */
export function floorCountFor(amountTotal: unknown): number {
  if (typeof amountTotal !== "number" || !Number.isFinite(amountTotal)) return 0;
  if (!Number.isInteger(amountTotal)) return 0;
  if (amountTotal < 100) return 0;
  return Math.min(Math.floor(amountTotal / 100), MAX_BATCH);
}
