import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { MAX_BATCH, readOrder } from "@/lib/order.ts";
import { getStripe, siteOrigin, stripeConfigured } from "@/lib/stripe.ts";

/* A Session is created against the live Stripe API every time, so this route
   must never be prerendered or cached. Same reasoning as /api/tower. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* ── opening the door ───────────────────────────────────────────────────────
   One floor, one dollar. The order is judged before Stripe is spoken to, so
   someone with a 40-character name is told that rather than being sent to a
   card form and bounced back out of it.

   The order of the two checks matters. Validation comes first so a bad request
   gets a 400 that says what is wrong, and only then does the absence of a key
   turn into a 503 -- if the key check came first, an unconfigured deployment
   would answer every malformed request with "payments are not set up", which
   is true but useless. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "that request was not readable" }, { status: 400 });
  }

  /* The client already ran this. Running it again is the point: the modal is a
     convenience, and a request can be written by hand with curl. */
  const reading = readOrder(body);
  if (!reading.ok) {
    return NextResponse.json({ problems: reading.problems }, { status: 400 });
  }
  const { n, name, url, attempt } = reading.order;

  if (!stripeConfigured()) {
    /* 503 and not 200-with-nothing, so the modal can tell "money is off" apart
       from "your order was refused", and say so without blaming the buyer for
       a missing environment variable. */
    return NextResponse.json({ error: "payments are not set up yet" }, { status: 503 });
  }

  const origin = siteOrigin(request);

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: n,
        price_data: {
          currency: "usd",
          unit_amount: 100,
          product_data: {
            name: n === 1 ? "One floor" : `${n} floors`,
            description: "One dollar a floor. Floors are never removed.",
          },
        },
      },
    ],
    /* Carried on the session because the webhook runs later, in a different
       process, holding a session object and nothing else. These are the only
       two values that have to survive the trip; the count does not, because
       `amount_total` already carries it. */
    metadata: { name, url: url ?? "" },
    payment_intent_data: { metadata: { name, url: url ?? "", floors: String(n) } },
    client_reference_id: attempt,
    success_url: `${origin}/?paid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/`,
  };

  try {
    /* ── why the idempotency key ──────────────────────────────────────────
       A double-click on "pay" would otherwise open two Sessions for the same
       press of the button, and pay for two towers. One `attempt` id is minted
       per press, so both clicks carry the same key and Stripe answers the
       second with the first Session it created.

       It is also why the modal mints a *new* id after a completed order and
       why it keeps the same one across a retry: the id means "this attempt",
       not "this user" and not "this request". */
    const session = await getStripe().checkout.sessions.create(params, {
      idempotencyKey: `tower-order-${attempt}`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "stripe did not return a checkout page" }, { status: 502 });
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    /* Stripe's own message can name the account, the key mode, or an internal
       parameter. None of that belongs in a response body, so it is logged and
       the buyer gets a sentence. */
    console.error("checkout session creation failed", error);
    return NextResponse.json(
      { error: `the till is jammed -- try again in a moment (${MAX_BATCH} floors max)` },
      { status: 502 }
    );
  }
}
