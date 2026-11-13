// Round 7 stream 7a's sounds (60 S2, S3, S4), synthesized on audio-kit's Voice as bear.js's are: a heavy step in
// deadfall (front and hind landing nearly together), a hollow knock of hoof on log, branches ripped down, a low huff,
// the player's own bad howl (cupped hands, head-locked), a wolf's howl at a bearing (and pups' yips over it), loons
// answering, a beaver's tail slap across calm water, a barred owl's who-cooks-for-you, a moose swimming. Each plays at a
// world position (x, y, z) or head-locked (null), and only while the audio is running.
//
//   play7a(au, kind, pos, size = 1) → Voice | null     kind: 'step' | 'knock' | 'rip' | 'huff' | 'myhowl' | 'howl' |
//                                                       'yips' | 'loons' | 'slap' | 'owl' | 'splash'
import { env } from './audio-kit.js';

function nz(v, kind, type, f, Q = 0.7) { const b = v.filter(type, f, Q), g = v.gain(0); v.noise(kind, b); b.connect(g); g.connect(v.input); return [g, b]; }
const at = (au, pos, o) => (pos ? { x: pos.x, y: pos.y, z: pos.z, at: pos.at || 0, ...o } : { at: (o && o.at) || 0, ...o });
const R = (au) => (au.rand ? au.rand() : Math.random());

// a heavy step in deadfall: a dull thud and twigs, twice close together (front and hind)
function step(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.9 * size, ref: 12, wet: 0.35, echo: 0.15, pri: 2 })); if (!v) return null;
  for (const k of [0, 0.09]) {
    const s = v.t + k, [g] = nz(v, 'brown', 'lowpass', 160, 0.8); env(g.gain, s, 0.01, 1.4, 0.02, 0.22);
    const [g2] = nz(v, 'pink', 'bandpass', 2600 + R(au) * 900, 1.6); env(g2.gain, s + 0.02, 0.003, 0.5, 0, 0.08);
  }
  return v.until(v.t + 0.6);
}
// wood on wood, hollow
function knock(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.9 * size, ref: 14, wet: 0.45, echo: 0.3, pri: 2 })); if (!v) return null;
  for (const k of [0, 0.62]) {
    const s = v.t + k, o = v.osc('sine', 210, s, s + 0.3), g = v.gain(0); v.chain(o, g); o.frequency.setValueAtTime(240, s); o.frequency.exponentialRampToValueAtTime(150, s + 0.15); env(g.gain, s, 0.002, 0.9, 0, 0.18);
    const [gn] = nz(v, 'white', 'bandpass', 900, 3); env(gn.gain, s, 0.001, 0.6, 0, 0.05);
  }
  return v.until(v.t + 1.2);
}
// branches pulled down and snapping
function rip(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.8 * size, ref: 10, wet: 0.35, echo: 0.2, pri: 2 })); if (!v) return null;
  const [g, b] = nz(v, 'pink', 'bandpass', 1800, 0.9); b.frequency.setValueAtTime(2400, v.t); b.frequency.linearRampToValueAtTime(900, v.t + 0.9); env(g.gain, v.t, 0.05, 0.7, 0.5, 0.5);
  for (let i = 0; i < 4; i++) { const s = v.t + 0.15 + i * 0.22 + R(au) * 0.08, [gc] = nz(v, 'white', 'bandpass', 3200, 2); env(gc.gain, s, 0.001, 0.9, 0, 0.04); }
  return v.until(v.t + 1.6);
}
// a low huff through the nose
function huff(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.8 * size, ref: 10, wet: 0.3, echo: 0.2, pri: 2 })); if (!v) return null;
  const [g, b] = nz(v, 'pink', 'bandpass', 420, 1.0); b.frequency.setValueAtTime(520, v.t); b.frequency.exponentialRampToValueAtTime(220, v.t + 0.35); env(g.gain, v.t, 0.02, 1.0, 0.05, 0.3);
  return v.until(v.t + 0.6);
}
// a howl: a rising slide into a long held note with a slow waver, falling away at the end. f0 its pitch, dur seconds,
// breath: how much air (the player's own is mostly air)
function howlOn(v, s, f0, dur, breath = 0.1, amp = 1) {
  const o = v.osc('sine', f0, s, s + dur + 0.3), o2 = v.osc('triangle', f0 * 2, s, s + dur + 0.3), g = v.gain(0), g2 = v.gain(0), vib = v.osc('sine', 4.5, s, s + dur + 0.3), vg = v.gain(f0 * 0.012);
  vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency);
  o.frequency.setValueAtTime(f0 * 0.7, s); o.frequency.exponentialRampToValueAtTime(f0, s + dur * 0.25); o.frequency.setValueAtTime(f0, s + dur * 0.75); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, s + dur);
  o2.frequency.setValueAtTime(f0 * 1.4, s); o2.frequency.exponentialRampToValueAtTime(f0 * 2, s + dur * 0.25); o2.frequency.setValueAtTime(f0 * 2, s + dur * 0.75); o2.frequency.exponentialRampToValueAtTime(f0 * 1.24, s + dur);
  v.chain(o, g); v.chain(o2, g2);
  env(g.gain, s, dur * 0.2, 0.55 * amp, dur * 0.6, dur * 0.25); env(g2.gain, s, dur * 0.2, 0.08 * amp, dur * 0.6, dur * 0.25);
  if (breath > 0) { const [gb, bb] = nz(v, 'pink', 'bandpass', f0 * 1.5, 1.2); void bb; env(gb.gain, s, dur * 0.15, breath * amp, dur * 0.6, dur * 0.25); }
}
function myhowl(au) {
  const v = au.voice({ local: true, gain: 0.45, pri: 2, at: 0 }); if (!v) return null;
  howlOn(v, v.t, 380 + R(au) * 40, 2.6, 0.5, 0.8);
  return v.until(v.t + 3.1);
}
// the pack: two or three voices overlapping at a distance, the lake's echo long
function howl(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 1.1 * size, ref: 400, roll: 0.6, wet: 0.7, echo: 0.6, pri: 2 })); if (!v) return null;
  const n = 2 + (R(au) < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) howlOn(v, v.t + i * (0.8 + R(au) * 0.9), 330 + i * 70 + R(au) * 40, 3.2 + R(au) * 1.2, 0.04, 1 - i * 0.15);
  return v.until(v.t + 7);
}
// pups: short broken yips and squeals riding over the adults
function yips(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.8 * size, ref: 300, roll: 0.6, wet: 0.6, echo: 0.5, pri: 2 })); if (!v) return null;
  for (let i = 0; i < 9; i++) { const s = v.t + 0.6 + i * 0.32 + R(au) * 0.15, f = 700 + R(au) * 500, o = v.osc('triangle', f, s, s + 0.22), g = v.gain(0); v.chain(o, g); o.frequency.setValueAtTime(f, s); o.frequency.exponentialRampToValueAtTime(f * 1.4, s + 0.08); o.frequency.exponentialRampToValueAtTime(f * 0.8, s + 0.18); env(g.gain, s, 0.01, 0.4, 0.04, 0.12); }
  return v.until(v.t + 4.2);
}
// loons answering: the tremolo laugh, far
function loons(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.8 * size, ref: 300, roll: 0.6, wet: 0.7, echo: 0.7, pri: 2 })); if (!v) return null;
  const s0 = v.t + 0.2, o = v.osc('sine', 820, s0, s0 + 2.6), g = v.gain(0), trem = v.osc('square', 9, s0, s0 + 2.6), tg = v.gain(0.25);
  trem.connect(tg); tg.connect(g.gain); v.chain(o, g); o.frequency.setValueAtTime(760, s0); o.frequency.linearRampToValueAtTime(980, s0 + 1.2); o.frequency.linearRampToValueAtTime(860, s0 + 2.4);
  env(g.gain, s0, 0.1, 0.35, 2.0, 0.4);
  return v.until(s0 + 3);
}
// a beaver's tail on calm water: a flat crack, the water's splash after
function slap(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 1.2 * size, ref: 200, roll: 0.5, wet: 0.5, echo: 0.8, pri: 2 })); if (!v) return null;
  const [g] = nz(v, 'white', 'bandpass', 1400, 0.8); env(g.gain, v.t, 0.001, 1.2, 0, 0.09);
  const [g2] = nz(v, 'pink', 'lowpass', 700, 0.7); env(g2.gain, v.t + 0.04, 0.02, 0.6, 0.05, 0.5);
  return v.until(v.t + 0.8);
}
// a barred owl: who-cooks-for-you, who-cooks-for-you-all
function owl(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.9 * size, ref: 60, roll: 0.8, wet: 0.6, echo: 0.5, pri: 2 })); if (!v) return null;
  const notes = [[0, 0.22, 330], [0.3, 0.2, 360], [0.55, 0.2, 360], [0.8, 0.45, 300], [1.6, 0.22, 330], [1.9, 0.2, 360], [2.15, 0.2, 360], [2.4, 0.6, 290]];
  for (const [d, l, f] of notes) { const s = v.t + d, o = v.osc('sine', f, s, s + l + 0.1), g = v.gain(0); v.chain(o, g); o.frequency.setValueAtTime(f * 1.04, s); o.frequency.exponentialRampToValueAtTime(f * 0.9, s + l); env(g.gain, s, 0.03, 0.5, l * 0.5, l * 0.4); }
  return v.until(v.t + 3.2);
}
// something big swimming: steady splashing, a long while
function splash(au, pos, size) {
  const v = au.voice(at(au, pos, { gain: 0.7 * size, ref: 40, wet: 0.4, echo: 0.6, pri: 2 })); if (!v) return null;
  for (let i = 0; i < 8; i++) { const s = v.t + i * 0.55 + R(au) * 0.1, [g] = nz(v, 'pink', 'bandpass', 900 + R(au) * 400, 0.9); env(g.gain, s, 0.02, 0.5, 0.05, 0.3); }
  return v.until(v.t + 5);
}
const KINDS = { step, knock, rip, huff, myhowl, howl, yips, loons, slap, owl, splash };
export function play7a(au, kind, pos = null, size = 1) {
  const f = KINDS[kind];
  if (!au || !au.ctx || !au.enabled || !f) return null;
  try { return au.say ? au.say(`7a-${kind}`, f(au, pos, size)) : f(au, pos, size); } catch (e) { console.warn('7a: a sound', kind, e); return null; }
}
