# The $1 Floor — the whole picture

**One dollar, one floor.** A public pixel-art apartment tower where every storey was bought for
exactly $1. Pay, and a floor is added on top of the stack: its windows warm up, somebody moves in,
and the camera rises one storey. Nothing is ever removed.

This document is the overview — the idea, the business, the machinery, and the laws that hold it
together. It is written to be read top to bottom, and it links out rather than restating.

| Where | What it holds |
| --- | --- |
| **`OVERVIEW.md`** (here) | the pitch end to end, and how the app is actually built |
| [`README.md`](README.md) | what it is at a glance, how to run it, and the tooling |
| [`PRODUCT.md`](PRODUCT.md) | product truth — users, positioning, confirmed capabilities, and what is deliberately still open |
| `index.html` header | the DIRECTION CONTRACT — the art thesis, the own-world, the story, the form |
| [`archive/v1-bricks.html`](archive/v1-bricks.html) | the abandoned first world, kept for reference |

![The tower at street level](screenshots/hero-desktop.png)

---

## 1 · The pitch

The tower *is* the chart. There is no leaderboard, no dashboard and no table of a thousand rows —
there is a building, and its height is the only number that matters. A visitor arrives, sees a
tower, and understands the entire product in one viewport without reading a word of instruction:
somebody paid a dollar, and a floor went up.

It sits at the deliberately **non-competitive end of the pay-for-a-spot genre**. The boards it sits
beside escalate to hundreds or thousands of dollars and turn into a wallet contest. This one refuses
to: one fixed price, no tiers, no bidding, no escalating minimum. The most anyone can beat you by is
one dollar, and that is a design constraint, not a coincidence.

The second half of the claim is **permanence**. A dollar buys a permanent line in a growing public
record, not a rented ad slot. Floors never expire, are never rotated out, and are never deleted —
which is what lets the page accumulate into a monument instead of decaying into a feed.

## 2 · The visitor's loop

Everything in the codebase exists to serve this sequence, and it is worth holding in mind while
reading the technical half:

1. **Arrive** from a launch post or a link somebody handed them seconds ago.
2. **Understand** it in a single viewport, with no instructions, no onboarding and no account.
3. **Press once** for one floor — or **hold** to charge up an order, because one charge buys all of
   them. Buying ten floors is still one action and one payment.
4. **A storey lands.** Its windows warm up, a resident moves in, and the newest name goes on the
   tower sign.
5. **The whole city falls one storey.** The sky, the skyline, the street and the clip line all drop
   on the same beat, so the tower reads as *climbing* rather than as the base sinking into the road.
6. **Scroll back down** and walk the entire tower — past the sun, through sunset, into the dark and
   out into space — then take the arrow back to the top.

Steps 4 and 5 are the entire emotional payload, and almost all of the engineering below exists to
make them land on the same frame.

## 3 · Who pays, and who just watches

**The buyer** is an indie maker, solo founder or small site owner who wants a click from a curious
audience and is willing to pay a trivial amount for it. They arrived from a link, they are in a
skimming mood, and their job is: *put my name and link somewhere visible, cheaply, and let me see who
else is there.* Payment has to complete without creating an account.

**The audience that never pays** is just as much a part of the product: people who come to watch the
tower grow. Who just took the top, how crooked the new block landed, how tall it is getting. That
drama is free, and it is what brings people back — which is the thing the buyers are actually buying
attention from.

`PRODUCT.md` owns this in full, including the accessibility commitments.

## 4 · The money

**$1 per floor. One price, no exceptions.** There is no way to spend more per floor than anybody
else, which is the whole point of the positioning.

**N floors is one charge, not N charges.** This is worth stating plainly because it is the obvious
failure mode of the idea: if building ten floors meant ten trips through checkout, nobody would ever
build ten floors. So the primary control is *hold-to-charge* — holding counts floors into a pending
order, and one release becomes a single payment for that many. The button's own label, price and
meter change while it charges. No cart, no stepper, no second control, no second screen.

**What is decided:** the price, the permanence, and the one-charge-for-N-floors flow.

**What is deliberately open** — and future work must not invent an answer:

- **The payment provider.** The reference flow assumes Stripe Checkout, and the prototype ships with
  payments **off**. Nothing here takes money.
- **Who carries the tax.** On a $1 cross-border sale, the question is whether to use a
  merchant-of-record so they absorb VAT and compliance, or to stay on Stripe and handle tax
  ourselves. At this price point the fee structure is not a rounding error — it is the business
  model.
- Moderation for offensive names and links, and whether a buyer may later edit or remove their floor.

There are **no buyers, no revenue and no traffic yet**. The tower is empty at launch, and this
document does not pretend otherwise.

## 5 · How it is built

### The single file

The whole app is one hand-written `index.html` — about 2,780 lines, no build step, no framework, no
bundler, no dependency graph. Open the file and it runs. At this size that is a feature rather than a
stunt: there is nothing between the source and the pixels, and the whole product can be read in an
afternoon.

It has three layers, in order:

| Lines | Layer | What lives there |
| --- | --- | --- |
| `43–924` | **CSS** | the tokens, the layout, the sky, the climb, the tower, the street, the sign, the tray and the media queries |
| `926–1576` | **DOM** | the sky SVG (bands, stars, worlds, moon), the camera and tower, the scroll rail, the signboard, the button |
| `1577–2776` | **JS** | one IIFE — the floor spec, the camera, the sky builders, the window, the rail, and the purchase |

The CSS is organised by the same section banners the JS uses (`tokens` at 44, `sky` at 163, `the
climb` at 211, `the tower` at 334, `tray + button` at 743). *Line numbers are as of this commit; trust
the banners, not the numbers.*

### A floor is a pure function of its number

This is the decision the rest of the app is built on. **There is no database of floors and no table
of rows — the tower is a counter.** A floor's entire appearance is derived from its number by
`spec(no)` (line 1650), fed by `hash()` (1626), which is a small integer-mixing function:

```js
function spec(no){
  // three windows, each lit or dark, 74% lit
  // a curtain colour, a balcony maybe, a thing on the sill, a belt every tenth
}
```

So **floor 37 looks like floor 37 for everyone, forever.** A shared link shows the same building, a
reload never reshuffles anybody's curtains, and the server never has to store what a floor looks
like — only that it exists. The residents' names come from the same trick (`nameFor()`, 1664), drawn
from a fixed sample list. Determinism here is not a performance optimisation; it is what makes the
tower a shared object rather than a private one.

### The camera and the rail

**A storey is a storey.** A dollar always buys the same height of building, at every floor count and
every window size — the storey height is fixed by the design and never shrinks or overlaps as the
tower grows. While the tower is short, the roofline climbs into the sky. Once the frame is full, the
**camera** takes over, riding up the tower one storey per purchase with the newest floor always the
one under the roof.

Two consequences fall out of that, and both are load-bearing:

- **The roofline is the one thing that never goes missing**, so every budget in the layout is
  measured from it rather than from the stack.
- **Scrolling is the climb.** The rail is exactly as long as the tower stands above the frame, so
  the distance you can scroll *is* the height you have built: the bottom of the rail is the street
  and the top of it is the newest floor under the roof.

`frame()` (2400) is the only place the world's position is computed, and it runs once per animation
frame. It turns the hand's position into CSS custom properties on the root:

| Property | Meaning |
| --- | --- |
| `--pan` | the scroll position, in screen pixels |
| `--pan-u` | the same number in the **art's own units** (`pan / scale`) |
| `--pan-far` | the far layer: `pan-u × FAR`, a twentieth of the climb |
| `--fh`, `--wh` | the storey height and window height actually in use |
| `--drop` | where the painted window's base sits in the world |
| `--star-op`, `--moon-op` | the fades, driven by altitude |

Writes are deduplicated by `setTok()` (1644) — writing a custom property on the root recalculates the
whole document, so nothing is written unless it actually changed.

### The window

A tower of a thousand floors must scroll exactly as smoothly as one of ten. So **the page holds a
moving window of about four dozen storeys** (`RENDER_CAP = 48`, line 1608) around the camera, never
the whole tower.

The subtle part is *what the window follows*. It follows the **camera**, not the newest floor — if it
followed the newest floor, a camera parked halfway up a hundred-storey tower would be looking at a
storey the window had already thrown away, and the frame would come up empty sky. Storeys enter and
leave at both ends, and `--drop` carries the window's base to its world height, which is what makes
the exchange invisible: a storey does not move when the window slides past it.

Each storey's place in the world is fixed by its number alone and is independent of the window — so
nothing shifts or jitters as it slides.

### The sky

The sky is a **column of flat bands with dithered checkerboard seams, never a gradient** — the tower
climbs *through* them, so the sky has to be deep enough to still be a sky eighty storeys up.
`buildSky()` (1918) lays one band per phase of the day; `checker()` (1908) dithers each seam on the
2-unit grid both the art and the tower are drawn on, so the transitions read as pixel art rather than
as a blur.

**The stars and the moon are not climbed *to*.** They fade in on altitude — `STAR_AT`, `MOON_AT`,
`SPACE_AT` (line 1874) — because what hides them is the light, not a floor number. You climb *out of*
the light that hides them.

Everything falls at exactly 1× with the camera except the far layer, which creeps at `FAR = 0.05`
(1878), a twentieth of the climb, the way a real sky holds almost still while you leave it. The ten
small worlds ride that same rail: they are children of the far layer, painted **behind the moon's
disc** so she occludes any world that crosses her, and dimmed to a fraction of her own fade. They are
smaller than her, dimmer than her, and never brighter than a star — because **in a flat sky, depth is
brightness and paint order and nothing else.**

![Deep space, with the moon and the small worlds](screenshots/deep-space-desktop.png)

### The purchase

`addFloor()` (2566) is the function that builds a storey — and in production it is **never called by
the browser on click**. Stripe calls it, once per floor, after `checkout.session.completed` with
`payment_status` paid. The client shows nothing until the server has the payment.

Holding does **not** buy anything per tick. It only counts: the pending order grows, and one release
becomes one payment of $N.

| Constant | Value | What it governs |
| --- | --- | --- |
| `MAX_BATCH` | `50` | the most floors one order may carry — mirrors the server-side cap |
| `TICK_MS` | `140` | one floor per tick while held |
| `HOLD_ARM_MS` | `320` | the delay before charging starts, so a tap stays a tap |

`click` is the single source of truth, because the keyboard fires it with `detail 0` and a tap fires
it after `pointerup`; a hold simply eats its own click.

## 6 · The laws of the world

These are not preferences. Violating any of them breaks the design in a way that is visible
immediately:

1. **Nothing lands off the 4px grid.** The whole page is drawn on it, tower and sky alike.
2. **A storey is always the same storey.** The floor height is fixed at its design value and never
   shrinks or overlaps as the tower grows.
3. **The roofline never goes missing**, so every layout budget is measured from it, not from the
   stack.
4. **The building stands on the pavement, not through it.** The camera is clipped on the scene art's
   own sidewalk line, so no storey is ever drawn over the street.
5. **The whole world falls together.** Nothing lags at a different rate and nothing tears — the
   building rides *inside* the falling camera, so its base and its cut line can never drift apart.
6. **Depth is brightness and paint order**, and nothing else. There is no perspective in a flat sky.
7. **Nothing is ever deleted.** Permanence is the value.
8. **One dominant call to action**, and nothing that competes with it.

## 7 · Key constants

The numbers that define the world. Each is named where it is set, and changing one usually means
changing another.

| Constant | Value | Set at | What it is |
| --- | --- | --- | --- |
| `--u` | `4px` | 47 | the grid everything is drawn on |
| `--bw0` / `--fh0` | `220px` / `52px` | 77–78 | the building's width and the storey height at full size |
| `--slab` | `4px` | 87 | the facade's slab; `--fh` must equal `4 slab + 4 sill + --wh + 12 header` |
| `--crown-gap` | `120px` | 90 | how much sky the roofline keeps above it |
| `RENDER_CAP` | `48` | 1608 | storeys in the DOM — about 2,500px of facade |
| `ART_W`, `ART_H`, `ART_GROUND` | `360`, `216`, `190` | 1808 | the scene art box, and the sidewalk line the camera clips to |
| `STAR_AT`, `MOON_AT`, `SPACE_AT` | `900`, `1010`, `1540` | 1874 | the altitudes where the stars and the moon fade in |
| `FAR` | `0.05` | 1878 | the far layer's creep — a twentieth of the climb |
| `STAR_TOP` | `-4600` | 1890 | how deep the star field is written |
| `WORLD_GAP`, `WORLD_BASE` | `60`, `64` | 2055–2056 | spacing and start of the world ladder |
| `MAX_BATCH`, `TICK_MS`, `HOLD_ARM_MS` | `50`, `140`, `320` | 2598–2600 | the batch order's ceiling and feel |

The storey height is not constant across viewports — it steps down at small sizes (`--fh0` is `48px`
at 854 and `44px` at 867), and the tower's own width steps with it. Everything else holds.

## 8 · Where to look for what

- **The floor** — `hash()` 1626, `spec()` 1650, `nameFor()` 1664, `makeFloor()` 1668, `relight()` 1742.
- **The window** — `rewindow()` 1764, the comment at 1751.
- **The camera and the rail** — `frame()` 2400, `armRest()` 2490, `moveScroll()` 2512, `refit()` 2522.
- **The sky** — `buildSky()` 1918, `checker()` 1908, `rng()`/`buildStars()` 1953–1961.
- **The worlds and their floating props** — `WORLDS` table 2089, `readBand()` 2109, `placeWorlds()`
  2162, `placeProps()` 2225, `buildWorlds()` 2264.
- **The purchase** — `addFloor()` 2566, `showPending()` 2605, `buy()` 2618, `press()` 2651.
- **Everything else** — `tools/` for the instruments, `PRODUCT.md` for product truth.

## 9 · How it is verified

This project is checked by **number, not by eye**, which is why `tools/` exists and why it is
committed rather than kept to one machine. `shoot.mjs` drives the page over the Chrome DevTools
Protocol, waits for a genuinely settled frame, screenshots it across viewports, and then evaluates a
probe *inside* the page. `sky.mjs` takes a captured frame apart into a colour census and a luminance
histogram; `crop.mjs` and `find.mjs` stand in for eyes that cannot be trusted at 4px.

`README.md` documents the tools in full. Two traps are worth repeating, because both cost real time
here:

- **Measure layout, never a raw rect.** A landing storey animates in a full storey above its slot,
  and `getBoundingClientRect()` includes that translate — so every layout read goes through the
  harness's own `layY()`.
- **Never diff two screenshots.** The stars randomise per load, so two captures of the *same* URL
  differ across the whole frame. Only ever measure within a single frame.

## 10 · Not built yet

Mirroring `PRODUCT.md`'s *Undecided* list, so the two cannot drift:

- **Payments are off.** No provider is wired up and nothing takes money.
- **Moderation** for offensive names and links.
- **Whether a buyer may edit or remove their own floor.**
- **Any free, sponsored or seeded floors** — there are none, and the launch tower is empty.

`PRODUCT.md` is the document that says what this is *not*. Read it before adding a feature.
