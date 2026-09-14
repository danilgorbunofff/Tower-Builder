(function(){
const out = {};

// ---- measuring a storey that may still be landing ---------------------------
// A storey that is still landing is carried 26px up by the `drop` keyframe, and
// getBoundingClientRect reports the translation: a snapshot taken mid-drop reads
// the newest storey half a storey high and half a storey above the roof. Waiting
// for the page's `data-at-rest` does not settle it either -- the page only sets
// that flag once a frame has painted, which on a deep tower is a long way after
// boot -- so every storey position below is measured in LAYOUT, with the
// element's own translate taken back off. Layout is final the moment the DOM is
// built, so the numbers hold whether or not the landing is over; the rest flag
// is reported alongside as a second opinion, never as a gate.
out.atRest = document.documentElement.dataset.atRest || null;
out.settleWaitMs = window.__settleWaitMs || null;
const ownTy = (el) => {
  const t = getComputedStyle(el).translate;
  if (!t || t === "none") return 0;
  const p = t.split(/\s+/);
  return parseFloat(p.length > 1 ? p[1] : p[0]) || 0;
};
const layY = (el) => el.getBoundingClientRect().y - ownTy(el);

// ---- tokens -----------------------------------------------------------------
const cs = getComputedStyle(document.documentElement);
const g = (n) => (cs.getPropertyValue(n) || "").trim();
const px = (n) => parseFloat(g(n)) || 0;

out.tokens = {
  bw: px("--bw"), fh: px("--fh"), fh0: px("--fh0"), wh: px("--wh"), ww: px("--ww"),
  pad: px("--pad"), slab: px("--slab"), crownGap: px("--crown-gap"),
  pan: g("--pan"), drop: g("--drop"), n: g("--n"),
};

// CRITICAL INVARIANT: --fh === 4 slab + 4 sill + --wh + 12 header
out.fhInvariant = {
  expected: 4 + 4 + out.tokens.wh + 12,
  actual: out.tokens.fh,
  ok: (4 + 4 + out.tokens.wh + 12) === out.tokens.fh,
};

// ---- key rects --------------------------------------------------------------
const rect = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
};
out.rects = {
  sky: rect(".sky"),
  tray: rect(".tray"),
  btn: rect("#order"),
  sign: rect(".sign"),
  tower: rect(".tower"),
  roof: rect(".roof"),
  stack: rect("#stack"),
  lamp: rect(".pavement svg.lamppost"),
  folks: rect(".pavement svg.passersby"),
  midSlot: rect(".pavement .slot.mid"),
  pavement: rect(".pavement"),
  slotLeft: rect(".pavement .slot.left"),
  slotRight: rect(".pavement .slot.right"),
};

out.btn = {
  h: out.rects.btn ? out.rects.btn.h : null,
  label: ((document.querySelector(".order-label") || {}).textContent || "").trim().replace(/\s+/g, " "),
};

// ---- floors -----------------------------------------------------------------
const floors = [...document.querySelectorAll(".floor")];
out.floorCount = floors.length;
out.floors = floors.map((el) => {
  const r = el.getBoundingClientRect();
  const row = el.querySelector(".row");
  const rr = row ? row.getBoundingClientRect() : null;
  const hdr = el.querySelector(".hdr");
  const hr = hdr ? hdr.getBoundingClientRect() : null;
  const wins = [...el.querySelectorAll(".win")];
  const door = el.querySelector(".door");
  return {
    no: el.dataset.no,
    i: el.style.getPropertyValue("--i"),
    y: Math.round(r.y),
    h: Math.round(r.height),
    w: Math.round(r.width),
    onGrid: (Math.round(r.y) % 4 === 0) && (Math.round(r.x) % 4 === 0) && (Math.round(r.width) % 4 === 0),
    rowH: rr ? Math.round(rr.height) : null,
    hdrH: hr ? Math.round(hr.height) : null,
    wins: wins.length + (door ? 1 : 0),
    lit: wins.filter((w) => w.dataset.lit === "1").length,
    lite: wins.filter((w) => w.dataset.lite === "1").length,
    balcony: !!el.querySelector(".rail"),
    belt: !!el.querySelector(".belt"),
    plate: (el.querySelector(".no") || {}).textContent,
    isNew: el.classList.contains("is-new"),
  };
});

// ---- consecutive storey spacing: MUST be exactly --fh, gap 0 -----------------
out.spacing = [];
for (let i = 1; i < floors.length; i++) {
  const upper = floors[i], lower = floors[i - 1];
  const uy = layY(upper), ly = layY(lower);
  out.spacing.push({
    pair: upper.dataset.no + "/" + lower.dataset.no,
    delta: Math.round(uy - ly),
    gap: Math.round(ly - (uy + upper.getBoundingClientRect().height)),
  });
}
const deltas = out.spacing.map((s) => s.delta);
const gaps = out.spacing.map((s) => s.gap);
out.spacingOk = {
  expected: -out.tokens.fh,
  deltasUnique: [...new Set(deltas)],
  maxAbsGap: gaps.length ? Math.max.apply(null, gaps.map(Math.abs)) : 0,
  measured: "layout (own translate excluded)",
  ok: deltas.every((d) => d === -out.tokens.fh) && gaps.every((x) => Math.abs(x) < 1.5),
};

// second opinion only: is anything finite still animating, and where is the
// newest storey's translate parked?
out.restCheck = {
  flag: out.atRest,
  finiteRunning: document.getAnimations().filter((a) => {
    const t = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
    return a.playState === "running" && t.iterations !== Infinity;
  }).length,
  topFloorTranslate: floors.length ? (getComputedStyle(floors[floors.length - 1]).translate || "none") : null,
};

// ---- camera + auto-fit -----------------------------------------------------
// The tower steps its storeys down before the camera pans, so --pan may be 0
// when the tower still fits. What must ALWAYS hold: the roof is inside the sky,
// the pan lands on a whole storey, and the tray + button + hint are on screen.
const hintR = rect(".order-hint");
const skyR = out.rects.sky, roofR = out.rects.roof, trayR = out.rects.tray, btnR = out.rects.btn;
const vh = window.innerHeight;
const panV = parseFloat(out.tokens.pan) || 0;
const crownV = out.tokens.crownGap;
const fhV = out.tokens.fh0 || out.tokens.fh;
const nV = parseInt(out.tokens.n, 10) || 0;
const groundV = px("--ground");
/* how much tower the camera can hold: the framed strip between the ground line
   and the reserved sky, minus the roof standing on top of the newest floor */
const roomV = skyR ? (skyR.h - groundV) - (roofR ? roofR.h : 0) - crownV : 0;
const wantPan = nV ? Math.max(0, nV * fhV - roomV) : 0;
const crownGapPx = roofR && skyR ? Math.round(roofR.y - skyR.y) : null;
out.camera = {
  panPx: panV,
  dropPx: parseFloat(out.tokens.drop) || 0,
  n: parseInt(out.tokens.n, 10) || 0,
  towerW: out.tokens.bw,
  countTimesFh: nV * out.tokens.fh,
  crownSpace: (skyR ? skyR.h : 0) - crownV,
  fh: out.tokens.fh,
  fh0: out.tokens.fh0,
  roomPx: Math.round(roomV),
  wantPanPx: Math.round(wantPan),
  /* the camera IS the model: pan = max(0, tower height - what the frame holds) */
  panMatchesModel: Math.abs(panV - wantPan) <= 1,
  fhIsEven: out.tokens.fh % 2 === 0,
  /* one dollar is one storey, at every count: the height of a floor must be the
     design height for this window, never a shrunken one to make the tower fit */
  fhIsDesignHeight: out.tokens.fh0 > 0 && out.tokens.fh === out.tokens.fh0,
  roofInFrame: !!roofR && roofR.y >= 1 && roofR.y + roofR.h <= (skyR ? skyR.y + skyR.h + 1 : vh),
  crownGapPx: crownGapPx,
  /* Before the camera pans, the tower grows inside the frame and the roofline
     climbs on its own; once it rides, the roof is pinned exactly the reserved
     gap below the top edge — the newest floor is the storey under the roof, at
     every count from there on. Closer than the gap is a clipped mast. */
  crownBandLo: crownV - 1,
  crownBandHi: panV > 0 ? crownV + 1 : null,
  crownHolds: crownGapPx === null
    ? false
    : (crownGapPx >= crownV - 1 && (panV <= 0 || crownGapPx <= crownV + 1)),
  trayFits: !!trayR && trayR.y + trayR.h <= vh + 0.5,
  hintFits: !!hintR && hintR.y + hintR.h <= vh + 0.5,
  btnFits: !!btnR && btnR.y + btnR.h <= vh + 0.5,
};
out.camera.ok = out.camera.n >= out.floorCount
  && out.camera.panMatchesModel && out.camera.fhIsEven && out.camera.fhIsDesignHeight
  && out.camera.roofInFrame && out.camera.crownHolds
  && out.camera.trayFits && out.camera.hintFits && out.camera.btnFits;

// ---- roof tracks the newest floor ------------------------------------------
const topFloor = floors[floors.length - 1];
if (topFloor && out.rects.roof) {
  const roofEl = document.querySelector(".roof");
  const roofBottom = Math.round(layY(roofEl) + roofEl.getBoundingClientRect().height);
  const topFloorTop = Math.round(layY(topFloor));
  out.roofTrack = {
    roofBottom: roofBottom,
    topFloorTop: topFloorTop,
    deltaPx: roofBottom - topFloorTop,
    measured: "layout (own translate excluded)",
  };
  out.roofTrack.ok = Math.abs(out.roofTrack.deltaPx) < 3;
  // the roof is only "in frame" if it is also sitting on the building
  out.camera.ok = out.camera.ok && out.roofTrack.ok;
  out.camera.roofSitsOnTopFloor = out.roofTrack.ok;
}

// ---- the building stands on the sidewalk, not below it ----------------------
// The scene art is 360x216, slice / xMidYMax, and its sidewalk starts at art y
// 190. The camera has to be clipped on that line: clip any lower and storeys are
// drawn over the pavement — the "floors going through the street" defect.
const camR = rect(".camera");
const ART_W = 360, ART_H = 216, ART_GROUND = 190;
const artScale = skyR ? Math.max(skyR.w / ART_W, skyR.h / ART_H) : 0;
/* the world slides down with the camera, so the line the tower stands on is no
   longer where the art was drawn — it is that far lower, on every pass */
const panPx    = px("--pan");
const groundPx = px("--ground");
const dropPx   = px("--drop");
const bandPx   = (ART_H - ART_GROUND) * artScale;
const sidewalkTop = skyR ? skyR.y + skyR.h - bandPx + panPx : 0;
out.groundLine = {
  artScale: Math.round(artScale * 100) / 100,
  streetBandPx: Math.round(bandPx),
  panPx: Math.round(panPx),
  artVsGroundPx: Math.round(bandPx - groundPx),
  sidewalkTop: Math.round(sidewalkTop),
  cameraBottom: camR ? Math.round(camR.y + camR.h) : null,
  groundVsClipPx: camR ? Math.round(sidewalkTop - (camR.y + camR.h)) : null,
  /* once the street itself has slid past the bottom of the frame there is no
     line left on screen to cut on, and the building simply carries on down */
  lidOpen: panPx >= groundPx,
  lidVsFrameBottomPx: camR ? Math.round((camR.y + camR.h) - (skyR.y + skyR.h)) : null,
  /* the base of the building: the stack's own baseline, less the offset the
     dropped middle floors are compensated with. It has to land exactly on the
     ground line — above it is a tower hovering over the street, below it is the
     "floors going through the pavement" defect the camera clip exists to stop. */
  lowestFloorVsGround: Math.round(out.rects.stack.y + dropPx - sidewalkTop),
};
out.groundLine.ok = out.groundLine.streetBandPx > 0
  && Math.abs(out.groundLine.groundVsClipPx) <= 2
  && (!out.groundLine.lidOpen || out.groundLine.lidVsFrameBottomPx >= -2)
  && Math.abs(out.groundLine.lowestFloorVsGround) <= 1;

// ---- doc overflow -----------------------------------------------------------
out.docOverflow = {
  x: document.documentElement.scrollWidth - window.innerWidth,
  y: document.documentElement.scrollHeight - window.innerHeight,
};
out.docOverflow.ok = out.docOverflow.x <= 0 && out.docOverflow.y <= 0;

// ---- fonts ------------------------------------------------------------------
out.fonts = {
  loaded: document.fonts.status,
  hasPressStart: [...document.fonts].some((f) => f.family.indexOf("Press Start") >= 0),
  hasSilkscreen: [...document.fonts].some((f) => f.family.indexOf("Silkscreen") >= 0),
};

// ---- tag --------------------------------------------------------------------
const tag = document.querySelector(".floor.is-new .tag");
if (tag) {
  const st = getComputedStyle(tag);
  const r = tag.getBoundingClientRect();
  out.tag = {
    text: tag.textContent.trim().replace(/\s+/g, " "),
    opacity: st.opacity,
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    visibleInView: r.x + r.width > 0 && r.x < window.innerWidth && r.y + r.height > 0 && r.y < window.innerHeight,
  };
}

// ---- street assets must flank the tower, not overlap it ---------------------
var csLeft = getComputedStyle(document.querySelector(".pavement .slot.left"));
var csRight = getComputedStyle(document.querySelector(".pavement .slot.right"));
var wantLampGap = parseFloat(csLeft.paddingRight) || 0;
var wantFolksGap = parseFloat(csRight.paddingLeft) || 0;
var folksShown = out.rects.folks && out.rects.folks.w > 0;

out.flank = {
  towerLeft: Math.round(out.rects.tower.x),
  towerRight: Math.round(out.rects.tower.x + out.rects.tower.w),
  lampGapPx: Math.round(out.rects.tower.x - (out.rects.lamp.x + out.rects.lamp.w)),
  wantLampGap: wantLampGap,
  folksShown: !!folksShown,
  folksGapPx: folksShown ? Math.round(out.rects.folks.x - (out.rects.tower.x + out.rects.tower.w)) : null,
  wantFolksGap: wantFolksGap,
  lampOnScreen: out.rects.lamp.x >= 0 && out.rects.lamp.x + out.rects.lamp.w <= window.innerWidth,
  // everyone stands on the same ground line: the pavement's bottom edge
  lampFeetVsGround: Math.round(out.rects.lamp.y + out.rects.lamp.h - out.rects.pavement.y - out.rects.pavement.h),
  folksFeetVsGround: folksShown
    ? Math.round(out.rects.folks.y + out.rects.folks.h - out.rects.pavement.y - out.rects.pavement.h)
    : null,
  // the pavement is authored above the sky's bottom edge, so nothing is clipped
  // there. It also travels with the camera now, hence the at-rest reading.
  curbPx: Math.round(out.rects.sky.y + out.rects.sky.h - out.rects.pavement.y - out.rects.pavement.h),
  curbAtRestPx: Math.round(out.rects.sky.y + out.rects.sky.h - out.rects.pavement.y - out.rects.pavement.h + panPx),
};
out.flank.ok =
  out.flank.lampGapPx === wantLampGap &&
  (!folksShown || out.flank.folksGapPx === wantFolksGap) &&
  out.flank.lampOnScreen &&
  out.flank.lampFeetVsGround === 0 &&
  (!folksShown || out.flank.folksFeetVsGround === 0) &&
  out.flank.curbAtRestPx > 0;

out.midSlotUnderTower = {
  tower: out.rects.tower ? [out.rects.tower.x, out.rects.tower.x + out.rects.tower.w] : null,
  midSlot: out.rects.midSlot ? [out.rects.midSlot.x, out.rects.midSlot.x + out.rects.midSlot.w] : null,
  ok: !!(out.rects.tower && out.rects.midSlot
    && Math.abs(out.rects.tower.x - out.rects.midSlot.x) < 1
    && Math.abs(out.rects.tower.w - out.rects.midSlot.w) < 1),
};

// ---- interactivity smoke test ----------------------------------------------
// above the render cap the DOM stops growing, so the tally has to be the logical
// one the page shows on the sign, not the number of floor nodes
const readCount = () => parseInt(document.getElementById("signN").textContent, 10);
const towerEl = document.querySelector(".tower");
const roofEl  = document.querySelector(".roof");
const panOf   = () => parseFloat(cs.getPropertyValue("--pan")) || 0;
const roofTop = () => Math.round(roofEl.getBoundingClientRect().y);
/* measured inside the frame, so a frame box that settles by a pixel between the
   two reads cannot be mistaken for the building moving (or not moving) */
const camEl   = document.querySelector(".camera");
const camOf   = () => camEl.getBoundingClientRect();
const roofInFrame = () => Math.round(roofEl.getBoundingClientRect().y - camOf().y);
const tsTower = getComputedStyle(towerEl);
const tsCam   = getComputedStyle(camEl);

/* A running transition reads as its START value for the whole first frame, so the
   world is measured with the climb's easing switched off. That is the state the
   page settles into anyway; the easing itself is checked separately, live. */
const settleClimb = () => {
  const st = document.createElement("style");
  st.textContent = ".sky.is-climb .camera,.sky.is-climb .pavement,"
    + ".sky.is-climb svg.scene .slide,.sky.is-climb svg.far .drift{transition:none!important}";
  document.head.appendChild(st);
};

/* the world the tower stands in: the pavement furniture (HTML) and the sliding
   layers inside the scene SVG. The sky itself is the control — a tower can climb
   past the skyline but never past the sky, so the two svg boxes must not move at
   all; everything that falls does it inside them. The stars are the one layer
   allowed to lag: they creep at a twentieth of the world, and that is measured
   rather than asserted away. */
const paveEl    = document.querySelector(".pavement");
const sliderEls = [...document.querySelectorAll(".sky svg.scene .slide")];
const sceneEl   = document.querySelector(".sky svg.scene");
const driftEl   = document.querySelector(".sky svg.far .drift");
const y2 = (el) => Math.round(el.getBoundingClientRect().y * 100) / 100;
const roofTopBefore = roofTop();
const camBottomBefore = Math.round(camOf().bottom);
const envSnap = () => ({
  pavement: Math.round(paveEl.getBoundingClientRect().y),
  cameraBottom: Math.round(camOf().bottom),
  slides: sliderEls.map((el) => Math.round(el.getBoundingClientRect().y)),
  scene: y2(sceneEl),
  drift: y2(driftEl),
  panFar: parseFloat(cs.getPropertyValue("--pan-far")) || 0,
  starOp: parseFloat(cs.getPropertyValue("--star-op")) || 0,
  moonOp: parseFloat(cs.getPropertyValue("--moon-op")) || 0,
});
const envBefore = envSnap();
const roofInBefore = roofInFrame();
const panBefore = panOf();
const fhBefore = parseFloat(cs.getPropertyValue("--fh")) || 0;
const before = readCount();
document.getElementById("order").click();
const after = readCount();
/* read the climb's wiring while it is still armed — settling the easing below
   clears it, and the easing is the one part that has to be live to be checked */
const climbTransition = tsCam.transitionProperty + " / " + tsCam.transitionDuration;
const climbWired = tsCam.transitionProperty.indexOf("transform") >= 0
  && (parseFloat(tsCam.transitionDuration) || 0) >= 0.3;
settleClimb();
const roofTopAfter = roofTop();
const roofInAfter = roofInFrame();
const panAfter = panOf();
const fhAfter = parseFloat(cs.getPropertyValue("--fh")) || 0;
const envAfter = envSnap();
out.pressAddsOne = {
  domBefore: document.querySelectorAll(".floor").length,
  domAfter: document.querySelectorAll(".floor").length,
  before, after,
  ok: after === before + 1,
};

// ---- a purchase has to move the building -----------------------------------
// A dollar buys one storey, and that storey has to be worth exactly one storey
// of visible change: before the camera rides, the roofline climbs; once it
// rides, the camera climbs instead and the roofline holds. What must never
// happen is the frame answering a purchase by shrinking the storeys — a floor
// that gets shorter as the tower grows was the complaint, and --fh is read
// again after the click to make sure it did not move. Read with the easing
// settled: once the camera rides, the roofline holding still while the world
// drops a storey is the expected answer, not a failure.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
out.growth = {
  fhBefore, fhAfter,
  fhStable: fhBefore === fhAfter && fhBefore === out.tokens.fh0,
  roofTopBefore, roofTopAfter,
  roofTopInFrameBefore: roofInBefore,
  roofTopInFrameAfter: roofInAfter,
  roofRisePx: roofInBefore - roofInAfter,
  panBefore, panAfter,
  panGrewPx: Math.round(panAfter - panBefore),
  /* the roofline climbing and the camera climbing are the same storey spent two
     ways, so the larger of the two must be a full storey of motion */
  storeysWorthOfMotion: Math.max(roofInBefore - roofInAfter, Math.round(panAfter - panBefore)),
  climbTransition: climbTransition,
  climbWired: climbWired,
  reducedMotion,
};
out.growth.ok = out.growth.fhStable
  && out.growth.storeysWorthOfMotion >= fhV - 1
  && (out.growth.climbWired || reducedMotion);

// ---- the world falls with the camera ---------------------------------------
// The camera climbing is only believable if the street climbs out of frame with
// it. Everything at ground level — the pavement furniture, the skyline, the
// horizon glow, the clouds, and the very clip line the building is cut on — has
// to fall by exactly what the camera gained, on the tower's own clock, or the
// building reads as sinking into a frozen city. Measured with the easing settled
// (see settleClimb) so it is the destination that is read, not the first frame.
const envDeltas = envAfter.slides.map((y, i) => y - envBefore.slides[i]);
const panGrewPx = Math.round(panAfter - panBefore);
const fall    = (v) => Math.abs(v - panGrewPx) <= 2;
/* the fade is quantised on purpose (eight visible steps), so the model is the
   ramp clamped and snapped to eighths; the stops are mirrored from index.html
   and probe-scroll.js owns their shape across the whole journey */
const fade8 = (v) => Math.round(Math.max(0, Math.min(1, v)) * 8) / 8;
const starModel = (u) => fade8((u - 900) / (1540 - 900));
const moonModel = (u) => fade8((u - 1010) / (1540 - 1010));
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const uBefore = panBefore / artScale, uAfter = panAfter / artScale;
out.environment = {
  bandGroups: sliderEls.length,
  panGrewPx: panGrewPx,
  pavementFellPx: envAfter.pavement - envBefore.pavement,
  cameraBottomFellPx: envAfter.cameraBottom - envBefore.cameraBottom,
  slideFellPx: envDeltas,
  sceneMovedPx: envAfter.scene - envBefore.scene,
  starCreepPx: envAfter.drift - envBefore.drift,
  panFarPx: envAfter.panFar,
  starOpBefore: envBefore.starOp, starOpAfter: envAfter.starOp,
  moonOpBefore: envBefore.moonOp, moonOpAfter: envAfter.moonOp,
};
/* every layer on one clock: no layer may lag or outrun the others, and the clip
   line the building is cut on has to be one of them — a lid that holds still
   while the street drops is exactly the tower sinking into a frozen city */
out.environment.layersLocked =
  envDeltas.every((d) => Math.abs(d - out.environment.pavementFellPx) <= 2);
out.environment.fellByPan = fall(out.environment.pavementFellPx)
  && fall(out.environment.cameraBottomFellPx)
  && envDeltas.every(fall);
/* the boxes the world slides inside are pinned to the frame: a sky that drifts
   with the camera would drag the horizon with it and the climb would read as
   the whole page scrolling rather than the tower leaving the ground */
out.environment.skyHeldStill = near(out.environment.sceneMovedPx, 0, 1);
/* parallax as a contract, not a vibe: the far layer creeps at a twentieth of the
   world and never matches it — equal speeds would read as one flat plate, a
   frozen far layer as a painted backdrop */
out.environment.farCreepsPx = panGrewPx / 20;
out.environment.creepsByTwentieth = near(
  out.environment.starCreepPx, out.environment.farCreepsPx, 0.6);
out.environment.creepIsSlower = Math.abs(out.environment.starCreepPx)
  < Math.abs(panGrewPx) / 5;
/* A tower short enough to fit the sky needs no camera, so nothing creeps and
   "slower than the camera" has no camera to be slower than. */
out.environment.creepOk = panGrewPx === 0
  ? out.environment.starCreepPx === 0
  : out.environment.creepIsSlower;
out.environment.panFarMatchesModel = near(
  out.environment.panFarPx, uAfter * 0.05, 0.02);
/* altitude decides the sky, and altitude alone: a storey in a night sky cannot
   lighten the dark back to day, whatever the camera did */
out.environment.fadeFollowsAltitude =
  near(out.environment.starOpAfter, starModel(uAfter), 0.001)
  && near(out.environment.moonOpAfter, moonModel(uAfter), 0.001)
  && out.environment.starOpAfter <= out.environment.starOpBefore
  && out.environment.moonOpAfter <= out.environment.moonOpBefore;
out.environment.ok = out.environment.bandGroups >= 4
  && out.environment.layersLocked
  && out.environment.fellByPan
  && out.environment.skyHeldStill
  && out.environment.creepsByTwentieth
  && out.environment.creepOk
  && out.environment.panFarMatchesModel
  && out.environment.fadeFollowsAltitude;

return out;
})();
