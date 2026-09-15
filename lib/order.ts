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

/* ── the blocklist, and why the test is on a shape rather than a spelling ───
   A name published here is permanent and public, so a small set of words never
   becomes one. Matching them by spelling would be worthless: `n4z1`, `NÁZI`,
   `n a z i` and `nazi nazi nazi` are the same word to every reader except a
   string comparison, and the person typing it knows that better than the person
   reading it.

   So the name is folded into a shape first, in the order the tricks arrive:
   take the accents off, lowercase, swap the digits and symbols that stand in for
   letters, delete everything that is not a letter or a digit, then collapse runs
   of the same character. The last step is what makes `nnaaazzziii` equal to
   `nazi`; the step before it is what makes `n-a-z-i` equal to `nazi`; and the
   two together are why the blocklist below is stored in ordinary spelling and
   normalised at load rather than being written out pre-mangled.

   Deleting separators is what makes `xXnaziXx` land on a shape containing
   `nazi` -- which is the point -- and it is also why the match is a substring
   test: once the hyphens are gone there are no words left to match against.
   Substring matching has one famous cost, and SAFE is the receipt for it:
   `Scunthorpe` contains a blocked word and is a town. SAFE spares whole tokens,
   so the escape cannot be spent on the rest of the same name -- `scunthorpe`
   passes and `scunthorpe <slur>` does not.

   Terms are matched two ways, by length, and the reason is the collapsing step:
   `coon` folds to `con`, which is a substring of `Connor`. A term that folds
   below four characters is therefore too generic to be evidence of anything and
   is matched only as a whole token, where `coon` still fails and `Connor` is
   not its business. */
const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s",
  "6": "g", "7": "t", "8": "b", "9": "g", "@": "a",
  "$": "s", "!": "i", "|": "l",
};
const LEET_RE = /[0-9@$!|]/g;
const NON_WORD = /[^a-z0-9]+/g;
const RUNS = /(.)\1+/g;
/* Marks left behind by decomposing a letter, so `Á` keeps its A and loses the
   accent. */
const MARKS = /[\u0300-\u036f]/g;
/* Letters that do not decompose at all, so no normalisation form reaches them
   and they have to be spelled out. Deliberately short: these are the ones that
   turn up in names. */
const SPECIAL: Record<string, string> = {
  "ß": "ss", "æ": "ae", "œ": "oe", "ø": "o", "đ": "d", "ð": "d",
  "þ": "th", "ł": "l", "ħ": "h", "ı": "i", "ŋ": "n", "ĸ": "k", "ſ": "s",
};
const SPECIAL_RE = /[ßæœøđðþłħıŋĸſ]/g;

/* Words that are allowed to contain a blocked sequence, because they are words.
   Each one is the receipt for a term on the list below: `cunt` is in Scunthorpe,
   `spic` is in spice and spicule, `paki` is in Pakistan, `negro` is in negroni,
   and `nigger` folds onto the same shape as Nigeria. Spared whole, so the escape
   cannot be spent on the rest of the same name -- `spice` passes and
   `spice <slur>` does not.

   One deliberate omission, since it is the entry somebody will want to add: the
   country `Niger` is NOT here. Run collapsing makes `nigger` and `Niger` the
   same shape, so sparing the country spares the slur, and a slur that ships is
   worse than a country name that is refused. Its people are spared a word
   later, which is as close as this gets to both. */
const SAFE = [
  "scunthorpe", "spice", "spices", "spiced", "spicy",
  "pakistan", "pakistani", "pakistanis",
  "nigeria", "nigerian", "nigerians",
  "spicule", "spicules", "auspicious", "negroni",
];

/* Letters only: accents taken off, case folded, and the letters that no
   normalisation form can reach spelled out. Every other fold below starts here. */
function lettersOf(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(MARKS, "")
    .toLowerCase()
    .replace(SPECIAL_RE, (c) => SPECIAL[c]);
}

/* Letters, with the digits and symbols that stand in for them. */
function fold(raw: string): string {
  return lettersOf(raw).replace(LEET_RE, (c) => LEET[c]);
}

/* The order the tricks arrive in, as one string. */
function shapeOf(raw: string): string {
  return fold(raw).replace(NON_WORD, "").replace(RUNS, "$1");
}

/* The words a name is made of, for the half of the test that has to know where
   one word ends. Digits and symbols separate here rather than substituting,
   which is what makes `coon88` the word `coon` followed by a number instead of a
   word that merely contains it. No run collapsing either: `kkk` and `K` fold
   onto the same single letter once runs are collapsed, and only the uncollapsed
   form tells them apart -- one is a hate symbol and the other is somebody's
   initial. */
function wordsOf(raw: string): string[] {
  return lettersOf(raw).split(/[^a-z]+/).filter(Boolean);
}

/* A term folded as the word it is, so that the list and SAFE are compared
   against the word somebody actually wrote. */
function wholeOf(raw: string): string {
  return lettersOf(raw).replace(/[^a-z]/g, "");
}

/* Written in ordinary spelling and folded once at load, so the list stays
   readable and correctable. Deliberately short -- the words that will actually
   turn up -- and adding to it is the whole maintenance story. Some entries are
   here because the shape test catches more than the word does: `n4z1` only folds
   onto `nazi` if `nazi` is on this list. */
const BLOCKED_RAW = [
  /* ethnic and racial */
  "nazi", "hitler", "swastika", "white power", "white pride", "kkk",
  "nigger", "nigga", "niglet", "coon", "darkie", "spic", "spick", "wetback",
  "beaner", "chink", "gook", "slant", "raghead", "towelhead", "sandnigger",
  "kike", "hymie", "paki", "jap", "gyp", "wop", "dago", "guido", "polack",
  "gypsy", "redskin", "savage", "injun", "negro", "colored", "mulatto",
  /* sexuality and gender */
  "fag", "faggot", "fagot", "dyke", "tranny", "shemale", "homo",
  /* disability */
  "retard", "retarded", "mongoloid", "spaz", "spastic", "windowlicker",
  /* sexual violence, and the abuse that goes with it */
  "rape", "rapes", "raped", "raping", "rapist", "rapists", "molest",
  "pedo", "pedophile", "paedo", "paedophile",
  "cunt", "whore", "slut", "skank", "bimbo", "hooker",
  /* the tower's own voice. PLACEHOLDER_NAME is the signal that a floor has been
     taken down, and a name that can be bought for a dollar would let anyone
     forge it -- either to dress their own storey up as a redaction or to make a
     redaction look like theirs. */
  PLACEHOLDER_NAME,
  "the tower", "moderator",
];

const BLOCKED = [...new Set(BLOCKED_RAW.map(wholeOf))];
/* The spared words, removed from the shape before it is tested. Longest first,
   so a longer one is taken as a whole rather than leaving its own tail behind. */
const SAFE_RE = new RegExp(
  SAFE.map(shapeOf)
    .sort((a, b) => b.length - a.length)
    .join("|"),
  "g"
);
/* Terms that are ordinary English words, or stems that live inside them, and so
   are never matched as a substring. `rape` is in drape, scrape, trapeze and
   parapet; `rapist` is in therapist and scraping; `homo` is in homophone and
   homogeneous; `pedo` is in pedometer; `savage` and `slant` are words in their
   own right. A bare one of these is still refused -- it simply cannot be caught
   hiding inside a longer word, because the longer word is usually innocent and
   refusing it is the worse mistake. */
const WHOLE_ONLY = new Set([
  "homo", "pedo", "rape", "rapes", "raped", "raping", "rapist", "rapists",
  "slant", "savage", "savages",
]);
/* Long enough not to be a coincidence. Below this a term is only ever matched
   whole; see the note above about `coon` and `Connor`. */
const SUBSTRING_MIN = 4;

/** The folded shape a name is judged on, exposed so a test can read it. */
export function normaliseName(raw: string): string {
  return shapeOf(raw);
}

/** The blocked term a name lands on, or null. The term is for the log and the
    test, never for the person typing: repeating a slur back at someone to tell
    them it is a slur is not a kindness, and the modal says so plainly instead. */
export function blockedName(raw: string): string | null {
  const shape = shapeOf(raw);
  if (!shape) return null;

  /* Escape first, then test, so a spared word cannot shield the rest of the name
     it sits in. */
  const spared = shape.replace(SAFE_RE, "");
  const words = wordsOf(raw);

  for (const term of BLOCKED) {
    const collapsed = shapeOf(term);
    /* The two ways a term can be evidence of intent. A long term caught anywhere
       in the shape survives the `n-a-z-i` disguise; a short one only counts on
       its own, where it cannot be an accident of a longer word. */
    if (collapsed.length >= SUBSTRING_MIN && !WHOLE_ONLY.has(term)) {
      if (spared.includes(collapsed)) return term;
    } else if (words.includes(term)) {
      return term;
    }
  }
  return null;
}

export function readName(raw: unknown): { ok: true; name: string } | { ok: false; message: string } {
  if (typeof raw !== "string") return { ok: false, message: "a floor needs a name" };
  const name = cleanName(raw);
  if (!name) return { ok: false, message: "a floor needs a name" };
  if (chars(name) > NAME_MAX) {
    return { ok: false, message: `${NAME_MAX} characters at most` };
  }
  if (blockedName(name)) {
    return { ok: false, message: "pick a different name" };
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
