import { Engine } from "@/components/engine";
import { Frame } from "@/components/frame";
import { dbConfigured } from "@/lib/db";
import { stripeConfigured } from "@/lib/stripe";

/* The page is the frame and the boot. The tower that stands in the frame -- the
   storeys, the sky bands, the world lanes, the rail -- is built after mount by
   lib/engine.ts, which owns the DOM under #stack the same way the IIFE in
   index.html does. React deliberately renders none of it. */

/* Which of the two things #order does is an environment fact, and environment
   facts read during a prerender are frozen into the HTML at build time. A
   deployment that added its keys after the build would then keep serving a page
   that still believed it was a demo -- the tray saying "nothing is charged"
   while the button charged. So: rendered per request. The page holds two
   components and no data of its own, so there is nothing a cache could save. */
export const dynamic = "force-dynamic";

export default function Home() {
  /* Both, not either. Money without the database is worse than no money at all:
     the card would be charged and there would be nowhere to put the floor. With
     either one missing the page stays a demo and the API routes answer 503. */
  const paymentsLive = dbConfigured() && stripeConfigured();

  return (
    <>
      <Frame />
      <Engine paymentsLive={paymentsLive} />
    </>
  );
}
