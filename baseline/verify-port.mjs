/* verify-port.mjs -- proof that the port is the original.

   lib/engine.ts is index.html's <script> moved into a module. Moving it was not
   supposed to change it, and "not supposed to" is worth nothing on its own: the
   probe suite proves the port BEHAVES the same, and this proves it IS the same.

   It walks both bodies in step. The original's body is 1-based lines 1579..2773
   of index.html; the port's runs from its own `"use strict";` to the final `}`
   of startEngine. Each port line is normalised -- the type annotations strict
   mode demanded are stripped -- and then the walk is:

     norm(orig[i]) === norm(port[j])   the same line. Classified by what the raw
                                       text changed: a type annotation, or a
                                       re-indent -- which is also a failure, since
                                       the port is meant to stay readable against
                                       index.html, line for line
     port[j] is in ADDED               an intentional insertion, one line
     port[j] opens a declared BLOCK    an intentional insertion, several lines
     anything else                     a transcription bug, exit 1

   A block is declared by the text its first line contains and by how many lines
   it runs. The count is the whole proof of its extent: skip one line too few or
   too many and the walk is looking at two different lines, which it reports as
   an ordinary mismatch and exits 1. A long section of new work is recorded as
   one block rather than eighty line entries, because the eighty entries said no
   more than the block does.

   Greedy, not an LCS, because every line of the two bodies is meant to be in the
   same order and nothing is allowed to be missing. A stray deletion desynchronises
   the walk on the spot and is reported where it happened.

   The normaliser is applied to BOTH sides, so a rewrite rule can only ever hide a
   difference the original also had.

   node baseline/verify-port.mjs                                        */

import { readFileSync } from "node:fs";

const ORIG = "index.html";
const PORT = process.argv[2] || "lib/engine.ts";   /* overridable for negative controls */
const BODY_FROM = 1579;   /* 1-based, first line of the <script> body */
const BODY_TO = 2773;     /* 1-based, last line of the <script> body */

/* Deliberate additions: no counterpart in index.html. Trimmed. */
const ADDED = [
  "/* The frame is server-rendered and the engine only starts once it is on screen,",
  "so every lookup here is guaranteed to hit. Asserting that keeps the body free",
  "of null checks the original never had. */",
  "/* setAttribute stringifies its value anyway; String() only satisfies the type */",
  "/* getAttribute is typed nullable; parseFloat tolerates the null this never gets */",
  "/* cloneNode is typed as Node; these are the SVG groups it was cloned from */",
  "/* as above: one order, one payment of $n */",
  "if(opts.onPurchase){ opts.onPurchase(n); return; }",
  "/* Phase 5 sends the order to the server instead; see demo mode at the top. */",
  "if(opts.onPurchase){ opts.onPurchase(1); return; }",
  "/* Storeys the server has named, out of the `floors` table. A storey the server",
  "has never heard of is not missing: this is the demo, and SAMPLE names it. */",
  "var residents = new Map<number, string>();",
  "",   /* the blank line that separates `residents` from the per-floor spec */
  "var real = residents.get(no);",
  "if(real !== undefined){ return real; }",
  "/* The handle goes out before the sample tower is seeded, so a poller that",
  "answers on the same tick still lands on a booted engine. */",
  "engineHandle = { applyTower: applyTower };",
  "if(opts.onReady){ opts.onReady(engineHandle); }",
  "",   /* the blank line that closes the block below, before the batch section */
];

/* Deliberate additions that are too long to list line by line. `at` is text the
   block's first line contains; `lines` is how many lines it runs for. */
const ADDED_BLOCKS = [
  { at: "a tower other people are also building", lines: 77 },
];

/* Longest alternative first: HTMLElement before Element, number[] before number. */
const TYPES = [
  "\\[number, string\\]\\[\\]",
  "Record<string, string \\| number>",
  "Record<string, string>",
  "string \\| \\(\\(dy: number\\) => string\\)",
  "\\(dy: number\\) => number",
  "Band \\| null",
  "HTMLElement\\[\\]",
  "SVGElement\\[\\]",
  "Foot\\[\\]",
  "number \\| null",
  "number\\[\\]",
  "string\\[\\]",
  "HTMLElement",
  "SVGElement",
  "Element",
  "Foot",
  "Band",
  "number",
  "string",
  "boolean",
];

const REWRITES = [
  [new RegExp(`\\s+as\\s+(?:${TYPES.join("|")})\\b`, "g"), ""],
  [/([\w)])!(?=[.,)\]])/g, "$1"],
  [/String\(([^()]*)\)/g, "$1"],
  [/(?<![A-Za-z0-9_$\].])\(([A-Za-z_$][\w.$[\]]*)\)/g, "$1"],
  [/\?(\s*:)/g, "$1"],
  /* a return-type annotation sits between `)` and `{`; removing it must not
     leave the space the original did not have */
  [new RegExp(`\\s*:\\s*(?:${TYPES.join("|")})\\s*(?=\\{)`, "g"), ""],
  [new RegExp(`\\s*:\\s*(?:${TYPES.join("|")})(?![A-Za-z0-9_$<])`, "g"), ""],
];

function normalise(line) {
  let out = line;
  for (const [re, to] of REWRITES) out = out.replace(re, to);
  return out.replace(/\s+/g, " ").trim();
}

function fail(msg) {
  console.error("verify-port: " + msg);
  process.exit(2);
}

const origAll = readFileSync(ORIG, "utf8").split(/\r?\n/);
const portAll = readFileSync(PORT, "utf8").split(/\r?\n/);

const orig = origAll.slice(BODY_FROM - 1, BODY_TO);
if (orig.length !== BODY_TO - BODY_FROM + 1) fail(`${ORIG} has only ${origAll.length} lines`);
if (orig[0].trim() !== '"use strict";') {
  fail(`${ORIG}:${BODY_FROM} is not the body's "use strict"; it is ${JSON.stringify(orig[0])}`);
}

const start = portAll.findIndex((l) => l.trim() === '"use strict";');
if (start < 0) fail(`${PORT} has no "use strict"; to anchor the body on`);
let end = portAll.length - 1;
while (end > start && portAll[end].trim() === "") end--;
if (portAll[end].trim() !== "}") fail(`${PORT} does not end with the closing brace`);
const port = portAll.slice(start, end);
if (port[port.length - 1].trim() !== "})();") {
  fail(`${PORT}: the body should still end with the seed IIFE, found ${JSON.stringify(port[port.length - 1])}`);
}

const isAdded = (line) => ADDED.includes(line.trim());

/* The block whose first line this could be, or null. Anchored on a `/*` so a
   block can never be opened by a line of code that happens to quote it. */
const blockAt = (line) => {
  const t = line.trim();
  if (!t.startsWith("/*")) return null;
  return ADDED_BLOCKS.find((b) => t.includes(b.at)) || null;
};

const annotated = [];
const reindented = [];
const added = [];
const blocked = [];
const unmatched = [];
const spilled = [];

let i = 0, j = 0;
while (i < orig.length && j < port.length) {
  if (normalise(orig[i]) === normalise(port[j])) {
    if (orig[i] !== port[j]) {
      const where = `${ORIG}:${BODY_FROM + i}  ${orig[i].trim()}\n        ${PORT}:${start + j + 1}  ${port[j].trim()}`;
      const indentA = orig[i].match(/^[ \t]*/)[0];
      const indentB = port[j].match(/^[ \t]*/)[0];
      if (indentA !== indentB) reindented.push(where);
      else annotated.push(where);
    }
    i++; j++;
    continue;
  }
  if (isAdded(port[j])) {
    added.push({ line: j, text: port[j].trim() });
    j++;
    continue;
  }
  const block = blockAt(port[j]);
  if (block && j + block.lines <= port.length) {
    blocked.push({ at: block.at, lines: block.lines, line: j });
    j += block.lines;
    continue;
  }
  unmatched.push({ i, j, a: orig[i], b: port[j] });
  i++; j++;
}

while (i < orig.length) { spilled.push(`dropped   ${ORIG}:${BODY_FROM + i}  ${orig[i].trim()}`); i++; }
while (j < port.length) {
  const block = blockAt(port[j]);
  if (isAdded(port[j])) added.push({ line: j, text: port[j].trim() });
  else if (block && j + block.lines <= port.length) {
    blocked.push({ at: block.at, lines: block.lines, line: j });
    j += block.lines;
    continue;
  }
  else spilled.push(`extra     ${PORT}:${start + j + 1}  ${port[j].trim()}`);
  j++;
}

for (const b of blocked) {
  console.log(`${PORT}:${start + b.line + 1}  block of ${b.lines} line(s)  ${b.at}\n`);
}

console.log("");
for (const a of annotated) console.log(a + "\n");
for (const r of reindented) console.log(`!! re-indented\n${r}\n`);
for (const u of unmatched) {
  console.log(`!! ${ORIG}:${BODY_FROM + u.i}  ${u.a.trim()}`);
  console.log(`   ${PORT}:${start + u.j + 1}  ${u.b.trim()}\n`);
}
for (const s of spilled) console.log(s + "\n");

const missing = ADDED.filter((t) => !added.some((a) => a.text === t));
const missingBlocks = ADDED_BLOCKS.filter((b) => !blocked.some((x) => x.at === b.at));
const blockLines = blocked.reduce((n, b) => n + b.lines, 0);

/* A declared block stands on its own: blank line above, blank line below. That
   is what makes `lines` checkable -- an extent one line too long lands on the
   line after the block's closing brace, and one too short lands on the brace
   itself. Neither is blank. */
const looseEnds = blocked.filter(
  (b) => (b.line > 0 && port[b.line - 1].trim() !== "") ||
         (b.line + b.lines < port.length && port[b.line + b.lines].trim() !== "")
);

console.log(`${ORIG} ${BODY_FROM}-${BODY_TO} (${orig.length} lines)  ->  ${PORT}:${start + 1}-${end + 1} (${port.length} lines)`);
console.log(`identical  ${orig.length - annotated.length - reindented.length - unmatched.length}/${orig.length} lines`);
console.log(`annotated  ${annotated.length} line(s) differ only by type annotations`);
console.log(`re-indent  ${reindented.length} line(s) moved sideways`);
console.log(`added      ${added.length} line(s) with no counterpart`);
console.log(`blocks     ${blocked.length} block(s), ${blockLines} line(s) with no counterpart`);

let bad = 0;
if (reindented.length) { console.log(`MISMATCH ${reindented.length} line(s) were re-indented`); bad++; }
if (unmatched.length) { console.log(`MISMATCH ${unmatched.length} line(s) differ by more than annotations`); bad++; }
if (spilled.length) { console.log(`MISMATCH the two bodies are not the same length`); bad++; }
if (added.length !== ADDED.length) {
  console.log(`MISMATCH ${ADDED.length} additions were declared but ${added.length} were found`);
  const tally = new Map();
  for (const a of added) tally.set(a.text, (tally.get(a.text) || 0) + 1);
  for (const t of ADDED) tally.set(t, (tally.get(t) || 0) - 1);
  for (const [text, n] of tally) {
    if (n) console.log(`  ${n > 0 ? "extra" : "missing"} ${Math.abs(n)}x  ${JSON.stringify(text)}`);
  }
  const at = added.map((a) => `${PORT}:${start + a.line + 1}`).join(", ");
  console.log(`  added on lines ${at}`);
  bad++;
}
if (missing.length) {
  console.log(`MISMATCH ${missing.length} declared addition(s) never appear:`);
  for (const m of missing) console.log("  " + m);
  bad++;
}
if (blocked.length !== ADDED_BLOCKS.length || missingBlocks.length) {
  console.log(`MISMATCH ${ADDED_BLOCKS.length} block(s) were declared but ${blocked.length} were found`);
  bad++;
}
if (looseEnds.length) {
  console.log(`MISMATCH ${looseEnds.length} block(s) do not sit between blank lines, so their extent is wrong`);
  for (const b of looseEnds) console.log(`  ${PORT}:${start + b.line + 1}  declared ${b.lines} line(s)`);
  bad++;
}
if (bad) process.exit(1);

console.log("MATCH the port is the original, line for line, modulo the declared annotations");
