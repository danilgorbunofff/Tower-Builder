import { NextResponse } from "next/server";
import { dbConfigured } from "@/lib/db";
import { getTower } from "@/lib/tower.ts";

/* Never cached: the whole point of the endpoint is that the number has moved
   since the last time you asked. */
export const dynamic = "force-dynamic";

function parseSince(raw: string | null): number {
  if (raw === null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

export async function GET(request: Request) {
  const since = parseSince(new URL(request.url).searchParams.get("since"));

  /* No database is the demo: this is the page as it has always been, with a
     count that only ever moves in the browser. `demo` tells the client not to
     bother polling, since the answer cannot change. */
  if (!dbConfigured()) {
    return NextResponse.json(
      { count: 0, floors: [], demo: true },
      { headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const tower = await getTower(since);
    return NextResponse.json(tower, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    /* Deliberately not a 200 with an empty tower. A page that cannot reach the
       database must keep showing the tower it already has and ask again, not
       quietly redraw itself as an empty lot. */
    console.error("GET /api/tower failed:", error);
    return NextResponse.json(
      { error: "the tower is unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
