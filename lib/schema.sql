-- The tower's whole database.
--
-- One row in tower_state is the count; floors is the ledger behind it. The two
-- are only ever moved together, inside the purchase transaction in lib/tower.ts,
-- so the count can never disagree with the ledger.
--
-- This file is the migration and the schema at once, and it is idempotent:
-- running it twice is a no-op. Nothing here ever deletes a row.

CREATE TABLE IF NOT EXISTS tower_state (
  id    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  count integer NOT NULL DEFAULT 0
);

-- One row per Stripe Checkout Session. The session id is the primary key, and
-- that is what makes the webhook idempotent: a replayed delivery conflicts, and
-- the transaction then finds there is nothing left to do.
CREATE TABLE IF NOT EXISTS purchases (
  id          text PRIMARY KEY,   -- Stripe Checkout Session id (cs_…) — idempotency key
  floors      integer NOT NULL,
  name        text    NOT NULL,
  url         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Floors are numbered 1..N, contiguous and never reused. `no` is the primary
-- key, so a second insert for the same storey is an error and not a duplicate.
CREATE TABLE IF NOT EXISTS floors (
  no          integer PRIMARY KEY,   -- 1..N, contiguous, never reused
  name        text    NOT NULL,
  url         text,
  purchase    text    NOT NULL REFERENCES purchases(id),
  hidden      boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- The read is always "the newest storeys", so the index runs the same way.
CREATE INDEX IF NOT EXISTS floors_no_desc ON floors (no DESC);

-- The singleton. A bare SELECT of a missing row would return no rows and the
-- API would have to invent a zero; seeding it here means count is always a
-- number, and the UPDATE ... RETURNING in the purchase transaction is always
-- certain to touch exactly one row.
INSERT INTO tower_state (id, count) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;
