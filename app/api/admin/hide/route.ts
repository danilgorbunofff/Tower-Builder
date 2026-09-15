import { NextResponse } from "next/server";
import { ADMIN_HEADER, adminConfigured, authorisedAsAdmin } from "@/lib/admin.ts";
import { dbConfigured } from "@/lib/db.ts";
import { hideFloor } from "@/lib/tower.ts";

/* ── the one thing nobody is allowed to do ──────────────────────────────────
   Take a name down. Not a button, not an admin page, not a row in a table
   somewhere with a padlock drawn on it -- a POST with a header, because the
   less there is to press, the less there is to press by accident.

   Nothing is deleted and nothing moves: lib/tower.ts flips `hidden` and every
   reader of the tower redacts on the way out. The storey stays in the sky,
   keeps its number, and keeps counting toward the height, which is the whole
   reason §8 chose redaction over deletion.

   No caching of any kind, including the CDN's: a takedown that takes five
   minutes to take effect is not a takedown. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* The storey number, and nothing else. A body carrying a name or a reason would
   be a body that could disagree with the row it is about. */
function parseNo(body: unknown): number | null {
  const no = (body as { no?: unknown } | null | undefined)?.no;
  if (typeof no !== "number" || !Number.isInteger(no) || no < 1) return null;
  return no;
}

export async function POST(request: Request) {
  /* Unset secret, or no database, is a supported state everywhere else in this
     app and it is one here too: the route answers 503 and the tower can only be
     moderated from psql until somebody sets the variable. */
  if (!adminConfigured() || !dbConfigured()) {
    return NextResponse.json(
      { error: "takedown is not configured" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }

  /* 403 and not 404. Every other unauthenticated endpoint in the world hides
     behind a 404 so that its existence stays a secret -- but this route's
     existence is in the source, which is public, and an operator who mistyped a
     secret is the person most likely to be reading this response. */
  if (!authorisedAsAdmin(request.headers.get(ADMIN_HEADER))) {
    return NextResponse.json(
      { error: "that is not the takedown secret" },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected a JSON body" }, { status: 400 });
  }

  const no = parseNo(body);
  if (no === null) {
    return NextResponse.json(
      { error: "no must be the integer number of a standing storey" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  try {
    /* Null is "there is no floor with that number" -- above the top of the
       tower, or never built. Hiding a floor that is already hidden is not an
       error and not a special case: it is the same state asked for twice. */
    const hidden = await hideFloor(no);
    if (!hidden) {
      return NextResponse.json(
        { error: `no floor ${no} stands` },
        { status: 404, headers: { "cache-control": "no-store" } }
      );
    }

    return NextResponse.json(
      { hidden: hidden.no, count: hidden.count },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    console.error("POST /api/admin/hide failed:", error);
    return NextResponse.json(
      { error: "the tower is unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
