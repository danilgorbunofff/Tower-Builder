/* The rail, end to end: a hand takes the beat away and parks the camera where it
   let go; the way back puts it at the ceiling and hides itself; the far layers
   answer the same one number the hand holds. Everything here goes through the
   real scroll event — scrollTop is assigned, so the browser fires a genuine
   trusted scroll, and the page's own listener is what moves the camera. */
(async function(){
  var sleep = function(ms){ return new Promise(function(r){ setTimeout(r, ms); }); };
  var two   = function(){ return new Promise(function(r){
    requestAnimationFrame(function(){ requestAnimationFrame(r); });
  }); };

  var sky = document.querySelector('.sky');
  var sc  = document.querySelector('.scroller');
  var tt  = document.getElementById('totop');
  var cam = document.querySelector('.camera');
  var pav = document.querySelector('.pavement');
  var scene = document.querySelector('svg.scene');
  var slide = document.querySelector('svg.scene .slide');
  var drift = document.querySelector('svg.far .drift');
  if (!sky || !sc || !tt || !cam) { return 'MISSING: sky/scroller/totop/camera'; }

  function tok(el, n){ return getComputedStyle(el).getPropertyValue(n).trim(); }
  function num(el, n){ return parseFloat(tok(el, n)) || 0; }
  function r2(x){ return Math.round(x * 100) / 100; }
  function r4(x){ return Math.round(x * 10000) / 10000; }
  function near(a, b, tol){ return Math.abs(a - b) <= (tol === undefined ? 0.25 : tol); }

  /* the page's own fade, recomputed here: clamped, then quantised to eighths so
     the sky loses its stars in eight visible steps rather than a smear */
  function fade8(v){
    if (v < 0) { v = 0; } else if (v > 1) { v = 1; }
    return Math.round(v * 8) / 8;
  }
  function starModel(u){ return fade8((u - 900) / 640); }
  function moonModel(u){ return fade8((u - 1010) / 530); }

  /* the art-unit factor, the page's own: the frame's box against the sky's
     360x216 art board, not the scene's much taller one -- the scenery inside
     the scene is drawn in the frame's units, which is why the climb, the drift
     and the street all agree to the pixel */
  function artScale(){
    var r = sky.getBoundingClientRect();
    return Math.max(r.width / 360, r.height / 216) || 1;
  }
  function snap(){
    var camcs = getComputedStyle(cam);
    var srect = scene.getBoundingClientRect();
    return {
      scrollTop: Math.round(sc.scrollTop),
      railH:     sc.scrollHeight,
      frameH:    sc.clientHeight,
      max:       Math.round(num(sky, '--scroll-max')),
      pan:       Math.round(num(sky, '--pan')),
      panU:      r2(num(sky, '--pan-u')),
      panFar:    r2(num(sky, '--pan-far')),
      starOp:    r4(num(sky, '--star-op')),
      moonOp:    r4(num(sky, '--moon-op')),
      ground:    Math.round(num(sky, '--ground')),
      fh:        Math.round(num(sky, '--fh')),
      scale:     r4(artScale()),
      sceneH:    Math.round(srect.height),
      camT:      camcs.transform,
      camDur:    camcs.transitionDuration,
      slideT:    getComputedStyle(slide).transform,
      farT:      getComputedStyle(drift).transform,
      pavT:      getComputedStyle(pav).transform,
      isScroll:  sky.classList.contains('is-scroll'),
      isClimb:   sky.classList.contains('is-climb'),
      totopOn:   tt.classList.contains('is-on'),
      totopVis:  getComputedStyle(tt).visibility,
      focusable: tt.tabIndex >= 0,
      aria:      tt.getAttribute('aria-label') || ''
    };
  }

  await two();
  var out = { base: snap() };

  /* ── a hand on the rail: three storeys below the ceiling (or as far as the
         rail goes, when the tower is shorter than the frame) ── */
  var drop = Math.min(3 * out.base.fh, out.base.max);
  var railIsReal = out.base.max > out.base.fh;
  var anyRail    = out.base.max > 0;
  sc.scrollTop = Math.max(0, out.base.max - drop);
  await two();
  await sleep(60);
  out.hand = snap();

  /* the beat belongs to the hand: no curve while the wheel is live, and back
     again once the page has the rail to itself */
  sky.classList.remove('is-scroll');
  await two();
  out.beatArmed = getComputedStyle(cam).transitionDuration;
  sky.classList.add('is-scroll');
  await two();
  out.beatOff = getComputedStyle(cam).transitionDuration;
  out.hand2 = snap();

  /* ── the way back ── */
  tt.click();
  await two();
  await sleep(60);
  out.back = snap();          // mid-beat: the curve is still carrying the scene
  await sleep(600);
  out.settled = snap();       // arrived, and everything it moved has stopped

  out.checks = {
    railMatchesCeiling: out.base.scrollTop === out.base.max,
    railOvershoot:      out.base.railH - out.base.frameH === out.base.max,
    railIsHonest:       anyRail || out.base.railH === out.base.frameH,
    handMovedCamera:    out.base.pan - out.hand.pan === drop,
    handPanIsScrollTop: out.hand.pan === out.hand.scrollTop,
    handTookTheBeat:    anyRail ? out.hand.isScroll === true : out.hand.isScroll === false,
    handPanU:           near(out.hand.panU, out.hand.pan / out.hand.scale),
    slideFollowsRail:   out.hand.slideT === 'matrix(1, 0, 0, 1, 0, ' + out.hand.panU + ')',
    farCreepsSlower:    near(out.hand.panFar, out.hand.panU * 0.05, 0.02),
    farAnswersRail:     anyRail ? out.hand.panFar < out.base.panFar : out.hand.panFar === 0,
    starsFadeOnAltitude: near(out.hand.starOp, starModel(out.hand.panU), 0.001)
                           && near(out.base.starOp, starModel(out.base.panU), 0.001)
                           && out.hand.starOp <= out.base.starOp,
    moonFadesToo:       near(out.hand.moonOp, moonModel(out.hand.panU), 0.001)
                           && near(out.base.moonOp, moonModel(out.base.panU), 0.001)
                           && out.hand.moonOp <= out.base.moonOp,
    groundHoldsStill:   out.base.ground === out.hand.ground && out.hand.ground === out.settled.ground,
    storeysHoldStill:   out.base.fh === out.hand.fh && out.hand.fh === out.settled.fh,
    totopShowsItself:   railIsReal
                          ? out.hand.totopOn === true && out.hand.totopVis === 'visible'
                          : out.hand.totopOn === false && out.hand.totopVis === 'hidden',
    totopHiddenAtTop:   out.base.totopOn === false,
    backAtCeiling:      out.settled.scrollTop === out.settled.max,
    backHidItself:      out.settled.totopOn === false && out.settled.totopVis === 'hidden',
    backRidesTheBeat:   out.settled.isScroll === false,
    beatCarriedScene:   anyRail ? out.back.slideT !== out.settled.slideT
                                : out.back.slideT === out.settled.slideT,
    beatArmedOnClimb:   out.beatArmed === '0.52s',
    beatOffOnWheel:     out.beatOff === '0s'
  };
  out.failing = Object.keys(out.checks).filter(function(k){ return !out.checks[k]; });
  return out;
})()
