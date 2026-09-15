/* compare.mjs — does the tower still measure the same?

   `ro.mjs` answers "is the tower self-consistent?" — it walks a probe's own `ok`
   flags. This answers the other question the port needs: "is it still the SAME
   tower?" It diffs two shoot.mjs runs key by key and prints every value that
   moved, so a port can be proven faithful or caught red-handed.

   usage:
     node baseline/compare.mjs <before.txt> <after.txt>   # one probe, one viewport
     node baseline/compare.mjs baseline after             # every file in both

   The port gate is the directory form, and it is one command:
     node baseline/run-probes.ps1 -OutDir after -BaseUrl http://127.0.0.1:3000
     node baseline/compare.mjs baseline after

   A file present in the first directory and missing from the second is itself a
   failure: a probe that stops running is a measurement quietly lost.

   Three keys are ignored because they are clocks, not measurements: `atRest`
   and `restCheck.flag` (the wall-clock stamp the page sets once it stops
   moving) and `settleWaitMs` (how long the harness waited for that). Everything
   else is geometry and must match exactly.

   Verified against itself: re-running the same URL through shoot.mjs moves
   nothing but those clocks, so a non-zero diff here is a real regression.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const isClock = (key, path) =>
  (key === "atRest" && path === "") ||
  (key === "settleWaitMs" && path === "") ||
  (key === "flag" && path === "restCheck");

/* Slice one complete JSON value off the front of `from`, whatever its type.
   shoot.mjs prints `EVAL <viewport> <JSON.stringify(reading, null, 1)>`, so the
   reading is always well-formed JSON — but NOT always an object. Two probes
   (probe-sign, smoke) hand their reading back as a JSON *string*, which shoot
   re-serialises with quotes and escapes. Brace-matching from the first `{` reads
   those as garbage; scanning a value of the right kind reads them as what they
   are. */
function scanJson(s, from) {
  const c = s[from];
  if (c === '"') {
    for (let i = from + 1; i < s.length; i++) {
      if (s[i] === "\\") { i++; continue; }
      if (s[i] === '"') return s.slice(from, i + 1);
    }
    throw new Error("unterminated string");
  }
  if (c === "{" || c === "[") {
    let depth = 0, inStr = false;
    for (let i = from; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (ch === "\\") i++;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") { if (--depth === 0) return s.slice(from, i + 1); }
    }
    throw new Error("unbalanced JSON");
  }
  const m = /^(?:-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(s.slice(from));
  if (!m) throw new Error("no JSON value after EVAL");
  return m[0];
}

function parse(file) {
  let s = readFileSync(file, "utf8");
  if (!s.includes("EVAL")) s = readFileSync(file, "utf16le");
  const at = s.indexOf("EVAL ");           // "EVAL " with the space: never hits EVAL-ERR
  if (at < 0) throw new Error(`no EVAL line in ${file}`);
  let i = at + "EVAL ".length;
  while (i < s.length && !/\s/.test(s[i])) i++;   // the viewport name
  while (i < s.length && /\s/.test(s[i])) i++;    // the gap before the reading
  let v = JSON.parse(scanJson(s, i));
  /* unwrap a reading that came back as a JSON string, so the diff is per-key
     rather than one opaque blob that can only ever say "different" */
  while (typeof v === "string" && /^\s*[{[]/.test(v)) v = JSON.parse(v);
  return v;
}

/* walk both trees together: a key present on one side only is a diff too, which
   is how a port loses a whole measurement without anyone noticing */
function diff(a, b, path, out) {
  if (a === b) return;
  const ta = Array.isArray(a), tb = Array.isArray(b);
  if (ta && tb) {
    if (a.length !== b.length) {
      out.push({ path, before: `Array(${a.length})`, after: `Array(${b.length})` });
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      diff(a[i], b[i], `${path}[${i}]`, out);
    }
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (isClock(k, path)) continue;
      diff(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    return;
  }
  out.push({ path, before: a, after: b });
}

function compareOne(a, b, label) {
  let va, vb;
  try { va = parse(a); } catch (e) { return { label, fatal: `${a} — ${e.message}` }; }
  try { vb = parse(b); } catch (e) { return { label, fatal: `${b} — ${e.message}` }; }
  const out = [];
  diff(va, vb, "", out);
  /* numbers that moved a hair are rounding, not regressions — count them apart
     so a 0.01px float wobble never reads as a broken storey */
  const hard = out.filter((d) =>
    !(typeof d.before === "number" && typeof d.after === "number"
      && Math.abs(d.before - d.after) <= 0.02));
  return { label, hard, soft: out.length - hard.length };
}

const argv = process.argv.slice(2);
/* --only probe-sign,midrail  compares just those files — for chasing one failure
   without drowning in the 24 files a partial capture legitimately did not write */
const onlyIdx = argv.indexOf("--only");
const ONLY = onlyIdx >= 0 ? (argv[onlyIdx + 1] || "").split(",").filter(Boolean) : [];
const args = argv.filter((f, i) =>
  f !== "--only" && !(onlyIdx >= 0 && i === onlyIdx + 1) && !f.startsWith("--"));
if (args.length < 2) {
  console.error("usage: node compare.mjs <before.txt|dir> <after.txt|dir> [--only a,b]");
  process.exit(2);
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

let pairs;
if (isDir(args[0]) && isDir(args[1])) {
  pairs = readdirSync(args[0]).filter((f) => f.endsWith(".txt")).sort()
    .map((n) => ({ a: join(args[0], n), b: join(args[1], n), label: n }));
} else {
  pairs = args.slice(1).map((f) => ({ a: args[0], b: f, label: isDir(args[1]) ? f : `${args[0]} vs ${f}` }));
}

let moved = 0, softTotal = 0, matched = 0, broke = 0;
const failures = [];
const wanted = pairs.filter((p) => !ONLY.length || ONLY.some((o) => p.label.includes(o)));
if (!wanted.length) {
  console.error(`--only matched nothing of ${pairs.length} file(s)`);
  process.exit(2);
}
pairs = wanted;

for (const p of pairs) {
  const r = compareOne(p.a, p.b, p.label);
  if (r.fatal) {
    broke++;
    console.log(`  ${p.label.padEnd(30)} BROKEN  ${r.fatal}`);
    failures.push(`${p.label}: ${r.fatal}`);
    continue;
  }
  softTotal += r.soft;
  if (r.hard.length) {
    moved++;
    console.log(`  ${p.label.padEnd(30)} ${r.hard.length} moved` +
      (r.soft ? `  (+${r.soft} rounding)` : ""));
    for (const d of r.hard.slice(0, 20)) {
      console.log(`      ${d.path || "(root)"}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
    }
    if (r.hard.length > 20) console.log(`      … ${r.hard.length - 20} more`);
    failures.push(`${p.label}: ${r.hard.length} measurements moved`);
  } else {
    matched++;
    console.log(`  ${p.label.padEnd(30)} MATCH` + (r.soft ? `  (${r.soft} rounding-only)` : ""));
  }
}

console.log("");
if (failures.length) {
  console.log(`FAIL — ${moved} file(s) moved, ${broke} broken, of ${pairs.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log(`MATCH — all ${pairs.length} measurement file(s) held` +
  (softTotal ? ` (${softTotal} rounding-only differences tolerated)` : ""));
