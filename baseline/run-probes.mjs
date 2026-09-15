/* run-probes.mjs — captures every probe in tools/ against a running copy of the app.

   This is the capture half of the port gate. `baseline/` holds the readings taken
   from the hand-written index.html; `after/` holds the same readings taken from the
   rebuilt app; `compare.mjs` diffs them.

     node baseline/run-probes.mjs --base http://127.0.0.1:58695/index.html --out baseline
     node baseline/run-probes.mjs --base http://127.0.0.1:3000            --out after

   Existing files are left alone unless --force, so a re-run only fills gaps.
   `--no-shot` throughout: the readings are the evidence, and the PNGs could never
   be diffed anyway — the star field randomises on every load.

   Node builtins only, like everything else in tools/.
*/
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };
const OUT   = join(ROOT, arg("out", "baseline"));
const BASE  = arg("base", "http://127.0.0.1:58695/index.html");
const FORCE = argv.includes("--force");
/* narrow the sweep while chasing one failure: --probe roundtrip --vp mobile */
const ONLY_PROBE = arg("probe", "");
const ONLY_VP    = arg("vp", "");

/* probe -> the query and viewports it needs.
   Heights are chosen so each probe meets the condition it was written to judge:
   ?n=8 keeps the tower short enough to still be climbing during a batch order,
   ?n=120 puts it deep enough that the render cap is a window and not a bin,
   ?n=400 is the tallest climb the page can build. */
const PLAN = {
  "probe-px2":    { q: "?n=120",             vps: ["desktop", "mobile", "wide", "laptop", "lap2", "panel", "narrow"] },
  "probe-batch":  { q: "?n=8",               vps: ["desktop", "mobile"] },
  "probe-scroll": { q: "?n=120",             vps: ["desktop", "mobile"] },
  "probe-camera": { q: "?n=120",             vps: ["desktop", "mobile"] },
  "probe-sign":   { q: "?n=120",             vps: ["desktop", "mobile"] },
  "probe-sky":    { q: "?n=120",             vps: ["desktop"] },
  "fresh":        { q: "?n=120",             vps: ["desktop", "mobile"] },
  "midrail":      { q: "?park=0.45&n=120",   vps: ["desktop", "mobile"] },
  "roundtrip":    { q: "?n=120",             vps: ["desktop", "mobile"] },
  "smoke":        { q: "?n=120",             vps: ["desktop"] },
  "props":        { q: "?n=120",             vps: ["desktop"] },
  "lanes":        { q: "?n=120",             vps: ["desktop"] },
  "space":        { q: "?n=400",             vps: ["desktop"] },
};

mkdirSync(OUT, { recursive: true });

let ran = 0, skipped = 0, failed = 0;
for (const [probe, { q, vps }] of Object.entries(PLAN)) {
  if (ONLY_PROBE && probe !== ONLY_PROBE) continue;
  const url = BASE + q;
  for (const vp of vps) {
    if (ONLY_VP && vp !== ONLY_VP) continue;
    const dest = join(OUT, `${probe}-${vp}.txt`);
    if (existsSync(dest) && !FORCE) { skipped++; continue; }

    process.stdout.write(`--> ${probe.padEnd(13)} ${vp.padEnd(8)} ${url}\n`);
    const r = spawnSync(process.execPath, [
      join(ROOT, "tools", "shoot.mjs"),
      "--url", url,
      "--prefix", `cap-${probe}-${vp}`,
      "--only", vp,
      "--eval-file", join(ROOT, "tools", `${probe}.js`),
      "--no-shot",
      "--probe-timeout", "180000",
    ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

    /* shoot.mjs prints its reading on stdout and its stage log on stderr; keep
       both so a failure is diagnosable from the captured file alone */
    writeFileSync(dest, (r.stdout || "") + (r.stderr || ""), "utf8");

    if (r.status !== 0) {
      console.log(`    FAILED (exit ${r.status})`);
      failed++;
      continue;
    }
    ran++;
    const flags = spawnSync(process.execPath, [join(ROOT, "tools", "ro.mjs"), dest, "--flags"], { encoding: "utf8" });
    for (const line of (flags.stdout || "").split("\n").filter((l) => l.trim() && !l.startsWith("==="))) {
      console.log(`    ${line.trim()}`);
    }
  }
}

console.log(`\ncaptured=${ran} skipped=${skipped} failed=${failed} -> ${OUT}`);
process.exit(failed ? 1 : 0);
