/* The levitating props contract: the fourteen drawn floats are runged from just
   above the parked frame to whatever ceiling this window can climb to -- cycling
   the shapes when the climb is taller than the ladder -- one at a time, each
   inside the lane the window leaves free, never over the column, never cropped,
   and never stopping before the climb does. Measured through the browser's own
   rects, so the CSS motion is included: a prop that turns is judged at whatever
   angle it happens to be caught in. */
(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const q = n => Math.round(n * 100) / 100;
  const FIRST = 260, MIN_STEP = 96, WIDTH_LAW = 30, SHAPES = 14;

  const sky = document.querySelector('.sky');
  const sc = document.getElementById('scroller');
  const tower = document.querySelector('.tower');
  const group = document.getElementById('levProps');
  if (!sky || !sc || !tower || !group) return 'MISSING';

  const s0 = sky.getBoundingClientRect();
  const k = Math.max(s0.width / 360, s0.height / 216);
  const wall = q(s0.height / k);                                 /* the window, in art units */
  const rail = Math.max(0, sc.scrollHeight - sc.clientHeight);   /* == autoPan, in pixels */
  const uMax = q(rail / k);                                      /* the ceiling, in art units */

  const read = g => {
    const body = g.firstElementChild;
    const tf = g.getAttribute('transform') || '';
    const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(tf);
    const rects = [...body.querySelectorAll('rect')].map(r => ({
      x: +r.getAttribute('x') || 0, y: +r.getAttribute('y') || 0,
      w: +r.getAttribute('width') || 0, h: +r.getAttribute('height') || 0,
    }));
    const x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.w));
    const y0 = Math.min(...rects.map(r => r.y)), y1 = Math.max(...rects.map(r => r.y + r.h));
    /* what a turning prop sweeps is its box turned about its middle, not its box */
    const flip = (body.getAttribute('class') || '').includes('flip');
    const half = Math.hypot((x1 - x0) / 2, (y1 - y0) / 2);
    return {
      body, tf, hidden: g.style.display === 'none',
      rung: +g.getAttribute('data-rung'), y: +g.getAttribute('data-y'),
      tx: m ? +m[1] : NaN, ty: m ? +m[2] : NaN,
      wide: flip ? half * 2 : x1 - x0,
      sig: rects.map(r => [r.x, r.y, r.w, r.h].join('/')).join(' '),
    };
  };

  const pool = [...group.children].map(read);
  const props = pool.filter(p => !p.hidden);
  const rungs = props.map(p => p.rung);
  const ys = props.map(p => p.y);

  if (!props.length) {
    return {
      frame: { w: q(s0.width), h: q(s0.height), k: q(k), window: wall },
      ceiling: uMax, firstRung: FIRST,
      nothingDueYet: uMax < FIRST,
      pass: uMax < FIRST,
    };
  }

  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const STEPS = 140;
  const visible = new Set(), centred = new Set();
  const cropped = [], behind = [], crowded = [];
  const firstSeen = [], firstMid = [];
  let blank = 0, blankWorst = 0, blankAt = -1, seenAtEnd = 0;

  sc.scrollTop = 0;
  await raf();
  const atTheStreet = sky.getBoundingClientRect();
  const streetIsClear = props.every(p => {
    const b = p.body.getBoundingClientRect();
    return b.bottom < atTheStreet.top || b.top > atTheStreet.bottom;
  });

  for (let s = 0; s <= STEPS; s++) {
    sc.scrollTop = Math.round(max * s / STEPS);
    await raf();
    const f = sky.getBoundingClientRect();
    const col = tower.getBoundingClientRect();
    let seen = 0, mid = 0;
    for (const p of props) {
      const b = p.body.getBoundingClientRect();
      if (b.bottom < f.top || b.top > f.bottom) continue;
      seen++; visible.add(p.rung);
      if (firstSeen[p.rung] === undefined) firstSeen[p.rung] = q(s / STEPS);
      if (b.left < f.left - 1 || b.right > f.right + 1) {
        cropped.push({ rung: p.rung, s, l: q(b.left - f.left), r: q(f.right - b.right) });
      }
      if (b.right > col.left + 0.5 && b.left < col.right - 0.5 &&
          b.bottom > col.top && b.top < col.bottom) {
        behind.push({ rung: p.rung, s, dx: q(Math.min(b.right - col.left, col.right - b.left)) });
      }
      const cy = (b.top + b.bottom) / 2;
      /* in focus means really inside, not at an edge: one rung enters the top of
         the sky about as this one leaves the bottom, so for a moment the two of
         them are each a sliver at an opposite edge. What must never happen is
         two of them out where the sky is actually being looked at. */
      const inset = f.height * 0.12;
      if (cy >= f.top + inset && cy <= f.bottom - inset) {
        mid++; centred.add(p.rung);
        if (firstMid[p.rung] === undefined) firstMid[p.rung] = q(s / STEPS);
      }
    }
    if (s === STEPS) seenAtEnd = seen;
    if (mid > 1) crowded.push({ s, mid });
    if (!seen) { blank++; if (blank > blankWorst) { blankWorst = blank; blankAt = q(s / STEPS); } } else blank = 0;
  }

  const diffs = ys.slice(1).map((y, i) => y - ys[i]);
  const step = ys.length > 1 ? ys[1] - ys[0] : 0;
  const top = ys[ys.length - 1];
  const room = q(uMax - top);
  const cloned = pool.length > SHAPES;
  const repeats = [1, 3, 5].filter(i => pool[i + SHAPES] && !pool[i + SHAPES].hidden);
  const checks = {
    skyHasRoom: s0.width > 100 && s0.height > 100,
    shapesAreFourteen: pool.length >= SHAPES,
    clonesRepeatTheShapes: repeats.every(i => pool[i].sig === pool[i + SHAPES].sig),
    ladderStartsAtTheFrame: ys[0] === FIRST,
    ladderIsStepped: diffs.every(d => d === step) && step >= MIN_STEP &&
                     step === Math.max(MIN_STEP, Math.round(wall)),
    ladderReachesTheCeiling: room >= 0 && room <= wall && room < step,
    everyRungPlaced: props.every(p => /^translate\(/.test(p.tf) && isFinite(p.tx) && isFinite(p.ty)),
    mirroredY: props.every(p => p.ty === -p.y),
    onTheGrid: props.every(p => Math.abs(p.tx % 2) < 0.001),
    withinTheWidthLaw: props.every(p => p.wide <= WIDTH_LAW + 0.01),
    streetIsClear,
    allRungsSeen: visible.size === props.length,
    everyRungCentred: centred.size === props.length,
    theEscalationIsCentred: rungs.filter(r => r < SHAPES).every(r => centred.has(r)),
    nothingCropped: cropped.length === 0,
    clearOfTheColumn: behind.length === 0,
    onePropAtATime: crowded.length === 0,
    topIsAlive: seenAtEnd > 0,
  };

  return {
    frame: { w: q(s0.width), h: q(s0.height), k: q(k), window: wall, bandUnits: q(s0.width / k) },
    ladder: { first: FIRST, step, rungs: props.length, yMax: top, uMax,
              roomAboveTheCeiling: room },
    shot: { drawn: pool.length, placed: props.length, seen: visible.size, centred: centred.size },
    blankStepsWorst: blankWorst, blankAtFrac: blankAt, seenAtEnd,
    firstSeen: rungs.filter(r => r < SHAPES).map(r => ({ rung: r, y: ys[r], at: firstSeen[r] })),
    firstMid: rungs.filter(r => r < SHAPES).map(r => ({ rung: r, at: firstMid[r] })),
    lanes: props.map(p => ({ rung: p.rung, y: p.y, x: q(p.tx), wide: q(p.wide) })),
    cropped: cropped.slice(0, 6), croppedCount: cropped.length,
    behind: behind.slice(0, 6), behindCount: behind.length,
    crowded: crowded.slice(0, 4),
    steps: STEPS, checks, pass: Object.values(checks).every(Boolean),
  };
})()
