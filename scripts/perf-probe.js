// The performance probe (docs/performance.md, the forest's pools): in the dev server, symlink this file into public/ and
// `await import('/perf-probe.js')` in the page, then PROBE.setup(), await PROBE.go('forest'), PROBE.tally(), PROBE.cost().
window.PROBE = (() => {
  const G = window.__game, R = G.renderer, STEP = 1 / 60;
  let L = null, Q = null;
  const SPOTS = {
    forest: { name: 'Forest interior', mode: 'walk', x: -19015, z: 16129, heading: 0.6, canoe: [0, -14] },
    lake: { name: 'Open lake', mode: 'paddle', x: -19665, z: 18089, heading: 3.84 },
    lodge: { name: 'Lodge point', mode: 'walk', x: -19597.3, z: 16777.0, heading: Math.PI / 2 },
    portage: { name: 'Portage end', mode: 'paddle', x: -20195, z: 17605, heading: 2.946 },
  };
  async function setup(w = 1366, h = 768) {
    L = L || await import('/src/lookboard.js');
    Q = Q || await import('/src/quality.js');
    R.setAnimationLoop(null);
    if (G.saver) G.saver.enabled = false;
    await L.openGame(G);
    R.setPixelRatio(1); R.setSize(w, h, false); G.post.resize(w, h);
    G.camera.aspect = w / h; G.camera.updateProjectionMatrix();
    G.day.running = false;
    return 'ok';
  }
  async function go(key, { doy = 196, hours = 12, settle = 90 } = {}) {
    const s = SPOTS[key] || key;
    L.place(G, s);
    await L.streamIn(G, s, (n) => G.step(STEP, n));
    G.day.setClock(2026, doy, hours);
    if (G.weather) { G.weather.set('clear'); G.weather._strikeIn = 1e9; }
    G.wind.override = 2; G.wind.speed = 2;
    L.place(G, s); G.chase.setMode('third'); G.chase.snap();
    for (let i = 0; i < settle; i += 30) { G.step(STEP, 30); await new Promise((r) => setTimeout(r, 0)); }
    return key;
  }
  function kind(o) {
    const u = o.userData || {};
    if (u.proxyOf) return u.proxyOf.userData.lod && u.proxyOf.userData.sp !== undefined ? 'veg-proxy' : (u.proxyOf.userData.cullSp !== undefined ? 'veg-proxy(group)' : 'proxy-other');
    if (u.sp !== undefined && u.lod) return 'veg-bin';
    if (u.cullSp !== undefined) return 'veg-group';
    if (o.isBatchedMesh) return 'veg-batch';
    if (u.vegBatch) return 'veg-batch';
    if (o.isInstancedMesh) return 'instanced-other';
    return 'mesh';
  }
  function tally() {
    const orig = R.renderBufferDirect, t = {};
    R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
      const pass = scene === null ? 'shadow' : camera === G.camera ? 'view' : (camera.layers.mask & 1) ? 'other' : 'mirror';
      const k = pass + ' ' + kind(object);
      t[k] = (t[k] || 0) + 1;
      return orig.apply(this, arguments);
    };
    try { G.step(STEP, 1); } finally { R.renderBufferDirect = orig; }
    const tot = Object.values(t).reduce((a, b) => a + b, 0);
    return { total: tot, calls: R.info.render.calls, tris: (R.info.render.triangles / 1e6).toFixed(2) + 'M', by: Object.fromEntries(Object.entries(t).sort((a, b) => b[1] - a[1])) };
  }
  // CPU time of the draw alone (submit, no GPU wait) and the whole frame (GPU synced), ms, best of rounds
  function cost({ frames = 20, rounds = 4 } = {}) {
    const t = { renderer: R, water: G.water, post: G.post, player: G.player, scene: G.scene, chase: G.chase };
    let best = Infinity, sim = Infinity;
    for (let r = 0; r < rounds; r++) {
      best = Math.min(best, Q.frameCost(t, { frames }));
      const t0 = performance.now(); if (G.advance) G.advance(STEP, 10); sim = Math.min(sim, (performance.now() - t0) / 10);
    }
    return { frame: +best.toFixed(2), sim: G.advance ? +sim.toFixed(2) : null };
  }
  return { setup, go, tally, cost, SPOTS };
})();
'probe ready';
