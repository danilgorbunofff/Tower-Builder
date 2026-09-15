"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MAX_BATCH, NAME_MAX, URL_MAX, readOrder, type Problem } from "@/lib/order";

/* ── the order form ─────────────────────────────────────────────────────────
   Everything the tower knows about a storey before it exists: how many, what
   the sign says, and where the door goes.

   It validates with readOrder(), which is also what app/api/checkout validates
   with. That is not a convenience, it is the whole reason lib/order.ts exists:
   the buyer's browser and the serverless function run the same function, so
   "the form accepted it and the server rejected it" cannot happen except
   across a deploy that changed the rules mid-session.

   Opening this does not reserve anything and closing it does not cancel
   anything. No floor exists until Stripe says the money did, so there is
   nothing here to be inconsistent with. */

/* ── one id per attempt ───────────────────────────────────────────────────
   Sent to app/api/checkout, used there as the Stripe idempotency key.

   It is derived from the order rather than from the session, which gives it
   both behaviours that are wanted for free: editing a field changes the order
   and therefore the key, so a corrected attempt is a fresh Checkout Session;
   pressing the button again with nothing changed keeps the key, so a request
   that was retried after a dropped connection returns the Session the first
   one created instead of charging for a second one.

   crypto.randomUUID is only defined in a secure context. That covers
   localhost and https and misses exactly the case this repository keeps
   tripping over -- a dev server reached at a LAN address over plain http --
   where it is `undefined` and calling it would take the button down with it.
   getRandomValues is available in every context, so the second branch is the
   one that runs there, and it produces the same 32 hex characters. The last
   branch is for a browser so old it has neither; this value is an idempotency
   key, not a secret, so Math.random is acceptable in a way it would not be
   for anything that guards money. */
function mintAttempt(): string {
  const c = globalThis.crypto;

  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID().replace(/-/g, "");
  }

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const FOCUSABLE = 'button, input, a[href], select, textarea, [tabindex]:not([tabindex="-1"])';

type Props = {
  /* How many floors the gesture asked for. Handed in by the engine: a tap
     sends one and a hold sends however many it counted. */
  floors: number;
  onClose: () => void;
};

export function OrderModal({ floors, onClose }: Props) {
  const [n, setN] = useState(floors);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [sending, setSending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  /* Keyed on the order, so it follows the rule described above mintAttempt.
     This is the "reset state when props change" pattern rather than a useMemo:
     the mint has to happen *inside* render, and a memo whose dependency list
     does not mention anything it reads is a memo the linter is right to
     complain about. */
  const [attempt, setAttempt] = useState(mintAttempt);
  const [stamped, setStamped] = useState({ n, name, url });
  if (stamped.n !== n || stamped.name !== name || stamped.url !== url) {
    setStamped({ n, name, url });
    setAttempt(mintAttempt());
  }

  const reading = useMemo(
    () => readOrder({ n, name, url, attempt }),
    [n, name, url, attempt]
  );

  const problemFor = (field: Problem["field"]): string | null => {
    if (reading.ok || !touched) return null;
    return reading.problems.find((p) => p.field === field)?.message ?? null;
  };

  const nameProblem = problemFor("name");
  const urlProblem = problemFor("url");

  /* ── escape, and staying inside ─────────────────────────────────────────
     A capture-phase listener on the document, so this runs before anything
     else on the page can react to a key. The engine's own keyboard handling
     is bound to #order and cannot fire from a field, but a trap is cheap and
     the failure it prevents -- Tab walking out of a dialog and into a button
     that buys floor 51 -- is a bad one. */
  useEffect(() => {
    const root = panel.current;
    if (!root) return;

    const fields = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => !el.hasAttribute("disabled")
      );

    (fields().find((el) => el.tagName === "INPUT") ?? fields()[0])?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const list = fields();
      if (!list.length) return;

      const at = list.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && at <= 0) {
        event.preventDefault();
        list[list.length - 1].focus();
      } else if (!event.shiftKey && at === list.length - 1) {
        event.preventDefault();
        list[0].focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const step = (by: number) => {
    setN((current) => Math.min(MAX_BATCH, Math.max(1, current + by)));
    setFailure(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    setFailure(null);

    /* The same function the server will run. Checked here so a mistake costs a
       sentence rather than a round trip and a card form. */
    if (!reading.ok) return;

    setSending(true);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reading.order),
      });

      const data = (await response.json().catch(() => null)) as
        | { url?: string; error?: string; problems?: Problem[] }
        | null;

      if (response.ok && data?.url) {
        /* Deliberately left in the sending state: the page is about to be
           replaced by Stripe's, and a form that re-enables itself for the
           half-second in between invites a second press. */
        window.location.assign(data.url);
        return;
      }

      if (response.status === 400 && data?.problems?.length) {
        /* Only reachable if the deployed rules are not the ones in this bundle
           -- a deploy landing between the form being opened and submitted. */
        setFailure("That order was refused: " + data.problems.map((p) => p.message).join(", "));
      } else {
        setFailure(data?.error ?? "the till did not answer — try again in a moment");
      }
    } catch {
      setFailure("no connection to the till — try again in a moment");
    }

    setSending(false);
  };

  const title = n === 1 ? "BUILD A FLOOR" : `BUILD ${n} FLOORS`;

  return (
    <div
      className="om"
      onMouseDown={(event) => {
        /* A click on the backdrop closes; a drag that started inside the panel
           and ended on the backdrop does not, because that is a mis-aimed
           selection, not a dismissal. */
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="om-panel"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="omTitle"
        aria-describedby="omSub"
      >
        <p className="om-kicker">THE $1 FLOOR</p>
        <h2 className="om-title" id="omTitle">
          {title}
        </h2>
        <p className="om-sub" id="omSub">
          One dollar a floor. Floors are never removed.
        </p>

        <button className="om-x" type="button" onClick={onClose} aria-label="Close without buying">
          <svg viewBox="0 0 12 12" focusable="false" aria-hidden="true">
            {/* Two diagonal runs of 2x2 cells meeting in the middle, drawn the
                same way #totop draws its arrow: cells on the 4px grid rather
                than a glyph, so no font has to have the character. */}
            <g fill="currentColor">
              <rect x="1" y="1" width="2" height="2" />
              <rect x="3" y="3" width="2" height="2" />
              <rect x="5" y="5" width="2" height="2" />
              <rect x="7" y="7" width="2" height="2" />
              <rect x="9" y="9" width="2" height="2" />
              <rect x="9" y="1" width="2" height="2" />
              <rect x="7" y="3" width="2" height="2" />
              <rect x="3" y="7" width="2" height="2" />
              <rect x="1" y="9" width="2" height="2" />
            </g>
          </svg>
        </button>

        <form className="om-form" onSubmit={submit} noValidate>
          <div className="om-count">
            <button
              className="om-step"
              type="button"
              onClick={() => step(-1)}
              disabled={n <= 1 || sending}
              aria-label="One floor fewer"
            >
              <span aria-hidden="true">−</span>
            </button>
            <p className="om-count-n" aria-live="polite">
              <b>{n}</b> {n === 1 ? "floor" : "floors"}
            </p>
            <button
              className="om-step"
              type="button"
              onClick={() => step(1)}
              disabled={n >= MAX_BATCH || sending}
              aria-label="One floor more"
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>

          <div className={"om-field" + (nameProblem ? " is-bad" : "")}>
            <label className="om-label" htmlFor="omName">
              NAME ON THE FLOOR
            </label>
            <input
              className="om-input"
              id="omName"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
              disabled={sending}
              autoComplete="off"
              /* maxLength counts UTF-16 units and lib/order.ts counts code
                 points, so the attribute is deliberately loose: it is there to
                 stop a paste, not to be the rule. A 12-emoji name is 12
                 characters to readName and 24 to the DOM, and it has to be
                 accepted. */
              maxLength={NAME_MAX * 2}
              placeholder="who lives here?"
              aria-describedby={nameProblem ? "omNameBad" : undefined}
              aria-invalid={nameProblem ? true : undefined}
            />
            {nameProblem && (
              <p className="om-bad" id="omNameBad">
                {nameProblem}
              </p>
            )}
          </div>

          <div className={"om-field" + (urlProblem ? " is-bad" : "")}>
            <label className="om-label" htmlFor="omUrl">
              LINK <span className="om-opt">OPTIONAL</span>
            </label>
            <input
              className="om-input"
              id="omUrl"
              name="url"
              type="text"
              inputMode="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onBlur={() => setTouched(true)}
              disabled={sending}
              autoComplete="off"
              maxLength={URL_MAX}
              placeholder="https://"
              aria-describedby={urlProblem ? "omUrlBad" : undefined}
              aria-invalid={urlProblem ? true : undefined}
            />
            {urlProblem && (
              <p className="om-bad" id="omUrlBad">
                {urlProblem}
              </p>
            )}
          </div>

          <p className="om-total" aria-live="polite">
            ONE PAYMENT OF <b>${n}</b>
          </p>

          {failure && (
            <p className="om-bad om-bad-form" role="alert">
              {failure}
            </p>
          )}

          <button className="om-pay" type="submit" disabled={sending}>
            {sending ? "OPENING THE TILL…" : `PAY $${n}`}
          </button>

          <p className="om-fine">
            STRIPE TAKES THE CARD. CARDS ONLY. CANCEL AND NOTHING IS CHARGED.
          </p>
        </form>
      </div>
    </div>
  );
}
