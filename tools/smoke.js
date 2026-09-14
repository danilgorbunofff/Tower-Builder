(() => {
  const sky = document.querySelector('.sky');
  const far = sky.querySelector('svg.far');
  const worlds = [...far.querySelectorAll('.planets > g')];
  const cols = [...sky.querySelectorAll('.tower')].map(t => t.id);
  return {
    errs: (window.__errs || []).slice(0, 4),
    sky: sky.getBoundingClientRect().width + 'x' + sky.getBoundingClientRect().height,
    worlds: worlds.length,
    tt: worlds.map(w => w.getAttribute('transform')),
    stars: far.querySelectorAll('.stars rect').length,
    towerW: (document.querySelector('.tower') || {}).getBoundingClientRect ? document.querySelector('.tower').getBoundingClientRect().width : null
  };
})()