import Stripe from "stripe";

/* ── the Stripe client, and whether there is one ────────────────────────────
   Server-only. Nothing in here may be imported by a component.

   `stripeConfigured()` is the app's whole notion of whether money is real, and
   it is the same shape as `dbConfigured()` in lib/db.ts: no key is a supported
   state, not a broken one. With no STRIPE_SECRET_KEY the page is the demo it
   has always been -- #order builds floors in the browser, nothing is charged,
   and baseline/ means something. With one, #order opens the order modal and
   the client stops building floors of its own accord.

   That is also why the 26-capture measurement gate stays valid: it runs
   without a key, so it measures the demo, which is what it was baselined
   against. */

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set — see .env.example");
  return secret;
}

let client: Stripe | undefined;

/* Module-scoped so a warm serverless invocation reuses it, the same reasoning
   as the connection pool in lib/db.ts. */
export function getStripe(): Stripe {
  if (client) return client;

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set — see .env.example");

  /* No apiVersion, deliberately: that pins the account's default version, so
     upgrading the SDK cannot silently change the wire format underneath a
     handler that has been tested as it is. */
  client = new Stripe(key, { appInfo: { name: "The $1 Floor" } });
  return client;
}

/* ── where the buyer is sent back to ────────────────────────────────────────
   The request's own origin by default rather than a hard-coded domain, which
   means a preview deployment returns to itself instead of to production. The
   environment variable is for the case where the origin behind a proxy is not
   the origin in the address bar. */
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(request.url).origin;
}
