import type { PoolClient } from "pg";
import { dbConfigured, getPool } from "./db.ts";

/* ── reading and writing the tower ─────────────────────────────────────────
   Every statement that matters lives here, so the API route, the webhook and
   the tests all exercise the same SQL. */

export type Floor = {
  no: number;
  name: string;
  url: string | null;
  hidden: boolean;
};

export type Tower = {
  count: number;
  floors: Floor[];
};

/* A poll carries a handful of new floors and a cold boot carries the last 48.
   200 is a bound on the response, not a rule about the tower. */
const FLOOR_LIMIT = 200;

/* ── the read ───────────────────────────────────────────────────────────────
   Both numbers come out of one statement on purpose. Two queries would let a
   purchase commit in between, and the page would then be told about a storey
   its own count had not reached yet — a rail one floor too short. One statement
   is one snapshot, so floors can never contain a number above count. */
export async function getTower(since: number): Promise<Tower> {
  /* No database is a supported state, not an error: this is how the page runs
     as the demo it has always been, and it is the state every baseline capture
     in baseline/ was taken in. */
  if (!dbConfigured()) {
    return { count: 0, floors: [] };
  }

  const { rows } = await getPool().query<{ count: number; floors: Floor[] }>(
    `WITH w AS (
       SELECT no, name, url, hidden FROM floors
        WHERE no > $1 ORDER BY no DESC LIMIT $2
     )
     SELECT (SELECT count FROM tower_state WHERE id = 1) AS count,
            (SELECT COALESCE(json_agg(w.* ORDER BY w.no), '[]'::json) FROM w) AS floors`,
    [since, FLOOR_LIMIT]
  );

  const row = rows[0];
  return { count: row?.count ?? 0, floors: row?.floors ?? [] };
}

async function currentCount(client: PoolClient): Promise<number> {
  const { rows } = await client.query<{ count: number }>(
    "SELECT count FROM tower_state WHERE id = 1"
  );
  return rows[0]?.count ?? 0;
}

export type PurchaseResult = {
  count: number;
  /* The highest floor that stood before this purchase — so this purchase owns
     lo+1 .. lo+floors. */
  lo: number;
  /* A session already in `purchases`. Stripe retries deliveries, so this is the
     expected second path, not an error. */
  replayed: boolean;
};

/* ── the one write ──────────────────────────────────────────────────────────
   Idempotent and atomic. Called once per `checkout.session.completed`, and
   called again if Stripe ever replays that event. */
export async function applyPurchase(
  sessionId: string,
  floors: number,
  name: string,
  url: string | null
): Promise<PurchaseResult> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    /* The replay guard. A conflicting id inserts nothing, and the transaction
       ends here having changed nothing at all. */
    const inserted = await client.query(
      `INSERT INTO purchases (id, floors, name, url) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
      [sessionId, floors, name, url]
    );
    if (inserted.rowCount === 0) {
      const count = await currentCount(client);
      await client.query("ROLLBACK");
      return { count, lo: count, replayed: true };
    }

    /* Row-locked, which is the whole reason the count lives in a table rather
       than being derived: two webhooks arriving together cannot interleave
       their blocks, so the ledger stays contiguous. RETURNING sees the updated
       row, so this is the count *before* the purchase. */
    const { rows } = await client.query<{ lo: number }>(
      `UPDATE tower_state SET count = count + $1 WHERE id = 1
         RETURNING count - $1 AS lo`,
      [floors]
    );
    const lo = rows[0].lo;

    /* lo+1 .. lo+floors — the block this purchase just paid for. The bounds are
       passed in rather than written as generate_series($lo, $lo + $n - 1), which
       would start the block on the floor lo that is already standing: a primary
       key collision the moment anyone bought twice. tools/test-tower.mjs is
       what caught that, on the second purchase. */
    await client.query(
      `INSERT INTO floors (no, name, url, purchase)
         SELECT gs, $2, $3, $1 FROM generate_series($4::int, $5::int) AS gs`,
      [sessionId, name, url, lo + 1, lo + floors]
    );

    const count = await currentCount(client);
    await client.query("COMMIT");
    return { count, lo, replayed: false };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
