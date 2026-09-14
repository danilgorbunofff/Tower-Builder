/* The far layer, all the way up. The worlds are not a rail of their own any
   more: they are children of .drift, the same group the moon lives in, so the
   only thing that can bring one through the frame is the height it was given.
   Four questions, asked on screen through the whole transform chain: does the
   sky still have stars when the rail runs out, is the field deeper than the
   deepest slice the rail can open on, do the worlds creep at the moon's own
   rate without any of them reading as a foreground slab, are they drawn behind
   her disc, and is the space stretch free of the speckled dust that read as
   blue grit over the stars.
   Run with ?n=400 so the sweep covers the tallest climb the page can build.

   The star counts come from the page's own transform arithmetic rather than
   from three thousand getBoundingClientRect calls per stop -- a probe that
   takes a minute is a probe nobody runs. The model is not trusted on its own:
   at the deepest stop every star is hit-tested for real and the disagreements
   are counted. */
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var two   = function(){ return new Promise(function(r){
    requestAnimationFrame(function(){ requestAnimationFrame(r); });
  }); };

  var sky    = document.querySelector('.sky');
  var sc     = document.querySelector('.scroller');
  var far    = document.querySelector('svg.far');
  var drift  = document.querySelector('svg.far .drift');
  var worlds = document.getElementById('worldField');
  var bands  = document.getElementById('skyBands');
  var orbit  = document.querySelector('svg.far .orbit');
  var moonG  = document.querySelector('svg.far .moon');
  if(!sky || !sc || !far || !drift || !worlds || !bands){
    return 'MISSING: sky/scroller/far/drift/worldField/skyBands';
  }

  var STARS  = [].slice.call(document.querySelectorAll('svg.far .stars rect'));
  var WORLDG = [].slice.call(worlds.children);

  function tok(el, n){ return getComputedStyle(el).getPropertyValue(n).trim(); }
  function num(el, n){ return parseFloat(tok(el, n)) || 0; }
  function r2(x){ return Math.round(x * 100) / 100; }
  function hits(a, b){
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function centre(b){ return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }

  /* the page's own numbers, mirrored -- reading them back off the page would
     make the check a tautology. WORLD_BASE is the moon's last row, WORLD_GAP a
     quarter of the frame, and the ladder runs as deep as the star field. */
  var FAR = 0.05, STAR_TOP = -4600, WORLD_GAP = 60, WORLD_BASE = 64;
  var RUNGS = Math.ceil((WORLD_BASE - STAR_TOP) / WORLD_GAP);   /* 78 */
  var WIDTH_CAP = 20;                                           /* art units */

  await two();
  var railMax = Math.round(num(sky, '--scroll-max'));
  var fh0     = num(sky, '--fh0') || 52;
  var box0    = far.getBoundingClientRect();
  var k0      = Math.max(box0.width / 360, box0.height / 216) || 1;
  var uMax    = railMax / k0;
  var step    = railMax / 40;

  /* ── the field's own extent, straight off the rects, and whether every row of
        the 2-unit grid between the first and the last has something in it ── */
  var xs = [], ys = [], zs = [];
  STARS.forEach(function(s){
    xs.push(parseFloat(s.getAttribute('x')) || 0);
    ys.push(parseFloat(s.getAttribute('y')) || 0);
    zs.push(parseFloat(s.getAttribute('width')) || 1);
  });
  var starMin = Math.min.apply(null, ys), starMax = Math.max.apply(null, ys);
  var widths = {}, rowAt = {};
  STARS.forEach(function(s, i){
    var w = s.getAttribute('width');
    widths[w] = (widths[w] || 0) + 1;
    rowAt[Math.round(ys[i] / 2) * 2] = 1;
  });
  var emptyRows = 0;
  for(var yy = starMax; yy >= starMin; yy -= 2){ if(!rowAt[yy]){ emptyRows++; } }

  /* ── the dust: the space stretch is flat colour and nothing else. This is the
        bug the reader reported -- bands speckled with a checker read as blue
        grit laid over the stars. Above the air the only pattern left is the
        four-unit seam, so the assertions are: nothing band-sized is patterned,
        and every flat fill in space is near-black. The air's own last bands keep
        their colour: the line that matters is where the sky stops being sky. ── */
  var SPACE_LINE = -1560;   /* mirrors BANDS: "space -- and the last colour left" */
  var deepFlat = 0, deepPatterned = 0, maxPatH = 0, darkOk = true, worst = '';
  var flatFills = {};
  [].slice.call(bands.querySelectorAll('rect')).forEach(function(r){
    var top = parseFloat(r.getAttribute('y')) || 0;
    var h   = parseFloat(r.getAttribute('height')) || 0;
    var f   = r.getAttribute('fill') || '';
    if(top + h > -1000){ return; }
    if(f.indexOf('url(') === 0){
      deepPatterned++;
      if(h > maxPatH){ maxPatH = h; }
      return;
    }
    if(top + h > SPACE_LINE){ return; }
    deepFlat++;
    flatFills[f] = (flatFills[f] || 0) + 1;
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(f);
    var cr = m ? parseInt(m[1], 16) : 255;
    var cg = m ? parseInt(m[2], 16) : 255;
    var cb = m ? parseInt(m[3], 16) : 255;
    if(Math.max(cr, cg, cb) > 40){ darkOk = false; worst = f; }
  });
  var patterns = sky.querySelectorAll('pattern').length;

  /* ── the ladder: one rung every WORLD_GAP of the layer, on the 2-unit grid the
        whole page is drawn on, from the moon's own last rows upward ── */
  var rungs = WORLDG.map(function(g){
    var t = g.getAttribute('transform') || '';
    return { x: parseFloat((t.match(/translate\(\s*(-?[\d.]+)/) || [])[1]),
             y: parseFloat((t.match(/translate\([^,]+[ ,]+(-?[\d.]+)/) || [])[1]) };
  });
  var rungGapOk = rungs.every(function(r, i){
    return i === 0 ? r.y === WORLD_BASE : r.y === rungs[i - 1].y - WORLD_GAP;
  });
  var onGrid = rungs.every(function(r){
    return r.y % 2 === 0 && r.x % 2 === 0 && isFinite(r.x) && isFinite(r.y);
  });
  var feet = WORLDG.map(function(g){ return r2(g.getBBox().width); });
  var widest = Math.max.apply(null, feet);

  /* ── one rail for the whole far layer, and no second one for the worlds --
        that token was the faster rail the reader threw out ── */
  var panU = num(sky, '--pan-u'), panFar = num(sky, '--pan-far');
  var farOnMoonRail = Math.abs(panFar - panU * FAR) < 0.05;
  var worldTokenGone = tok(sky, '--pan-world') === '';

  /* ── the climb, swept. Star visibility comes off the layer's own arithmetic:
        the drift is carried in the layer's units, so the drift value IS the
        offset, and the slice the frame opens on is the 216 units of the viewBox
        the layer has been carried up to. Read back as tens of thousands of
        getBoundingClientRect calls, this sweep takes a minute; the model is
        cross-checked against a real hit test at the deepest stop. ── */
  function visibleAt(i, p, box, k){
    var y = ys[i] + p, h = zs[i];
    if(y + h <= 0 || y >= 216){ return false; }
    var half = box.width / (2 * k);
    return xs[i] + zs[i] > 180 - half && xs[i] < 180 + half;
  }

  var sweep = [], seen = {}, speeds = {}, prev = null;
  var starsMin = Infinity, starsMax = 0, thinner = 0, most = 0;
  for(var i = 0; i <= 40; i++){
    sc.scrollTop = Math.round(step * i);
    await two();
    var u = num(sky, '--pan-u'), p = num(sky, '--pan-far');
    var box = far.getBoundingClientRect();
    var k = Math.max(box.width / 360, box.height / 216) || 1;
    var stars = 0;
    for(var s = 0; s < STARS.length; s++){ if(visibleAt(s, p, box, k)){ stars++; } }
    var now = {}, list = [];
    for(var w = 0; w < WORLDG.length; w++){
      var wb = WORLDG[w].getBoundingClientRect();
      if(!hits(wb, box)){ continue; }
      list.push(w);
      now[w] = centre(wb).y;
      if(!seen[w]){ seen[w] = { first: Math.round(u) }; }
      seen[w].last = Math.round(u);
    }
    if(prev && u - prev.u > 1){
      for(var q = 0; q < list.length; q++){
        var who = list[q];
        if(prev.y[who] === undefined){ continue; }
        var art = r2((now[who] - prev.y[who]) / k);
        var key = String(who);
        if(!speeds[key]){ speeds[key] = { art: 0, climb: 0 }; }
        speeds[key].art = r2(speeds[key].art + art);
        speeds[key].climb = r2(speeds[key].climb + (u - prev.u));
      }
    }
    prev = { u: u, y: now };
    if(list.length > most){ most = list.length; }
    if(i && stars < sweep[i - 1][1] - 12){ thinner++; }
    starsMin = Math.min(starsMin, stars);
    starsMax = Math.max(starsMax, stars);
    sweep.push([Math.round(u), stars, list.length, num(sky, '--moon-op')]);
  }

  /* the deepest stop, hit-tested for real against the arithmetic above */
  var lastBox = far.getBoundingClientRect();
  var lastK = Math.max(lastBox.width / 360, lastBox.height / 216) || 1;
  var lastP = num(sky, '--pan-far');
  var modelErr = 0, realStars = 0;
  for(var m = 0; m < STARS.length; m++){
    var real = hits(STARS[m].getBoundingClientRect(), lastBox) ? 1 : 0;
    realStars += real;
    if(real !== (visibleAt(m, lastP, lastBox, lastK) ? 1 : 0)){ modelErr++; }
  }

  /* every rung that comes into frame does so in order, from the bottom up */
  var keys = Object.keys(seen).map(function(w){ return parseInt(w, 10); });
  var ordered = keys.every(function(w, i){ return i === 0 || w > keys[i - 1]; });

  /* ── the creep: a world the frame is holding moves as slowly as the moon,
        which is the whole point of putting it on the moon's rail ── */
  var ratios = [];
  keys.forEach(function(w){
    var s = speeds[String(w)];
    if(s && s.climb > 20 && s.art > 0){ ratios.push(r2(s.art / s.climb)); }
  });
  var creepLo = ratios.length ? Math.min.apply(null, ratios) : 0;
  var creepHi = ratios.length ? Math.max.apply(null, ratios) : 0;

  /* ── the orbit: does the rock go round, and does it stay with its world ── */
  var orb = null;
  if(orbit){
    if(railMax){ sc.scrollTop = Math.round(railMax * 0.42); }
    await two();
    var holder = WORLDG.filter(function(g){ return g.querySelector('.orbit'); })[0];
    var b0 = orbit.getBoundingClientRect(), t0 = getComputedStyle(orbit).transform;
    await sleep(4200);
    var b1 = orbit.getBoundingClientRect(), t1 = getComputedStyle(orbit).transform;
    var c0 = centre(b0), c1 = centre(b1);
    var host = holder ? centre(holder.querySelector('g').getBoundingClientRect()) : c0;
    orb = {
      animation: getComputedStyle(orbit).animationName,
      moved: t0 !== t1,
      r0: r2(Math.sqrt(Math.pow(c0.x - host.x, 2) + Math.pow(c0.y - host.y, 2)) / lastK),
      r1: r2(Math.sqrt(Math.pow(c1.x - host.x, 2) + Math.pow(c1.y - host.y, 2)) / lastK)
    };
  }

  var moonOp  = num(sky, '--moon-op');
  var worldOp = parseFloat(getComputedStyle(worlds).opacity);

  var checks = {
    layerIsOneFrame:  Math.abs(lastK - Math.max(lastBox.width / 360, lastBox.height / 216)) < 0.001,
    fieldIsWritten:   starMin === STAR_TOP,
    fieldIsDeeper:    starMin <= -uMax * FAR,
    fieldOnTheGrid:   emptyRows === 0,
    skyNeverThins:    starsMin >= 8,
    skyIsLevel:       thinner === 0 && starsMax <= starsMin * 4 + 160,
    modelIsPaint:     modelErr <= STARS.length / 100,
    noDustInSpace:    maxPatH <= 4 && deepPatterned <= 64,
    spaceIsBlack:     darkOk && deepFlat >= 6,
    ladderIsCounted:  WORLDG.length === RUNGS,
    ladderGapsHeld:   rungGapOk && onGrid,
    noWorldIsBig:     widest <= WIDTH_CAP,
    skyIsNotCrowded:  most <= 6,
    rungsInOrder:     ordered,
    farRailIsOneRate: farOnMoonRail,
    noWorldRail:      worldTokenGone,
    worldsFade:       Math.abs(worldOp - moonOp * 0.72) < 0.02,
    worldsBehindMoon: !!moonG && !!(worlds.compareDocumentPosition(moonG) & 4),
    creepIsTwentieth: ratios.length > 0 && creepLo >= 0.02 && creepHi <= 0.08,
    orbitRuns:        !orb || orb.animation === 'lev-orbit',
    orbitMoves:       !orb || orb.moved,
    orbitStaysNear:   !orb || (orb.r0 > 4 && orb.r0 < 12 && orb.r1 > 4 && orb.r1 < 12)
  };

  return {
    far:    { viewBox: far.getAttribute('viewBox'), k: r2(k0),
              w: Math.round(box0.width), h: Math.round(box0.height) },
    rails:  { railMax: railMax, fh0: fh0, uMax: Math.round(uMax),
              driftMax: r2(uMax * FAR) },
    field:  { n: STARS.length, minY: starMin, maxY: starMax,
              rows: Object.keys(rowAt).length, emptyRows: emptyRows, widths: widths },
    dust:   { patterns: patterns, deepFlat: deepFlat, deepPatterned: deepPatterned,
              maxPatH: maxPatH, darkOk: darkOk, worst: worst, fills: flatFills },
    ladder: { rungs: WORLDG.length, want: RUNGS, widest: widest, feet: feet,
              firstRungY: rungs[0].y, lastRungY: rungs[rungs.length - 1].y },
    creep:  ratios,
    sweep:  sweep.filter(function(_, i){ return i % 4 === 0; }),
    seen:   seen,
    paint:  { modelErr: modelErr, realStars: realStars, n: STARS.length },
    orbit:  orb,
    checks: checks,
    failing: Object.keys(checks).filter(function(c){ return !checks[c]; })
  };
})()