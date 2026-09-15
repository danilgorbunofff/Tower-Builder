# Architecture

How the app is put together, and which parts of that are load-bearing. This is written for the
person who is about to make it nicer — the split below looks untidy, and the tidying is what
breaks it.

| Where | What it holds |
| --- | --- |
| **`ARCHITECTURE.md`** (here) | the code, the seams, and the traps |
| [`OVERVIEW.md`](OVERVIEW.md) | the idea end to end, and the laws of the world |
| [`README.md`](README.md) | what it is at a glance, how to run it, and the tooling |
| [`PRODUCT.md`](PRODUCT.md) | product truth — what this is, and what it deliberately is not |

---

## 1 · One page, two halves

The page is a React server component that renders a static frame and then gets out of the way. The
tower is built after mount by an imperative module that owns a subtree of the DOM and never gives
it back.

```
app/page.tsx            the frame + the boot. Decides demo or live. Renders no data.
├── components/frame.tsx     the static chrome: sky column, far layer, pavement, roof, sign, tray
└── components/engine.tsx    "use client" — starts the engine, the poller, the return path
    ├── lib/engine.ts            the world: sky, storeys, camera, rail, order control
    ├── lib/feed.ts              the poller: asks the server what the tower looks like now
    ├── lib/return.ts            what happens when Stripe sends the buyer back
    └── components/order-modal.tsx   the form, which is the only React UI that changes
```

`lib/engine.ts`, `lib/feed.ts`, `lib/live.ts`, `lib/return.ts` and `lib/order.ts` are on the browser
side of that line; `db`, `tower`, `stripe`, `fulfil` and `admin` are server only. `engine.ts` is the
one file with no imports at all, and `order.ts` is the one file *both* sides import — which is the
whole of the moderation story in §6.

| File | Lines | What it is |
| --- | --- | --- |
| `app/globals.css` | ~1,230 | the whole stylesheet: the first 880 lines are `index.html`'s, verbatim |
| `components/frame.tsx` | ~675 | the DOM of `index.html` 928–1575, mechanically transcribed |
| `lib/engine.ts` | ~1,400 | `index.html`'s IIFE, mechanically ported and type-annotated |
| `components/order-modal.tsx` | ~340 | the modal: the form, the copy, and the `fetch` |
| `lib/order.ts` | ~380 | the judge. No imports, because two runtimes import it |

## 2 · Why the engine is not React

`lib/engine.ts` is about 1,400 lines of `var`, one `requestAnimationFrame` loop, and direct DOM
writes. That is not a porting accident. The app it came from was one hand-written `index.html`, and
the port's entire acceptance test is that the art did not move — `baseline/verify-port.mjs` proves
the port is the original *line for line*, modulo declared type annotations and declared additions.

Three consequences, and they are the rules of this file:

- **React renders none of the tower.** `components/frame.tsx` renders the chrome with `#stack`,
  `#skyBands`, `#worldField` and the star field *empty*, and the engine fills them. React never
  re-renders any of it, so there is no reconciliation to fight and no diffing of four dozen
  storeys per frame.
- **There is exactly one writer per node.** Everything the engine owns, React renders once and
  forgets. Everything React owns, the engine reads but does not write — with one deliberate
  exception, `#note`, whose text is swapped when payments go live (see §4).
- **The engine's vocabulary is the original's.** `spec`, `hash`, `makeFloor`, `frame`, `rewindow`,
  `relight`, `setTok` keep their names, their shapes and their line order. Renaming them to be
  idiomatic would break the verifier, and the verifier is the reason the art is trustworthy.

So: `var` is deliberate, the `!` non-null assertions are deliberate, and the module cannot import
anything. Resist all three.

## 3 · The seams the engine grew

The port added a handful of things to `index.html`'s engine and nothing else.
`baseline/verify-port.mjs` declares every one of them by name, line by line, and reports `MATCH` when
the file is exactly the original plus those additions:

| The seam | Where | What it is |
| --- | --- | --- |
| **`RemoteFloor`** | `engine.ts:41` | a storey the server knows about: `{no, name, url?}` |
| **`residents`** | `engine.ts:110` | server-named storeys, so `nameFor()` can answer with a real name |
| **`hoardings`** | `engine.ts:122` | the same, for links, kept separate because most floors have none |
| **the hoarding's link** | `engine.ts:241` | the wrap that turns a bought floor's name into an `<a>`, and the CSS that styles it |
| **`towerGrew` / `landStorey` / `applyTower`** | `engine.ts:1126`–`1210` | the poller's whole interface: an updated count, and the storeys that came with it |

`applyTower` is the only way anything outside the engine can grow the tower, and it exists so that
a floor landing at the top does not move whoever is looking at the street. The camera's own
behaviour is untouched: the engine decides where to look, and the server only ever says what
exists.

## 4 · Demo mode, and the switch that matters

Half of this app is a demo and that is a supported state, not a missing feature. With either
`DATABASE_URL` or `STRIPE_SECRET_KEY` absent the page is exactly the prototype it always was:
`#order` builds floors in the browser, nothing is charged, `/api/tower` answers `{demo: true}`, and
the poller stops on its first response and never asks again.

That state is load-bearing. **Every capture in `baseline/` was taken in it**, which is what lets
`baseline/compare.mjs` hold the port to the original reading for reading. A build that quietly
turned the demo on or off would invalidate the whole measurement, so the switch is one expression
in one place:

```ts
const paymentsLive = dbConfigured() && stripeConfigured();
```

**Both, not either.** Money without a database would take a card and have nowhere to put the floor.

Two details follow from that, and both are easy to "fix" wrongly:

- **`app/page.tsx` is `force-dynamic`.** The switch is an environment fact, and an environment fact
  read during a prerender is frozen into the HTML at build time — a deployment that set its keys
  after the build would keep serving a page that believed it was a demo, with the tray saying
  *nothing is charged* while the button charged.
- **The tray's one line of copy is swapped from a script** (`lib/live.ts`), not from JSX, because
  `components/frame.tsx` is held to `index.html` character for character by `baseline/domdiff.mjs`.
  It refuses to swap when the link carries `?n=`, because a sample tower's own warning outranks it.

With `paymentsLive`, the engine's `buy()` returns early and hands the order to React instead of
building anything, and floors only ever appear once the server says they were paid for.

## 5 · The server half

Five routes, all Node runtime, all deliberately small:

| Route | What it does |
| --- | --- |
| `GET /api/tower?since=` | the count and the new storeys above `since`, redacted. `{demo:true}` with no database |
| `POST /api/checkout` | validates the order with `lib/order.ts`, then creates a Checkout Session |
| `POST /api/stripe/webhook` | verifies the signature, then fulfils `checkout.session.completed` |
| `GET /api/checkout/session?id=` | the same `fulfil()`, for a webhook that never arrived |
| `POST /api/admin/hide` | the takedown. Secret-gated, not linked from anywhere |

`lib/tower.ts` holds every statement that matters, so the route, the webhook and the tests all
exercise the same SQL. Three tables, and one rule that holds them together:

- `tower_state` — one row, the count.
- `floors` — one row per storey, `no` ascending and contiguous, never reused.
- `purchases` — one row per Checkout Session. **The primary key is the session id, and that is the
  entire idempotency story**: a replayed webhook conflicts, and the transaction then finds there is
  nothing left to do.

The count and the ledger only ever move together, inside one transaction, in one order:
`BEGIN` → insert the purchase (conflict? roll back and report a replay) → `UPDATE tower_state …
RETURNING count - $1 AS lo` → insert the block with `generate_series` → `COMMIT`. The `UPDATE …`
takes a row lock, which is what makes two buyers one second apart get contiguous floors instead of
a race.

## 6 · Moderation

This is the one place the product bends its own promise, so it is worth being precise about how far
it bends. `OVERVIEW.md` §1 promises a storey is permanent, and §6's seventh law says nothing is ever
deleted. Both still hold:

- **The name is judged where it is typed and again where it is stored.** `lib/order.ts` is a single
  dependency-free module imported by both the browser bundle and the server, so there is no second
  opinion to drift: the modal refuses a name before it makes a request, and `/api/checkout` refuses
  the same name before it speaks to Stripe, and `lib/fulfil.ts` checks a third time when the webhook
  arrives — a name that was fine at the checkout and is not fine later is replaced with
  `PLACEHOLDER_NAME` and the floor is still built, because the dollar was taken.
- **Nothing is deleted to take something down.** `POST /api/admin/hide` flips `floors.hidden`, and
  the redaction happens on the way *out* of the database, in `lib/tower.ts`. The storey keeps its
  number and keeps counting toward the height; what goes is the words.
- **Redaction is a type, not a branch.** The server hands out `ShippedFloor`, which has no `hidden`
  field, so no consumer can ask whether a floor was taken down and start drawing it differently. The
  real name never enters the response body at all — hiding it in the browser would have left it in
  the JSON.
- **A floor's link is an allowlist**: `http` and `https` only, no credentials in the authority,
  length-capped, rendered with `rel="noopener noreferrer ugc"`. The hoarding itself only shows on the
  newest storey, and the anchor wraps the name rather than sitting beside it, so the hoarding's text
  is character for character what it was before links existed.

## 7 · How it is verified

By number, never by eye. Two instruments do most of the work, and both run locally against no
network at all:

```sh
node baseline/verify-port.mjs        # is lib/engine.ts still index.html's engine, line for line?
node baseline/domdiff.mjs            # is components/frame.tsx still index.html's DOM, node for node?
```

`verify-port.mjs` walks both files as a strict line sequence and reports identical, annotated,
re-indented, added and block counts. **Every deliberate addition to `lib/engine.ts` must be declared
in its `ADDED` / `ADDED_BLOCKS` tables**, including the blank lines that separate an added block
from the code around it — a new block whose surrounding whitespace is not declared is reported as
"extra `""`".

The art gate is a pair of captures and a diff:

```sh
node baseline/fontserver.mjs                                   # in another shell, port 58695
node baseline/run-probes.mjs --base http://127.0.0.1:3000 --out after --force
node baseline/compare.mjs baseline/fonts after                 # 27 reading files, MATCH
```

`baseline/fonts/` holds the readings taken from the original `index.html`; `after/` holds the same
readings taken from this app. `after/` is throwaway and is regenerated per run.

The behaviour gates are the phase tests, and they need a database:

```sh
npm run db:test              # the data layer: numbering, idempotency, the read window
node tools/test-phase5.mjs   # the money: the clamp, the order, replays, concurrent purchases
node tools/test-phase6.mjs   # the judge, the link rule, the redaction, and the takedown door
```

`test-phase5.mjs` and `test-phase6.mjs` both detect what the running server is configured for and
say so out loud rather than assuming — a route answering 503 is a supported state, not a failure.

## 8 · The traps

Each of these cost real time here, and each looks like something else:

- **Measure layout, never a raw rect.** A landing storey animates in a full storey above its slot
  and `getBoundingClientRect()` includes that translate. Every layout read goes through the
  harness's own `layY()`.
- **Never diff two screenshots.** The stars randomise per load, so two captures of the *same* URL
  differ across the whole frame. Only ever measure within one frame.
- **`allowedDevOrigins` is not optional in dev.** Next refuses any `/_next/*` fetch whose origin is
  not the dev server's own host, and the failure is silent: the page still returns 200 with the
  server-rendered frame, React never hydrates, and every probe reports "the tower did not build".
  `next.config.ts` allows `127.0.0.1` for exactly this reason. There is no such check in a
  production build.
- **Every probe URL carries `?n=120`.** A bare URL is a different page: `#note` is script-owned for
  `?n=`, and the note is what says the tower you are looking at is a sample.
- **`process.loadEnvFile` throws when there is no `.env.local`.** Every tool wraps it.
- **Starting the engine twice is harmless on purpose.** It stamps `#stage` and refuses a second
  boot, which is what keeps React's development-only StrictMode mount/unmount/mount from building
  two towers.

## 9 · Deploying it

Vercel, a Node runtime, and a Neon Postgres in the same region as the functions — a poll every five
seconds crossing an ocean is the one latency anybody would notice. Four variables to supply and one
optional override, all written down in `.env.example`:

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | everything. Use Neon's **pooled** endpoint |
| `STRIPE_SECRET_KEY` | taking money. Both this *and* a database turn the demo off |
| `STRIPE_WEBHOOK_SECRET` | the webhook, registered at `https://<domain>/api/stripe/webhook` |
| `TOWER_ADMIN_SECRET` | the takedown only. Unset, that route answers 503 and moderation is psql |
| `NEXT_PUBLIC_SITE_URL` | optional; the buyer's return origin when something rewrites `Host` |

Keep payment methods to **cards only**. Delayed and buy-now-pay-later methods add fixed fees at $1
and an `async_payment_succeeded` path this app does not have.

Run `npm run db:migrate` against the production database once. The schema is idempotent and never
deletes anything.
