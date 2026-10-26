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
// card at a preset that suits the machine (deviceClass: High on a discrete GPU, Medium on an integrated one, Low on a
// small one), then the one above or below, and keeps the best that fits the budget; then it watches the frame rate
// in play and steps down if the game runs slow (AutoWatch, round A-C). A frame is timed as the wall time of frames drawn back to back with a one-pixel read at each end, so
// it is whichever of the CPU and the GPU is slower, the way the frame rate sees it. (The GPU timer queries of
// EXT_disjoint_timer_query_webgl2 read two to three times high per pass on ANGLE over Metal, with gaps between
// passes counted as GPU time, so they are not used for the decision; profile() still reports them.)

import * as THREE from 'three';
import { cascadeHooks } from './sunlight.js';
import { REFLECT_LAYER, REFLECT_SHORE_LAYER } from './water.js';

export const PRESETS = {
  low: { shadows: '1024', shadowReach: 80, lod: 0.5, vegDensity: 0.5, reflections: false, reflectionScale: 0.15, antialias: 'fxaa', godRays: false, renderScale: 0.75 },
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

// round A-C: what the browser says the machine is, for where Auto starts. The GPU's name (WEBGL_debug_renderer_info,
// unmasked in Chrome and Edge; Safari and Firefox may say only "Apple GPU" or a generic name), the cores and the
// memory. 'low': the small integrated GPUs (Intel HD and UHD, the phone GPUs, a software renderer) or a CPU of two
// cores or 2 GB; 'mid': the other integrated GPUs (Intel Iris, AMD's Radeon Graphics in an APU, Apple's base chips)
// or four cores or 4 GB; 'high': everything else (discrete NVIDIA and AMD, Apple's Pro and Max chips).
export const LOW_GPU = /SwiftShader|llvmpipe|Basic Render|Mali|Adreno|PowerVR|\bHD Graphics|UHD Graphics/i;
export const MID_GPU = /Iris|Intel|Radeon\(TM\) Graphics|Radeon Graphics|Radeon Vega|Vega \d|Apple M[1-4](?! (Pro|Max|Ultra))\b|Apple GPU/i;
export function deviceClass(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) || '');
  } catch { /* no name: judged by the benchmark alone */ }
  const cores = navigator.hardwareConcurrency || 4, memory = navigator.deviceMemory || 8;
  let tier = 'high';
  if (LOW_GPU.test(gpu) || cores <= 2 || memory <= 2) tier = 'low';
  else if (MID_GPU.test(gpu) || cores <= 4 || memory <= 4) tier = 'mid';
  return { gpu, cores, memory, tier };
}

// Auto: the best preset whose frame fits the budget. settings: the Settings (applyPreset). Where it starts follows
// deviceClass (round A-C): a 'high' machine tries High (then Ultra, or Medium and Low), a 'mid' one Medium (then
// High if Medium had a third of the budget to spare, else Low), a 'low' one Low alone. The tiles are brought to
// each preset's LOD before it is timed (the draw alone does not run their update). Returns { pick, ms, device }.
export function benchmark(settings, t, budget = AUTO_BUDGET) {
  const ms = {}, device = deviceClass(t.renderer), tiles = t.player && t.player.world && t.player.world.tiles;
  const cost = (name) => {
    settings.applyPreset(name);
    if (tiles) { const c = t.chase.camera.position; for (let i = 0; i < 3; i++) tiles.update(t.player.x, t.player.z, c); }
    return (ms[name] = +frameCost(t).toFixed(2));
  };
  let pick;
  if (device.tier === 'low') { cost('low'); pick = 'low'; }
  else if (device.tier === 'mid') {
    const m = cost('medium');
    if (m > budget) pick = 'low';
    else pick = m < budget * 0.67 && cost('high') <= budget ? 'high' : 'medium';
  } else if (cost('high') <= budget) pick = cost('ultra') <= budget ? 'ultra' : 'high';
  else if (cost('medium') <= budget) pick = 'medium';
  else pick = 'low';
  return { pick, ms, device };
}

// round A-C: Auto keeps watching. The benchmark times the quiet scene behind the title card; a camp in the woods
// or a storm on a big lake can cost more, and a laptop on battery runs slower than it did plugged in. While the
// quality is Auto and the game is up (not the title, not paused, the tab shown), the frame times are gathered over
// WATCH.window seconds of play; when the median frame is over WATCH.slow ms (under ~45 fps), Auto steps down one
// preset (Ultra, High, Medium, Low) and says so in the console; it never steps up by itself (Auto chosen again in
// the settings runs the benchmark afresh). A hitch (a tile coming in, a teleport) is one frame of many and moves
// the median not at all.
export const WATCH = { window: 8, slow: 22, after: 12 };
const ORDER = ['low', 'medium', 'high', 'ultra'];
export class AutoWatch {
  // live(): true while play is going on (main.js: the title away, the page shown)
  constructor(settings, live) { this.settings = settings; this.live = live; this.ms = []; this.acc = 0; this.wait = WATCH.after; this.steps = []; }
  frame(dt) {
    const s = this.settings;
    if (s.values.quality !== 'auto' || !this.live() || !(dt > 0)) { this.ms.length = 0; this.acc = 0; return; }
    if (this.wait > 0) { this.wait -= dt; return; } // settling after a start, a preset or a step down
    this.ms.push(dt * 1000); this.acc += dt;
    if (this.acc < WATCH.window) return;
    const sorted = this.ms.slice().sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    this.ms.length = 0; this.acc = 0;
    const at = ORDER.indexOf(s.values.autoPick || 'high');
    if (med <= WATCH.slow || at <= 0) return;
    const next = ORDER[at - 1];
    s.applyPreset(next);
    s.set('autoPick', next);
    for (const fn of s.listeners) fn('quality', s.values.quality); // the panel's Auto label names the pick
    this.steps.push({ from: ORDER[at], to: next, median: +med.toFixed(1) });
    this.wait = WATCH.after;
    console.log(`quality: Auto stepped down to ${PRESET_NAMES[next]} (median frame ${med.toFixed(1)} ms over ${WATCH.window} s)`);
  }
}

// ---------- the programs three's compile skips (round A-C) -----------------------------------------------------
// main.js compiles the scene behind the title card (renderer.compileAsync with the composer's target bound), but
// three's compile makes the main pass's programs only. These came later, each compiled in the frame it was first
// needed (a hitch of tens of milliseconds on a laptop, and the count crept from 64 fresh to 76 after four days):
//  - the shadow pass's depth programs. three draws the shadow map before it sets the frame's lights, so a depth
//    program carries whatever light state the scene's last render left: the mirror's (no lights: its camera does
//    not see layer 0), or with no mirror (Low, or 150 m inland) the last main pass's. The first walk inland
//    compiled every caster's depth program again. So two shadow passes are drawn here, one after a mirror pass and
//    one after a main pass, with one of every caster the tiles make (tiles.js shadowPrewarmGroup) and a stand-in
//    for every other kind in the scene (a box with the caster's material: the depth program follows its side, its
//    alpha test, its instancing and a custom depth material), shown only inside these two shadow passes;
//  - the mirror's variants (no lights, its own target) of everything that can be mirrored, the wildlife included;
//  - the grade with the other anti-aliasing (FXAA is a define) and the god rays' three passes (drawn only with the
//    sun in view and the rays on).
// t: { renderer, scene, camera, post, water, tiles, player, world }. Resolves to { programs, added, ms }.
export async function prewarmPasses(t) {
  const { renderer, scene, camera, post, water, tiles, player, world } = t;
  const n0 = renderer.info.programs.length, t0 = performance.now();
  const grp = tiles.shadowPrewarmGroup(), box = new THREE.BoxGeometry(0.01, 0.01, 0.01), keys = new Set();
  const inTile = (o) => { for (let p = o; p; p = p.parent) if (/^(tile|far) /.test(p.name)) return true; return false; };
  scene.traverse((o) => {
    if (!o.castShadow || !o.isMesh || o.isSkinnedMesh || inTile(o)) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const k = `${m.side}|${m.shadowSide}|${m.alphaTest > 0 && !!(m.map || m.alphaMap)}|${m.alphaToCoverage}|${o.isInstancedMesh ? 1 : 0}${o.instanceColor ? 1 : 0}|${o.customDepthMaterial ? o.customDepthMaterial.uuid : ''}`;
    if (keys.has(k)) return;
    keys.add(k);
    const s = o.isInstancedMesh ? new THREE.InstancedMesh(box, m, 1) : new THREE.Mesh(box, m);
    if (o.isInstancedMesh) { s.setMatrixAt(0, new THREE.Matrix4()); if (o.instanceColor) s.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(3).fill(1), 3); }
    if (o.customDepthMaterial) s.customDepthMaterial = o.customDepthMaterial;
    s.castShadow = true; s.frustumCulled = false;
    grp.add(s);
  });
  grp.position.copy(camera.position).addScaledVector(camera.getWorldDirection(new THREE.Vector3()), 8);
  grp.visible = false;
  scene.add(grp);
  let active = false;
  const show = () => { if (active) grp.visible = true; }; // inside these shadow passes only, never the main pass
  cascadeHooks.push(show);
  const stub = new THREE.PerspectiveCamera(), target = new THREE.WebGLRenderTarget(4, 4);
  stub.layers.set(REFLECT_LAYER); // sees the canoe alone and no light
  const fxaa = post.grade.fxaa;
  const pass = (lightless) => {
    if (lightless) {
      // a mirror pass, its reflections forced on (a start at Low has none, and compiled the mirror's programs on the
      // first change to Medium); inland, where there is no mirror to draw, a render that sees no light instead
      const on = water.reflectionsOn, f0 = renderer.info.render.frame;
      water.reflectionsOn = true;
      try { water.renderReflection(renderer, scene, camera, player.level || world.levelAt(player.x, player.z)); } finally { water.reflectionsOn = on; }
      if (renderer.info.render.frame === f0) { renderer.setRenderTarget(target); renderer.render(scene, stub); renderer.setRenderTarget(null); }
    }
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = true; grp.visible = false; active = true;
    try { post.render(); } finally { renderer.shadowMap.autoUpdate = auto; active = false; grp.visible = false; }
  };
  const later = () => new Promise((r) => setTimeout(r, 0)); // a task each, so the title card keeps breathing
  try {
    pass(true); await later();
    pass(false); await later();
    post.grade.fxaa = !fxaa; post.render();
    // the mirror's variants: one of each material and kind of mesh on the mirror's layers, compiled into its target
    // in its light state (a scene with the fog and no light)
    const mirrorScene = new THREE.Scene(), mirrorCam = new THREE.PerspectiveCamera(), seen = new Set(), reps = [];
    mirrorScene.fog = scene.fog;
    mirrorCam.layers.mask = (1 << REFLECT_LAYER) | (1 << REFLECT_SHORE_LAYER);
    scene.traverse((o) => {
      if (!o.material || !(o.layers.mask & mirrorCam.layers.mask)) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        const k = `${m.uuid}:${o.isInstancedMesh ? 1 : 0}${o.instanceColor ? 1 : 0}${o.isSkinnedMesh ? 1 : 0}`;
        if (!seen.has(k)) { seen.add(k); reps.push(o); }
      }
    });
    renderer.setRenderTarget(water.reflection.target);
    for (const o of reps) renderer.compile(o, mirrorCam, mirrorScene);
    // the god rays, through the pass's own full-screen triangle (a plane's normals would make another program)
    const R = post.rays, was = R.quad.material;
    for (const m of [R.mask, R.blur1, R.blur2]) { R.quad.material = m; renderer.setRenderTarget(R.a); renderer.compile(R.quad._mesh, camera); }
    R.quad.material = was;
  } catch (e) { console.warn('quality: the prewarm failed', e); }
  finally {
    renderer.setRenderTarget(null);
    post.grade.fxaa = fxaa;
    cascadeHooks.splice(cascadeHooks.indexOf(show), 1);
    scene.remove(grp); grp.dispose(); box.dispose(); target.dispose();
  }
  return { programs: renderer.info.programs.length, added: renderer.info.programs.length - n0, ms: Math.round(performance.now() - t0) };
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
