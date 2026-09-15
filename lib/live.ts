/* ── the one line of copy that depends on whether money is real ─────────────
   The tray has said "PAYMENTS ARE OFF — NOTHING IS CHARGED" since the tower was
   a demo, and it was true: #order built floors in the browser and nothing left
   the page. With a Stripe key it stops being true, and a page that charges a
   dollar while telling the buyer it charges nothing is the one piece of copy
   that absolutely has to change.

   It is changed here rather than in components/frame.tsx because that file is a
   verbatim transcription of index.html and baseline/domdiff.mjs holds it to
   that character for character. It is also the established division of labour:
   the frame is the static chrome, and everything that varies is written by
   script after mount -- #signN, #signCash, #orderPrice and #orderText are all
   already the engine's. This is the same thing, one line further down the tray.

   Nothing here runs in the demo, which is what keeps the 26 baseline captures
   meaningful: they were all taken with no key, so the note under them is still
   the original text and the geometry the probes assert on is untouched. */

export function showLiveNote(): void {
  /* A ?n= link is a sample tower -- a finished building, not this one -- and
     lib/engine.ts has already replaced this element's text to say so. That
     warning outranks this one, so there is nothing to add and no reason to
     take it away. */
  if (/[?&]n=\d/.test(window.location.search)) return;

  const note = document.getElementById("note");
  if (!note) return;

  /* Built as nodes rather than an innerHTML string so there is no parsing step
     to reason about later, and so the <b> the original markup had stays a <b>
     with the same box. */
  note.textContent = "PAYMENTS ARE LIVE — ONE DOLLAR A FLOOR. ";
  const strong = document.createElement("b");
  strong.textContent = "HOLD TO BUILD MORE — ONE CHARGE.";
  note.appendChild(strong);
}
