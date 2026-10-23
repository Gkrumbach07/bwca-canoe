// The audio kit: noise, rooms, envelopes, the seasons of the singers, and the one-shot Voice every sound in
// audio-voices.js is built from. Everything is synthesized; nothing here knows about the world.
import { mulberry32 } from './rng.js';

export const TAU = Math.PI * 2;
export const TINY = 0.0001;
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// 0 outside [a, b], 1 at m
export const bump = (v, a, m, b) => smooth(a, m, v) * (1 - smooth(m, b, v));

// Who sings when, by day of the year (Ely dates): the white-throated sparrow and the hermit thrush from mid-May
// to late July, spring peepers loud in May and a few stragglers into August, green frogs through high summer,
// crickets from late July into early October.
export const songSeason = (d) => smooth(125, 140, d) * (1 - smooth(205, 228, d));
export const peeperSeason = (d) => Math.max(smooth(112, 124, d) * (1 - smooth(160, 185, d)), 0.22 * smooth(150, 165, d) * (1 - smooth(215, 240, d)));
export const greenFrogSeason = (d) => smooth(150, 165, d) * (1 - smooth(222, 242, d));
export const cricketSeason = (d) => smooth(198, 212, d) * (1 - smooth(262, 285, d));

// Looping noise, normalised to `rms`. White, pink (Kellet's filter) or brown (a leaky integrator); the channels
// are independent, and the tail is folded over the head so the loop has no seam.
export function noiseBuffer(ctx, kind, seconds, channels, seed, rms = 0.25) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), fade = Math.floor(sr * 0.08);
  const buf = ctx.createBuffer(channels, n, sr), rng = mulberry32(seed), tmp = new Float32Array(n + fade);
  for (let c = 0; c < channels; c++) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = rng() * 2 - 1;
      if (kind === 'white') tmp[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        tmp[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else { br = (br + w * 0.02) * 0.996; tmp[i] = br; }
    }
    const d = buf.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = tmp[i];
    for (let i = 0; i < fade; i++) { const k = i / fade; d[i] = tmp[i] * k + tmp[n + i] * (1 - k); }
    let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i];
    const g = rms / Math.sqrt(s / n || 1);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

// A room for the convolver: noise decaying to -60 dB at `decay` seconds, darkening as it goes (one-pole lowpass
// whose coefficient falls from `bright` at `darken` per second: air, water and leaves take the highs first), plus
// early reflections [[seconds, gain], ...]. Unit energy per channel, so the send level is the wet level.
export function roomBuffer(ctx, { seconds, decay, bright, darken, early = [], pre = 0.006, seed = 1 }) {
  const sr = ctx.sampleRate, n = Math.floor(sr * seconds), buf = ctx.createBuffer(2, n, sr), rng = mulberry32(seed);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = Math.floor(pre * sr); i < n; i++) {
      const t = i / sr, a = Math.max(0.004, bright * Math.exp(-t * darken));
      lp += (rng() * 2 - 1 - lp) * a;
      d[i] = lp * Math.exp((-t * 6.9) / decay) * Math.sqrt((2 - a) / a); // the one-pole loses level as it darkens: put it back
    }
    for (const [t, g] of early) { const i = Math.floor((t + (c ? 0.0037 : 0)) * sr); if (i < n) d[i] += g * (rng() < 0.5 ? -1 : 1) * (c ? 0.85 : 1); }
    let s = 0; for (let i = 0; i < n; i++) s += d[i] * d[i];
    const g = 1 / Math.sqrt(s || 1);
    for (let i = 0; i < n; i++) d[i] *= g;
  }
  return buf;
}

export function shaperCurve(fn, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = fn((i / (n - 1)) * 2 - 1);
  return c;
}

// A pluck-shaped envelope on a fresh gain: up to `peak` in `a` seconds, held, then an exponential fall. Returns
// the time it ends.
export function env(p, t, a, peak, hold, rel) {
  p.setValueAtTime(TINY, t);
  p.exponentialRampToValueAtTime(Math.max(TINY * 2, peak), t + a);
  if (hold > 0) p.setValueAtTime(Math.max(TINY * 2, peak), t + a + hold);
  p.exponentialRampToValueAtTime(TINY, t + a + hold + rel);
  return t + a + hold + rel;
}

// A soft bump on a gain that lives on (a bed's slap, a peep): approach `peak`, then fall back to 0. Built from
// setTargetAtTime only, so bumps that overlap simply merge.
export function swell(p, t, peak, a, hold, rel) {
  p.setTargetAtTime(peak, t, Math.max(0.001, a / 3));
  p.setTargetAtTime(0, t + a + hold, Math.max(0.001, rel / 3));
}

// A crunch: n grains spread over `span` seconds, each a click of `peak` falling away in `dec`
export function grains(p, t, n, span, peak, dec, rand) {
  const ts = [];
  for (let i = 0; i < n; i++) ts.push(t + rand() * span);
  ts.sort((a, b) => a - b);
  let last = -1;
  for (const s0 of ts) {
    const s = Math.max(s0, last + 0.007);
    p.setTargetAtTime(peak * (0.45 + rand() * 0.55), s, 0.0012);
    p.setTargetAtTime(0, s + 0.004, Math.max(0.002, dec / 3));
    last = s;
  }
  return last + dec;
}

export function setPos(n, x, y, z) {
  if (n.positionX) { n.positionX.value = x; n.positionY.value = y; n.positionZ.value = z; } else n.setPosition(x, y, z);
}

// One one-shot. Its chain: input -> (air: a lowpass by distance) -> panner (relative to the listener, which sits at
// the origin facing the camera's way) -> the dry bus, with sends to the reverb and the lake echo. A head-locked
// voice (no position) goes to the engine's local bus instead. Noise comes from taps on the engine's running noise
// sources, so a footstep is a filter and a gain, not a buffer source. The engine frees it once `end` has passed.
export class Voice {
  constructor(au, o) {
    const ctx = au.ctx;
    this.au = au; this.ctx = ctx; this.nodes = []; this.taps = []; this.panner = null; this.pos = null;
    this.t = ctx.currentTime + 0.012 + (o.at || 0);
    this.end = this.t + 0.3;
    this.input = this.gain(o.gain ?? 1);
    let out = this.input;
    if (o.x === undefined || o.local) { out.connect(au.local); this.dist = 0; }
    else {
      this.pos = { x: o.x, y: o.y ?? au.L.y, z: o.z };
      const d = this.dist = au.distTo(this.pos);
      if (o.air !== false && d > 20) { const f = this.filter('lowpass', Math.max(900, 16000 / (1 + d / 120)), 0.5); out.connect(f); out = f; }
      const p = this.panner = ctx.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse';
      p.refDistance = o.ref ?? 10; p.rolloffFactor = o.roll ?? 1; p.maxDistance = 20000;
      this.nodes.push(p);
      au.place(p, this.pos);
      out.connect(p); out = p;
      out.connect(au.dry);
    }
    if (o.wet > 0) { const s = this.gain(o.wet); out.connect(s); s.connect(au.reverbIn); }
    if (o.echo > 0.01) { const e = this.gain(o.echo); out.connect(e); e.connect(au.echoIn); }
  }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; this.nodes.push(g); return g; }
  filter(type, f, Q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; this.nodes.push(b); return b; }
  osc(type, f, t0 = this.t, t1 = t0 + 1) {
    const o = this.ctx.createOscillator();
    if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
    o.frequency.value = f; o.start(t0); o.stop(t1);
    this.nodes.push(o); this.until(t1);
    return o;
  }
  // a tap on one of the engine's running noises ('white', 'pink', 'brown') into `node`
  noise(kind, node) { const s = this.au.src[kind]; s.connect(node); this.taps.push([s, node]); return node; }
  // a -> b -> ... -> the voice's input
  chain(...ns) { for (let i = 0; i < ns.length - 1; i++) ns[i].connect(ns[i + 1]); ns[ns.length - 1].connect(this.input); return ns[0]; }
  until(t) { if (t > this.end) this.end = t; return this; }
  free() {
    for (const [s, n] of this.taps) { try { s.disconnect(n); } catch { /* already gone */ } }
    for (const n of this.nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    this.nodes.length = 0; this.taps.length = 0;
  }
}
