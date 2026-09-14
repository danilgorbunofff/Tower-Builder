/* Cold load, nobody has scrolled: does the window land where the camera already is?
   Reads the DOM in document order, not sorted by number — a window built from the
   wrong end holds the right storeys upside down, which a sort hides. */
(() => {
  const num = (k) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(k)) || 0;
  const sc = document.querySelector(".scroller");
  const sky = document.querySelector(".sky");
  const stack = document.querySelector(".stack");
  const floors = [...document.querySelectorAll(".floor")];
  const nos = floors.map((f) => +f.dataset.no);
  const skyR = sky.getBoundingClientRect();
  const inFrame = floors.filter((f) => {
    const r = f.getBoundingClientRect();
    return r.bottom > skyR.top && r.top < skyR.bottom;
  });
  const mid = skyR.top + skyR.height / 2;
  const under = floors.filter((f) => {
    const r = f.getBoundingClientRect();
    return r.top <= mid && r.bottom > mid;
  });
  const fh = ((parseFloat(getComputedStyle(stack).height) || 0) + 0) || null;
  const fh0 = num("--fh");
  const pan = num("--pan");
  const ground = num("--ground");
  const n = floors.length ? Math.max(...nos) : 0;
  const centred = Math.max(1, Math.min(Math.floor((skyR.height / 2 + pan - ground) / fh0) + 1, n));
  return {
    v: "fresh",
    scrollTop: Math.round(sc.scrollTop),
    scrollMax: Math.round(sc.scrollHeight - sc.clientHeight),
    atCeiling: Math.abs(sc.scrollTop - (sc.scrollHeight - sc.clientHeight)) < 2,
    pan: Math.round(pan),
    panU: Math.round(num("--pan-u")),
    fh0,
    depth: floors.length,
    first: nos.length ? nos[0] : null,
    last: nos.length ? nos[nos.length - 1] : null,
    ascending: nos.every((v, i) => i === 0 || v === nos[i - 1] + 1),
    drop: num("--drop"),
    dropIsBase: Math.abs(num("--drop") - (nos.length ? nos[0] - 1 : 0) * fh0) < 0.5,
    inFrame: inFrame.length,
    storeyAtCentre: under.length ? +under[0].dataset.no : null,
    storeyTheModelWants: centred,
    towerVisible: inFrame.length >= 8 && !!under.length && +under[0].dataset.no === centred,
    diag: { fh },
  };
})()
