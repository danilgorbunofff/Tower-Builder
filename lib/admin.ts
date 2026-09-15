import { timingSafeEqual } from "node:crypto";

/* ── the takedown secret ────────────────────────────────────────────────────
   Server-only. Nothing in here may be imported by a component.

   Moderation publishes instantly and takes down privately (§8), which means
   there is exactly one operation in this app that nobody is supposed to be able
   to perform: hiding a floor. It is not a button anywhere, not even a hidden
   one, because a button is a thing that gets pressed by accident and a takedown
   that was a mis-click is a name somebody paid a dollar for.

   So the whole gate is a shared secret in a header. That is thin, and it is
   meant to be: the endpoint does one thing, does it without deleting anything,
   and is not reachable at all unless TOWER_ADMIN_SECRET is set -- the same
   "absent configuration is a supported state" shape as dbConfigured() and
   stripeConfigured(). Unset, this route answers 503 and the tower can only be
   moderated from psql. */

export const ADMIN_HEADER = "x-admin-secret";

export function adminConfigured(): boolean {
  return Boolean(process.env.TOWER_ADMIN_SECRET);
}

export function adminSecret(): string {
  const secret = process.env.TOWER_ADMIN_SECRET;
  if (!secret) throw new Error("TOWER_ADMIN_SECRET is not set — see .env.example");
  return secret;
}

/* Compares in constant time, and refuses unequal lengths before it does. The
   length of the secret is not the secret, and leaking it tells an attacker
   nothing they cannot measure by timing this function anyway.

   A Buffer compare rather than `===` because a string compare that stops at the
   first difference is a string compare that reports how many characters were
   right, one request at a time. */
export function authorisedAsAdmin(offered: string | null): boolean {
  if (!adminConfigured() || !offered) return false;

  const a = Buffer.from(adminSecret(), "utf8");
  const b = Buffer.from(offered, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
