import { NextResponse } from "next/server";
import { fulfil } from "@/lib/fulfil.ts";
import { getStripe, stripeConfigured } from "@/lib/stripe.ts";
import { getTower } from "@/lib/tower.ts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Session ids are `cs_test_...` / `cs_live_...`. Checked before it reaches
   Stripe so a junk query string is a 400 rather than an outbound request. */
const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

/* ── coming back from the till ──────────────────────────────────────────────
   The buyer lands on `/?paid=cs_...` and the page asks this route whether the
   money went through. That question has a side effect on purpose.

   The webhook is the primary path and it is usually already done by the time
   anyone gets here -- but "usually" is not a guarantee. A webhook can be
   missed entirely: a function that was cold and timed out, a deploy that
   changed the endpoint at the wrong second, a signing secret rotated before
   the delivery was retried. When that happens Stripe has the money and the
   tower has nothing, and no amount of waiting fixes it, because the only agent
   left who knows the session id is the browser sitting on the success page.

   So this route runs the *same* fulfil() the webhook does. Either one can be
   first; the primary key on `purchases` means whichever arrives second is a
   no-op. That is the entire reason both call the same function instead of each
   having its own version of it.

   No authentication, and none is needed. The session id is the capability --
   it is only ever handed to the buyer and to Stripe -- and the worst anyone
   can do with a stolen one is cause floors that were already paid for to
   appear. Which is the outcome we want anyway. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!SESSION_ID.test(id)) {
    return NextResponse.json({ error: "that is not a checkout session" }, { status: 400 });
  }

  if (!stripeConfigured()) {
    return NextResponse.json({ error: "payments are not set up yet" }, { status: 503 });
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(id);

    if (session.payment_status !== "paid") {
      /* Not an error. This is what the page sees for the second or two between
         being redirected back and Stripe finishing the payment, and it is what
         it sees forever if the buyer closed the tab on the card form. The
         client polls while it matters and gives up quietly. */
      return NextResponse.json({ paid: false });
    }

    const done = await fulfil(session.id, session.amount_total, session.metadata);

    /* `done.lo` is the count before this purchase, so the floors above it are
       exactly this purchase's block. When there is no block to hand back --
       the webhook already built it, or the amount bought nothing -- asking from
       a number nothing can exceed returns the count with no floors, and the
       client grows the tower without naming anything. */
    const tower = await getTower(done ? done.lo : Number.MAX_SAFE_INTEGER);

    return NextResponse.json({ paid: true, count: tower.count, floors: tower.floors });
  } catch (error) {
    console.error("checkout session lookup failed", error);
    /* 503, matching /api/tower: a lookup that failed is not the same thing as
       a payment that did not happen, and reporting it as "not paid" would tell
       a buyer their floor does not exist because a database blinked. */
    return NextResponse.json({ error: "the tower is not answering" }, { status: 503 });
  }
}
