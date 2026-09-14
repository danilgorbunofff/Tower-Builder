/* Does the info panel ever reach the tower? The roofline parks in the same top
   strip as the sign once the tower is tall, so the sign is capped at the sky
   left over beside it. Measures the rendered gap at any count / viewport. */
(function(){
  var s = document.querySelector('.sign');
  var r = document.getElementById('roof');
  if (!s || !r) { return 'MISSING .sign or #roof'; }
  var cs = getComputedStyle(s);
  var sb = s.getBoundingClientRect();
  var rb = r.getBoundingClientRect();
  function r4(n){ return Math.round(n * 10) / 10; }
  var out = {
    vw: innerWidth, vh: innerHeight,
    sign:  [r4(sb.left), r4(sb.top), r4(sb.width), r4(sb.height)],
    roof:  [r4(rb.left), r4(rb.top), r4(rb.width), r4(rb.height)],
    gapPx: r4(rb.left - (sb.left + sb.width)),
    fit:   cs.getPropertyValue('--sign-fit').trim(),
    s:     cs.getPropertyValue('--sign-s').trim(),
    bw:    cs.getPropertyValue('--bw').trim()
  };
  return JSON.stringify(out);
})()
