/* Park the camera at ?alt=<fraction of the climb> so a screenshot lands on a
   chosen rung of the junk ladder, then let two frames settle before the shot. */
(async () => {
  const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const frac = parseFloat(new URLSearchParams(location.search).get('alt') || '0');
  const sc = document.getElementById('scroller');
  const max = Math.max(0, sc.scrollHeight - sc.clientHeight);
  sc.scrollTop = Math.round(max * frac);
  await raf(); await raf();
  return 'alt=' + frac + ' scrollTop=' + sc.scrollTop + ' of ' + max;
})()
