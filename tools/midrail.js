/* Parks the rail at a share of its travel and lets the page settle, so the PNG
   the harness captures next is a real mid-flight frame of the climb — the one
   thing a probe cannot show: that the journey is visible in pixels, that the
   storeys in frame are real storeys, and that the sky behind them really turned.

   It drives the same path a wheel does (assigning scrollTop fires a trusted
   scroll, and the page's own listener moves the camera), so nothing internal is
   poked and the shot is evidence of the shipped behaviour, not of a test rig.

   Park with `?park=0.45` (0 = street, 1 = the newest floor). Note the roofline is
   NOT expected to be in frame below the ceiling: panning pins the roof only at
   the top of the rail, so a parked share in between is a view of lower storeys —
   which is the whole point of being able to scroll a hundred-floor tower.

   The tower is a hundred storeys and the DOM holds forty-eight, so the second
   thing this proves is that those forty-eight are a *window* on the camera and
   not a bin holding the newest ones: the storey under the middle of the frame has
   to be a real storey, and it has to be the storey the model says is there —
   floor((G - skyH/2) / fh) + 1, with G the ground line's distance down the sky. */
(async () => {
  const cs  = getComputedStyle(document.documentElement);
  const num = (v) => parseFloat(cs.getPropertyValue(v)) || 0;
  const sky = document.querySelector(".sky");
  const sc  = document.querySelector(".scroller");
  const max = num("--scroll-max");
  const fh  = num("--fh");
  const n   = num("--n");
  const ground = num("--ground");

  const want = parseFloat((location.search.match(/[?&]park=([\d.]+)/) || [])[1]);
  const share = Number.isFinite(want) ? Math.max(0, Math.min(1, want)) : 0.55;
  sc.scrollTop = Math.round(max * share);
  await new Promise((r) => setTimeout(r, 700));

  const skyR = sky.getBoundingClientRect();
  const inSky = (r) => r.bottom > skyR.top && r.top < skyR.bottom;
  const boxed = [...document.querySelectorAll(".floor")]
    .map((f) => ({
      no: +f.dataset.no,
      i: +(f.style.getPropertyValue("--i") || 0),
      r: f.getBoundingClientRect(),
    }))
    .sort((a, b) => a.no - b.no);
  const paved = document.querySelector(".pavement").getBoundingClientRect();
  const roof = document.querySelector(".roof").getBoundingClientRect();
  const slide = document.querySelector(".sky svg.scene .slide").getBoundingClientRect();
  const win = boxed.filter((f) => inSky(f.r)).length;
  const pan = num("--pan");
  const panU = num("--pan-u");

  /* the storey the camera is looking at: the middle line of the frame, measured
     up the tower from the kerb, counted in storeys */
  const look = ((skyR.height / 2) + pan - ground) / fh;
  const centred = Math.max(1, Math.min(Math.floor(look) + 1, n));
  const mid = skyR.top + skyR.height / 2;
  const underCentre = boxed.find((f) => f.r.top <= mid && f.r.bottom > mid);
  const nos = boxed.map((f) => f.no);

  return {
    max, parkedAt: sc.scrollTop, share: max ? +(sc.scrollTop / max).toFixed(2) : 0,
    pan, panU, panFar: num("--pan-far"),
    starOp: num("--star-op"), moonOp: num("--moon-op"),
    fh, storeysAboveStreet: Math.round(sc.scrollTop / fh),
    /* which slice of the painted biome is on screen: art-space y of the frame's
       top edge, with the column running 0 (space) .. 1946 (daylight) */
    frameTopArtY: Math.round(190 - panU + 1730),
    floorsInFrame: win,
    frameFullOfStoreys: win >= 8,
    streetGone: !inSky(paved),
    roofAboveFramePx: Math.round(-roof.bottom),
    firstBandMovedPx: Math.round(slide.y),
    stillOnTheRail: sc.scrollTop > 0 && sc.scrollTop < max,

    /* ── the window ── */
    windowLen: boxed.length,
    windowFirst: nos.length ? nos[0] : null,
    windowLast: nos.length ? nos[nos.length - 1] : null,
    windowContiguous: nos.every((v, i) => i === 0 || v === nos[i - 1] + 1),
    windowDropPx: num("--drop"),
    windowDropMatchesBase: Math.abs(num("--drop") - (nos.length ? nos[0] - 1 : 0) * fh) < 0.5,
    /* --i is a position in the window and the window is numbered from its base,
       so the two have to agree: storey n wears --i of n - first, and a storey with
       a bigger number is always the higher one on screen. A window built from the
       wrong end still holds the right storeys in the right places — only upside
       down, with the numbers inside them climbing the wrong way. */
    windowNumberedInOrder: boxed.every((f, k) => f.i === k),
    windowSitsRight: boxed.every((f, k) => k === 0 || f.r.bottom < boxed[k - 1].r.bottom),
    storeyAtCentre: underCentre ? underCentre.no : null,
    storeyTheModelWants: centred,
    centreIsRealStorey: !!underCentre && underCentre.no === centred,
    ok: win >= 8 && nos.every((v, i) => i === 0 || v === nos[i - 1] + 1)
        && boxed.every((f, k) => f.i === k) && !!underCentre && underCentre.no === centred,
  };
})();