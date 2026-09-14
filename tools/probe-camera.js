/* probe-camera.js — does the roofline actually stay in the frame?
   Reports the sky, stack, roof and pavement in viewport coordinates. */
(function(){
  var out = {};
  var r = function(el){ var b = el.getBoundingClientRect(); return {
    top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height),
    left: Math.round(b.left), w: Math.round(b.width) }; };
  var $ = function(s){ return document.querySelector(s); };

  var sky   = $(".sky"), tray = $(".tray"), stack = $("#stack"), roof = $(".roof"),
      pave  = $(".pavement"), tower = $("#tower"), btn = $("#order");
  var floors = document.querySelectorAll(".floor");
  var last = floors[floors.length - 1];

  var cs = getComputedStyle(document.documentElement);
  out.vars = {
    n:    cs.getPropertyValue("--n").trim(),
    fh:   cs.getPropertyValue("--fh").trim(),
    pan:  cs.getPropertyValue("--pan").trim(),
    drop: cs.getPropertyValue("--drop").trim(),
    crownGap: cs.getPropertyValue("--crown-gap").trim(),
    vh: Math.round(window.innerHeight), vw: Math.round(window.innerWidth)
  };
  out.sky   = r(sky);
  out.tray  = r(tray);
  out.stack = r(stack);
  out.roof  = roof ? r(roof) : null;
  out.pave  = r(pave);
  out.tower = r(tower);
  out.lastFloor = last ? r(last) : null;
  out.btn   = r(btn);
  out.floorsOnScreen = floors.length;

  /* the climb lives on the camera now: the building and the ground line it is cut
     off by are one box, so they cannot drift apart. The tower itself is cargo. */
  var camT = getComputedStyle($(".camera")).transform;
  out.cameraTransform = camT;
  out.cameraTranslateY = camT === "none" ? 0 : Number((camT.match(/,\s*(-?[\d.]+)\)$/) || [0, 0])[1]);
  var transform = getComputedStyle(tower).transform;
  out.towerTransform = transform;

  out.camera = {
    roofInFrame: !!roof && out.roof.top >= out.sky.top && out.roof.bottom <= out.sky.bottom,
    crownGapPx:  roof ? out.roof.top - out.sky.top : null,
    stackTopVsSkyTop: out.stack.top - out.sky.top,
    stackFitsSky: out.stack.top >= out.sky.top - 1,
    newestFloorTop: out.lastFloor ? out.lastFloor.top - out.sky.top : null
  };
  /* where the layout thinks the ground is vs where the stack ends */
  out.ground = {
    stackBottomVsPaveBottom: out.stack.bottom - out.pave.bottom,
    stackBottomVsPaveTop:    out.stack.bottom - out.pave.top,
    paveBottomVsSkyBottom:   out.pave.bottom - out.sky.bottom
  };
  out.sign = r($(".sign"));
  out.cameraBox = r($(".camera"));
  /* the base of the building has to be the line it is cut on (less the culling
     offset when the middle floors are dropped), or the lowest floor is either
     sliced open or left floating above the street */
  var dropPx = parseFloat(cs.getPropertyValue("--drop")) || 0;
  out.camera.stackBottomVsClipPx = Math.round(out.stack.bottom - out.cameraBox.bottom + dropPx);
  out.camera.baseSitsOnClip = Math.abs(out.camera.stackBottomVsClipPx) <= 1;
  /* the scene svg is 360x216, drawn slice / xMidYMax, and its sidewalk starts at
     art y 190 — the tower's base belongs on that line, not on the lamp's base */
  var sb   = sky.getBoundingClientRect();
  var scale = Math.max(sb.width / 360, sb.height / 216);
  /* the world slides down with the camera, so the sidewalk line the tower stands
     on sits that far below where the art was drawn, and the lid follows it down
     until it reaches the bottom of the frame */
  var panPx = parseFloat(cs.getPropertyValue("--pan")) || 0;
  var groundPx = parseFloat(cs.getPropertyValue("--ground")) || 26 * scale;
  out.art = {
    scale: Math.round(scale * 1000) / 1000,
    sidewalkBandPx: Math.round(26 * scale),
    panPx: Math.round(panPx),
    lidOpen: panPx >= groundPx,
    sidewalkTop: Math.round(sb.bottom - 26 * scale + panPx),
    groundVsClipPx: Math.round((sb.bottom - 26 * scale + panPx) - out.cameraBox.bottom)
  };
  /* the pavement travels too: report where it sits at rest, not just where it is */
  out.ground.paveBottomAtRestVsSkyBottom = out.ground.paveBottomVsSkyBottom - Math.round(panPx);
  out.towerOverflowPx = out.tower.bottom - out.cameraBox.bottom;
  out.stackOverflowPx = out.stack.bottom - out.cameraBox.bottom;
  out.signOverRoof = !!(roof &&
    out.sign.bottom > out.roof.top &&
    out.sign.left  < out.roof.left + out.roof.w &&
    out.roof.left  < out.sign.left + out.sign.w);
  out.signVsRoofPx = roof ? out.sign.bottom - out.roof.top : null;

  out.docOverflow = { scrollH: document.documentElement.scrollHeight, innerH: window.innerHeight };
  out.errs = window.__errs || [];
  return out;
})()
