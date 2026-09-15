/*
  shoot.mjs — reliable headless screenshots over the Chrome DevTools Protocol.

  The plain `--screenshot=` CLI flag hangs on this machine (Chrome stalls on GCM
  registration and never writes a file), so we drive the browser instead and
  wait for real signals: the load event, then the geometry itself standing
  still. The font hosts are blocked because this machine cannot reach them and
  an unanswerable stylesheet request delays the load event by minutes.

  usage:
    node shoot.mjs --url http://127.0.0.1:58695/?n=34 --prefix stack-v1
    node shoot.mjs --url <url> --prefix <p> --full           # capture full page
    node shoot.mjs --url <url> --prefix <p> --only desktop
*/
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);

const OUT = join(process.cwd(), '.impeccable');

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const flag = (k) => argv.includes('--' + k);

const URL_ = arg('url');
const PREFIX = arg('prefix', 'shot');
const FULL = flag('full');
const ONLY = arg('only', '');
const EVAL = arg('eval', '');
const EVAL_FILE = arg('eval-file', '');
const SKIP_SHOT = flag('no-shot');
const EXPR = EVAL_FILE ? readFileSync(EVAL_FILE, 'utf8') : EVAL;
/* probes in this project sweep the whole scroll rail and sleep on animation
   frames; the default 30s CDP ceiling is not enough room for that */
const PROBE_TIMEOUT = Number(arg('probe-timeout', 120000));

const VIEWPORTS = {
  desktop: { width: 1440, height: 1000, mobile: false },
  mobile: { width: 390, height: 844, mobile: true },
  wide: { width: 1920, height: 1080, mobile: false },
  laptop: { width: 840, height: 900, mobile: false },
  lap2: { width: 1280, height: 800, mobile: false },
  panel: { width: 427, height: 650, mobile: false },
  narrow: { width: 620, height: 700, mobile: false },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Chrome re-executes itself on launch, so the process spawn() hands back is
   often only a launcher: it exits the moment the real browser starts, child.pid
   goes stale, and child.kill() below kills nothing. The real browser survives as
   an orphan holding the profile directory locked. rmSync then throws EPERM, the
   capture dies, and because run-probes.mjs reuses one profile per probe and
   viewport, every later capture of that same probe is stranded too. So when the
   delete fails, kill whatever chrome is still pointing at this profile. */
function reap(profile) {
  const esc = profile.replace(/'/g, "''");
  try {
    execFileSync('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      /* every string here is single-quoted: node escapes windows argv with
         backslashes, which powershell does not unescape, so a double quote in
         the command silently arrives mangled and kills nothing */
      `Get-CimInstance Win32_Process -Filter 'Name=''chrome.exe''' | `
      + `Where-Object { $_.CommandLine -like '*${esc}*' } | `
      + `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' });
  } catch { /* nothing to reap, or no powershell: the rmdir will say so */ }
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function freshProfile(profile) {
  for (let i = 0; ; i++) {
    try { rmSync(profile, { recursive: true, force: true }); return; }
    catch (e) {
      if (i >= 13 || !['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(e.code)) throw e;
      reap(profile);
      /* Windows frees the profile's handles a moment after chrome dies, not
         when it is killed: retrying instantly just re-fails against a browser
         that is still deleting its own files. ~4s of grace in total, which is
         far cheaper than a lost capture -- run-probes.mjs reuses one profile per
         probe and viewport, so a throw here strands every later capture too. */
      sleepSync(300);
    }
  }
}

function launch(profile) {
  freshProfile(profile);
  mkdirSync(profile, { recursive: true });
  const p = spawn(CHROME, [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--no-service-autorun',
    '--disable-gpu', '--hide-scrollbars', '--mute-audio',
    '--disable-extensions', '--disable-default-apps', '--disable-sync',
    /* headless Chrome treats the tab as occluded and slows the renderer down to
       a crawl: animation frames and timers fire seconds apart, which freezes the
       newest storey mid-landing and makes every measurement race the page's own
       paint. These three are the cure. */
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-background-networking', '--disable-component-update',
    '--disable-client-side-phishing-detection', '--disable-domain-reliability',
    '--disable-features=Translate,OptimizationHints,MediaRouter,ChromeWhatsNewUI',
    '--password-store=basic',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  return p;
}

async function devtoolsPort(profile, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('chrome exited early: ' + child.exitCode);
    const f = join(profile, 'DevToolsActivePort');
    if (existsSync(f)) {
      const txt = readFileSync(f, 'utf8').trim().split(/\r?\n/);
      if (txt[0]) return Number(txt[0]);
    }
    await sleep(250);
  }
  throw new Error('no DevToolsActivePort after 30s');
}

/* minimal CDP client over the built-in WebSocket */
class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
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
      const t = setTimeout(() => rej(new Error('timeout waiting for ' + method)), timeout);
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
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }
      }, timeout);
    });
  }
}

async function connect(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* browser not listening yet */ }
    await sleep(250);
  }
  throw new Error('no page target on ' + port);
}

async function shoot(vp) {
  const profile = join(OUT, `chrome-${PREFIX}-${vp}`);
  const marks = [];
  const mark = (what) => { marks.push(`${what}=${Math.round(performance.now() - t0)}`); };
  const t0 = performance.now();
  const child = launch(profile);
  const outPath = join(OUT, `${PREFIX}-${vp}.png`);
  try {
    const port = await devtoolsPort(profile, child);
    const wsUrl = await connect(port);
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.addEventListener('open', res, { once: true });
      ws.addEventListener('error', rej, { once: true });
    });
    const cdp = new CDP(ws);
    mark('launch');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: VIEWPORTS[vp].width, height: VIEWPORTS[vp].height,
      deviceScaleFactor: 1, mobile: VIEWPORTS[vp].mobile,
    });
    mark('setup');

    /* the page pulls its pixel fonts from fonts.googleapis.com. This machine
       cannot reach it, so the stylesheet request sits there for a minute or two
       and the load event arrives far too late to be a starting gun. Block the
       two font hosts: the requests fail at once, the load event lands on time,
       and -- since the fonts never arrived here anyway -- the measurements stay
       exactly what they were. */
    await cdp.send('Network.enable').catch(() => {});
    await cdp.send('Network.setBlockedURLs', {
      urls: ['*fonts.googleapis.com*', '*fonts.gstatic.com*'],
    }).catch(() => {});

    const loaded = cdp.once('Page.loadEventFired', 6000);
    await cdp.send('Page.navigate', { url: URL_ });
    await loaded.then(() => mark('load')).catch(() => mark('load-timeout'));

    /* the webfonts, if this machine can reach them at all: this box cannot, and
       a stalled stylesheet request must not hold a probe hostage, so give the
       fonts a moment and measure either way */
    await cdp.send('Runtime.evaluate', {
      expression: 'document.fonts.ready.then(() => true)',
      awaitPromise: true,
    }, 1500).then(() => mark('fonts')).catch(() => mark('fonts-timeout'));

    /* real signal: the tower actually finished being built. Boot appends storeys
       one at a time until `--n` reaches the count asked for, so on a deep tower
       the page is still assembling long after the load event, and a probe let
       loose in that window measures a half-built tower -- exactly the 26px storey
       that used to look like a layout fault. So wait for the count, then for the
       geometry to stand still across three samples with nothing finite animating;
       the page's own `data-at-rest` rides along as a second opinion. */
    await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        const cs = getComputedStyle(document.documentElement);
        const want = Number(new URLSearchParams(location.search).get('n') || 0);
        const built = () => {
          const n = Math.round(parseFloat(cs.getPropertyValue('--n')) || 0);
          return !want || n >= want;
        };
        const sig = () => {
          const f = document.querySelectorAll('.floor');
          const top = f[f.length - 1];
          const roof = document.querySelector('.roof');
          const tower = document.querySelector('.tower');
          if (!top || !roof || !tower) return 'waiting';
          const a = top.getBoundingClientRect();
          const r = roof.getBoundingClientRect();
          const t = tower.getBoundingClientRect();
          return [f.length, Math.round(a.y), Math.round(a.height),
                  Math.round(r.y), Math.round(r.height), Math.round(t.height),
                  Math.round(cs.getPropertyValue('--n'))].join(':');
        };
        const busy = () => document.getAnimations().filter((a) => {
          const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
          return a.playState === 'running' && t.iterations !== Infinity;
        }).length;
        let last = sig(), same = 0, waited = 0;
        for (let i = 0; i < 600; i++) {
          await new Promise((r) => setTimeout(r, 200));
          waited += 200;
          const now = sig();
          same = (now === last) ? same + 1 : 0;
          last = now;
          if (built() && same >= 3 && !busy()) break;
        }
        window.__settleWaitMs = waited;
        return { atRest: document.documentElement.dataset.atRest || null, waited: waited,
                 built: built(), running: busy() };
      })()`,
      awaitPromise: true, returnByValue: true,
    }, 150000).then((r) => {
      const v = r.result?.value || {};
      mark('settle');
      console.log(`SETTLE ${vp} atRest=${v.atRest} waited=${v.waited}ms built=${v.built} running=${v.running}`);
    }).catch(() => { mark('settle-timeout'); });

    if (EXPR) {
      const r = await cdp.send('Runtime.evaluate', {
        expression: EXPR, returnByValue: true, awaitPromise: true,
      }, PROBE_TIMEOUT);
      mark('probe');
      console.log(`EVAL ${vp} ${JSON.stringify(r.result?.value ?? r.result ?? null, null, 1)}`);
      console.log(`EVAL-ERR ${JSON.stringify(r.exceptionDetails?.text || null)}`);
    }

    if (SKIP_SHOT) { mark('done'); console.log(`STAGES ${vp} ${marks.join(' ')}`); ws.close(); return; }

    const params = { format: 'png', fromSurface: true };
    if (FULL) {
      const m = await cdp.send('Page.getLayoutMetrics');
      const h = Math.ceil(m.cssContentSize?.height || m.contentSize?.height || VIEWPORTS[vp].height);
      params.captureBeyondViewport = true;
      params.clip = { x: 0, y: 0, width: VIEWPORTS[vp].width, height: h, scale: 1 };
    }
    const { data } = await cdp.send('Page.captureScreenshot', params);
    writeFileSync(outPath, Buffer.from(data, 'base64'));

    /* surface console errors so a broken build is visible in the log */
    const errs = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__errs || [])', returnByValue: true,
    }).catch(() => ({ result: { value: '[]' } }));
    console.log(`OK   ${vp.padEnd(7)} ${readFileSync(outPath).length} bytes  ${outPath}  errs=${errs.result?.value}`);
    mark('done');
    console.log(`STAGES ${vp} ${marks.join(' ')}`);
    ws.close();
  } catch (e) {
    console.log(`FAIL ${vp.padEnd(7)} ${e.message}`);
  } finally {
    /* exitCode is set when the process we spawned was a launcher that already
       exited -- the real browser is out there on its own and child.kill() below
       cannot reach it, so reap by profile instead. */
    const launcherGone = child.exitCode !== null;
    try { child.kill('SIGKILL'); } catch {}
    if (launcherGone) reap(profile);
  }
}

const which = ONLY ? [ONLY] : ['desktop', 'mobile'];
mkdirSync(OUT, { recursive: true });
for (const vp of which) await shoot(vp);
process.exit(0);
