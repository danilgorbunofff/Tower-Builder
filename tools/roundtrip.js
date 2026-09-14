/* The wheel, both ways. Climbing rebuilds the top; climbing back DOWN rebuilds the
   base — and the base has to arrive in the right order, numbered the right way up,
   or the tower comes out with its storeys shuffled and its numbers climbing wrong.

   Measured after every leg, in document order (never sorted): a window assembled
   from the wrong end holds the correct set of storeys upside down. */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sc = document.querySelector(".scroller");
  const sky = document.querySelector(".sky");
  const num = (k) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k)) || 0;

  const snap = (label) => {
    const floors = [...document.querySelectorAll(".floor")];
    const nos = floors.map((f) => +f.dataset.no);
    const rects = floors.map((f) => f.getBoundingClientRect());
    const skyR = sky.getBoundingClientRect();
    const mid = skyR.top + skyR.height / 2;
    const fh0 = num("--fh");
    const pan = num("--pan");
    const ground = num("--ground");
    const n = nos.length ? Math.max(...nos) : 0;
    const under = floors.filter((f, k) => rects[k].top <= mid && rects[k].bottom > mid);
    /* The identity the window must not break: a storey painted through a sliding
       window sits at the world height its own number asks for. --i is window-local,
       --drop moves the whole slice, and together they have to cancel back out to
       (no - 1) * fh. Checked for all 48 storeys, not just the one at the midline:
       which storey straddles the midline flips on a 2px round, the world height
       of every storey does not. */
    const worldBottom = (r) => pan + (skyR.bottom - ground) - r.bottom;
    const drift = floors.map((f, k) => Math.abs(worldBottom(rects[k]) - (+f.dataset.no - 1) * fh0));
    let maxGap = 0;
    for (let k = 1; k < rects.length; k++) {
      maxGap = Math.max(maxGap, Math.abs(rects[k - 1].top - rects[k].bottom));
    }
    return {
      label,
      at: Math.round(sc.scrollTop),
      depth: nos.length,
      first: nos.length ? nos[0] : null,
      last: nos.length ? nos[nos.length - 1] : null,
      ascending: nos.every((v, i) => i === 0 || v === nos[i - 1] + 1),
      numbered: floors.every((f, k) => +(f.style.getPropertyValue("--i") || 0) === k),
      dropIsBase: Math.abs(num("--drop") - (nos.length ? nos[0] - 1 : 0) * fh0) < 0.5,
      maxGapPx: Math.round(maxGap),
      maxDriftPx: Math.round(Math.max(...drift, 0) * 10) / 10,
      atCentre: under.length ? +under[0].dataset.no : null,
      want: Math.max(1, Math.min(Math.floor((skyR.height / 2 + pan - ground) / fh0) + 1, n)),
      inFrame: floors.filter((f, k) => rects[k].bottom > skyR.top && rects[k].top < skyR.bottom).length,
    };
  };

  const max = sc.scrollHeight - sc.clientHeight;
  const legs = [0.35, 0.9, 0.25, 1.0, 0.4];
  const seen = [];
  for (const s of legs) {
    sc.scrollTop = Math.round(max * s);
    await sleep(520);
    seen.push(snap(String(s)));
  }

  const bad = seen.filter(
    (r) =>
      !r.ascending || !r.numbered || !r.dropIsBase || r.maxGapPx > 1 || r.maxDriftPx > 1.5 ||
      r.depth < 8 || r.inFrame < 8
  );

  return {
    v: "roundtrip",
    max: Math.round(max),
    legs: seen,
    bases: seen.map((r) => r.first),
    wentUpThenDown: seen[1].first > seen[0].first && seen[2].first < seen[1].first && seen[3].first > seen[2].first,
    failures: bad.map((r) => `${r.label} at=${r.at} asc=${r.ascending} num=${r.numbered} base=${r.dropIsBase} gap=${r.maxGapPx} drift=${r.maxDriftPx} centre=${r.atCentre}/${r.want}`),
    ok: bad.length === 0,
  };
})()
