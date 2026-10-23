// Quality presets (settings.js) and the frame measurements behind Auto and the numbers in docs/look.md.
//
// A preset only sets the individual display settings (each stays in the panel and can be changed after, which
// makes the quality Custom): the sun's shadow map size per cascade and how far the cascades reach, the tree
// detail distance and the understory's density, the mirror pass and its resolution, the anti-aliasing (MSAA
// samples, or FXAA in the grade), the god rays and the render scale. Ultra is the game as it was before the
// presets (2048 maps reaching 300 m, MSAA 4x, the mirror at a quarter size), so it looks exactly as it did.
// Every preset keeps the shadows on, so moving between them never recompiles a material.
//
// Auto measures, once (the first run, or when Auto is picked again): a few frames of the scene behind the title
// card at High, then Ultra if High had room or Medium (and Low) if it did not, and keeps the best that fits the
// budget. A frame is timed as the wall time of frames drawn back to back with a one-pixel read at each end, so
// it is whichever of the CPU and the GPU is slower, the way the frame rate sees it. (The GPU timer queries of
// EXT_disjoint_timer_query_webgl2 read two to three times high per pass on ANGLE over Metal, with gaps between
// passes counted as GPU time, so they are not used for the decision; profile() still reports them.)

export const PRESETS = {
  low: { shadows: '1024', shadowReach: 120, lod: 0.5, vegDensity: 0.5, reflections: false, reflectionScale: 0.15, antialias: 'fxaa', godRays: false, renderScale: 0.75 },
  medium: { shadows: '2048', shadowReach: 180, lod: 0.75, vegDensity: 0.75, reflections: true, reflectionScale: 0.2, antialias: 'fxaa', godRays: true, renderScale: 0.9 },
  high: { shadows: '2048', shadowReach: 240, lod: 1, vegDensity: 1, reflections: true, reflectionScale: 0.25, antialias: '2', godRays: true, renderScale: 1 },
  ultra: { shadows: '2048', shadowReach: 300, lod: 1, vegDensity: 1, reflections: true, reflectionScale: 0.25, antialias: '4', godRays: true, renderScale: 1 },
};
export const PRESET_NAMES = { low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra' };
export const PRESET_KEYS = new Set(Object.keys(PRESETS.ultra));
// the frame Auto allows itself (ms, the draw alone): 60 fps leaves 16.7, less the simulation, the HUD, the
// compositor and the heavier spots (the sun in view over open water, tiles streaming in)
export const AUTO_BUDGET = 11;

// targets: settings.attach's ({ renderer, scene, water, post, chase, player })
function drawOnce(t) {
  const { renderer, water, post, player, scene } = t;
  renderer.info.reset();
  water.renderReflection(renderer, scene, t.chase.camera, player.level || player.world.levelAt(player.x, player.z));
  post.render();
}
const _px = new Uint8Array(4);
function sync(renderer) { const gl = renderer.getContext(); renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); }

// Wall milliseconds per frame over `frames` frames drawn back to back (after `warm` unmeasured ones), the
// simulation not stepped. Synchronous: the animation loop cannot run in between.
export function frameCost(t, { frames = 16, warm = 3 } = {}) {
  for (let i = 0; i < warm; i++) drawOnce(t);
  sync(t.renderer);
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) drawOnce(t);
  sync(t.renderer);
  return (performance.now() - t0) / frames;
}

// Auto: the best preset whose frame fits the budget, trying High first. settings: the Settings (applyPreset).
// Returns { pick, ms: { preset: ms } }.
export function benchmark(settings, t, budget = AUTO_BUDGET) {
  const ms = {};
  const cost = (name) => { settings.applyPreset(name); return (ms[name] = +frameCost(t).toFixed(2)); };
  let pick;
  if (cost('high') <= budget) pick = cost('ultra') <= budget ? 'ultra' : 'high';
  else if (cost('medium') <= budget) pick = 'medium';
  else pick = 'low';
  return { pick, ms };
}

// ---------- profiling (dev) ------------------------------------------------------------------------------------
// GPU time per pass via EXT_disjoint_timer_query_webgl2, CPU time, draw calls and triangles, for `frames` frames of
// the running game drawn the way main.js draws them. From the console:
//   const Q = await import('/src/quality.js'); await Q.profile(__game, { frames: 30 })
// The CPU, call and triangle counts are exact; the GPU times are inflated on ANGLE over Metal (see above): compare
// them only with each other, and time the frame with frameCost.
export function gpuTimer(gl) {
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  let current = null;
  const done = [];
  return {
    ok: !!ext,
    mark(label) {
      if (!ext) return;
      if (current) { gl.endQuery(ext.TIME_ELAPSED_EXT); done.push(current); current = null; }
      if (label) { const q = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, q); current = { label, q }; }
    },
    // resolves to [{ label, ms }] for every query ended so far
    async collect() {
      if (!ext) return [];
      const out = [];
      for (let tries = 0; tries < 200 && done.length; tries++) {
        while (done.length && gl.getQueryParameter(done[0].q, gl.QUERY_RESULT_AVAILABLE)) {
          const d = done.shift();
          const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
          const ns = gl.getQueryParameter(d.q, gl.QUERY_RESULT);
          gl.deleteQuery(d.q);
          out.push({ label: d.label, ms: disjoint ? NaN : ns / 1e6 });
        }
        if (done.length) await new Promise((r) => setTimeout(r, 4));
      }
      return out;
    },
  };
}

const quantile = (a, q) => { const s = a.filter((x) => x === x).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : NaN; };
const median = (a) => quantile(a, 0.5);

// game: window.__game. Hold the animation loop while it runs, or the loop's own frames land in the queries.
export async function profile(game, { frames = 30, dt = 1 / 60, simulate = true, q = 0.2 } = {}) {
  const { renderer, water, post, player, world, scene, camera } = game;
  const T = gpuTimer(renderer.getContext());
  const info = renderer.info.render;
  const seg = new Map();
  let curLabel = null, curT = 0, curCalls = 0, curTris = 0;
  const rec = (label) => {
    const now = performance.now();
    if (curLabel) {
      let s = seg.get(curLabel); if (!s) { s = { cpu: [], calls: [], tris: [], _cpu: 0, _calls: 0, _tris: 0 }; seg.set(curLabel, s); }
      s._cpu += now - curT; s._calls += info.calls - curCalls; s._tris += info.triangles - curTris;
    }
    curLabel = label; curT = now; curCalls = info.calls; curTris = info.triangles;
    T.mark(label);
  };
  const flush = () => { for (const s of seg.values()) { s.cpu.push(s._cpu); s.calls.push(s._calls); s.tris.push(s._tris); s._cpu = 0; s._calls = 0; s._tris = 0; } };
  const sm = renderer.shadowMap, smRender = sm.render;
  sm.render = function (...a) { const was = curLabel; rec('shadow'); const r = smRender.apply(this, a); rec(was || 'main'); return r; };
  const passes = post.composer.passes, saved = passes.map((p) => p.render), names = ['main', 'rays', 'grade'];
  passes.forEach((p, i) => { const f = p.render; p.render = function (...a) { rec(names[i] || `pass${i}`); return f.apply(this, a); }; });
  const sim = [], total = [], gpuFrames = [];
  try {
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      if (simulate) game.advance(dt, 1);
      const t1 = performance.now();
      sim.push(t1 - t0);
      renderer.info.reset();
      rec('reflection');
      water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z));
      post.render();
      rec(null);
      total.push(performance.now() - t1);
      flush();
      const per = {};
      for (const r of await T.collect()) per[r.label] = (per[r.label] || 0) + r.ms;
      gpuFrames.push(per);
    }
  } finally {
    sm.render = smRender;
    passes.forEach((p, i) => { p.render = saved[i]; });
  }
  const out = { frames, size: [renderer.domElement.width, renderer.domElement.height], sim: +median(sim).toFixed(2), cpuDraw: +median(total).toFixed(2), passes: {} };
  let gpu = 0;
  for (const [label, s] of seg) {
    const g = quantile(gpuFrames.map((f) => f[label] || 0), q);
    gpu += g;
    out.passes[label] = { gpu: +g.toFixed(2), cpu: +median(s.cpu).toFixed(2), calls: median(s.calls), tris: median(s.tris) };
  }
  const frameGpu = gpuFrames.map((f) => Object.values(f).reduce((a, b) => a + b, 0));
  out.gpu = +gpu.toFixed(2); out.gpuMedian = +median(frameGpu).toFixed(2); out.gpuMin = +quantile(frameGpu, 0).toFixed(2);
  out.calls = Object.values(out.passes).reduce((a, p) => a + p.calls, 0);
  out.tris = Object.values(out.passes).reduce((a, p) => a + p.tris, 0);
  return out;
}
