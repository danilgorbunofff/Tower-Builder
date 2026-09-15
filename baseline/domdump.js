/* domdump.js — the Phase 2 gate's reading. Used by domdiff.mjs, never by hand.

   Phase 2 claims that components/frame.tsx is index.html's markup transcribed
   character for character. Checking that by eye is how transcriptions rot, and
   screenshots cannot see it at all -- the two differ by a class name or a dropped
   id without moving a single pixel, until some later edit depends on the thing
   that went missing. So this reads the markup itself.

   It deliberately does NOT read the live DOM. It fetches the page's own URL and
   parses the bytes through DOMParser, which never runs a script and never applies
   a stylesheet. That isolates the one thing Phase 2 changed -- the markup the
   server sends -- from the one thing Phase 3 will change, the DOM the engine
   builds afterwards. Read against index.html it returns the hand-written tree;
   read against the Next app it returns what React rendered.

   The answer is a newline-joined structural signature: indent for depth, tag, then
   attributes sorted by name so ordering cannot masquerade as a difference, then
   the text of leaves only. Loading, defer and the like are left in, because a
   difference there is a difference. SCRIPT, STYLE and friends are dropped: Next
   injects hydration and the original has its IIFE, and neither renders. */

(async () => {
  const res = await fetch(location.href, { cache: "no-store" });
  const doc = new DOMParser().parseFromString(await res.text(), "text/html");

  const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TITLE", "TEMPLATE", "NOSCRIPT", "BASE"]);

  const out = [];
  const walk = (el, depth) => {
    if (SKIP.has(el.tagName)) return;
    /* Next server-renders an empty <div hidden> as its RSC boundary marker. It
       holds nothing and draws nothing. The app itself never sets a bare hidden
       attribute -- index.html's hits are all aria-hidden -- so this skips exactly
       that marker. The test is deliberately narrow: a hidden element with any
       other attribute or any child is still printed, so a real one cannot slip
       past the gate unnoticed. */
    if (el.hasAttribute("hidden") && el.attributes.length === 1 && el.children.length === 0) return;
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}=${a.value}`)
      .sort();
    const kids = Array.from(el.children);
    /* text only on leaves: a parent's textContent is its children's text, and
       repeating it at every level buries the real difference */
    const text = kids.length ? "" : (el.textContent || "").replace(/\s+/g, " ").trim();
    out.push(
      "  ".repeat(depth) +
        el.tagName.toLowerCase() +
        (attrs.length ? " " + attrs.join(" ") : "") +
        (text ? " | " + text : "")
    );
    for (const k of kids) walk(k, depth + 1);
  };

  for (const c of Array.from(doc.body.children)) walk(c, 0);
  return out.join("\n");
})()
