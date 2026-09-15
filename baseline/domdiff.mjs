/* domdiff.mjs — the Phase 2 gate.

   Reads the markup of the hand-written index.html and of the rebuilt app through
   the same lens (baseline/domdump.js) and diffs the two structural signatures.
   This is what makes "frame.tsx is a transcription" a checked claim instead of a
   hopeful one.

     node baseline/fontserver.mjs                       # leave running: 58695
     npm run start                                      # leave running: 3000
     node baseline/domdiff.mjs
     node baseline/domdiff.mjs --dump                   # keep both sides for eyeballing

   Exit 0 only on byte-identical signatures. Exit 1 on a real difference, 2 when
   one side could not be read at all -- a harness that cannot tell those two apart
   is worse than no harness.

   Node builtins only, like everything else here. */

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf("--" + k);
  return i >= 0 ? argv[i + 1] : d;
};
const ORIGINAL = arg("original", "http://127.0.0.1:58695/index.html");
const CANDIDATE = arg("candidate", "http://127.0.0.1:3000/");
const DUMP = argv.includes("--dump");
/* the frame does not reflow by viewport, and the dump is markup, not layout */
const VP = arg("vp", "desktop");

/* Reads one side. shoot.mjs prints `EVAL <vp> <json>` with the value pretty
   printed at indent 1; domdump.js always returns a string, and a JSON string has
   no raw newlines, so the value is guaranteed to sit on that one line. */
function read(url) {
  const r = spawnSync(
    process.execPath,
    [
      join(ROOT, "tools", "shoot.mjs"),
      "--url", url,
      "--prefix", "domdiff",
      "--only", VP,
      "--eval-file", join(HERE, "domdump.js"),
      "--no-shot",
      "--probe-timeout", "120000",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );

  const stdout = r.stdout || "";
  const line = stdout.split("\n").find((l) => l.startsWith(`EVAL ${VP} `));
  const errLine = stdout.split("\n").find((l) => l.startsWith("EVAL-ERR "));
  if (!line) {
    const why = errLine && errLine !== "EVAL-ERR null" ? errLine : (r.stderr || "").trim().split("\n").slice(-4).join("\n");
    return { ok: false, why: `no reading from ${url} (exit ${r.status})\n    ${why}` };
  }
  let value;
  try {
    value = JSON.parse(line.slice(`EVAL ${VP} `.length));
  } catch (e) {
    /* When the payload itself fails to run, shoot.mjs prints `EVAL <vp> {` -- the
       exception object, not the expected string -- and its EVAL-ERR line carries
       only the word "Uncaught" (L255 prints exceptionDetails.text, which drops the
       real message). So a one-character typo in domdump.js presents as a JSON
       position error, which points at the wrong file. Name the actual suspect. */
    const hint = errLine ? `\n    ${errLine}` : "";
    return {
      ok: false,
      why:
        `unparseable reading from ${url}: ${e.message}${hint}\n` +
        "    the payload failed to run -- check it with " +
        `\`node --check ${join(HERE, "domdump.js").replace(/\\/g, "/")}\``,
    };
  }
  if (typeof value !== "string" || !value.length) {
    const hint = errLine ? ` (${errLine})` : "";
    return { ok: false, why: `${url} returned ${typeof value} instead of a signature${hint} -- is the server serving the app?` };
  }
  return { ok: true, lines: value.split("\n") };
}

const a = read(ORIGINAL);
const b = read(CANDIDATE);
for (const side of [a, b]) {
  if (!side.ok) {
    console.error("CANNOT READ: " + side.why);
    process.exit(2);
  }
}

if (DUMP) {
  writeFileSync(join(HERE, "dom-original.txt"), a.lines.join("\n") + "\n", "utf8");
  writeFileSync(join(HERE, "dom-candidate.txt"), b.lines.join("\n") + "\n", "utf8");
  console.log(`wrote baseline/dom-original.txt (${a.lines.length} lines)`);
  console.log(`wrote baseline/dom-candidate.txt (${b.lines.length} lines)`);
}

if (a.lines.join("\n") === b.lines.join("\n")) {
  console.log(`MATCH  ${a.lines.length} lines of markup identical`);
  console.log(`  ${ORIGINAL}`);
  console.log(`  ${CANDIDATE}`);
  process.exit(0);
}

/* The two should be identical, so anything else is worth reading in full. A plain
   longest-common-subsequence diff, then a bounded print: enough to name the fault,
   not so much that the terminal scrolls the answer away. */
const n = a.lines.length, m = b.lines.length;
const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
for (let i = n - 1; i >= 0; i--) {
  for (let j = m - 1; j >= 0; j--) {
    lcs[i][j] = a.lines[i] === b.lines[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  }
}
const ops = [];
for (let i = 0, j = 0; i < n || j < m; ) {
  if (i < n && j < m && a.lines[i] === b.lines[j]) {
    ops.push([" ", a.lines[i]]); i++; j++;
  } else if (j < m && (i === n || lcs[i][j + 1] >= lcs[i + 1][j])) {
    ops.push(["+", b.lines[j]]); j++;
  } else {
    ops.push(["-", a.lines[i]]); i++;
  }
}

/* Trim to the changed region: unchanged runs at the top and bottom are noise
   unless they provide context. */
let first = ops.findIndex(([op]) => op !== " ");
let last = ops.length - 1;
while (last > first && ops[last][0] === " ") last--;
const CAP = 120;
const window = ops.slice(Math.max(0, first - 3), Math.min(ops.length, last + 4));
const removed = window.filter(([op]) => op === "-").length;
const added = window.filter(([op]) => op === "+").length;

console.log(`DIFF  original ${n} lines, candidate ${m} lines`);
console.log(`      ${removed} line(s) only in ${ORIGINAL}`);
console.log(`      ${added} line(s) only in ${CANDIDATE}`);
console.log("");
for (const [op, line] of window.slice(0, CAP)) console.log(op + " " + line);
if (window.length > CAP) console.log(`... ${window.length - CAP} more line(s) of difference suppressed`);
process.exit(1);
