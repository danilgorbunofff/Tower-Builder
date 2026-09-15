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
     port[j] is in ADDED               an intentional insertion
     anything else                     a transcription bug, exit 1

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

const annotated = [];
const reindented = [];
const added = [];
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
  unmatched.push({ i, j, a: orig[i], b: port[j] });
  i++; j++;
}

while (i < orig.length) { spilled.push(`dropped   ${ORIG}:${BODY_FROM + i}  ${orig[i].trim()}`); i++; }
while (j < port.length) {
  if (isAdded(port[j])) added.push({ line: j, text: port[j].trim() });
  else spilled.push(`extra     ${PORT}:${start + j + 1}  ${port[j].trim()}`);
  j++;
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

console.log(`${ORIG} ${BODY_FROM}-${BODY_TO} (${orig.length} lines)  ->  ${PORT}:${start + 1}-${end + 1} (${port.length} lines)`);
console.log(`identical  ${orig.length - annotated.length - reindented.length - unmatched.length}/${orig.length} lines`);
console.log(`annotated  ${annotated.length} line(s) differ only by type annotations`);
console.log(`re-indent  ${reindented.length} line(s) moved sideways`);
console.log(`added      ${added.length} line(s) with no counterpart`);

let bad = 0;
if (reindented.length) { console.log(`MISMATCH ${reindented.length} line(s) were re-indented`); bad++; }
if (unmatched.length) { console.log(`MISMATCH ${unmatched.length} line(s) differ by more than annotations`); bad++; }
if (spilled.length) { console.log(`MISMATCH the two bodies are not the same length`); bad++; }
if (added.length !== ADDED.length) {
  console.log(`MISMATCH ${ADDED.length} additions were declared but ${added.length} were found`);
  bad++;
}
if (missing.length) {
  console.log(`MISMATCH ${missing.length} declared addition(s) never appear:`);
  for (const m of missing) console.log("  " + m);
  bad++;
}
if (bad) process.exit(1);

console.log("MATCH the port is the original, line for line, modulo the declared annotations");
