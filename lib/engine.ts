/* engine.ts — the tower.

   This is the <script> at the foot of the hand-written index.html, moved into a
   module and otherwise left alone. Three things about that are deliberate.

   1. It is imperative, and it stays imperative. It writes CSS custom properties
      once per animation frame and dedupes every write through setTok(). Routing
      that through React state would re-render sixty times a second and throw away
      the one property that makes a thousand-floor tower scroll like a ten-floor
      one. React renders the frame; the engine owns the tower. See ARCHITECTURE.md.

   2. It mutates the DOM directly. Every id, class and custom property it reads is
      part of a contract that tools/probe-px2.js and its neighbours depend on, so
      the way to check a change here is behavioural, never cosmetic: run the probe
      suite. baseline/compare.mjs holds the readings that a faithful port must
      reproduce, for all seven viewports.

   3. Demo mode is the absence of a purchase handler. With no opts.onPurchase the
      engine builds the floors itself the moment they are ordered -- which is what
      tools/probe-px2.js:364 requires, since it clicks #order and then asserts that
      the tower grew by exactly one. Phase 5 supplies a handler and this stops
      being true. Nothing else in this file knows anything about money.

   Line N of the body below is line N + 1578 of index.html, so the two can be read
   side by side. The transcription was mechanical: only the header, the two
   onPurchase seams, the closing brace and the type annotations are new.
   The annotations are annotations alone -- strict mode wants them and nothing
   reads them at run time. The probe suite is what proves that claim, and
   baseline/verify-port.mjs is what checks that they are the only thing that
   changed. */

export type EngineOptions = {
  /** Where a committed order goes. Omit it and the engine builds the floors itself. */
  onPurchase?: (floors: number) => void;
};

/* Two shapes the original left implicit: what a world reaches, and the band of
   sky that a window is actually showing. */
type Foot = { x0: number; x1: number };
type Band = { lo: number; hi: number; cx: number; tw: number };

export function startEngine(opts: EngineOptions = {}) {
  /* The engine owns the frame's DOM for as long as the document lives. React's
     development-only StrictMode mount/unmount/mount cycle would otherwise boot it
     twice: two skies, two star fields, and two click handlers on #order, so every
     tap would buy two floors. The second boot is a no-op. */
  var host = document.getElementById("stage");
  if(host && host.dataset.engine === "1"){ return; }
  if(host){ host.dataset.engine = "1"; }
  "use strict";

  /* The frame is server-rendered and the engine only starts once it is on screen,
     so every lookup here is guaranteed to hit. Asserting that keeps the body free
     of null checks the original never had. */
  var $ = function(id: string){ return document.getElementById(id) as HTMLElement; };

  var sky      = document.querySelector(".sky") as HTMLElement;
  var tower    = $("tower");
  var stack    = $("stack");
  var roof     = $("roof");
  var btn      = $("order");
  var btnPrice = $("orderPrice");
  var btnText  = $("orderText");
  var btnBar   = $("orderBar");
  var note     = $("note");
  var live     = $("live");
  var signN    = $("signN");
  var signCash = $("signCash");
  var signLast = $("signLast");
  var skyDefs  = $("skyDefs");
  var skyBands = $("skyBands");
  var starField = $("starField");
  var worldField = $("worldField");
  var scroller = $("scroller");
  var totop    = $("totop");

  var root = document.documentElement;
  var MO   = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* Storeys off the bottom of the frame leave the DOM; the counter keeps climbing
     past the cap. 48 storeys is about 2500px of facade. */
  var RENDER_CAP = 48;

  var CURTAIN = ["#8a5a9c", "#5a7f9c", "#9c5a6a", "#6f8a4a"];
  var THINGS  = ["plant", "ac", "plant", "laundry"];

  var SAMPLE = [
    "nadia","kofi","miriam","yusuf","lena","tobias","aisha","pedro","hanna","omar",
    "saoirse","dimitri","priya","jonas","mei","lucas","fatima","ivan","zoe","marek",
    "ines","hugo","anika","sven","leila","marcos","tam","greta","ravi","noor"
  ];

  var floors: HTMLElement[] = [];
  var count  = 0;
  var busy   = false;

  /* ── pure, deterministic per-floor spec ──────────────────────────────────
     Floor 37 looks like floor 37 for everyone, forever: a shared link shows the
     same building, and a reload never shuffles anyone's curtains. */
  function hash(n: number){
    var x = (n * 2654435761) >>> 0;
    x ^= x >>> 13;
    x = (x * 1274126177) >>> 0;
    x ^= x >>> 16;
    return x >>> 0;
  }

  function tok(name: string){
    return parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
  }

  /* frame() runs once per animation frame while a hand is on the rail, and every
     write to a custom property on the root recalculates the whole document. Most
     of what it writes does not change while scrolling, so it is only written when
     it actually differs. */
  var written: Record<string, string> = {};

  function setTok(name: string, value: string){
    if(written[name] === value){ return; }
    written[name] = value;
    root.style.setProperty(name, value);
  }

  function spec(no: number){
    var lit: number[] = [];
    for(var w = 0; w < 3; w++){
      lit.push(hash(no * 131 + w * 17) % 100 < 74 ? 1 : 0);
    }
    return {
      lit: lit,
      curtain: CURTAIN[hash(no * 53) % CURTAIN.length],
      balcony: no > 1 && hash(no * 17) % 100 < 34,
      thing: THINGS[hash(no * 23) % THINGS.length],
      belt: no > 1 && no % 10 === 0
    };
  }

  function nameFor(no: number){
    return SAMPLE[hash(no * 7 + 13) % SAMPLE.length];
  }

  function makeFloor(no: number){
    var s = spec(no);

    var li = document.createElement("li");
    li.className = "floor";
    li.dataset.no = String(no);

    if(s.belt){
      var belt = document.createElement("div");
      belt.className = "belt";
      li.appendChild(belt);
    }

    var row = document.createElement("div");
    row.className = "row";

    for(var w = 0; w < 3; w++){
      if(no === 1 && w === 1){
        var door = document.createElement("div");
        door.className = "door";
        row.appendChild(door);
        continue;
      }
      var win = document.createElement("div");
      win.className = "win";
      win.dataset.lit = String(s.lit[w]);
      win.style.setProperty("--curtain", s.curtain);
      if(s.lit[w] && hash(no * 41 + w * 11) % 100 < 30){ win.dataset.lite = "1"; }
      row.appendChild(win);
    }
    li.appendChild(row);

    if(s.balcony){
      var rail = document.createElement("div");
      rail.className = "rail";
      var thing = document.createElement("div");
      thing.className = "thing";
      thing.dataset.kind = s.thing;
      if(s.thing === "plant"){
        thing.style.left = (16 + hash(no * 29) % 40) + "px";
      }
      rail.appendChild(thing);
      li.appendChild(rail);
    }

    if(no === 1){
      var lamp = document.createElement("div");
      lamp.className = "lamp";
      li.appendChild(lamp);
    }

    var hdr = document.createElement("div");
    hdr.className = "hdr";
    var plate = document.createElement("span");
    plate.className = "no";
    plate.textContent = no + "F";
    hdr.appendChild(plate);
    li.appendChild(hdr);

    var tag = document.createElement("span");
    tag.className = "tag";
    var who = document.createElement("b");
    who.textContent = nameFor(no);
    tag.appendChild(document.createTextNode("NEW "));
    tag.appendChild(who);
    li.appendChild(tag);

    return li;
  }

  /* --i is a position inside the window, not a name: a storey's number lives in
     data-no, and the window slides, so the two move together. The NEW tag belongs
     to the newest floor in the tower — not to the top of the window, which is a
     different storey once the camera has climbed past it. */
  function relight(){
    var n = floors.length;
    var newest = String(count);
    for(var i = 0; i < n; i++){
      floors[i].style.setProperty("--i", String(i));
      floors[i].classList.toggle("is-new", floors[i].dataset.no === newest);
    }
  }

  /* ── the window ──────────────────────────────────────────────────────────
     The DOM holds at most RENDER_CAP storeys, but it must not hold the *newest*
     ones: the rail is count storeys long, so a camera parked halfway up a
     hundred-storey tower is looking at a storey the old bin had already thrown
     away, and the frame came up empty sky. The cap is a window instead — it
     slides along the tower with the camera, so wherever the rail can stop, the
     storeys under the frame are real storeys, each wearing its own number on its
     own panel. Storeys enter and leave at the two ends; --drop carries the
     window's base to its world height, and that is what makes the exchange
     invisible: the drop and --i are two views of one anchor, so a storey does
     not move when the window moves past it. */
  var winLo = 0;    /* storeys culled below the window */

  function rewindow(lo: number){
    if(!floors.length){ winLo = 0; return; }

    var top = Math.max(0, count - floors.length);
    if(lo < 0){ lo = 0; }
    if(lo > top){ lo = top; }
    if(lo === winLo){ return; }

    var j, next = winLo + floors.length + 1, node;
    if(lo > winLo){
      /* the camera climbed: the base leaves, the top arrives */
      for(j = winLo; j < lo; j++){
        floors.shift()!.remove();
        node = makeFloor(next++);
        floors.push(node);
        stack.appendChild(node);
      }
    } else {
      /* The camera dropped: the top leaves, the base arrives — and the base is
         built backwards, so each arrival lands in front of the last one and the
         list stays numbered from the bottom. */
      for(j = winLo - 1; j >= lo; j--){
        floors.pop()!.remove();
        node = makeFloor(j + 1);
        floors.unshift(node);
        stack.insertBefore(node, stack.firstChild);
      }
    }
    winLo = lo;
    relight();
  }

  /* ── the camera ──────────────────────────────────────────────────────────
     A storey is a storey: a dollar always buys the same height of building, at
     every count and every window size. When the tower outgrows the frame the
     camera climbs with it — it parks the newest floor and a sliver of sky under
     the top edge, and the storeys below the kerb leave frame. The roofline is
     the one thing that never goes missing, so every budget here is measured
     from it, not from the stack. */

  /* The scene art is 360x216, drawn slice / xMidYMax, and its sidewalk starts at
     art y 190. The building's base belongs on that line: the camera is clipped
     there, so every storey that sinks past it vanishes behind the near ground
     instead of standing on the pavement. */
  var ART_W = 360, ART_H = 216, ART_GROUND = 190;

  /* ── the sky column ─────────────────────────────────────────────────────
     One flat band per phase of the day, from the haze over the street to open
     space. Bands, never blends: every seam is a dithered checker laid on the
     2-unit grid the whole page is drawn on, so the transitions read as pixel
     art instead of as a gradient — and the tower climbs *through* them, so the
     sky has to be some eighty storeys deep to still be a sky up there. The
     bands themselves are flat: a band of speckled dust was tried above the air
     and it read as blue grit over the stars, which is not what the top of a sky
     is. What carries the climb through the last six thousand units is the bands
     getting further apart and darker, which is what a sky does.
     Altitudes are the scene's own units: y grows downward, the sidewalk is at
     190, the bottom of the column is 216 and its top is SKY_TOP. SKY_TOP is the
     frame group's own lift, negated — the column is 8216 art units and the frame
     it holds is the bottom 216 of them. */
  var SKY_TOP = -8000;

  var BANDS: [number, string][] = [
    [  216, "#d8e6f2"],  /* haze over the roofs — where every tower starts */
    [  168, "#c3d8ec"],
    [  120, "#aac9e6"],
    [   72, "#92b8de"],
    [   24, "#7ea8d6"],
    [  -48, "#6f9cce"],  /* the sun is somewhere in here */
    [ -136, "#6390c6"],
    [ -224, "#5a84ba"],
    [ -312, "#6d82ae"],  /* golden hour: the light turns */
    [ -384, "#8a7fa2"],
    [ -456, "#a97d94"],
    [ -520, "#c58a86"],
    [ -576, "#d99a72"],  /* sunset */
    [ -640, "#b96f78"],
    [ -704, "#8f5578"],
    [ -768, "#6b4470"],
    [ -832, "#4b3564"],  /* dusk */
    [ -904, "#332b52"],
    [ -984, "#222240"],
    [-1064, "#161a33"],
    [-1144, "#0e1428"],  /* night, and the stars are out */
    [-1240, "#090f20"],
    [-1344, "#060b18"],
    [-1448, "#04070f"],  /* the top of the air */
    [-1560, "#02040c"],  /* space — and the last colour left behind a window */
    [-1704, "#03060f"],
    [-1850, "#040713"],
    [-2000, "#040712"],
    [-2310, "#050a18"],
    [-2620, "#070c1b"],
    [-2930, "#050a18"],
    [-3240, "#070c1b"],
    [-3550, "#050a18"],
    [-3860, "#070c1b"],
    [-4160, "#040812"],  /* and the dark is simply the dark */
    [-4600, "#02040a"],
    [-5400, "#010309"],
    [-6500, "#010208"],
    [-7000, "#010106"]   /* the top of the column: nothing left but the last window */
  ];

  var NS = "http://www.w3.org/2000/svg";

  /* Where the climb leaves the weather, in art units of slide — the same units
     the bands are written in. Altitude, not floor count and not a fraction of
     the viewport: the sky has to darken by how far the world has fallen, or a
     wide window gets a different night than a tall one. */
  var STAR_AT = 900, MOON_AT = 1010, SPACE_AT = 1540;

  /* The one layer that does not fall with the world: the stars creep, at a
     twentieth of it, the way a real sky holds almost still while you leave. */
  var FAR = 0.05;

  /* How deep the star field has to be written — and the world ladder above it is
     written to the same depth, because two far layers that end at different
     heights are two ceilings, and a sky with a ceiling in it is a room. The creep
     moves this layer 350 units over the four-hundred-floor run of the rail on the
     window the probes work at, but the creep is the climb over the layer's own
     scale, so a short window with the same four hundred floors collects a larger
     one: a 480-wide, 400-tall window comes to 468. The field is written ten times
     deeper than the tallest page walks, so that no reader ever reaches its end —
     a row of stars costs two rects, and the cost of covering the case is nothing.
     The whole column is 8216 units, so there is room for it. */
  var STAR_TOP = -4600;

  function fade(v: number){
    if(v < 0){ v = 0; } else if(v > 1){ v = 1; }
    /* eight steps: a fade you can still see the pixels of */
    return String(Math.round(v * 8) / 8);
  }

  function svgEl(tag: string, at: Record<string, string | number>){
    var n = document.createElementNS(NS, tag);
    /* setAttribute stringifies its value anyway; String() only satisfies the type */
    for(var k in at){ n.setAttribute(k, String(at[k])); }
    return n;
  }

  /* One 4x4 checker on the same grid as everything else in the page: `lo`
     underneath, and `n` of its four 2x2 cells — that is 25% of the pixels each
     — punched through in `hi`. Every seam between two bands is one of these,
     which is the only texture in the sky. Returns the fill to hand to a rect. */
  function checker(id: string, lo: string, hi: string, n: number){
    var p = svgEl("pattern", {id: id, width: 4, height: 4, patternUnits: "userSpaceOnUse"});
    p.appendChild(svgEl("rect", {width: 4, height: 4, fill: lo}));
    if(n > 0){ p.appendChild(svgEl("rect", {width: 2, height: 2, fill: hi})); }
    if(n > 1){ p.appendChild(svgEl("rect", {x: 2, y: 2, width: 2, height: 2, fill: hi})); }
    if(n > 2){ p.appendChild(svgEl("rect", {x: 2, width: 2, height: 2, fill: hi})); }
    skyDefs.appendChild(p);
    return "url(#" + id + ")";
  }

  function buildSky(){
    var i, top;
    for(i = 0; i < BANDS.length; i++){
      top = (i + 1 < BANDS.length) ? BANDS[i + 1][0] : SKY_TOP;
      /* Every band is one flat colour: the sky up there is dark, and the thing
         that gives it scale is how far apart the seams are, not what is inside
         them. */
      skyBands.appendChild(svgEl("rect", {
        x: 0, y: top, width: ART_W, height: BANDS[i][0] - top,
        fill: BANDS[i][1]
      }));
    }
    /* The seams go on last, over the bands they belong to: a quarter-density
       row under the line and a half-density row over it, so the denser dither
       is always the colour being climbed into — and above the air, where the
       bands are near-black and up to four hundred units apart, the seam is the
       only place anything changes, which is what carries the climb. Two rects
       and two 4x4 patterns per seam — a real gradient would have cost a filter
       and a lot of pixels to say the same thing less clearly. */
    for(i = 0; i + 1 < BANDS.length; i++){
      top = BANDS[i + 1][0];
      var lo = BANDS[i][1], hi = BANDS[i + 1][1];
      checker("d50-" + i, lo, hi, 2);
      checker("d25-" + i, lo, hi, 1);
      skyBands.appendChild(svgEl("rect", {x: 0, y: top - 4, width: ART_W, height: 4, fill: "url(#d50-" + i + ")"}));
      skyBands.appendChild(svgEl("rect", {x: 0, y: top,     width: ART_W, height: 4, fill: "url(#d25-" + i + ")"}));
    }
  }

  /* ── the stars ──────────────────────────────────────────────────────────
     Deterministic forever, out of one fixed seed: a shared link has to show the
     same sky to everyone. The four hand-placed groups stay exactly where they
     were drawn and carry the extra field in tiers — a hundred faint, a few
     dozen mid, a hundred and fifty bright — plus a handful of crosses for the
     ones you would actually name. */
  function rng(seed: number){
    var s = seed >>> 0;
    return function(){
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function buildStars(){
    var r = rng(0x5eed73);
    var tiers = starField.querySelectorAll("g");

    /* A row at a time, over the whole band the drift can open on. The layer is
       carried down this column, so what the frame shows is a 216-unit slice of a
       field four and a half thousand units deep, and the slice walks up through
       it as the tower grows. Hand-placed rects cannot do that — the top of them
       is at y 22 and the climb leaves it behind in a couple of storeys — and a
       scatter cannot either: a scatter has gaps, and a slice that advances
       spends the whole climb discovering the gaps, which reads as a sky that is
       running out rather than a sky that is passing. So every row is visited, on
       the 2-unit grid, and what rises with the altitude is how much of each row
       lights up — a star or two a row, more of them, and crosses more often, the
       further into the night the row is — while the two groups that were
       hand-placed for the first frame carry the low sky and the two brighter
       ones take over once the air is behind you. */
    function put(group: Element, y: number, p: number, size: number){
      if(r() > p){ return false; }
      var x = 4 + 2 * Math.floor(r() * (ART_W - 12) / 2);
      if(x > 202 && x < 256 && y > 20 && y < 72){ return false; }  /* the moon's square */
      group.appendChild(svgEl("rect", {x: x, y: y, width: size, height: size}));
      return true;
    }

    var bright = svgEl("g", {fill: "#ffffff", opacity: ".95"});
    for(var y = 216; y >= STAR_TOP; y -= 2){
      /* How far into the night this row is, in the units the sky's phases are
         written in: the layer is carried at FAR of the climb, so y over FAR is
         the height at which this row's slice of the layer is the one in the
         frame — which lets the same constants that say when the stars come out
         and when the air ends say how lit the row is. The sky is not thinner up
         here: there is less and less left to thin it, so the density saturates
         and stays, and the field stays dense for its whole four and a half
         thousand units. */
      var up = Math.max(0, Math.min(1, ((-y / FAR) - STAR_AT) / (SPACE_AT - STAR_AT)));
      var high = up > .5;
      var lit = put(high ? tiers[1] : tiers[3], y, .55 + .35 * up, 1);
      lit = put(high ? tiers[0] : tiers[2], y, .30 + .35 * up, 2) || lit;
      /* Both draws can miss — a third of the rows down in the low sky — and the
         frame walks up through these rows two at a time, so a row with nothing
         in it is not sparsity, it is a hole the climb arrives at and sits in.
         One star a row is guaranteed, and the dimmest group takes it: the low
         sky is the pale one.
         Which column it stands in is the other half of the guarantee. A row's own
         draw is only a scatter, and a scatter has to be spread evenly to survive
         a crop: a 390-wide window shows a third of the width, so a field that is
         only random leaves that window staring at the holes between the stars.
         The guaranteed one therefore walks four lanes a quarter of the sky apart,
         one lane a row, jittered a few units — any four rows in a row cover every
         quarter of the width on any crop, and no window is wider than a lane plus
         its jitter. */
      if(!lit){
        var fx = 44 + 90 * (((216 - y) / 2) % 4) + 2 * Math.round((r() * 12 - 6) / 2);
        if(fx > 202 && fx < 256 && y > 20 && y < 72){ fx -= 90; }   /* the moon keeps its square */
        tiers[3].appendChild(svgEl("rect", {x: fx, y: y, width: 1, height: 1}));
      }
      if(r() < .03 + .05 * up){                               /* the ones you would name */
        var cx = 6 + 2 * Math.floor(r() * (ART_W - 20) / 2);
        if(!(cx > 200 && cx < 258 && y > 18 && y < 74)){
          bright.appendChild(svgEl("rect", {x: cx + 2, y: y,     width: 2, height: 6}));
          bright.appendChild(svgEl("rect", {x: cx,     y: y + 2, width: 6, height: 2}));
        }
      }
    }
    starField.appendChild(bright);
  }

  /* ── the worlds ──────────────────────────────────────────────────────────
     Height is not only a darker sky: it is everything else that is up here, and
     it does not stop when a screen does. Ten of them, one every sixty units of
     the layer from the moon's own rows upward — and each one a little further
     from home than the one under it: a pale moon, an ocean, a rust
     desert, a giant with bands and a moon of its own, a ringed world, a night
     side with the lights still on, a pair, a cube, one that has come apart, and
     them all a coin. It is the same joke the tower is: somebody is out here.
     They are at the moon's distance and they move the way it moves: this group
     is a child of .drift and creeps at the same twentieth of the climb. So the
     only thing that brings a world through the frame is the height it was given
     in the layer — a world is drawn where it lives and the window comes to it,
     the way it comes to a star — and the creep is slow enough that a world sits
     out there for four or five hundred storeys of building. That is what makes
     a ladder of them rather than a sky, and what makes them far rather than
     here: a thing you reach quickly is near you, and a thing you are still
     passing two days of building later is not.
     Past the tenth the same ten come round again — a run with an end is a run
     you can see the end of — so the sky still has worlds in it at four hundred
     floors or at four thousand, and the one overhead is always a new one.
     So the ladder is written as altitudes and the coordinates are derived: rungs
     that start in the moon's own last row and run as deep as the star field, y
     is what that altitude comes to in the layer's own units, and x is a lane
     rather than a number: read off the frame by readBand() and laneX() below,
     so that a world is always somewhere the window can see it and never behind
     a facade. */
  var WORLD_GAP = 60;    /* one rung every sixty units of the layer: three or  */
  var WORLD_BASE = 64;   /* four of them inside a frame at once. The bottom    */
                         /* rung is drawn in the moon's own last rows, so the  */
                         /* first world is the moon's neighbour, and the ladder */
                         /* runs as deep as the star field, because two far    */
                         /* layers that end at different heights are two       */
                         /* ceilings. */
  var WORLD_RUNGS = Math.ceil((WORLD_BASE - STAR_TOP) / WORLD_GAP);

  /* Only the radius is a property of a world; where it sits across the sky is
     not. A ladder written as fixed columns only holds on the one aspect it was
     written on, and the sky is cropped by the window: a 427-wide panel is shown
     art x 142..218 of the 360 the layer is drawn on, a 1920-wide one gets all
     of them. So x is a lane a world is put into when it is built and re-put
     into whenever the frame changes, chosen from the band the window is really
     showing and from the shape's own reach — read back off the cells it is
     drawn with, which is not the radius it was drawn from: a ringed world is
     half again as wide as its disc, and a world with a moon has a moon to find
     room for. No world is drawn more than twenty units across, either: the
     narrowest window measured — a phone, 390 wide, showing 116 of the layer's
     360 units with the tower's 48 down the middle — leaves 29 between the
     facade and the frame, and a shape wider than that cannot be inside both.
     Their inks are night inks, too. These are a dozen units of art drawn on a
     screen forty pixels away: a saturated disc at that size stops being a world
     and becomes a hole in the sky — which is exactly what a blue ocean and a red
     desert did up here, at full strength, on a black field. So every body is
     drawn at the colour it would be at the far end of a long exposure, some
     three quarters of the way down to the dark, and the light is left to their
     edges, their bands and their city lights, which is where the eye can still
     find the shape without the shape being brighter than the sky it is in. The
     moon is the one exception and it is the reason the rule exists: it is nearer
     than anything else up here, so it is drawn pale and at its own strength,
     while the field behind it is held to three quarters of the moon's own fade.
     Depth in a flat sky is a difference in brightness and nothing else. */
  var WORLDS: [number, string][] = [
    /* r  what it is */
    [5, "pale"],      /* the moon again, further off */
    [7, "ocean"],
    [6, "rust"],
    [9, "giant"],     /* with the moon that goes round it */
    [6, "ring"],
    [6, "night"],
    [5, "pair"],      /* and a moon of its own */
    [5, "cube"],
    [7, "broken"],
    [6, "coin"]       /* and this is what it is all for */
  ];

  /* The band of the far layer's own units that the window is really showing,
     and the tower's own lane inside it. The same arithmetic the frame does: the
     layer is slice-fitted, so one art unit is max(w/360, h/216) pixels, the
     visible width is w over that, and cx is the tower's own centre expressed in
     those units, which is the one place a world may not be. */
  var worldBand: Band | null = null, worldAlt: number[] = [], worldFoot: Foot[] = [];
  function readBand(){
    var sb = sky.getBoundingClientRect();
    var tb = tower.getBoundingClientRect();
    var kF = Math.max(sb.width / ART_W, sb.height / ART_H) || 1;
    var half = Math.min(180, (sb.width / kF) / 2);
    var tw = (tb.right - tb.left) / 2 / kF;
    if(!tw){ tw = (parseFloat(getComputedStyle(tower).width) || 0) / 2 / kF; }
    return {
      lo: 180 - half,
      hi: 180 + half,
      cx: 180 + (((tb.left + tb.right) - (sb.left + sb.right)) / 2) / kF,
      tw: tw
    };
  }

  /* A lane: outward from the tower by its own half-width, the world's radius and
     a stagger, so that the ten do not read as two columns -- and always
     outward, never back across the facade. Two bounds then hold it inside the
     band the window is showing: the inward one is the promise that a world is
     never half behind a facade, the outward one that it is never half off the
     edge. Where both cannot be met the band is narrower than tower plus world,
     and the one that matters is the facade. */
  function laneX(band: Band, foot: Foot, i: number, side: number){
    /* Outward from the facade by the shape's own reach, the second gap and a
       stagger of up to four units, so the ten do not read as two columns; then
       in off the edge the window is really showing. Both bounds are written in
       terms of the origin the shape is drawn about. */
    var inward = band.cx + side * (band.tw + 2 + (side > 0 ? -foot.x0 : foot.x1));
    var x = inward + side * ((i * 7) % 5) * 7;
    var lo = band.lo + 2 - foot.x0, hi = band.hi - 2 - foot.x1;
    x = side > 0 ? Math.min(x, hi) : Math.max(x, lo);
    /* Where a band is too narrow to hold both, the band gives way by the
       deficit and the facade does not give way at all: a world half off the
       edge of the frame reads as one coming into shot, a world half behind the
       building reads as a bug. */
    if(side > 0 ? x < inward : x > inward){ x = inward; }
    /* Onto the grid. The two nearest even origins are equal candidates, so the
       one that keeps every bound wins; where the band cannot hold the shape at
       all, the one further from the building does, so the little that is lost
       comes off the edge of the frame and never across a facade. */
    var down = 2 * Math.floor(x / 2), up = 2 * Math.ceil(x / 2);
    var fits = function(v: number){
      if(v + foot.x0 < band.lo + 2 || v + foot.x1 > band.hi - 2){ return false; }
      return side > 0 ? v >= inward : v <= inward;
    };
    if(fits(down) !== fits(up)){ return fits(down) ? down : up; }
    if(fits(down)){ return side > 0 ? Math.min(down, up) : Math.max(down, up); }
    return side > 0 ? Math.max(down, up) : Math.min(down, up);
  }

  /* Put them where the window says they can be seen. Called once the layer is
     built and again on every refit, because a crop is a property of the frame.
     A world's y is its altitude and never moves; only x is re-decided. */
  function placeWorlds(){
    if(!worldField.firstChild){ return; }
    var band = readBand();
    worldBand = band;
    for(var i = 0; i < worldAlt.length; i++){
      worldField.children[i].setAttribute("transform",
        "translate(" + laneX(band, worldFoot[i], i, i % 2 ? 1 : -1) + " " + worldAlt[i] + ")");
    }
  }

  /* The same question the worlds answer, asked of the scene layer. Its scale is
     the far layer's own -- the column's element is one frame tall and 8216/216
     of it wide, so preserveAspectRatio lands on the identical fit -- which is
     why a lane is measured once and holds for both layers. A prop is drawn at
     the altitude of its rung and only its x is re-decided: the band is a
     property of the window, and the climb is a property of the count.

     The rungs run from just above the parked frame to whatever ceiling this
     layout can climb to, so the junk cannot stop before the climb does -- a
     taller climb asks for more rungs and the fourteen drawn shapes cycle, one
     more pass each time. The lanes take the rung rather than the shape, so the
     second pass does not sit where the first one did. Recomputed only when the
     ceiling or the window moves; the rest of the time it is one string compare.

     The rungs are one window apart, and a window is never taller than a drawn
     frame, so the next thing up enters the top of the sky exactly as this one
     leaves the bottom: the air is never empty and never holds two of them, and
     because the top rung can then never be more than a window under the ceiling
     there is a prop above the roof at the end of any climb -- the moment the
     whole ladder was built for.
     A prop that turns is measured by what it sweeps, not by what it rests as:
     the quarter turns are about the shape's own middle, so the reach that has
     to fit the lane is the half-diagonal of its box, not half its width. */
  var PROP_FIRST = 260;   /* the lowest rung, above the whole frame the street sits in */
  var PROP_MIN   = 96;    /* never pack them tighter than this, whatever a window does */
  var propPool: SVGElement[] = [];  /* the fourteen drawn, then one clone per rung above them */
  var propBase: number[] = [];      /* their authored delays, so a repeat is the one thing out of phase */
  var propFoot: Foot[] = [];        /* what each drawn shape reaches, in its own units */
  var propKey    = "";    /* the ceiling and the window the ladder was cut for */

  function propReach(body: Element, kind: number): Foot {
    if(propFoot[kind]){ return propFoot[kind]; }
    /* getAttribute is typed nullable; parseFloat tolerates the null this never gets */
    var cells = body.querySelectorAll("rect");
    var foot: Foot = {x0: 0, x1: 0}, top = 0, bot = 0;
    for(var c = 0; c < cells.length; c++){
      var left = parseFloat(cells[c].getAttribute("x") as string) || 0;
      var wide = parseFloat(cells[c].getAttribute("width") as string) || 0;
      var up = parseFloat(cells[c].getAttribute("y") as string) || 0;
      foot.x0 = Math.min(foot.x0, left);
      foot.x1 = Math.max(foot.x1, left + wide);
      top = Math.min(top, up);
      bot = Math.max(bot, up + (parseFloat(cells[c].getAttribute("height") as string) || 0));
    }
    if(body.classList.contains("lev-flip")){
      var mid = (foot.x0 + foot.x1) / 2;
      var half = Math.sqrt(Math.pow((foot.x1 - foot.x0) / 2, 2) +
                           Math.pow((bot - top) / 2, 2));
      foot = {x0: mid - half, x1: mid + half};
    }
    propFoot[kind] = foot;
    return foot;
  }

  function placeProps(scale: number, uMax: number){
    var uid = document.getElementById("levProps");
    if(!uid){ return; }
    if(!propPool.length){
      propPool = [].slice.call(uid.children);
      propPool.forEach(function(g){
        propBase.push(parseFloat((g.firstElementChild as SVGElement).style.animationDelay) || 0);
      });
    }
    var sb    = sky.getBoundingClientRect();
    var step  = Math.max(PROP_MIN, Math.round(sb.height / scale));
    var rungs = uMax < PROP_FIRST ? 0 : 1 + Math.floor((uMax - PROP_FIRST) / step);
    var key   = rungs + "|" + step + "|" + Math.round(scale * 100) + "|" +
                Math.round(sb.width) + "|" + Math.round(sb.height);
    if(key === propKey){ return; }
    propKey   = key;
    var kinds = propBase.length;
    var band  = readBand();
    for(var r = 0; r < rungs; r++){
      if(!propPool[r]){
        var pass = Math.floor(r / kinds);
        /* cloneNode is typed as Node; these are the SVG groups it was cloned from */
        var clone = propPool[r % kinds].cloneNode(true) as SVGElement;
        clone.firstElementChild!.setAttribute("style",
          "animation-delay:" + (propBase[r % kinds] - pass * 2.3).toFixed(2) + "s");
        uid.appendChild(clone);
        propPool[r] = clone;
      }
      var prop = propPool[r];
      var up   = PROP_FIRST + r * step;
      prop.style.display = "";
      prop.setAttribute("data-rung", String(r));
      prop.setAttribute("data-y", String(up));
      prop.setAttribute("transform", "translate(" +
        laneX(band, propReach(prop.firstElementChild as Element, r % kinds), r, r % 2 ? 1 : -1) + " " +
        -up + ")");
    }
    for(var s = rungs; s < propPool.length; s++){ propPool[s].style.display = "none"; }
  }

  function buildWorlds(){
    /* The layer's own units: y 216 is its ground line and the day the climb
       reaches an altitude is the day this group has been carried down that far,
       so a world is written at the altitude it belongs to and the rail brings it
       through. Every row is 2 units tall and every width a multiple of 4 — the
       grid — which is what makes a circle out of rectangles. */
    function rect(g: Element, x: number, y: number, w: number, h: number, ink: string){
      g.appendChild(svgEl("rect", {x: x, y: y, width: w, height: h, fill: ink}));
    }

    /* One cross-section per 2 units of height: the half-width the sphere has
       there, rounded down to the grid, which steps a silhouette by 4 and reads
       as round at every size the ladder uses. `ink` may be a function of the
       row, which is how the giant gets its bands without a clip path, and `cut`
       shaves cells off the right-hand end of a row, which is how one of them
       came apart. */
    function disc(g: Element, cx: number, cy: number, r: number, ink: string | ((dy: number) => string), cut?: (dy: number) => number){
      for(var dy = -r; dy <= r; dy += 2){
        var hw = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) / 2) * 2;
        var off = cut ? cut(dy) : 0;
        if(hw - off < 2){ continue; }
        rect(g, cx - hw, cy + dy, (hw - off) * 2, 2, typeof ink === "function" ? ink(dy) : ink);
      }
    }

    var band = readBand();
    worldBand = band;

    for(var i = 0; i < WORLD_RUNGS; i++){
      var spec = WORLDS[i % WORLDS.length], r = spec[0], kind = spec[1];
      /* The world is drawn about its own origin: the lane and the altitude
         belong to the wrapper's transform, so the drawing is only ever the
         shape, and where the shape goes is a question the window answers. */
      var x = 0, y = 0, side = i % 2 ? 1 : -1;
      /* The rung's own height in the layer, on the 2-unit grid both far layers
         are drawn on: the moon's last row, less one gap for every rung above it,
         with the ten drawn in turn. Nothing about the climb touches it — the
         creep brings the rung down, and the height it was given decides which
         storeys of the climb are the ones that get to see it. */
      var alt = WORLD_BASE - i * WORLD_GAP;
      var g = svgEl("g", {});

      if(kind === "pale"){
        disc(g, x, y, r, "#9c9a8b");                            /* the moon again, and */
        rect(g, x - 2, y - 2, 4, 4, "#7a7768");                 /* further off than it */
        rect(g, x + 2, y + 2, 2, 2, "#7a7768");
      } else if(kind === "ocean"){
        disc(g, x, y, r, "#2b5474");
        rect(g, x - 4, y - 4, 8, 6, "#33553d");                 /* the land, */
        rect(g, x + 2, y - 2, 4, 4, "#33553d");                 /* and the rest */
        rect(g, x - 2, y - r + 2, 4, 2, "#a9c2cf");             /* a cap at each end */
        rect(g, x - 4, y + r - 4, 6, 2, "#a9c2cf");
      } else if(kind === "rust"){
        disc(g, x, y, r, "#6b3a22");
        rect(g, x - 4, y - 4, 6, 4, "#42271a");                 /* the long valleys */
        rect(g, x + 2, y,     4, 2, "#42271a");
        rect(g, x - 2, y - r + 2, 4, 2, "#b9b3a4");
      } else if(kind === "giant"){
        var bands = ["#4e4436", "#3d3529", "#584c3c", "#332c23", "#473d30"];
        disc(g, x, y, r, function(dy: number){
          return bands[Math.min(bands.length - 1, Math.floor((dy + r) / (r / 2.5)))];
        });
        rect(g, x + 2, y, 6, 4, "#3a2418");                     /* the storm on it */

        /* and one moon, going round. Eight places on a circle of eight units,
           four seconds apiece, and the rock is drawn about its own group's
           origin because the .orbit rule translates it from there. */
        var hub = svgEl("g", {transform: "translate(" + x + " " + y + ")"});
        var orb = svgEl("g", {class: "orbit"});
        rect(orb, -2, -2, 4, 4, "#9a9686");
        hub.appendChild(orb);
        g.appendChild(hub);
      } else if(kind === "ring"){
        rect(g, x - r - 4, y - 4, (r + 4) * 2, 2, "#5a5342");  /* the ring, behind */
        disc(g, x, y, r, "#7d7460");
        rect(g, x - r - 2, y + 4, (r + 2) * 2, 2, "#8a8067");  /* and in front */
        rect(g, x - 4, y - 2, 8, 2, "#6b6350");                 /* a band across the face */
      } else if(kind === "night"){
        disc(g, x, y, r, "#121a30");
        rect(g, x - r,     y - 2, 2, 4, "#2c3a5e");             /* the one lit edge */
        rect(g, x - r + 4, y - 4, 2, 2, "#2c3a5e");
        rect(g, x - 2, y - 2, 2, 2, "#ffd98a");                 /* and the lights, still on */
        rect(g, x + 2, y + 2, 2, 2, "#ffd98a");
        rect(g, x,     y - 2, 2, 2, "#ffd98a");
      } else if(kind === "pair"){
        disc(g, x, y, 5, "#2f5a63");
        disc(g, x + 12, y - 2, 5, "#5c4230");
        rect(g, x + 6, y - 2, 2, 2, "#2c3a45");                 /* the line between them */
      } else if(kind === "cube"){
        rect(g, x - 6, y - 2, 10, 10, "#46505f");               /* the face */
        rect(g, x - 4, y - 6, 10,  4, "#5d6878");               /* the top */
        rect(g, x + 4, y - 4,  4, 10, "#333b46");               /* and the side */
      } else if(kind === "broken"){
        disc(g, x, y, r, "#4a3f36", function(dy: number){
          return (dy > -6 && dy < 6) ? 4 : 0;                   /* a bite out of the right */
        });
        rect(g, x + r,     y - 2, 2, 2, "#4a3f36");             /* and what it lost, drifting */
        rect(g, x + r + 4, y + 2, 2, 2, "#544437");
        rect(g, x + r + 2, y + 6, 2, 2, "#3c3229");
      } else {
        /* the coin: whatever they are all doing up here, this is what for. It is
           the one thing in the field still allowed to be gold — a joke nobody can
           see is not a joke — but it is the gold of a coin across the street, not
           the gold of the sign you are standing on. */
        disc(g, x, y, r, "#c2a04c");
        rect(g, x - r + 2, y - r + 4, 2, 2, "#e8d9a0");         /* the glint */
        rect(g, x - 4, y - 4, 6, 2, "#7d5f16");                 /* the S */
        rect(g, x,     y - 2, 2, 2, "#7d5f16");
        rect(g, x - 4, y,     6, 2, "#7d5f16");
        rect(g, x - 4, y + 2, 2, 2, "#7d5f16");
        rect(g, x - 4, y + 4, 6, 2, "#7d5f16");
        rect(g, x - 2, y - 6, 2, 12, "#7d5f16");                /* struck through */
      }
      /* What the shape reaches either side of its own origin, read back off the
         cells it was just drawn with, because that is what a lane has to hold
         and it is not the radius it was drawn from. The moon is not one of
         them: it is on a road of its own and where it goes is not the lane's
         business. */
      var cells = g.querySelectorAll("rect");
      var foot = {x0: 0, x1: 0};
      for(var c = 0; c < cells.length; c++){
        if(cells[c].closest(".orbit")){ continue; }
        var left = parseFloat(cells[c].getAttribute("x") as string) || 0;
        foot.x0 = Math.min(foot.x0, left);
        foot.x1 = Math.max(foot.x1, left + (parseFloat(cells[c].getAttribute("width") as string) || 0));
      }
      worldFoot.push(foot);
      var lane = laneX(band, foot, i, side);
      var w = svgEl("g", {class: "world"});
      w.setAttribute("transform", "translate(" + lane + " " + alt + ")");
      w.appendChild(g);
      worldField.appendChild(w);
      worldAlt.push(alt);
    }
  }

  function frame(frac?: number){
    var fh0   = tok("--fh0") || 52;
    var roofH = roof.offsetHeight || 56;
    var skyB  = sky.getBoundingClientRect();
    var scale = Math.max(skyB.width / ART_W, skyB.height / ART_H) || 1;
    var curb  = Math.round((ART_H - ART_GROUND) * scale);
    var crown = tok("--crown-gap") || 120;
    var room  = (sky.clientHeight || 1) - curb - roofH - crown;

    /* The camera rides at the roofline: the newest floor is always the storey
       directly under the roof, and every dollar past the first frameful of
       tower slides the same facade down past the kerb — same storey height, a
       different slice of sky. No snapping: a camera cuts the bottom storey
       wherever it likes, and a hand on the rail is not obliged to land on the
       grid either. */
    autoPan = count ? Math.max(0, count * fh0 - room) : 0;

    /* The rail is exactly as long as the tower stands above the frame, so the
       distance you can scroll *is* the height you have built and the last stop
       is the newest floor. A scroll container can only travel what its content
       overshoots it by, which is why the rail is the climb plus one frame. */
    setTok("--scroll-max", autoPan + "px");

    /* A purchase, a refit and the way back all place the scroller by hand, so
       they say *where* as a fraction of the rail — the rail is about to be a
       different length and "the ceiling" has to survive that. Then read it back
       rather than trust it: the browser clamps to the rail it can actually see. */
    if(frac !== undefined){
      void scroller.scrollHeight;
      moveScroll(frac * autoPan);
    }
    pan = Math.max(0, Math.min(scroller.scrollTop, autoPan));

    /* Everything the sky does is a function of the one number the hand holds,
       in the art's own units: a transform inside an SVG is measured in those,
       never in screen pixels. The scenery, the sun and the street all fall at
       exactly 1x, together with the ground the tower stands on. */
    var u = pan / scale;

    setTok("--ground",  curb + "px");
    setTok("--fh",      fh0 + "px");
    setTok("--wh",      (fh0 - 20) + "px");
    setTok("--pan",     pan + "px");
    setTok("--pan-u",   u.toFixed(2) + "px");
    setTok("--pan-far", (u * FAR).toFixed(2) + "px");
    /* The worlds are not a rail of their own any more. They are children of the
       far layer and creep at the far layer's own twentieth of the climb, which
       is what the moon does: what brings them through is not a formula but the
       height they were given, and the frame never needs to know. */

    /* The stars are the exception, and the reason the climb has a far end: they
       are not climbed *to*, they are climbed out of. Faded on altitude, so what
       hides them is the light, not a storey number. */
    setTok("--star-op", fade((u - STAR_AT) / (SPACE_AT - STAR_AT)));
    setTok("--moon-op", fade((u - MOON_AT) / (SPACE_AT - MOON_AT)));

    /* The rail can stop anywhere between the street and the roof, so the window
       follows the camera and not the newest floor: the slice that is painted is
       the slice that is on screen. Skipped while seeding — the window is pinned
       to the top then, which is where the camera ends up anyway — and free on a
       purchase, because a purchase only adds the floor the window ends on. */
    if(!booting && floors.length){
      rewindow(Math.round(((sky.clientHeight || 1) / 2 + pan - curb) / fh0
                          - floors.length / 2));
    }

    /* the window's base, in the world: what the painted slice sits on */
    setTok("--drop", (winLo * fh0) + "px");
    setTok("--n",    String(count));
    sky.classList.toggle("is-dense", fh0 < 40);

    /* the way back exists only once the roof is out of frame */
    totop.classList.toggle("is-on", autoPan - pan > fh0);

    /* the junk floating above, on rungs counted off the same climb the worlds
       ride -- placed here and not on a resize because the rail grows with every
       floor, and it is the rail the rungs are measured against. */
    placeProps(scale, autoPan / scale);

    armRest();
  }

  /* ── at rest ─────────────────────────────────────────────────────────────
     The tower paints in stages: sky and worlds, then the seeded storeys, then
     the newest one landing. Read mid-landing, that storey sits half a storey
     above its own roof, so the page says plainly when nothing has moved for a
     beat: `data-at-rest` on the root, cleared by every painted frame and set
     again once the landing animation has had its 190ms. Instruments wait for
     that instead of guessing at a stopwatch. */
  var restTimer: number | null = null;
  function armRest(){
    var root = document.documentElement;
    delete root.dataset.atRest;
    if(restTimer){ window.clearTimeout(restTimer); }
    restTimer = window.setTimeout(function(){
      root.dataset.atRest = String(Math.round(performance.now()));
    }, 260);
  }

  /* ── the rail ────────────────────────────────────────────────────────────
     Scrolling is the climb. --pan is read straight off scrollTop, so a wheel and
     a purchase drive the same camera along the same rail, and the rail is only
     ever as long as the tower is tall. The one thing that has to be told apart
     is who moved the scroller. A hand takes the 520ms beat away — a curve under
     a live wheel is just lag — while a purchase puts the rail where it has to be
     before the beat starts and lets the beat own every pixel of the climb. */
  var autoPan    = 0;      /* how far the camera can climb at this count */
  var pan        = 0;      /* how far it has */
  var selfScroll = false;  /* the next scroll event is ours, not a hand's */
  var queued     = false;  /* one frame() per animation frame, however fast the wheel */
  var booting    = true;   /* the sample tower arrives built: no beat, no rail work */

  function moveScroll(v: number){
    selfScroll = true;
    scroller.scrollTop = v;
    /* a frame of grace: if the move lands where the scroller already was there is
       no event at all, and the flag must not eat the next real one */
    requestAnimationFrame(function(){ selfScroll = false; });
  }

  /* The count has not moved, so the view has no business moving either: a refit
     keeps the same slice of sky under the eye instead of snapping to the street. */
  function refit(){
    frame(autoPan ? pan / autoPan : 0);
    placeWorlds();
  }

  scroller.addEventListener("scroll", function(){
    if(selfScroll){ return; }
    sky.classList.add("is-scroll");
    if(queued){ return; }
    queued = true;
    requestAnimationFrame(function(){ queued = false; frame(); });
  }, {passive:true});

  /* Back to the top is the same move a purchase makes, so it gets the same beat */
  totop.addEventListener("click", function(){
    sky.classList.remove("is-scroll");
    frame(1);
  });

  function paint(){
    signN.textContent    = String(count);
    signCash.textContent = "$" + count;
    signLast.textContent = count ? nameFor(count) + " · " + count + "F" : "—";
  }

  function wobble(){
    if(MO.matches) return;
    tower.classList.remove("bump");
    void tower.offsetWidth;
    tower.classList.add("bump");
  }

  function litCount(){
    var n = 0;
    for(var i = 0; i < floors.length; i++){
      var lit = spec(parseInt(floors[i].dataset.no as string, 10)).lit;
      for(var w = 0; w < 3; w++){ if(lit[w]){ n++; } }
    }
    return n;
  }

  /* ── the one thing that happens ─────────────────────────────────────────
     In production this is NEVER called by the browser on click. Stripe calls it
     once per floor after checkout.session.completed with payment_status paid. */
  function addFloor(quiet?: boolean){
    count++;
    var el = makeFloor(count);
    floors.push(el);
    stack.appendChild(el);

    /* The window can only be as long as the cap: a storey arriving at the top
       pushes one off the base, and the window's base is then one storey further
       up the world. At boot that is the whole story; a bought floor re-parks the
       camera a few lines down and settles the window there instead. */
    if(floors.length > RENDER_CAP){
      floors.shift()!.remove();
      winLo++;
    }

    relight();
    paint();
    /* the beat belongs to the climb: a purchase parks the rail on the new ceiling
       before it paints, and the climb is then the only thing that moves */
    sky.classList.remove("is-scroll");
    frame(booting ? undefined : 1);
    wobble();

    if(!quiet){
      live.textContent = "Floor " + count + " built. " + nameFor(count)
        + " moved in. $" + count + " taken. " + litCount() + " windows lit in the tower.";
    }
  }

  /* ── press once for one floor, or hold to charge up a batch ─────────────
     Holding does NOT buy anything per tick. It only counts: the pending order
     grows to N floors, and one release becomes ONE payment of $N. */
  var MAX_BATCH   = 50;    /* mirrors the server-side cap on line_items[0][quantity] */
  var TICK_MS     = 140;   /* one floor per tick while held */
  var HOLD_ARM_MS = 320;   /* ignore the first moments so a tap stays a tap */

  var holdDelay: number | null = null, holdTick: number | null = null, suppress = false;
  var pending   = 0;

  function showPending(){
    var n = pending;
    btnPrice.textContent = "$" + (n > 1 ? n : 1);
    btnText.textContent  = n > 1 ? ("BUILD " + n + " FLOORS") : "BUILD A FLOOR";
    btn.classList.toggle("is-charging", n > 1);
    btnBar.style.width = Math.round(Math.min(n, MAX_BATCH) / MAX_BATCH * 100) + "%";
    btn.setAttribute("aria-label", n > 1
      ? ("Build " + n + " floors for " + n + " dollars in one payment")
      : "Build one floor for one dollar");
  }

  /* One charge, N floors. Floors only ever appear with the money: the client
     shows nothing until the server has the payment. */
  function buy(n: number){
    if(busy){ return; }
    /* as above: one order, one payment of $n */
    if(opts.onPurchase){ opts.onPurchase(n); return; }
    busy = true;
    btn.classList.add("is-work");

    var gap   = n > 8 ? 90 : 130;
    var total = n * gap + 200;

    for(var i = 0; i < n; i++){
      window.setTimeout(function(){ addFloor(true); }, i * gap);
    }
    window.setTimeout(function(){
      busy = false;
      btn.classList.remove("is-work");
      live.textContent = n + " floors built, floors " + (count - n + 1) + " to " + count
        + ", in a single payment of $" + n + ". " + nameFor(count)
        + " is the newest resident. " + litCount() + " windows lit in the tower.";
    }, total);
  }

  function endHold(commit: boolean){
    if(holdDelay){ window.clearTimeout(holdDelay); holdDelay = null; }
    if(holdTick){ window.clearInterval(holdTick); holdTick = null; }
    btn.classList.remove("is-down");

    var n = pending;
    pending = 0;
    showPending();

    /* a hold that counted at least one floor owns its click and becomes the batch */
    if(commit && n > 0){ suppress = true; buy(n); }
  }

  function press(){
    if(busy) return;
    /* Phase 5 sends the order to the server instead; see demo mode at the top. */
    if(opts.onPurchase){ opts.onPurchase(1); return; }
    busy = true;
    btn.classList.add("is-work");
    addFloor();
    window.setTimeout(function(){
      busy = false;
      btn.classList.remove("is-work");
    }, 120);
  }

  /* click is the single source of truth: the keyboard fires it with detail 0 and a
     tap fires it after pointerup, so a hold only has to eat its own click */
  btn.addEventListener("click", function(){
    if(suppress){ suppress = false; return; }
    press();
  });

  btn.addEventListener("pointerdown", function(e){
    if(e.button && e.button !== 0){ return; }
    suppress = false;
    btn.classList.add("is-down");
    pending = 0;
    showPending();
    holdDelay = window.setTimeout(function(){
      holdTick = window.setInterval(function(){
        if(pending < MAX_BATCH){ pending++; showPending(); }
      }, TICK_MS);
    }, HOLD_ARM_MS);
  });

  /* listen on the window so letting go anywhere still commits the batch instead
     of leaving the order stuck mid-charge */
  window.addEventListener("pointerup", function(){ endHold(true); });
  window.addEventListener("pointercancel", function(){ endHold(false); });
  window.addEventListener("blur", function(){ endHold(false); });

  btn.addEventListener("keydown", function(e){
    var k = e.key;

    if(k === " " || k === "Enter"){
      btn.classList.add("is-down");
      /* a keyboard can't hold, so the order is queued with the arrow keys and
         committed here; with nothing queued the click still buys one floor */
      if(e.repeat || pending > 0){
        e.preventDefault();
        if(!e.repeat && pending > 0){
          var n = pending;
          pending = 0;
          showPending();
          buy(n);
        }
      }
      return;
    }

    if(k === "+" || k === "ArrowUp" || k === "ArrowRight"){
      e.preventDefault();
      if(pending < MAX_BATCH){ pending++; showPending(); }
    } else if((k === "-" || k === "ArrowDown" || k === "ArrowLeft") && pending > 0){
      e.preventDefault();
      pending--;
      showPending();
    }
  });
  btn.addEventListener("keyup", function(e){
    if(e.key === " " || e.key === "Enter"){ btn.classList.remove("is-down"); }
  });

  /* long-press on touch can raise the context menu and swallow the release */
  btn.addEventListener("contextmenu", function(e){ e.preventDefault(); });

  /* breakpoints change --bw and --fh, so storeys built under the old geometry get rebuilt */
  var rez: number | null = null;
  window.addEventListener("resize", function(){
    if(rez){ window.clearTimeout(rez); }
    rez = window.setTimeout(function(){
      for(var i = 0; i < floors.length; i++){
        var old = floors[i];
        var fresh = makeFloor(parseInt(old.dataset.no as string, 10));
        fresh.style.setProperty("--i", old.style.getPropertyValue("--i"));
        fresh.classList.toggle("is-new", old.classList.contains("is-new"));
        old.parentNode!.replaceChild(fresh, old);
        floors[i] = fresh;
      }
      /* snap to the new fit: only a purchase earns the climb beat. The beat is
         armed on the frame, so the ground falls on the tower's own curve */
      sky.classList.remove("is-climb");
      refit();
      requestAnimationFrame(function(){ sky.classList.add("is-climb"); });
    }, 140);
  });

  /* the fit is measured from the sky's own box, and that box settles late — the
     tray grows a line taller once the real font lands, which quietly steals
     height from the frame. Re-measure whenever the box actually changes, so the
     ground line, the storey height and the camera always match what is on
     screen; no rebuild, just the fit. */
  if(window.ResizeObserver){ new ResizeObserver(function(){ refit(); }).observe(sky); }

  /* ── boot ─────────────────────────────────────────────────────────────── */
  (function seed(){
    var m = /[?&]n=(\d+)/.exec(location.search);
    var n = m ? Math.min(parseInt(m[1], 10) || 0, 400) : 0;

    buildSky();
    buildStars();
    buildWorlds();

    for(var i = 0; i < n; i++){ addFloor(); }
    if(m){ note.textContent = "SAMPLE TOWER. NOT REAL RESIDENTS — PAYMENTS ARE OFF."; }
    paint();

    /* a sample tower opens parked on its own ceiling: the link asked for a
       finished building, not for two hundred frames of climbing it */
    booting = false;
    frame(1);
    requestAnimationFrame(frame);
    /* the boot frame is still — a shared ?n= link opens on a finished tower, and
       the climb beat belongs to the floors a hand actually buys. A resize snaps
       to the new fit for the same reason: only a purchase should climb. */
    requestAnimationFrame(function(){ sky.classList.add("is-climb"); });
  })();
}
