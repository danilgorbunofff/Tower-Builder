import { applyPurchase } from "./tower.ts";
import { PLACEHOLDER_NAME, floorCountFor, readName, readUrl } from "./order.ts";

/* ── turning a paid session into standing floors ────────────────────────────
   The one write path for money. Both callers go through here:

     - app/api/stripe/webhook/route.ts, when Stripe says
       `checkout.session.completed` (and again, on every retry it sends)
     - app/api/checkout/session/route.ts, when a buyer comes back from Stripe
       and asks whether their floors exist yet

   Two callers, one function, on purpose. The reconcile route exists because a
   webhook can be missed -- a cold function, a bad deploy, a signature secret
   that was rotated at the wrong moment -- and the answer to a missed webhook
   must be the *same* code, not a second implementation of it that quietly
   disagrees. If fulfilment ever needed fixing, fixing it here fixes both, and
   the replay guard below means running both at once is harmless. */

export type Fulfilment = {
  floors: number;
  /* The name and link that actually landed, which may not be the ones that were
     asked for. See the note about hostile metadata below. */
  name: string;
  url: string | null;
  /* The highest floor that stood before this purchase, so this purchase owns
     lo+1 .. lo+floors. */
  lo: number;
  count: number;
  replayed: boolean;
};

const ID_MAX = 200;

/* ── a paid floor always lands ──────────────────────────────────────────────
   This is the one place the project's laws collide, so it is worth being
   explicit about which one wins.

   "Floors only ever appear with the money" cuts both ways: a floor that has
   been paid for has to appear. So when the metadata will not validate -- and it
   can fail to: it is set when the session is created, but it is read back
   later, by a different process, against whatever the validation rules are
   *then* -- the answer is not to refuse. Refusing would take someone's dollar
   and give them nothing, which is the only genuinely unforgivable outcome
   here.

   The count is never in question: it comes from `amount_total`, which is
   money. Only the *text* is doubtful, and text is the part the tower can do
   without. So a name that will not validate becomes PLACEHOLDER_NAME and a
   link that will not validate becomes no link, and the storey is built either
   way. This is the same trade Phase 6's takedown makes: height is preserved,
   the words are what go.

   Note that this is the *second* reading of these values. app/api/checkout read
   them once already, with the same function, before it ever spoke to Stripe.

   Returns null when the amount does not buy a floor at all. That is not an
   error and the callers answer 200: nothing is wrong, there is just nothing to
   build, and telling Stripe to retry would not change that. */
export async function fulfil(
  sessionId: unknown,
  amountTotal: unknown,
  metadata: unknown
): Promise<Fulfilment | null> {
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > ID_MAX) {
    return null;
  }

  const floors = floorCountFor(amountTotal);
  if (floors < 1) return null;

  const fields = (typeof metadata === "object" && metadata !== null ? metadata : {}) as Record<
    string,
    unknown
  >;

  const name = readName(fields.name);
  const url = readUrl(fields.url);

  const landed = name.ok ? name.name : PLACEHOLDER_NAME;
  /* A rejected link and an absent link are the same outcome, and deliberately
     so: the storey does not need a door to be a storey. */
  const link = url.ok ? url.url : null;

  const { lo, count, replayed } = await applyPurchase(sessionId, floors, landed, link);

  return { floors, name: landed, url: link, lo, count, replayed };
}
