import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { fulfil } from "@/lib/fulfil.ts";
import { getStripe, stripeConfigured, webhookSecret } from "@/lib/stripe.ts";

/* Node, not Edge: this needs `stripe.webhooks.constructEvent`, which verifies an
   HMAC in Node's crypto. The raw request body is also the whole contract here,
   so this route must not be given a pre-parsed one. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ── the webhook ────────────────────────────────────────────────────────────
   This is where money becomes height. Stripe calls it; nothing else does.

   Two things about it are load-bearing and both are easy to get wrong:

   1. The signature is checked against the *raw body*, so `await request.text()`
      and never `await request.json()`. Re-serialising a parsed object changes
      key order and whitespace, and the HMAC is over the exact bytes Stripe
      sent -- so a JSON-parsed body verifies as a forgery. That is also why
      nothing may read the body before this line.

   2. Stripe retries. It retries because a request timed out, because it got a
      500, and sometimes because it felt like it -- at-least-once delivery is
      the contract, so the same event *will* arrive more than once and a second
      arrival is normal rather than suspicious. The replay guard is not here;
      it is the primary key on `purchases` and the `ON CONFLICT DO NOTHING` in
      applyPurchase. This handler only has to be safe to run twice. */
export async function POST(request: Request) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    /* Unconfigured deployments should not be pointing Stripe at themselves at
       all, but if one is, saying so plainly beats a 500 that looks like an
       outage and gets retried for three days. */
    return NextResponse.json({ error: "payments are not set up yet" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "no signature" }, { status: 400 });
  }

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, webhookSecret());
  } catch (error) {
    /* 400, and deliberately nothing useful in the body: whoever sent this
       either has the wrong secret or is not Stripe, and neither party needs
       help from us. */
    console.error("stripe webhook signature rejected", error);
    return NextResponse.json({ error: "signature rejected" }, { status: 400 });
  }

  /* `completed` covers every card payment. `async_payment_succeeded` is for the
     methods that settle later -- the project takes cards only, so it cannot
     fire today, but handling it costs one line now and would otherwise be a
     silently missed payment on the day a second method is switched on in the
     Stripe dashboard, which is a change that never touches this repository. */
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return NextResponse.json({ ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    /* A session can complete without being paid (a delayed method that has not
       settled, or a zero-amount session). No money, no floors -- and no retry,
       because a retry would not change it. */
    return NextResponse.json({ ignored: "not paid" });
  }

  try {
    const done = await fulfil(session.id, session.amount_total, session.metadata);

    /* `null` means the amount buys no floor. Answering 200 rather than an error
       is intentional: nothing went wrong and there is nothing to retry. */
    if (!done) return NextResponse.json({ ignored: "buys no floor" });

    return NextResponse.json({
      floors: done.floors,
      count: done.count,
      replayed: done.replayed,
    });
  } catch (error) {
    console.error("fulfilment failed", error);
    /* ── the one place a 500 is correct ───────────────────────────────────
       A database that is unreachable or a write that failed is exactly what
       Stripe's retries are for. Swallowing it into a 200 would mean a paid
       floor that never existed and nobody ever asked again -- which is the
       failure this whole design is arranged to avoid. So: fail loudly, let
       Stripe come back, and let app/api/checkout/session be the second net. */
    return NextResponse.json({ error: "could not build the floors yet" }, { status: 500 });
  }
}
