import type { EngineHandle } from "./engine.ts";

/* ── the walk back from the till ────────────────────────────────────────────
   Stripe sends the buyer to `/?paid=cs_...`. This is the code that waits on
   that page for the floors to exist.

   Its job is not to display anything. The feed poller in lib/feed.ts is
   already asking the server what the tower looks like, and if the webhook did
   its job the floors turn up on their own within five seconds without this
   module being involved at all. What this module provides is the *nudge*:
   a request to app/api/checkout/session, which is the route that runs the
   fulfilment path a missed webhook never ran. Without it, a dropped webhook
   means a paid floor that waits forever for a retry Stripe already gave up on.

   So it polls, and it is content to lose. If the answer is `paid: false` for a
   minute it stops and says nothing further, because the overwhelmingly likely
   reason is that the buyer abandoned the card form -- and the page they are
   looking at already tells them nothing was charged. */

const POLL_MS = 1500;
/* Stripe's own redirect lands before the webhook usually does, so the first
   few polls are expected to miss. A minute is well past any real lag and short
   enough that a closed tab is not holding a timer open for long. */
const GIVE_UP_MS = 60_000;
const SESSION_ID = /^cs_[A-Za-z0-9_]{8,200}$/;

let started = false;

export function returnedSessionId(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("paid") ?? "";
  return SESSION_ID.test(id) ? id : null;
}

function say(text: string): void {
  const live = document.getElementById("live");
  if (live) live.textContent = text;
}

/* The parameter is dropped once the floors are standing, not before. A refresh
   mid-flight has to be another attempt at the same reconciliation -- that is
   the whole safety net -- but a refresh afterwards has nothing left to do, and
   leaving a spent `?paid=` in the address bar means every future bookmark or
   paste re-runs a lookup that can only ever answer the same way. */
function clearParam(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("paid");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function startReturn(engine: EngineHandle): void {
  if (started) return;
  const id = returnedSessionId();
  if (!id) return;
  started = true;

  let waited = 0;

  const ask = async () => {
    try {
      const response = await fetch(`/api/checkout/session?id=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });

      if (response.ok) {
        const data = (await response.json()) as {
          paid?: boolean;
          count?: number;
          floors?: { no: number; name: string; url?: string | null }[];
        };

        if (data.paid && typeof data.count === "number") {
          const arrived = Array.isArray(data.floors) ? data.floors : [];
          /* The engine's own handler, the same one the poller calls. A webhook
             that already built these floors means `arrived` is empty and the
             count has not moved, which applyTower treats as nothing to do. */
          engine.applyTower(data.count, arrived);

          const built = arrived.length;
          say(
            built > 0
              ? `Payment received. ${built === 1 ? "One floor is" : `${built} floors are`} up, ` +
                `${arrived[0].no} to ${arrived[built - 1].no}. The tower stands at ` +
                `${data.count} floors.`
              : `Payment received. The tower stands at ${data.count} floors.`
          );

          clearParam();
          return;
        }
      }
    } catch {
      /* A network that failed is not a payment that failed. Fall through and
         ask again; the give-up below is the only thing that ends this. */
    }

    waited += POLL_MS;
    if (waited >= GIVE_UP_MS) {
      say("Still waiting on the payment to be confirmed. Reload this page in a minute to check.");
      return;
    }
    window.setTimeout(ask, POLL_MS);
  };

  /* A beat before the first ask, so a buyer who is bounced back and forward on
     the same tick as the redirect does not ask about a session Stripe has not
     finished writing. */
  window.setTimeout(ask, 400);
}
