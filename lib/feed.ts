import type { EngineHandle, RemoteFloor } from "./engine.ts";

/* ── the poller ──────────────────────────────────────────────────────────────
   The tower is one building and this page is one window onto it. The engine
   paints that window; this asks the server what the building looks like now and
   hands the answer straight to the engine, which is the only thing that knows
   how to grow a tower without moving whoever is looking at it.

   It is a plain module rather than a hook, for the same reason the engine is:
   it owns one timer for the life of the document, and React's development-only
   StrictMode mount/unmount/mount would otherwise leave two pollers asking the
   same question twice a second. The engine hands its handle over on every boot
   -- including the refused second one -- and this starts once and ignores the
   rest. */

const POLL_MS = 5000;
const SLOW_MS = 30000;

type Payload = {
  count: number;
  floors: RemoteFloor[];
  /* The server has no database behind it. Nothing can change, so there is
     nothing to poll for. */
  demo?: boolean;
};

let started = false;

export function startFeed(engine: EngineHandle) {
  if (started) return;
  started = true;

  /* The last count the server gave us, which is also the highest floor we have
     been told about. Asking for what we already have costs a round trip and
     returns nothing. */
  let since = 0;
  let delay = POLL_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false;
  let stopped = false;

  const schedule = (ms: number) => {
    if (stopped) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(poll, ms);
  };

  async function poll() {
    timer = undefined;
    /* A poll started from a visibilitychange can land while one is still in the
       air. Dropping it would drop the chain with it, so it goes back in line. */
    if (busy) { schedule(POLL_MS); return; }

    /* A hidden tab polling a number nobody can see spends somebody's money on
       nobody's behalf. The listener below starts it up again on the way back. */
    if (document.visibilityState === "hidden") return;

    busy = true;
    try {
      const res = await fetch(`/api/tower?since=${since}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as Payload;

      /* No database is the demo, and the demo is what baseline/ was measured
         against. It builds its floors in the browser and has no shared tower to
         catch up with. */
      if (data.demo) { stopped = true; return; }

      engine.applyTower(data.count, data.floors);
      since = data.count;
      delay = POLL_MS;
      busy = false;
      schedule(delay);
    } catch (error) {
      busy = false;
      /* A failed poll is not news for the person looking at the tower: they
         still have the tower they had a moment ago, and it is still true. It
         retries, more slowly each time, and forgets all about it on the first
         success. */
      console.warn("the tower feed is behind:", error);
      delay = Math.min(delay * 2, SLOW_MS);
      schedule(delay);
    }
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      delay = POLL_MS;
      schedule(0);
    }
  });

  /* Immediately, not in five seconds: a page that opens on a standing tower
     should open on a standing tower, not on an empty lot that fills in. */
  schedule(0);
}
