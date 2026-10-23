// The one-shots: every call, footfall, stroke and splash the soundscape plays, each built on audio-kit.js's Voice
// from oscillators and taps on the engine's running noise. Each takes the engine (`au`) and a world position
// ({ x, y, z }, or null for a head-locked sound) and returns its Voice, or null when the mix is full.
import { TINY, smooth, env, grains } from './audio-kit.js';

// noise through a filter into a fresh gain: [gain, filter]
function nz(v, kind, type, f, Q = 0.7) { const b = v.filter(type, f, Q), g = v.gain(0); v.noise(kind, b); b.connect(g); g.connect(v.input); return [g, b]; }
// an oscillator into a fresh gain: [osc, gain]
function tone(v, type, f, t0, t1) { const o = v.osc(type, f, t0, t1), g = v.gain(0); o.connect(g); g.connect(v.input); return [o, g]; }
// far sounds are mostly room and echo
function sends(au, pos, wet, echo) { const d = au.distTo(pos); return { wet: wet + 0.25 * smooth(60, 900, d), echo: echo * au.S.open * smooth(40, 400, d) }; }
const where = (pos) => pos || {};

// ---- loons -----------------------------------------------------------------------------------------------
// The common loon's four calls on one harmonic voice: the wail (a long rising "ahh-OOO", sometimes a third note),
// the tremolo (the laughing call, a fast warble between two pitches), the male's yodel (a rising intro, then
// repeated two-note phrases), and the soft hoot between mates.
export function loon(au, kind, pos, size = 1) {
  const hoot = kind === 'hoot', s = sends(au, pos, 0.2, 0.6);
  const v = au.voice({ ...pos, gain: (hoot ? 0.16 : 0.5) * size, ref: hoot ? 15 : 45, wet: s.wet, echo: hoot ? 0 : s.echo, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.93 + R() * 0.14;
  const o = v.osc(au.waves.loon, 800 * k, t, t + 7), g = v.gain(0), lp = v.filter('lowpass', 2800, 0.5);
  const vib = v.osc('sine', 4.5 + R() * 1.5, t, t + 7), vd = v.gain(7 * k); vib.connect(vd); vd.connect(o.frequency);
  v.chain(o, g, lp);
  const F = o.frequency, A = g.gain;
  let end;
  if (kind === 'tremolo') {
    const dur = 1.2 + R() * 0.9, rate = 8.5 + R() * 1.5, n = Math.floor(dur * rate), f1 = 1000 * k, f2 = 1230 * k;
    F.setValueAtTime(f1, t); A.setValueAtTime(TINY, t); A.exponentialRampToValueAtTime(0.3, t + 0.06);
    for (let i = 0; i < n; i++) {
      const s0 = t + i / rate, up = 1 + i * 0.004, e = Math.min(1, (i + 1) / 3, (n - i) / 3);
      F.linearRampToValueAtTime(f1 * up, s0 + 0.3 / rate); F.linearRampToValueAtTime(f2 * up, s0 + 0.7 / rate);
      A.linearRampToValueAtTime(0.3 * e + 0.05, s0 + 0.3 / rate); A.linearRampToValueAtTime(0.85 * e + 0.05, s0 + 0.7 / rate);
    }
    end = t + n / rate; A.exponentialRampToValueAtTime(TINY, end + 0.15); end += 0.15;
  } else if (kind === 'yodel') {
    F.setValueAtTime(700 * k, t); F.linearRampToValueAtTime(1020 * k, t + 0.7); F.linearRampToValueAtTime(1040 * k, t + 1.2);
    A.setValueAtTime(TINY, t); A.exponentialRampToValueAtTime(0.7, t + 0.4); A.linearRampToValueAtTime(0.8, t + 1.2);
    let s0 = t + 1.25;
    for (let i = 0, n = 3 + Math.floor(R() * 3); i < n; i++, s0 += 0.62) {
      F.linearRampToValueAtTime(1380 * k, s0 + 0.1); F.linearRampToValueAtTime(1360 * k, s0 + 0.3); F.linearRampToValueAtTime(1060 * k, s0 + 0.42); F.linearRampToValueAtTime(1050 * k, s0 + 0.58);
      A.linearRampToValueAtTime(0.55, s0 + 0.03); A.linearRampToValueAtTime(0.95, s0 + 0.14); A.linearRampToValueAtTime(0.8, s0 + 0.4); A.linearRampToValueAtTime(0.7, s0 + 0.58);
    }
    end = s0; A.exponentialRampToValueAtTime(TINY, end + 0.4); end += 0.4;
  } else if (hoot) {
    F.setValueAtTime(560 * k, t); F.linearRampToValueAtTime(500 * k, t + 0.28);
    end = env(A, t, 0.05, 0.8, 0.1, 0.16);
  } else {
    F.setValueAtTime(620 * k, t); F.linearRampToValueAtTime(800 * k, t + 0.3); F.linearRampToValueAtTime(840 * k, t + 1.0);
    F.linearRampToValueAtTime(1180 * k, t + 1.22); F.linearRampToValueAtTime(1120 * k, t + 2.35);
    A.setValueAtTime(TINY, t); A.exponentialRampToValueAtTime(0.6, t + 0.35); A.linearRampToValueAtTime(0.75, t + 1.0);
    A.linearRampToValueAtTime(0.5, t + 1.14); A.linearRampToValueAtTime(0.85, t + 1.4); A.linearRampToValueAtTime(0.7, t + 2.35);
    end = t + 2.35;
    if (R() < 0.35) { F.linearRampToValueAtTime(1000 * k, t + 2.55); F.linearRampToValueAtTime(980 * k, t + 3.5); A.linearRampToValueAtTime(0.5, t + 2.5); A.linearRampToValueAtTime(0.75, t + 2.7); A.linearRampToValueAtTime(0.6, t + 3.5); end = t + 3.5; }
    F.linearRampToValueAtTime(900 * k, end + 0.55); A.exponentialRampToValueAtTime(TINY, end + 0.7); end += 0.7;
  }
  v.until(end + 0.05);
  v.length = end - t;
  return v;
}

// ---- birds and beasts ------------------------------------------------------------------------------------
// White-throated sparrow: "Oh sweet Canada Canada Canada", pure whistles, the second note a jump up (now and
// then down), then triplets.
export function sparrow(au, pos) {
  const v = au.voice({ ...pos, gain: 0.19, ref: 14, wet: 0.3 });
  if (!v) return null;
  const R = au.rand, t = v.t, f0 = 3000 + R() * 600, f1 = f0 * (R() < 0.85 ? 1.21 + R() * 0.06 : 0.86);
  const [o, g] = tone(v, 'sine', f0, t, t + 4), F = o.frequency, A = g.gain;
  let s = t;
  const note = (f, len, from = 0.97) => { F.setValueAtTime(f * from, s); F.linearRampToValueAtTime(f, s + 0.04); A.setTargetAtTime(1, s, 0.012); A.setTargetAtTime(0, s + len - 0.03, 0.012); s += len; };
  note(f0, 0.5); s += 0.05; note(f1, 0.48); s += 0.06;
  for (let i = 0, n = 3 + (R() < 0.5 ? 1 : 0); i < n; i++) { note(f1 * 1.01, 0.11, 0.99); s += 0.025; note(f1 * 0.985, 0.11, 0.99); s += 0.025; note(f1 * 0.97, 0.12, 0.99); s += 0.05; }
  return v.until(s + 0.1);
}

// Hermit thrush: one phrase of its song, a long pure note and then a quick flourish of flutey notes above it on two
// voices at once; each phrase of a bout starts on a different pitch (the engine picks it).
export function thrush(au, pos, fIntro) {
  const v = au.voice({ ...pos, gain: 0.2, ref: 14, wet: 0.45 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [a, ga] = tone(v, 'sine', fIntro, t, t + 1.8), [b, gb] = tone(v, 'sine', fIntro * 1.5, t, t + 1.8);
  ga.gain.setTargetAtTime(0.9, t, 0.04); ga.gain.setTargetAtTime(0, t + 0.3, 0.02);
  const ratios = [1.26, 1.5, 1.34, 1.68, 1.5, 2, 1.78, 1.5, 2.25, 2, 1.68, 1.5, 1.88, 2.5], off = Math.floor(R() * 5);
  let s = t + 0.38;
  for (let i = 0, n = 9 + Math.floor(R() * 6); i < n; i++) {
    const f = fIntro * ratios[(i + off) % ratios.length] * (0.98 + R() * 0.04), amp = 0.8 * (1 - (i / n) * 0.6);
    a.frequency.setValueAtTime(f, s); a.frequency.linearRampToValueAtTime(f * (R() < 0.5 ? 1.04 : 0.96), s + 0.04);
    b.frequency.setValueAtTime(f * (R() < 0.5 ? 1.5 : 0.75), s);
    ga.gain.setTargetAtTime(amp, s, 0.004); ga.gain.setTargetAtTime(0, s + 0.035, 0.008);
    gb.gain.setTargetAtTime(amp * 0.35, s, 0.004); gb.gain.setTargetAtTime(0, s + 0.035, 0.008);
    s += 0.048 + R() * 0.012;
  }
  return v.until(s + 0.15);
}

// Red squirrel: a few barks, then the long descending rattle
export function squirrel(au, pos) {
  const v = au.voice({ ...pos, gain: 0.9, ref: 10, wet: 0.25 });
  if (!v) return null;
  const R = au.rand, [g, bp] = nz(v, 'white', 'bandpass', 4800, 2.5), A = g.gain;
  let s = v.t;
  for (let i = 0, n = R() < 0.6 ? 1 + Math.floor(R() * 3) : 0; i < n; i++) { bp.frequency.setValueAtTime(2600, s); A.setTargetAtTime(0.9, s, 0.003); A.setTargetAtTime(0, s + 0.035, 0.01); s += 0.22 + R() * 0.1; }
  const dur = 1.2 + R() * 1.8, rate = 15 + R() * 4, n = Math.floor(dur * rate);
  bp.frequency.setValueAtTime(5200, s); bp.frequency.linearRampToValueAtTime(3200, s + dur);
  for (let i = 0; i < n; i++) { const p = s + i / rate; A.setTargetAtTime(0.8 * Math.min(1, (i + 1) / 3) * (1 - (0.4 * i) / n), p, 0.002); A.setTargetAtTime(0, p + 0.018, 0.006); }
  return v.until(s + dur + 0.1);
}

// Barred owl: "who cooks for you, who cooks for you-all", the last note drawn out and falling
export function owl(au, pos, half = false) {
  const s0 = sends(au, pos, 0.4, 0.4);
  const v = au.voice({ ...pos, gain: 0.28, ref: 30, wet: s0.wet, echo: s0.echo, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.92 + R() * 0.16;
  const o = v.osc(au.waves.owl, 380 * k, t, t + 6), g = v.gain(0), lp = v.filter('lowpass', 1100, 0.5);
  v.chain(o, g, lp);
  const F = o.frequency, A = g.gain;
  const hoot = (s, len, f0, f1, amp) => { F.setValueAtTime(f0 * k, s); F.linearRampToValueAtTime(f1 * k, s + len * 0.6); A.setTargetAtTime(amp, s, 0.03); A.setTargetAtTime(0, s + len - 0.05, 0.04); };
  let s = t;
  const phrase = (last) => {
    hoot(s, 0.28, 360, 400, 0.8); s += 0.42; hoot(s, 0.24, 380, 410, 0.7); s += 0.36; hoot(s, 0.16, 390, 400, 0.6); s += 0.22;
    if (!last) { hoot(s, 0.5, 400, 440, 0.9); s += 1.1; return; }
    F.setValueAtTime(450 * k, s); F.linearRampToValueAtTime(260 * k, s + 0.95); A.setTargetAtTime(0.95, s, 0.03); A.setTargetAtTime(0, s + 0.8, 0.08); s += 1.2;
  };
  phrase(half); if (!half) phrase(true);
  return v.until(s + 0.3);
}

// Common raven: one to three hoarse croaks
export function raven(au, pos) {
  const s0 = sends(au, pos, 0.3, 0.3);
  const v = au.voice({ ...pos, gain: 0.7, ref: 20, wet: s0.wet, echo: s0.echo });
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.9 + R() * 0.2;
  const o = v.osc('sawtooth', 420 * k, t, t + 2.4), f1 = v.filter('bandpass', 1000, 3), f2 = v.filter('bandpass', 1700, 4), g = v.gain(0), g2 = v.gain(0.5);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(v.input);
  const [gn] = nz(v, 'white', 'bandpass', 1300, 1.2);
  let s = t;
  for (let i = 0, n = 1 + Math.floor(R() * 3); i < n; i++) {
    o.frequency.setValueAtTime(440 * k, s); o.frequency.linearRampToValueAtTime(330 * k, s + 0.28);
    g.gain.setTargetAtTime(0.8, s, 0.02); g.gain.setTargetAtTime(0, s + 0.24, 0.03);
    gn.gain.setTargetAtTime(0.25, s, 0.02); gn.gain.setTargetAtTime(0, s + 0.22, 0.03);
    s += 0.55 + R() * 0.3;
  }
  return v.until(s + 0.2);
}

// Lake ice in the cold: a low boom and the falling whistle of a crack running across the sheet
export function iceBoom(au, pos) {
  const v = au.voice({ ...pos, gain: 0.75, ref: 40, wet: 0.5, echo: 0.5 * au.S.open, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [o, go] = tone(v, 'sine', 75, t, t + 2); o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(32, t + 1.2); env(go.gain, t, 0.02, 0.8, 0, 1.4);
  const [gn] = nz(v, 'brown', 'lowpass', 220); env(gn.gain, t, 0.01, 0.9, 0.05, 1.2);
  for (let i = 0, n = 2 + Math.floor(R() * 2); i < n; i++) {
    const s = t + 0.05 + i * (0.14 + R() * 0.1), [w, gw] = tone(v, 'sine', 2400, s, s + 0.6);
    w.frequency.setValueAtTime(2600 * (1 - i * 0.1), s); w.frequency.exponentialRampToValueAtTime(260, s + 0.45); env(gw.gain, s, 0.005, 0.3 * (1 - i * 0.3), 0, 0.45);
  }
  return v.until(t + 2);
}

// Green frog: the loose banjo string, "gunk", once or a few times
export function greenFrog(au, pos) {
  const v = au.voice({ ...pos, gain: 0.32, ref: 8, wet: 0.25 });
  if (!v) return null;
  const R = au.rand, t = v.t, n = 1 + (R() < 0.4 ? 1 + Math.floor(R() * 2) : 0);
  const o = v.osc('triangle', 240, t, t + n * 0.5 + 0.3), bp = v.filter('bandpass', 480, 1.5), g = v.gain(0);
  v.chain(o, bp, g);
  const [gc] = nz(v, 'white', 'bandpass', 1500, 1.5);
  let s = t;
  for (let i = 0; i < n; i++) {
    const f = 225 + R() * 40;
    o.frequency.setValueAtTime(f * 1.12, s); o.frequency.exponentialRampToValueAtTime(f, s + 0.04);
    g.gain.setTargetAtTime(1, s, 0.003); g.gain.setTargetAtTime(0, s + 0.02, 0.05);
    gc.gain.setTargetAtTime(0.3, s, 0.001); gc.gain.setTargetAtTime(0, s + 0.004, 0.004);
    s += 0.32 + R() * 0.15;
  }
  return v.until(s + 0.3);
}

// A beaver's tail on the water: the crack, the thump, the water thrown up and falling back, and the lake echoing it
export function beaverSlap(au, pos, size = 1) {
  const s0 = sends(au, pos, 0.35, 0.9);
  const v = au.voice({ ...pos, gain: 0.5 * size, ref: 25, wet: s0.wet, echo: s0.echo + 0.15 * au.S.open, pri: 2 });
  if (!v) return null;
  const t = v.t;
  const [gc] = nz(v, 'white', 'highpass', 700); env(gc.gain, t, 0.001, 1, 0.004, 0.05);
  const [o, go] = tone(v, 'sine', 90, t, t + 0.6); o.frequency.setValueAtTime(110 / Math.sqrt(size), t); o.frequency.exponentialRampToValueAtTime(42, t + 0.25); env(go.gain, t, 0.003, 0.9, 0, 0.3);
  const [gs] = nz(v, 'pink', 'bandpass', 1600); env(gs.gain, t + 0.02, 0.03, 0.5, 0.05, 0.7);
  return v.until(t + 1);
}

// Bald eagle: thin, gull-like chirps, a longer first note and a falling chatter
export function eagle(au, pos, size = 1) {
  const s0 = sends(au, pos, 0.3, 0.35);
  const v = au.voice({ ...pos, gain: 0.45 * size, ref: 25, wet: s0.wet, echo: s0.echo });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const o = v.osc('triangle', 3000, t, t + 2.5), g = v.gain(0), rasp = v.gain(0.7), am = v.osc('square', 95 + R() * 30, t, t + 2.5), amd = v.gain(0.3);
  am.connect(amd); amd.connect(rasp.gain); v.chain(o, g, rasp);
  const F = o.frequency, A = g.gain;
  let s = t;
  F.setValueAtTime(2600, s); F.linearRampToValueAtTime(3300, s + 0.08); F.linearRampToValueAtTime(3000, s + 0.22);
  A.setTargetAtTime(0.9, s, 0.01); A.setTargetAtTime(0, s + 0.2, 0.02); s += 0.32;
  for (let i = 0, n = 4 + Math.floor(R() * 4); i < n; i++) {
    const f = 3200 - i * 60; F.setValueAtTime(f, s); F.linearRampToValueAtTime(f * 1.06, s + 0.03); F.linearRampToValueAtTime(f * 0.95, s + 0.07);
    A.setTargetAtTime(0.7, s, 0.006); A.setTargetAtTime(0, s + 0.06, 0.01); s += 0.1 + R() * 0.02;
  }
  return v.until(s + 0.2);
}

// A fish rising: the plink of the bubble it leaves and a swirl of water, bigger and lower for a bigger fish
export function fishRise(au, pos, size = 1) {
  const v = au.voice({ ...pos, gain: 0.18 * Math.min(2, size), ref: 6, wet: 0.2, echo: 0.1 * au.S.open });
  if (!v) return null;
  const R = au.rand, t = v.t, f0 = (520 / Math.sqrt(size)) * (0.9 + R() * 0.2);
  const [o, go] = tone(v, 'sine', f0, t, t + 0.3); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.05); env(go.gain, t, 0.002, 0.6, 0, 0.09);
  const [gs] = nz(v, 'white', 'bandpass', 1900 / Math.sqrt(size), 0.8); env(gs.gain, t, 0.005, 0.4 * Math.min(1.5, size), 0.02, 0.15 + 0.1 * size);
  return v.until(t + 0.5);
}

// A moose's grunt: a short hoarse, nasal "uh-wuh"
export function mooseGrunt(au, pos, size = 1) {
  const s0 = sends(au, pos, 0.35, 0.4);
  const v = au.voice({ ...pos, gain: 0.55 * size, ref: 18, wet: s0.wet, echo: s0.echo });
  if (!v) return null;
  const R = au.rand, t = v.t, k = (0.9 + R() * 0.2) / Math.pow(size, 0.3);
  const o = v.osc('sawtooth', 100 * k, t, t + 1.2), f1 = v.filter('bandpass', 380, 3), f2 = v.filter('lowpass', 900, 0.7), g = v.gain(0);
  v.chain(o, f1, f2, g);
  o.frequency.setValueAtTime(105 * k, t); o.frequency.linearRampToValueAtTime(122 * k, t + 0.12); o.frequency.exponentialRampToValueAtTime(70 * k, t + 0.5);
  env(g.gain, t, 0.06, 0.9, 0.15, 0.3);
  const [gn] = nz(v, 'pink', 'bandpass', 600, 1); env(gn.gain, t, 0.05, 0.25, 0.15, 0.3);
  return v.until(t + 0.7);
}

// A moose wading: slow surges of water round its legs, with a gurgle in each
export function mooseWade(au, pos, size = 1) {
  const v = au.voice({ ...pos, gain: 0.28 * size, ref: 10, wet: 0.2, echo: 0.1 * au.S.open });
  if (!v) return null;
  const R = au.rand, [g1] = nz(v, 'pink', 'lowpass', 900, 0.6), [g2] = nz(v, 'white', 'bandpass', 1300, 0.9);
  let s = v.t;
  for (let i = 0, n = 2 + Math.floor(R() * 2); i < n; i++) {
    g1.gain.setTargetAtTime(0.8, s, 0.08); g1.gain.setTargetAtTime(0, s + 0.25, 0.12);
    grains(g2.gain, s + 0.05, 6, 0.3, 0.4, 0.05, R);
    s += 0.45 + R() * 0.25;
  }
  return v.until(s + 0.6);
}

// A splash: a lure, a fish, a paddler going in. Head-locked when pos is null (the fishing's own splash).
export function splash(au, pos, size = 1) {
  const s = Math.max(0.15, Math.min(3, size)), d = pos ? au.distTo(pos) : 0;
  const v = au.voice({ ...where(pos), gain: 0.35 * Math.sqrt(s), ref: 8, wet: pos ? 0.2 : 0.1, echo: pos ? 0.25 * au.S.open * smooth(30, 200, d) : 0 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [g] = nz(v, 'white', 'bandpass', 1100 / Math.sqrt(s), 0.6); env(g.gain, t, 0.02, 0.6, 0, 0.25 + 0.3 * s);
  const [o, og] = tone(v, 'sine', 220, t, t + 0.25); o.frequency.setValueAtTime(220 / Math.sqrt(s), t); o.frequency.exponentialRampToValueAtTime(70, t + 0.18); env(og.gain, t, 0.015, 0.3, 0, 0.2);
  if (s > 0.8) { const [gd] = nz(v, 'white', 'highpass', 2500); grains(gd.gain, t + 0.15, Math.round(6 * s), 0.35 * s, 0.25, 0.03, R); }
  return v.until(t + 0.4 + 0.4 * s);
}

// Thunder: the crack of a close strike and the long roll down the lake, arriving at the speed of sound
export function thunder(au, pos, size = 1) {
  const d = au.distTo(pos), close = d < 1500;
  const v = au.voice({ ...pos, at: Math.min(12, d / 343), gain: 0.9 * size, ref: 400, roll: 0.6, wet: 0.5, echo: 0.6 * au.S.open, pri: 3 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [g] = nz(v, 'brown', 'lowpass', close ? 700 : 260, 0.5);
  if (close) { const [gc] = nz(v, 'white', 'highpass', 900, 0.5); env(gc.gain, t, 0.003, 0.7, 0.05, 0.35); }
  const dur = 3 + R() * 4 + d / 2000;
  let s = t;
  g.gain.setValueAtTime(0, t);
  for (let i = 0, n = 3 + Math.floor(R() * 4); i < n; i++) { g.gain.setTargetAtTime((0.5 + R() * 0.5) * (1 - i / (n + 2)), s, 0.06 + R() * 0.2); s += 0.3 + R() * 0.9; }
  g.gain.setTargetAtTime(0, s, dur * 0.3);
  return v.until(s + dur);
}

// ---- the paddler -----------------------------------------------------------------------------------------
// One footfall on the ground class under you; heavier and lower under the canoe
export function step(au, kind, pos, heavy = false) {
  const v = au.voice({ ...pos, gain: heavy ? 0.42 : 0.3, ref: 6, wet: 0.08, air: false, pri: 0 });
  if (!v) return null;
  const R = au.rand, t = v.t, h = heavy ? 1.3 : 1;
  const thud = (cut, amp, dec) => { const [g] = nz(v, 'brown', 'lowpass', cut / h, 0.7); env(g.gain, t, 0.006, amp, 0, dec * h); };
  const hiss = (type, f, Q, amp, a, dec) => { const [g] = nz(v, 'white', type, f, Q); env(g.gain, t, a, amp, 0, dec); };
  const crunch = (f, Q, n, span, amp, dec) => { const [g] = nz(v, 'white', 'bandpass', f, Q); grains(g.gain, t, n, span * h, amp, dec, R); };
  switch (kind) {
    case 'rock': {
      hiss('highpass', 2200, 0.7, 0.25, 0.001, 0.018);
      const [o, g] = tone(v, 'sine', 240, t, t + 0.12); o.frequency.setValueAtTime(250 / h, t); o.frequency.exponentialRampToValueAtTime(170 / h, t + 0.05); env(g.gain, t, 0.002, 0.3, 0, 0.06);
      crunch(3600, 1.2, 2, 0.03, 0.12, 0.015); break;
    }
    case 'grass': hiss('bandpass', 3200, 0.6, 0.3, 0.035, 0.16); thud(300, 0.6, 0.06); break;
    case 'burn': crunch(2400, 1.1, 5, 0.07, 0.45, 0.018); thud(450, 0.7, 0.07); break;
    case 'gravel': crunch(1800, 0.8, 8, 0.12, 0.4, 0.02); thud(350, 0.7, 0.07); break;
    case 'dirt': thud(600, 1, 0.07); crunch(1400, 0.9, 3, 0.03, 0.2, 0.02); break;
    case 'snow': {
      crunch(1100, 0.7, 9, 0.14, 0.35, 0.025); thud(300, 0.5, 0.08);
      if (au.S.cold > 0.85) { const [o, g] = tone(v, 'sine', 1300, t, t + 0.12); o.frequency.linearRampToValueAtTime(1550, t + 0.06); env(g.gain, t + 0.02, 0.01, 0.06, 0.02, 0.03); }
      break;
    }
    case 'wade': {
      const [g] = nz(v, 'pink', 'bandpass', 750, 0.8); env(g.gain, t, 0.05, 0.7, 0.05, 0.3);
      const [o, og] = tone(v, 'sine', 480, t + 0.05, t + 0.2); o.frequency.setValueAtTime(480, t + 0.05); o.frequency.exponentialRampToValueAtTime(900, t + 0.09); env(og.gain, t + 0.05, 0.003, 0.15, 0, 0.05);
      break;
    }
    default: thud(420, 0.6, 0.09); hiss('bandpass', 1500, 0.7, 0.12, 0.01, 0.06); // needle duff: soft
  }
  return v.until(t + 0.4);
}

// The catch and the pull: the blade going in (a short bright splash and a plunk), then the water swirling off it,
// a low gurgle that swells and fades through the power phase (`pull` seconds)
export function paddleCatch(au, pos, power, pull) {
  const v = au.voice({ ...pos, gain: 0.26 * (0.4 + 0.6 * power), ref: 7, wet: 0.12, echo: 0.04 * au.S.open, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [g] = nz(v, 'white', 'bandpass', 1500 + R() * 400, 0.9); env(g.gain, t, 0.004, 0.9, 0.01, 0.12);
  const [o, go] = tone(v, 'sine', 240, t, t + 0.15); o.frequency.setValueAtTime(240 + R() * 40, t); o.frequency.exponentialRampToValueAtTime(95, t + 0.08); env(go.gain, t, 0.003, 0.4, 0, 0.08);
  const [gs, sw] = nz(v, 'pink', 'bandpass', 620, 1.6);
  sw.frequency.setValueAtTime(680, t + 0.03); sw.frequency.linearRampToValueAtTime(360, t + pull);
  for (let i = 0; i < 5; i++) { const s = t + 0.04 + (i / 5) * pull * 0.9 + R() * 0.03; gs.gain.setTargetAtTime(0.35 + R() * 0.35, s, 0.02); gs.gain.setTargetAtTime(0.1, s + 0.05, 0.03); }
  gs.gain.setTargetAtTime(0, t + pull, 0.05);
  return v.until(t + pull + 0.3);
}

// The exit and the recovery: a soft trickle as the blade leaves, then drips off it, little bubble plinks
export function paddleExit(au, pos, power, recovery) {
  const v = au.voice({ ...pos, gain: 0.15 * (0.4 + 0.6 * power), ref: 7, wet: 0.12, air: false, pri: 0 });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [g] = nz(v, 'white', 'bandpass', 2600, 0.8); env(g.gain, t, 0.01, 0.5, 0.02, 0.14);
  const [o, og] = tone(v, 'sine', 1200, t, t + recovery + 0.2);
  const ts = []; for (let i = 0, n = 2 + Math.floor(R() * 4); i < n; i++) ts.push(t + 0.08 + R() * recovery * 0.85);
  ts.sort((a, b) => a - b);
  let last = 0;
  for (const s0 of ts) {
    const s = Math.max(s0, last + 0.04), f = 900 + R() * 900;
    o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 2.1, s + 0.025);
    og.gain.setTargetAtTime(0.15 + R() * 0.2, s, 0.002); og.gain.setTargetAtTime(0, s + 0.005, 0.018);
    last = s;
  }
  return v.until(t + recovery + 0.2);
}

// The paddle shaft knocking the gunwale as it changes sides (and any small wooden knock)
export function knock(au, pos, delay = 0, amt = 1) {
  const v = au.voice({ ...pos, at: delay, gain: 0.13 * amt, ref: 6, wet: 0.1, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.9 + R() * 0.2;
  const [, g1] = tone(v, 'sine', 215 * k, t, t + 0.15); env(g1.gain, t, 0.001, 0.8, 0, 0.09);
  const [, g2] = tone(v, 'sine', 590 * k, t, t + 0.1); env(g2.gain, t, 0.001, 0.4, 0, 0.05);
  const [gc] = nz(v, 'white', 'bandpass', 1300, 2); env(gc.gain, t, 0.001, 0.5, 0, 0.02);
  return v.until(t + 0.2);
}

// A creak: stick-slip, a low sawtooth whose rate wanders, through two narrow wood resonances. The hull flexing in
// the waves or on a hard stroke; higher and shorter, the yoke on your shoulders.
export function creak(au, pos, amt = 1, yoke = false) {
  const v = au.voice({ ...pos, gain: 0.2 * amt, ref: 6, wet: 0.08, air: false, pri: 0 });
  if (!v) return null;
  const R = au.rand, t = v.t, dur = yoke ? 0.18 + R() * 0.12 : 0.3 + R() * 0.25, up = yoke ? 1.7 : 1;
  const o = v.osc('sawtooth', 40, t, t + dur + 0.1), b1 = v.filter('bandpass', (800 + R() * 400) * up, 7), b2 = v.filter('bandpass', (1900 + R() * 500) * up, 5), g = v.gain(0), g2 = v.gain(0.5);
  o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g2); g2.connect(g); g.connect(v.input);
  o.frequency.setValueAtTime(30 + R() * 15, t); o.frequency.linearRampToValueAtTime(55 + R() * 25, t + dur * 0.4); o.frequency.linearRampToValueAtTime(28 + R() * 10, t + dur);
  env(g.gain, t, 0.05, 1, Math.max(0, dur - 0.13), 0.08);
  return v.until(t + dur + 0.1);
}

// The hollow knock of the hull against a tree, or rolling over on the water
export function bonk(au, pos, amt = 1) {
  const v = au.voice({ ...pos, gain: 0.08 * amt, ref: 7, wet: 0.15, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t, k = 0.9 + R() * 0.2;
  for (const [f, a, d] of [[118, 0.8, 0.35], [262, 0.5, 0.22], [431, 0.3, 0.12]]) { const [, g] = tone(v, 'sine', f * k, t, t + d + 0.05); env(g.gain, t, 0.002, a, 0, d); }
  const [gc] = nz(v, 'white', 'bandpass', 900, 1); env(gc.gain, t, 0.001, 0.6, 0, 0.02);
  return v.until(t + 0.45);
}

// The hull grinding up onto a gravel shore
export function scrape(au, pos) {
  const v = au.voice({ ...pos, gain: 0.32, ref: 7, wet: 0.1, air: false });
  if (!v) return null;
  const R = au.rand, t = v.t;
  const [g] = nz(v, 'white', 'bandpass', 1500, 0.8); grains(g.gain, t, 16, 0.6, 0.5, 0.03, R);
  const [gl] = nz(v, 'brown', 'lowpass', 350); env(gl.gain, t, 0.05, 0.6, 0.25, 0.3);
  return v.until(t + 0.9);
}

// Launching: the hull sliding off the bank and settling with a splash
export function launch(au, pos) {
  const v = au.voice({ ...pos, gain: 0.3, ref: 7, wet: 0.12, air: false });
  if (!v) return null;
  const t = v.t, [gl] = nz(v, 'brown', 'lowpass', 400); env(gl.gain, t, 0.1, 0.7, 0.2, 0.4);
  splash(au, { ...pos, at: 0.35 }, 0.7);
  return v.until(t + 0.9);
}

// Going over: a big splash, the hull rolling, water rushing and bubbles
export function capsize(au, pos) {
  splash(au, pos, 2.6); bonk(au, pos, 0.8);
  const v = au.voice({ ...pos, gain: 0.35, ref: 7, wet: 0.15, air: false, pri: 2 });
  if (!v) return null;
  const R = au.rand, t = v.t, [g] = nz(v, 'pink', 'lowpass', 1400); env(g.gain, t, 0.05, 0.6, 0.3, 1.2);
  const [o, og] = tone(v, 'sine', 600, t, t + 1.4);
  for (let i = 0; i < 6; i++) { const s = t + 0.15 + i * 0.17 + R() * 0.06, f = 500 + R() * 500; o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 2, s + 0.03); og.gain.setTargetAtTime(0.25, s, 0.002); og.gain.setTargetAtTime(0, s + 0.006, 0.02); }
  return v.until(t + 1.7);
}

// Climbing back in: the hull righted with a knock, the water pouring off you and out of it
export function climb(au, pos) {
  bonk(au, pos, 0.5);
  const v = au.voice({ ...pos, gain: 0.3, ref: 7, wet: 0.12, air: false });
  if (!v) return null;
  const t = v.t, [g] = nz(v, 'pink', 'bandpass', 900, 0.6); env(g.gain, t + 0.2, 0.15, 0.5, 0.4, 1.0);
  return v.until(t + 1.9);
}

// A swimming stroke (a sweep of water and a couple of bubbles), or a softer slosh treading water
export function swimStroke(au, pos, strong) {
  const v = au.voice({ ...pos, gain: strong ? 0.3 : 0.14, ref: 6, wet: 0.1, air: false, pri: 0 });
  if (!v) return null;
  const R = au.rand, t = v.t, [g, b] = nz(v, 'pink', 'bandpass', 500, 0.9);
  b.frequency.setValueAtTime(500, t); b.frequency.linearRampToValueAtTime(strong ? 1400 : 800, t + 0.3); env(g.gain, t, 0.06, 0.6, 0.05, 0.3);
  if (strong) { const [o, og] = tone(v, 'sine', 600, t + 0.2, t + 0.5); for (let i = 0; i < 2; i++) { const s = t + 0.22 + i * 0.12, f = 550 + R() * 400; o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 1.9, s + 0.03); og.gain.setTargetAtTime(0.2, s, 0.002); og.gain.setTargetAtTime(0, s + 0.006, 0.02); } }
  return v.until(t + 0.55);
}

// A paddle dip (the old one-size dip, for what the stroke sync does not cover); head-locked when pos is null
export function dip(au, pos, amt = 1) {
  const v = au.voice({ ...where(pos), gain: 0.5 * amt, ref: 7, wet: 0.1, air: false });
  if (!v) return null;
  const t = v.t, [g] = nz(v, 'white', 'bandpass', 1400, 0.7); env(g.gain, t, 0.03, 1, 0, 0.32);
  return v.until(t + 0.4);
}

// ---- the fishing (head-locked, as before) ----------------------------------------------------------------
export function reel(au, pitch = 1) {
  const v = au.voice({ gain: 0.12, pri: 0 });
  if (!v) return null;
  const t = v.t, [g] = nz(v, 'white', 'highpass', 2600 * pitch, 1.2); env(g.gain, t, 0.004, 1, 0, 0.026);
  return v.until(t + 0.05);
}
export function bite(au, strength = 1) {
  const v = au.voice({ gain: 0.14, pri: 2 });
  if (!v) return null;
  const t = v.t, [o, g] = tone(v, 'sine', 420, t, t + 0.16); o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1); env(g.gain, t, 0.01, strength, 0, 0.13);
  if (strength < 1) { const t2 = t + 0.13, [o2, g2] = tone(v, 'sine', 380, t2, t2 + 0.12); o2.frequency.setValueAtTime(380, t2); o2.frequency.exponentialRampToValueAtTime(150, t2 + 0.08); env(g2.gain, t2, 0.01, 0.67, 0, 0.09); }
  return v.until(t + 0.3);
}
export function snap(au) {
  const v = au.voice({ gain: 0.2, pri: 2 });
  if (!v) return null;
  const t = v.t, [g] = nz(v, 'white', 'highpass', 1800); env(g.gain, t, 0.003, 1, 0, 0.087);
  const [o, og] = tone(v, 'triangle', 1900, t, t + 0.15); o.frequency.setValueAtTime(1900, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.12); env(og.gain, t, 0.005, 0.44, 0, 0.135);
  return v.until(t + 0.16);
}
