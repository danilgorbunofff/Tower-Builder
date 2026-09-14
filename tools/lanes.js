(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const q = n => Math.round(n * 100) / 100;
  const PAD = 4;                 /* a world's body keeps this much clear of the frame */
  const EVERY = 300, FIRST = 1010, FAR = 0.72;   /* mirrors the page's own constants */

  const sky = document.querySelector('.sky');
  const planets = sky.querySelector('svg.far .planets');
  const sc = document.getElementById('scroller');
  const tower = document.querySelector('.tower');
  if(!sky || !planets || !sc || !tower) return 'MISSING';

  /* every world is a <g> the page places by transform; nothing else lives here */
  const wrappers = [...planets.children].filter(
    n => n.tagName.toLowerCase() === 'g' && /^translate/.test(n.getAttribute('transform') || ''));

  const bodies = wrappers.map(g => {
    const m = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(g.getAttribute('transform') || '');
    return { bb: bodyBox(g), wy: m ? parseFloat(m[2]) : 0 };
  });
  const s0 = sky.getBoundingClientRect();
  const k = Math.max(s0.width / 360, s0.height / 216);
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  const uMax = max / k;
  const rMax = Math.ceil((uMax - FIRST + EVERY) / EVERY);

  /* --- the world's body: its own rects, the orbit's moon left out -------------
     Positions come from the page's source coordinates, not from a rendered
     box, so a satellite swinging wide cannot be mistaken for the world itself. */
  function bodyBox(g){
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for(const r of g.querySelectorAll('rect')){
      if(r.closest('.orbit')) continue;
      const x = +r.getAttribute('x'), y = +r.getAttribute('y');
      const w = +r.getAttribute('width'), h = +r.getAttribute('height');
      if(![x, y, w, h].every(v => isFinite(v))) continue;
      if(x < x0) x0 = x; if(y < y0) y0 = y;
      if(x + w > x1) x1 = x + w; if(y + h > y1) y1 = y + h;
      n++;
    }
    return n ? { x0, y0, x1, y1, n } : null;
  }

  const panOf = () => {
    const t = getComputedStyle(planets).transform;
    if(!t || t === 'none') return 0;
    const m = /^matrix\(([-\d.,\s]+)\)$/.exec(t);
    return m ? parseFloat(m[1].split(',')[5]) : 0;
  };

  /* the far layer is inset:0 over the sky with viewBox 0 0 360 216 + xMidYMax slice */
  const SX = x => s0.left + s0.width / 2 + (x - 180) * k;
  const SY = y => s0.bottom - (216 - y) * k;

  const seek = async u => {
    sc.scrollTop = Math.max(0, Math.min(max, Math.round(u * k)));
    await raf();
    const tree = document.querySelector('.tower').getBoundingClientRect();
    const pan = panOf();
    return { tree, pan };
  };

  const rows = [], failing = [], seen = [], multiple = [];
  let checked = 0;

  for(let r = 1; r <= rMax; r++){
    const u = FIRST + EVERY * (r - 1) + 150;          /* the world is centred here */
    if(u > uMax) break;
    const { tree, pan } = await seek(u);
    const idx = (r - 1) % wrappers.length;
    const g = wrappers[idx];
    const wt = /translate\(\s*([-\d.]+)[\s,]+([-\d.]+)/.exec(g.getAttribute('transform') || '');
    if(!wt) return 'NO-TRANSFORM';
    const wx = parseFloat(wt[1]), wy = parseFloat(wt[2]);
    const bb = bodyBox(g);
    if(!bb){ failing.push('no body ' + idx); continue; }

    const box = {
      l: SX(wx + bb.x0), r: SX(wx + bb.x1),
      t: SY(wy + pan + bb.y0), b: SY(wy + pan + bb.y1),
    };
    const pad = [q(box.l - s0.left), q(s0.right - box.r), q(box.t - s0.top), q(s0.bottom - box.b)];
    const ov = Math.max(0, Math.min(box.r, tree.right) - Math.max(box.l, tree.left)) *
               Math.max(0, Math.min(box.b, tree.bottom) - Math.max(box.t, tree.top));
    const painted = g.getBoundingClientRect();       /* what the whole world paints, satellites in */
    const out = q(Math.max(0, s0.left - painted.left) + Math.max(0, painted.right - s0.right));
    const bad = pad.some(v => v < PAD - 0.5) || ov > 0;
    /* how many worlds are in shot at this moment: the rail carries one past per
       rung, so the answer is one, and if it ever is not the ladder has lost its
       spacing rather than its order. The moon is not counted: it is on a road
       of its own and rides with the world it goes round. */
    let vis = 0;
    for(const b of bodies){
      const top = SY(b.wy + pan + b.bb.y0), bot = SY(b.wy + pan + b.bb.y1);
      if(bot > s0.top && top < s0.bottom) vis++;
    }
    rows.push({ r, idx, vis, pad, ov: q(ov), out, body: q(box.r - box.l) });
    if(bad) failing.push({ r, idx, vis, pad, ov: q(ov), out, body: q(box.r - box.l) });
    if(vis !== 1) multiple.push({ r, idx, vis });
    checked++;
    if(seen[seen.length - 1] !== idx) seen.push(idx);
  }

  /* --- the star field, scanned in four-row bands -----------------------------
     The guarantee is a lane walk: any four rows in a row cover every quarter of
     the width. A band four rows tall is therefore the smallest band that can
     never be empty, and an empty one of those is the real defect. */
  const bandPx = Math.round(4 * 2 * k) + 2;
  const stars = [...sky.querySelectorAll('svg.far .stars rect')].map(r => {
    const b = r.getBoundingClientRect();
    return { x: b.left, y: b.top };
  });
  const bands = [];
  for(const frac of [0.25, 0.6, 0.95]){
    const y0 = s0.top + (s0.height - bandPx) * frac;
    let hits = 0;
    for(const s of stars){
      if(s.y >= y0 && s.y <= y0 + bandPx && s.x >= s0.left && s.x <= s0.right) hits++;
    }
    if(!hits) bands.push({ frac, y0: q(y0) });
  }

  const checks = {
    skyHasRoom: s0.width > 100 && s0.height > 100,
    tenShapes: wrappers.length === 10,
    rungsToCheck: checked >= 3,
    bodiesInWindow: failing.length === 0,
    oneWorldAtATime: multiple.length === 0,
    allTenSeen: new Set(rows.map(x => x.idx)).size === wrappers.length,
    skyNeverBlank: bands.length === 0,
  };

  return {
    far: { k: q(k), w: q(s0.width), h: q(s0.height), bandPx, bandUnits: q(s0.width / k) },
    rails: { railMax: max, uMax: q(uMax), rMax },
    stars: stars.length,
    seen,
    rows: rows.slice(0, 6).map(x => ({ r: x.r, b: x.body, pad: x.pad, vis: x.vis })),
    failing: failing.slice(0, 6),
    failingCount: failing.length,
    multiple: multiple.slice(0, 4),
    bands,
    checks,
    pass: Object.values(checks).every(Boolean),
  };
})()
