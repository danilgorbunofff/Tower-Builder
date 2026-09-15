# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Indie makers, solo founders, and small site owners who want a click from a curious audience and
are willing to pay a trivial amount for it. They arrive from a launch post or a shared link, in a
curious, skimming mood, on desktop and phone equally. Their job: *"Put my name and link somewhere
visible, cheaply, and let me see who else is there."*

A second audience never pays: people who come to **watch the tower grow** — who just took the top,
how crooked the new block landed, how tall it's getting. The drama is free and it is what brings
them back.

## Product Purpose

A public tower where every floor was bought for exactly $1. Pay $1 and a floor is added on top of
the stack; everything below stays where it is and the newest floor is the one that just arrived.
**One payment can buy several floors** — the buyer holds the button to charge up an order and one
charge builds them all. Each floor has its own windows, curtain, balcony and residents, derived
deterministically from its floor number — so a floor's *art* is a function of its number rather than
a stored drawing. Only the two things a buyer chooses, the name and the link, are stored. Storeys are
rendered from a moving window of about four dozen around the camera, so a thousand-floor tower is not
a thousand rows on screen.
**The tower never falls.** Every floor ever bought stays **forever**, so the page accumulates into a
monument instead of decaying. The one exception is a floor whose words break the rules: its name or
link comes down and **its height does not move** — the storey keeps its number, keeps its place in
the stack, and keeps counting toward how tall the tower is.

Success: the tower keeps growing, people return to see how tall it has become, and the next floor is
always one dollar away.

## Positioning

**One fixed price. No auction, no bidding war, no strategy.** The entire transaction is
"$1 and you're on top."

This is the deliberately *non-competitive* end of the pay-for-a-spot genre. The boards it sits
beside escalate to hundreds or thousands of dollars and turn into a wallet contest; this one refuses
to. Nobody can outspend you meaningfully — the maximum anyone can beat you by is one dollar.

The second half of the claim is **permanence**: nothing is ever deleted, expired, or rotated out.
$1 buys a permanent line in a growing public record, not a fleeting ad slot. A floor can be
**redacted** — words removed, floor kept — and that is the only thing that ever changes about a
floor that has landed.

## Operating Context

- Reached from a launch post or shared link; must explain itself in a single viewport with no instructions.
- Read on phones as often as desktop, usually one-handed.
- The tower is read from the top down; the newest block is the entire draw, and height is the proof.
- Nobody reads a list of a thousand rows, so height has to land as a **shape**, not as a table.
- Buyers arrived from a link they were handed seconds ago; patience and attention are both minimal.
- Payment must complete without creating an account.

## Capabilities and Constraints

Confirmed:

- One fixed price: **$1 per floor**. No tiers, no bidding, no escalating minimum.
- **More floors may be bought in a single payment.** Holding the primary control charges up an order
  (one floor per tick, capped) and one release is one charge for N floors. Adding a floor never adds a
  screen, a cart, a stepper, or a second control.
- Buying **adds a floor on top of the tower**; everything below keeps its place.
- Floors are **permanent** — never expire, never deleted, never rotated out. If a floor's name or
  link has to come down, the redaction removes the words and nothing else: the number, the place in
  the stack and the count all stay.
- A floor shows a **name plus one link**. The name is checked as it is typed and checked again
  before the floor is built; a link must be `http` or `https`, with nothing before the host.
- **Payments run through Stripe Checkout, cards only** — no account, no embedded form, no second
  provider. With no keys configured the page is a demo that charges nothing, and that state is
  supported rather than broken: the control still builds floors, in the browser, for free.
- The tower stays **readable as height**: the newest floor is the draw and the top of the stack.
- **Growth is visible.** A purchase moves the building: the new storey lands in the sky at once and
  the view then eases back down one storey. A storey is always the same storey — the floor height is
  fixed at its design value and never shrinks or overlaps as the tower grows. While the tower is
  short the roofline climbs into the sky; once the frame is full the camera takes over, riding up
  the tower one storey per purchase with the newest floor always the one under the roof. A building
  cannot grow past its window, so past that point the camera, not the storeys, is what moves.
- **The building stands on the pavement, not through it.** The camera is clipped on the scene art's
  own sidewalk line, so no storey is ever drawn over the street; the lamps and passers-by sit in
  front of the base.
- **The whole world falls with the camera.** A purchase does not only add a floor — it makes the city
  lower. Clouds, skyline, sidewalk, street and the clip line all drop by exactly one storey on the
  same beat as the building, so the tower reads as climbing rather than the base sinking into the
  road. Nothing lags at a different rate and nothing tears: the building rides *inside* the falling
  camera, so its base and its cut line can never drift apart.
- **The climb is long, and it is the visitor's.** The sky is six frames deep, running from a haze over
  the roofs, past the sun, through sunset and night, and out into space; the stars and the moon fade
  in with altitude, because you climb out of the light that hides them rather than up to them. The
  distant skyline creeps at a twentieth of the climb, and the storeys, the air and the street all
  move together at exactly 1x.
- **The tower can be walked.** Scrolling *is* the climb: the rail is exactly as long as the tower
  stands above the frame, so the top of the rail is the newest floor under the roof and the bottom of
  it is the street. A hand on the wheel takes over from the animation at once, and a ghosted arrow
  returns to the top — it appears only once the roof is out of frame, so it never claims there is
  somewhere to go.
- **The far sky is the one place depth can be spent.** Above the light, ten small worlds ride the
  frame's far layer alongside the moon, held at the same twentieth of the climb she is, drawn
  *behind* her disc so she occludes any world that crosses her, and faded to a fraction of her own
  opacity. They are smaller than her, dimmer than her, and never brighter than a star.
- **Only the storeys you can see are painted.** The page holds a moving window of about four dozen
  storeys around the camera, never the whole tower. Each storey's place in the world is fixed by its
  number alone and is independent of that window, so nothing shifts or jitters as it slides — a
  thousand-floor tower scrolls as smoothly as a ten-floor one.
- The page carries a **single dominant call to action** and nothing that competes with it.

Undecided — future work must not invent these:

- Whether a buyer can edit, rename, or remove their own floor later.
- Any free, sponsored, or seeded floors.

Decided, and not to be reopened by accident:

- **Payment provider: Stripe Checkout** (cards only), fulfilled by webhook and reconciled by the
  buyer's return. Configured by `DATABASE_URL` and `STRIPE_SECRET_KEY`; absent either, the page is
  the demo.
- **Moderation: validate at entry, publish immediately, take down privately.** Names and links are
  judged in the browser before the request and again on the server before the floor is built, and a
  floor that gets through can be redacted out of band. Nothing is ever deleted to do it.

## Brand Commitments

No existing name, logo, palette, or voice was committed by the user at the start.
Working title: **The $1 Ladder**. The name has since settled, in the repo, the page and these docs,
as **The $1 Floor** — and the visual direction, "Short-Order Pass", is what recast the ladder as a
stack of orders. The built world followed the name rather than the other way round.

## Evidence on Hand

No real blocks, buyers, traffic, or revenue exist. **The tower is empty at launch.**
No testimonials, customer logos, rung counts, press mentions, or traffic numbers may be fabricated.

## Product Principles

1. **One price, one action.** Any added choice taxes a purchase that should take five seconds. Buying
   ten floors is still one action and one charge.
2. **The page is the product.** No dashboard, no settings, no onboarding, no accounts.
3. **Permanence is the value.** $1 buys a line that never disappears — protect that above all. The
   only permitted change to a landed floor is that its words can be taken down; anything that would
   move, renumber, hide, or delete the *storey* is out of bounds.
4. **Growth is the proof.** An empty tower looks broken; a tall one looks alive. Every block stays visible, and height must land at a glance even at thousands of blocks.
5. **Losing is cheap.** Being pushed down costs a dollar, not a fortune. Keep the tone playful, never adversarial.

## Accessibility & Inclusion

- The single primary action must be keyboard and screen-reader operable, and reachable without scrolling.
- The climb is a focusable scroll region, so the whole tower is walkable from the keyboard, and the
  way back to the top is a real button, not a gesture.
- The primary control must comfortably exceed 44×44px.
- The tower must stay legible at 200% text zoom and in forced-colors / high-contrast mode.
