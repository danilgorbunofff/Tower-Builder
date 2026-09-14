(function(){
  var R = {}, tok = function(n){
    return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  };
  var sky = document.querySelector(".sky");
  var scene = document.querySelector(".sky svg.scene");
  var far = document.querySelector(".sky svg.far");
  var sc = document.getElementById("scroller");
  var sb = scene.getBoundingClientRect();
  R.pan      = tok("--pan");
  R.panU     = tok("--pan-u");
  R.panFar   = tok("--pan-far");
  R.scrollMax= tok("--scroll-max");
  R.starOp   = tok("--star-op");
  R.moonOp   = tok("--moon-op");
  R.ground   = tok("--ground");
  R.fh       = tok("--fh");
  R.count    = tok("--n");
  R.skyH     = sky.clientHeight;
  R.scroller = { top: Math.round(sc.scrollTop), h: sc.scrollHeight, client: sc.clientHeight };
  R.scene    = { vb: scene.getAttribute("viewBox"), w: +sb.width.toFixed(2), h: +sb.height.toFixed(2), top: +sb.top.toFixed(2), bottom: +sb.bottom.toFixed(2), scale: +(sb.width / 360).toFixed(4) };
  R.far      = (function(){ var r = far.getBoundingClientRect(); return { vb: far.getAttribute("viewBox"), w: +r.width.toFixed(2), h: +r.height.toFixed(2), scale: +(r.height / 216).toFixed(4) }; })();
  R.bands    = document.getElementById("skyBands").children.length;
  R.defs     = document.getElementById("skyDefs").children.length;
  R.tiers    = Array.prototype.map.call(document.getElementById("starField").children, function(g){ return (g.getAttribute("fill") || "-") + ":" + g.children.length; });
  R.stars    = document.getElementById("starField").querySelectorAll("rect").length;
  R.moonKids = document.querySelector(".sky svg.far .moon").children[0].children.length;
  R.drift    = getComputedStyle(document.querySelector(".sky svg.far .drift")).transform;
  R.totopOn  = document.getElementById("totop").classList.contains("is-on");
  R.cls      = sky.className;
  /* sample the painted sky: the band colour under the top of the frame */
  var pts = [4, Math.round(sky.clientHeight * 0.25), Math.round(sky.clientHeight * 0.5), Math.round(sky.clientHeight * 0.75)];
  R.atPoints = pts.map(function(y){ var e = document.elementFromPoint(2, y); return y + ":" + (e ? e.tagName + "." + (e.getAttribute("class") || "") : "none"); });
  return JSON.stringify(R, null, 1);
})()
