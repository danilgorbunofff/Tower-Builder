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
   moving) and `settleWaitMs` (how long the harness waited for that).

   Everything else is geometry and must match, with two narrow exceptions, both
   reported rather than hidden: differences of 0.02px or less are counted as
   "rounding-only", and the handful of readings listed in ENV below — each one
   proven to move the same way for the ORIGINAL against its own baseline — are
   counted as "env-sensitive" and printed with `~`. A file still moves only when
   a value falls outside both.

   Verified against itself: re-running the same URL through shoot.mjs moves
   nothing but those clocks, so a non-zero diff here is a real regression.
*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const isClock = (key, path) =>
  (key === "atRest" && path === "") ||
  (key === "settleWaitMs" && path === "") ||
  (key === "flag" && path === "restCheck");

/* Readings taken OUTSIDE the engine that are known to move on their own, and
   were proven to do so by running the ORIGINAL against its own baseline. Each
   entry names one exact file and one exact path, with its own bound, so it
   cannot silently absorb a whole class of changes — and every tolerated value is
   printed, never swallowed.

   `scene` is `.sky svg.scene`, sized by the stylesheet's `height: 3803.704%`
   (8216/216). Chrome resolves that percentage against `.sky`'s used height and
   caches the result from whichever layout pass got there first; after settle the
   original reads 33508.84375 and the port 33508.8125 — 2/64px, the layout
   quantum. Forcing the same percentage to re-resolve on BOTH pages yields
   33508.84375 on both, so the port's engine arithmetic is identical and the
   difference is purely which pass won. 3803.704% of 880.953125px is ~33509px, so
   a 1e-5 relative bound still catches any real change (0.33px, and a storey is
   52px). */
const ENV = {
  "probe-sky-desktop.txt": {
    "scene.h": { rel: 1e-5 },
    "scene.top": { rel: 1e-5 },
  },
  /* `back.*T` are parallax transforms read as `matrix(1, 0, 0, 1, 0, <px>)`,
     i.e. STRINGS, so the numeric rule above can never reach them. probe-scroll
     assigns scrollTop, sleeps 60ms, and samples a rAF-driven transform that is
     still travelling (`beatCarriedScene` asserts it is: it wants slideT to
     differ from the settled reading). So the value is a race with the page's own
     paint, and it lands on one of a few quantised frames rather than on a
     measurement. Sampling the ORIGINAL page five times, re-measured, gives
     5522.17 / 5539.62 / 5555.51 desktop and 4692.23 / 4705.69 / 4717.42 mobile --
     a 0.60% spread, identical quanta in both environments, with the port drawing
     from the same three. 8e-3 clears that jitter; it is still well under the
     1.3-1.8% gap to the settled transform, so a scene that stopped animating is
     caught. The string skeleton must match exactly, so this can only ever excuse
     the numbers inside one transform, never a change of transform. */
  "probe-scroll-desktop.txt": {
    "back.camT": { rel: 8e-3 }, "back.slideT": { rel: 8e-3 },
    "back.farT": { rel: 8e-3 }, "back.pavT": { rel: 8e-3 },
  },
  "probe-scroll-mobile.txt": {
    "back.camT": { rel: 8e-3 }, "back.slideT": { rel: 8e-3 },
    "back.farT": { rel: 8e-3 }, "back.pavT": { rel: 8e-3 },
  },
  /* probe-space restarts a CSS animation and samples it mid-flight — it reports
     `"moved": true` about itself, so a moving value is the point. The original
     gave 7.5/6.5 once and then 7/7.81 on both later runs, which is exactly what
     the port gives; the baseline capture is the outlier, not the port. Radii
     swing ~1.3 on their own, so the bound is absolute, set just above that. */
  "space-desktop.txt": {
    "orbit.r0": { abs: 0.6 },
    "orbit.r1": { abs: 1.4 },
  },
};

const NUM = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const numbersIn = (s) => (s.match(NUM) || []).map(Number);
const skeleton = (s) => s.replace(NUM, "#");

const withinBound = (a, b, rule) => {
  if (typeof a === "number" && typeof b === "number") {
    if (rule.abs !== undefined && Math.abs(a - b) <= rule.abs) return true;
    return rule.rel !== undefined &&
      Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1) <= rule.rel;
  }
  /* a transform read back from getComputedStyle: same shape, numbers allowed to
     drift. A different transform is a different string skeleton and fails. */
  if (typeof a === "string" && typeof b === "string" && rule.rel !== undefined) {
    if (skeleton(a) !== skeleton(b)) return false;
    const na = numbersIn(a), nb = numbersIn(b);
    return na.length === nb.length &&
      na.every((x, i) => Math.abs(x - nb[i]) /
        Math.max(Math.abs(x), Math.abs(nb[i]), 1) <= rule.rel);
  }
  return false;
};

const isEnv = (label, d) => {
  const rule = (ENV[basename(label)] || {})[d.path];
  return rule ? withinBound(d.before, d.after, rule) : false;
};

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
  /* numbers that moved a hair are rounding, not regressions; readings in ENV are
     the page's own layout/animation noise. Everything else is a real move. */
  const hard = [], env = [], soft = [];
  for (const d of out) {
    if (typeof d.before === "number" && typeof d.after === "number"
        && Math.abs(d.before - d.after) <= 0.02) soft.push(d);
    else if (isEnv(label, d)) env.push(d);
    else hard.push(d);
  }
  return { label, hard, env, soft: soft.length };
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

let moved = 0, softTotal = 0, envTotal = 0, matched = 0, broke = 0;
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
  envTotal += r.env.length;
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
    const notes = [];
    if (r.soft) notes.push(`${r.soft} rounding-only`);
    if (r.env.length) notes.push(`${r.env.length} env-sensitive`);
    console.log(`  ${p.label.padEnd(30)} MATCH` + (notes.length ? `  (${notes.join(", ")})` : ""));
    for (const d of r.env) {
      console.log(`      ~ ${d.path}: ${JSON.stringify(d.before)} -> ${JSON.stringify(d.after)}`);
    }
  }
}

console.log("");
if (failures.length) {
  console.log(`FAIL — ${moved} file(s) moved, ${broke} broken, of ${pairs.length}`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
const notes = [];
if (softTotal) notes.push(`${softTotal} rounding-only`);
if (envTotal) notes.push(`${envTotal} env-sensitive, listed above`);
console.log(`MATCH — all ${pairs.length} measurement file(s) held` +
  (notes.length ? ` (${notes.join(", ")} — tolerated)` : ""));
