"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OrderModal } from "@/components/order-modal";
import { startEngine } from "@/lib/engine";
import { startFeed } from "@/lib/feed";
import { showLiveNote } from "@/lib/live";
import { startReturn } from "@/lib/return";

/* The one line of React between the page and the tower.

   Frame is server-rendered and the engine only starts once it is on screen, so
   this renders nothing and does its work in an effect. Everything after that --
   the storeys, the sky bands, the world lanes, the rail, the render loop, the
   handlers on #order -- belongs to lib/engine.ts. React never re-renders any of
   it, which is the point: see the header of that file.

   Starting twice is harmless. The engine stamps #stage and refuses a second
   boot, which is what keeps React's development-only StrictMode mount/unmount/
   mount from building two towers and charging twice per tap.

   The poller is handed the engine's handle rather than reaching for the DOM, so
   there is exactly one thing in the page that knows how a tower grows.

   ── paymentsLive ───────────────────────────────────────────────────────────
   One prop, and it decides which of two entirely different things #order does.

   False (no Stripe key, or no database) is the demo this repo has always been:
   no onPurchase is passed, so lib/engine.ts's own buy()/press() keep building
   floors in the browser, nothing is charged, and every capture in baseline/ --
   which was taken in exactly this state -- still describes it.

   True hands the engine an onPurchase, and the early return at the top of buy()
   means the engine stops building anything itself: it reports the order and this
   component opens the form. Floors then only appear once the server says they
   have been paid for. */
export function Engine({ paymentsLive = false }: { paymentsLive?: boolean }) {
  /* null is "no order in progress". `seq` is what makes a second press a new
     form with a new idempotency key rather than the open one with a changed
     number -- a different press is a different attempt. */
  const [order, setOrder] = useState<{ n: number; seq: number } | null>(null);
  const seq = useRef(0);

  const onPurchase = useCallback((n: number) => {
    seq.current += 1;
    setOrder({ n, seq: seq.current });
  }, []);

  /* Stable, because the modal reads it from a keydown listener it registers
     once and never re-registers. */
  const close = useCallback(() => setOrder(null), []);

  useEffect(() => {
    if (!paymentsLive) {
      startEngine({ onReady: startFeed });
      return;
    }

    startEngine({
      onPurchase,
      onReady: (engine) => {
        startFeed(engine);
        startReturn(engine);
      },
    });

    /* After the boot, not before: seed() writes this element's text itself when
       the link carries ?n=, and that warning outranks this one. */
    showLiveNote();
  }, [paymentsLive, onPurchase]);

  return order ? <OrderModal key={order.seq} floors={order.n} onClose={close} /> : null;
}
