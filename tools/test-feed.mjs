/* Proves the Phase 4 gate: two browsers converge on the same tower, and a
 * visitor parked at street level does not move when a floor lands at the top.
 *
 *   node tools/test-feed.mjs [--base http://127.0.0.1:3000]
 *
 * The unit tests prove the SQL and the probes prove the page is unchanged.
 * Neither can prove the thing Phase 4 claims, because that claim only exists
 * between two clients: a storey somebody else paid for has to reach a page that
 * is already open, and it has to arrive without moving whoever is looking at the
 * tower. That takes two browsers, one database and a camera to watch.
 *
 * Two Chrome instances rather than two tabs of one, because lib/feed.ts stops
 * polling in a hidden tab and a backgrounded tab is exactly that.
 *
 * Destructive: it truncates floors and purchases. assertLocal() is why it is
 * allowed to.
 */

import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 ? argv[i + 1] : d; };

const BASE = arg("base", "http://127.0.0.1:3000");
const POLL_WAIT = Number(arg("wait", 25000));

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(root, ".env.local"));
  } catch {
    /* reported below */
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(2);
}

function assertLocal(connectionString) {
  const host = new URL(connectionString).hostname;
  if (!["localhost", "127.0.0.1", "::1", "host.docker.internal"].includes(host)) {
    console.error(`refusing to run: DATABASE_URL host is "${host}", not a local database.`);
    process.exit(2);
  }
  return host;
}

const host = assertLocal(url);

const CHROME = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const OUT = join(root, ".impeccable");
const VIEWPORT = { width: 1440, height: 1000 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function eq(label, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok    ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}\n          expected ${e}\n          actual   ${a}`);
  }
}
const is = (label, condition) => eq(label, Boolean(condition), true);

/* ── the driver ─────────────────────────────────────────────────────────────
   The same minimal CDP client tools/shoot.mjs uses, because the CLI screenshot
   flags hang on this machine and Puppeteer is not a dependency of this project. */

/* Chrome re-executes itself on launch, so the process spawn() hands back is
   usually only a launcher: it exits the moment the real browser starts, its pid
   goes stale, and SIGKILL below reaches nothing. The browser survives as an
   orphan holding the profile directory, so the next run cannot clear it. Match
   on the profile path instead. */
function reap(profile) {
  const esc = profile.replace(/'/g, "''");
  try {
    execFileSync("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      `Get-CimInstance Win32_Process -Filter 'Name=''chrome.exe''' | `
      + `Where-Object { $_.CommandLine -like '*${esc}*' } | `
      + `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: "ignore" });
  } catch { /* no powershell, or nothing to reap */ }
}

function launch(profile) {
  try { rmSync(profile, { recursive: true, force: true }); }
  catch { reap(profile); rmSync(profile, { recursive: true, force: true }); }
  mkdirSync(profile, { recursive: true });
  return spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--no-service-autorun",
    "--disable-gpu", "--hide-scrollbars", "--mute-audio",
    "--disable-extensions", "--disable-default-apps", "--disable-sync",
    /* headless Chrome treats the tab as occluded and slows the renderer to a
       crawl, which would put the poll timer seconds out of step with real time */
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-networking", "--disable-component-update",
    "--disable-client-side-phishing-detection", "--disable-domain-reliability",
    "--disable-features=Translate,OptimizationHints,MediaRouter,ChromeWhatsNewUI",
    "--password-store=basic",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
}

async function devtoolsPort(profile) {
  for (let i = 0; i < 120; i++) {
    /* no `child.exitCode` check: the spawned process is a launcher that always
       exits early, so it says nothing about whether the browser is alive */
    const f = join(profile, "DevToolsActivePort");
    if (existsSync(f)) {
      const first = readFileSync(f, "utf8").trim().split(/\r?\n/)[0];
      if (first) return Number(first);
    }
    await sleep(250);
  }
  throw new Error("no DevToolsActivePort after 30s");
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(m.error.message)) : resolve(m.result);
      } else if (m.method && this.handlers.has(m.method)) {
        for (const h of this.handlers.get(m.method)) h(m.params);
      }
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
  once(method, timeout = 20000) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error("timeout waiting for " + method)), timeout);
      const fn = (p) => {
        clearTimeout(t);
        this.handlers.get(method).splice(this.handlers.get(method).indexOf(fn), 1);
        res(p);
      };
      this.on(method, fn);
    });
  }
  send(method, params = {}, timeout = 30000) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error("CDP timeout: " + method)); }
      }, timeout);
    });
  }
}

async function pageWs(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* not listening yet */ }
    await sleep(250);
  }
  throw new Error("no page target on " + port);
}

/* Everything the gate needs, read out of the page in one shot. The tokens are
   the only place the engine publishes the camera, so they are the only honest
   way to ask where it is. */
const SNAP = `(() => {
  const cs   = getComputedStyle(document.documentElement);
  const sc   = document.getElementById('scroller');
  const fl   = document.querySelectorAll('.floor');
  const txt  = (id) => { const e = document.getElementById(id); return e ? e.textContent : null; };
  const num  = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
                         return { y: Math.round(r.y * 100) / 100, h: Math.round(r.height * 100) / 100 }; };
  const at   = (no) => rect(document.querySelector('.floor[data-no="' + no + '"]'));
  return {
    n: num(cs.getPropertyValue('--n')),
    pan: num(cs.getPropertyValue('--pan')),
    drop: num(cs.getPropertyValue('--drop')),
    scrollMax: num(cs.getPropertyValue('--scroll-max')),
    fh: num(cs.getPropertyValue('--fh')),
    scrollTop: sc ? Math.round(sc.scrollTop * 100) / 100 : null,
    cash: txt('signCash'),
    signN: txt('signN'),
    signLast: txt('signLast'),
    storeys: fl.length,
    one: at(1),
    bottom: rect(fl[0]),
    top: rect(fl[fl.length - 1]),
    visibility: document.visibilityState,
    atRest: document.documentElement.dataset.atRest || null,
  };
})()`;

class Page {
  constructor(name, cdp, child, profile) {
    this.name = name; this.cdp = cdp; this.child = child; this.profile = profile;
  }
  async ev(expression, timeout = 30000) {
    const r = await this.cdp.send("Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true }, timeout);
    if (r.exceptionDetails) throw new Error(`${this.name}: ${r.exceptionDetails.text}`);
    return r.result?.value ?? null;
  }
  snap() { return this.ev(SNAP); }
  async until(expression, ms, label) {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < ms) {
      last = await this.ev(expression);
      if (last) return last;
      await sleep(250);
    }
    throw new Error(`${this.name}: timed out after ${ms}ms waiting for ${label}`);
  }
}

async function open(name, url_) {
  const profile = join(OUT, `chrome-feed-${name}`);
  const child = launch(profile);
  const port = await devtoolsPort(profile);
  const ws = new WebSocket(await pageWs(port));
  await new Promise((res, rej) => {
    ws.addEventListener("open", res, { once: true });
    ws.addEventListener("error", rej, { once: true });
  });
  const cdp = new CDP(ws);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride",
    { ...VIEWPORT, deviceScaleFactor: 1, mobile: false });
  await cdp.send("Network.enable").catch(() => {});
  await cdp.send("Network.setBlockedURLs",
    { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] }).catch(() => {});
  const loaded = cdp.once("Page.loadEventFired", 15000);
  await cdp.send("Page.navigate", { url: url_ });
  await loaded.catch(() => {});
  return new Page(name, cdp, child, profile);
}

/* ── the database ───────────────────────────────────────────────────────── */

const admin = new pg.Client({ connectionString: url });
await admin.connect();

async function reset() {
  await admin.query("TRUNCATE floors, purchases; UPDATE tower_state SET count = 0 WHERE id = 1;");
}

/* The only writer the test is allowed: it makes storeys exist the way a
   purchase makes storeys exist, purchase row and all, so the rows it reads back
   are the rows a buyer would have produced. */
async function grow(n, name) {
  await admin.query("BEGIN");
  try {
    const { rows } = await admin.query(
      "UPDATE tower_state SET count = count + $1 WHERE id = 1 RETURNING count - $1 AS lo, count AS now",
      [n]
    );
    const { lo, now } = { lo: rows[0].lo, now: Number(rows[0].now) };
    const id = `cs_feedtest_${lo}`;
    await admin.query("INSERT INTO purchases (id, floors, name, url) VALUES ($1, $2, $3, NULL)",
      [id, n, name]);
    await admin.query(
      `INSERT INTO floors (no, name, url, purchase)
         SELECT gs, $1, NULL, $2 FROM generate_series($3::int, $4::int) AS gs`,
      [name, id, lo + 1, lo + n]);
    await admin.query("COMMIT");
    return now;
  } catch (error) {
    await admin.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/* ── the run ────────────────────────────────────────────────────────────── */

const START = 20;          /* deep enough to have a real rail to be parked on */
const STEP = 6;            /* small enough that the landing path is still taken */
const pages = [];

async function main() {
  await admin.query(readFileSync(join(root, "lib", "schema.sql"), "utf8"));
  await reset();
  await grow(START, "opener-20");
  console.log(`\nconnected to ${host}\nseeded a ${START}-storey tower, then opened two browsers on ${BASE}`);

  const a = await open("a", `${BASE}/`);   /* stays parked at street level */
  const b = await open("b", `${BASE}/`);   /* stays parked at the ceiling  */
  pages.push(a, b);

  /* the page opens empty and fills in from the feed, so the first thing to
     prove is that the feed is live at all */
  await a.until(`(${SNAP}).n >= ${START}`, POLL_WAIT, `a to cold-boot ${START} storeys`);
  await b.until(`(${SNAP}).n >= ${START}`, POLL_WAIT, `b to cold-boot ${START} storeys`);

  /* A page whose database is unreachable is served the demo, and the demo stops
     polling permanently. Nothing below can pass in that state, so it is worth
     failing on the specific thing rather than on the symptom. */
  for (const p of [a, b]) {
    const api = await p.ev(
      `fetch('/api/tower?since=0', { cache: 'no-store' }).then(r => r.json()).then(d => ({ demo: d.demo === true, count: d.count }))`
    );
    is(`${p.name}: database is wired, not the demo`, api.demo === false);
    is(`${p.name}: the tab is visible, so the feed keeps polling`, (await p.snap()).visibility === "visible");
  }

  /* park A at the street: scroller to zero and a beat for the engine to fold
     that into --pan. B is left exactly where the cold boot put it -- the top. */
  await a.ev(`(() => { const s = document.getElementById('scroller'); s.scrollTop = 0; return s.scrollTop; })()`);
  await sleep(1200);

  const a0 = await a.snap();
  const b0 = await b.snap();
  console.log("\n  parked");
  eq("a is at street level", a0.pan, 0);
  eq("b is at the ceiling", b0.pan, b0.scrollMax);
  is("the tower is tall enough to have a rail to be parked on", a0.scrollMax > a0.fh);

  /* ── a floor lands at the top while somebody is watching ──────────────── */
  console.log(`\n  ${STEP} storeys bought by somebody else`);
  const after = await grow(STEP, `poller-${START + STEP}`);
  await a.until(`(${SNAP}).n >= ${after}`, POLL_WAIT, `a to reach ${after}`);
  await b.until(`(${SNAP}).n >= ${after}`, POLL_WAIT, `b to reach ${after}`);
  /* let the landing animation finish before reading the camera, or the
     comparison is against a tower still in motion. data-at-rest carries a
     timestamp, not a boolean: frame() deletes it and armRest() stamps it 260ms
     later, so anything truthy means the scene has stopped painting. */
  await b.until(`!!(${SNAP}).atRest`, 20000, "b to come to rest");
  await sleep(300);

  const a1 = await a.snap();
  const b1 = await b.snap();

  eq("a converged on the same tower", a1.n, after);
  eq("b converged on the same tower", b1.n, after);
  eq("both browsers agree on the count", a1.n, b1.n);
  eq("the signboard counts the dollars", a1.cash, "$" + after);
  eq("and shows it to b as well", b1.cash, "$" + after);

  /* The name travelled the whole way: somebody else's purchase, through the
     database, the API, the poller, the engine's `residents` map, into the DOM. */
  is("the newest storey wears the name that was bought for it",
     (a1.signLast || "").includes(`poller-${after}`));
  is("and storey numbers agree", a1.signN === String(after) && b1.signN === String(after));

  /* The gate. A was parked at the street and stayed there: the rail above it got
     longer, which is the tower's news, not the viewer's. Nothing about where A
     is looking may have changed. */
  eq("a: the camera did not move", a1.pan, a0.pan);
  eq("a: the scroller was not touched", a1.scrollTop, a0.scrollTop);
  eq("a: the street did not move", a1.bottom, a0.bottom);
  is("a: the rail did grow, so this was a real change", a1.scrollMax > a0.scrollMax);
  eq("a: a did not rebuild its storeys", a1.storeys, a0.storeys);

  /* B was watching the ceiling, which is the one place a storey landing is news,
     so B got the animated path and rode the new floor up. */
  eq("b: the camera rode up to the new ceiling", b1.pan, b1.scrollMax);
  is("b: the ceiling moved, as it should have", b1.scrollMax > b0.scrollMax);
  /* Storey 1 never leaves the window at this height -- RENDER_CAP is 48 and the
     tower is 26 -- so `--drop` stays 0 and the drop/pan invariant would only be
     exercised by a tower tall enough to start culling. What is checkable here is
     the same claim seen from the other side: the storey has not moved in the
     world, so the camera climbing must carry it down the screen by exactly the
     distance the camera climbed (screen y grows downward). */
  eq("b: the storeys stayed put in the world while the camera climbed",
     Number((b1.one.y - b0.one.y).toFixed(2)), Number((b1.pan - b0.pan).toFixed(2)));
  /* and the same thing where it is visible: the newest storey arrives where the
     camera is already looking, which is what makes the landing a landing rather
     than the tower growing off-screen somewhere above. */
  eq("b: the new storey landed where the camera was looking",
     b1.top.y, b0.top.y);

  /* ── and again, to prove it is a property and not a first-time effect ── */
  console.log(`\n  another ${STEP}, to show it is not a one-off`);
  const after2 = await grow(STEP, `poller-${after + STEP}`);
  await a.until(`(${SNAP}).n >= ${after2}`, POLL_WAIT, `a to reach ${after2}`);
  await b.until(`(${SNAP}).n >= ${after2}`, POLL_WAIT, `b to reach ${after2}`);
  await b.until(`!!(${SNAP}).atRest`, 20000, "b to come to rest");
  await sleep(300);

  const a2 = await a.snap();
  const b2 = await b.snap();

  eq("both browsers agree again", a2.n, b2.n);
  eq("both converged on the new count", a2.n, after2);
  eq("a is still parked at the street", a2.pan, 0);
  eq("a: the street still has not moved", a2.bottom, a0.bottom);
  eq("a: the scroller still has not been touched", a2.scrollTop, a0.scrollTop);
  eq("b is still at the ceiling", b2.pan, b2.scrollMax);
  is("the newest name is in the DOM again",
     (a2.signLast || "").includes(`poller-${after2}`));

  console.log(`\n  a: storeys ${a0.storeys} -> ${a1.storeys} -> ${a2.storeys}, pan ${a0.pan} -> ${a1.pan} -> ${a2.pan}`);
  console.log(`  b: pan ${b0.pan} -> ${b1.pan} -> ${b2.pan}, ceilings ${b0.scrollMax} -> ${b1.scrollMax} -> ${b2.scrollMax}`);
  console.log(`  b: newest floor y ${b0.top.y} -> ${b1.top.y} -> ${b2.top.y}, storey 1 y ${b0.one.y} -> ${b1.one.y} -> ${b2.one.y}`);
}

let crashed = null;
try {
  await main();
} catch (error) {
  crashed = error;
} finally {
  for (const p of pages) {
    try { p.cdp.ws.close(); } catch {}
    try { p.child.kill("SIGKILL"); } catch {}
    reap(p.profile);
  }
  await reset().catch(() => {});
  await admin.end().catch(() => {});
}

if (crashed) {
  console.log(`\n  ERROR ${crashed.message}`);
  process.exit(1);
}

console.log(failures ? `\n${failures} assertion(s) failed\n` : "\nall good\n");
process.exit(failures ? 1 : 0);
