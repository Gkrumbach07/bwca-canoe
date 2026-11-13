// Speech without words (the owner, 2026-11-13: "Right now it's just text. Should it be some sort of gobbly gloop?"):
// a line said aloud as a soft murmur of made-up syllables, the way a voice sounds through a wall or across a room. It
// carries who is talking (each person's own pitch, size and pace), how they say it (a question rises at its end, a
// "!" is louder and higher, a comma and a full stop are pauses) and nothing of the words. It is short: a line's first
// couple of seconds, finished at the end of a word, so a long line is read, not listened to.
//
// The voice: a buzz at the speaker's pitch (a sawtooth, a little jitter and vibrato) and a breath of noise through
// three formant bands that glide from vowel to vowel (a e i o u from the letters of the line, so the same line always
// sounds the same), with short noise onsets for the s, sh, f, t, k and p of a word, a hum for its m and n. All of it
// through a gentle low-pass: a murmur, never a word.
//
// Self-contained (no imports): it builds on any `kit` with the Voice's shape (audio-kit.js), so the game plays it
// through the engine's one-shots and a rig renders it offline:
//   kit: { ctx, t, input, osc(type, f, t0, t1), filter(type, f, Q), gain(v), noise('white'|'pink', node), until(t) }
//   voiceOf({ key, name, female, age, pitch?, pace? }) → { f0, form, rate, breath, wobble, rasp, lilt, bright, seed }
//   speak(kit, text, voice, { max = 2.2, gain = 1, mood = null }) → { end, syllables, secs }

const FORMANTS = { // F1, F2, F3 (Hz) of an adult male voice; a voice's `form` scales them
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 2950], o: [570, 840, 2410], u: [320, 900, 2250], y: [400, 1900, 2600], ə: [500, 1450, 2450],
};
const ONSET = { // the consonant before a vowel: [kind, band centre Hz, Q, seconds, level]
  s: ['hiss', 5600, 1.6, 0.06, 0.32], z: ['hiss', 5000, 1.6, 0.05, 0.22], c: ['hiss', 5200, 1.6, 0.05, 0.28], x: ['hiss', 4200, 1.4, 0.05, 0.25],
  h: ['breath', 1500, 0.6, 0.05, 0.22], f: ['breath', 3600, 0.8, 0.05, 0.2], v: ['breath', 3000, 0.9, 0.04, 0.14], w: ['glide', 0, 0, 0.05, 0],
  t: ['tick', 3800, 1.2, 0.018, 0.4], k: ['tick', 2400, 1.4, 0.022, 0.4], p: ['tick', 1200, 1.0, 0.016, 0.34], q: ['tick', 2400, 1.4, 0.022, 0.38],
  d: ['tick', 3200, 1.4, 0.012, 0.22], g: ['tick', 2000, 1.4, 0.014, 0.22], b: ['tick', 900, 1.0, 0.012, 0.2], j: ['hiss', 3000, 1.4, 0.04, 0.22],
  m: ['hum', 0, 0, 0.05, 0], n: ['hum', 0, 0, 0.045, 0], l: ['glide', 0, 0, 0.04, 0], r: ['glide', 0, 0, 0.04, 0],
};
const TINY = 0.0001;

// a small seeded random (mulberry32) and a string's hash
function rng32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// A person's voice, from who they are: a woman's or a man's, a kid's, a young, middle-aged or old voice, and the rest
// from their key (the same person always sounds the same). (ux round 2, the owner 2026-11-13: "change the pitch based on
// who's talking so they don't all sound the same") Each voice takes its own place across about ten semitones of its
// register (`pitch` -1 low .. 1 high, else from the key), its own throat size, pace, airiness, roughness, and `lilt`, how
// far its pitch moves over a line (a flat talker to a sing-song one). The story's cast set `pitch` and `pace` by hand
// (story-data/cast.js look.voice) so the people met together never sound alike.
export function voiceOf({ key = '', name = '', female = false, age = 'adult', pitch = null, pace = null } = {}) {
  const R = rng32(hash(`voice:${key || name}`));
  const kid = age === 'kid', old = age === 'old', young = age === 'young', mid = age === 'mid';
  const p = Math.max(-1, Math.min(1, Number.isFinite(pitch) ? pitch : R() * 2 - 1));
  const centre = kid ? 265 : female ? 200 : 116;
  const semis = p * 5 + (young ? 1.2 : old ? -1.4 : mid ? -0.4 : 0);
  const f0 = centre * 2 ** (semis / 12);
  const throat = (kid ? 1.3 : female ? 1.15 : 1) * (1 + 0.035 * p + (R() - 0.5) * 0.12);
  const r1 = R(), r2 = R(), r3 = R(), r4 = R(), r5 = R();
  return {
    f0,
    form: throat,                                                                                    // the size of the throat
    rate: (kid ? 1.12 : old ? 0.84 : young ? 1.06 : 1) * (Number.isFinite(pace) ? pace : 0.84 + r1 * 0.32), // syllables a second, ×
    breath: (old ? 0.2 : 0.05) + r2 * 0.14,                                                          // how airy
    wobble: old ? 0.028 + r3 * 0.016 : 0.006 + r3 * 0.01,                                            // the vibrato's depth
    rasp: (old ? 0.022 : 0.008) + r4 * 0.016,                                                        // the roughness in the pitch
    lilt: 0.55 + r5 * 1.1,                                                                           // the pitch's travel over a line, ×
    bright: (female || kid ? 2000 : 1700) + R() * 1100,                                              // the murmur's low-pass
    seed: hash(key || name),
  };
}

// The line as syllables: [{ onset, vowel, coda, word end?, pause after (s), stress }]
export function syllables(text) {
  const out = [], words = String(text || '').replace(/[“”"]/g, '').split(/\s+/).filter(Boolean);
  for (const raw of words) {
    const w = raw.toLowerCase(), punct = /[.!?;:]$/.test(raw) ? (/[?]$/.test(raw) ? '?' : /[!]$/.test(raw) ? '!' : '.') : /[,—–-]$/.test(raw) ? ',' : '';
    const letters = w.replace(/[^a-z']/g, '');
    if (!letters) { if (punct && out.length) out[out.length - 1].pause = Math.max(out[out.length - 1].pause, punct === ',' ? 0.16 : 0.26); continue; }
    // vowel groups: each is a syllable, its onset the consonants before it
    const re = /([^aeiouy]*)([aeiouy]+)/g;
    let m, n = 0, last = 0;
    const here = [];
    while ((m = re.exec(letters))) { here.push({ onset: m[1].replace(/'/g, ''), vowel: m[2], coda: '' }); last = re.lastIndex; n++; }
    if (!here.length) here.push({ onset: letters.slice(0, 1), vowel: 'ə', coda: '' });
    const tail = letters.slice(last).replace(/'/g, '');
    if (tail) here[here.length - 1].coda = tail;
    // a silent final e ("store", "time") is not a syllable of its own
    if (here.length > 1 && here[here.length - 1].vowel === 'e' && !here[here.length - 1].coda && here[here.length - 1].onset.length <= 2) { const e = here.pop(); here[here.length - 1].coda += e.onset; }
    here.forEach((s, i) => { s.stress = i === 0 && here.length > 1 ? 1 : 0; s.end = i === here.length - 1; s.pause = 0; s.mark = ''; });
    const end = here[here.length - 1];
    end.pause = punct === ',' ? 0.16 : punct ? 0.26 : 0.035;
    end.mark = punct;
    out.push(...here);
  }
  return out;
}

const vowelOf = (v) => { const c = v[0]; return FORMANTS[c] ? c : 'ə'; };

// Say `text` in `voice` on the kit (a Voice). Returns { end, syllables, secs }: end in the context's seconds.
export function speak(kit, text, voice, { max = 2.2, gain = 1, mood = null } = {}) {
  const ctx = kit.ctx, t0 = kit.t, V = voice || voiceOf({});
  const all = syllables(text);
  if (!all.length) return { end: t0, syllables: 0, secs: 0 };
  const R = rng32((V.seed ^ hash(String(text))) >>> 0);
  const question = /\?\s*["”]?\s*$/.test(String(text)), bang = /!\s*["”]?\s*$/.test(String(text)) || mood === 'loud';
  const quiet = mood === 'quiet';
  // the syllables said: up to `max` seconds, to the end of a word
  const dur = (s) => (0.075 + 0.02 * Math.min(3, s.vowel.length) + (s.stress ? 0.025 : 0) + (s.coda ? 0.02 : 0)) / V.rate;
  const said = []; let secs = 0;
  for (const s of all) { said.push(s); secs += dur(s) + s.pause / V.rate; if (secs >= max && s.end) break; }
  const lastWord = said.length === all.length;
  const N = said.length;

  // the buzz and the breath, into three formant bands, summed, softened
  const end0 = t0 + secs + 0.4;
  const src = kit.osc('sawtooth', V.f0, t0, end0);
  const vib = kit.osc('sine', 4.6 + R() * 1.4, t0, end0), vd = kit.gain(V.f0 * V.wobble);
  vib.connect(vd); vd.connect(src.frequency);
  const jit = kit.gain(V.f0 * (V.rasp ?? 0.012)); kit.noise('pink', jit); jit.connect(src.frequency); // a little roughness in the pitch
  const pre = kit.filter('lowpass', 3400, 0.5); src.connect(pre);
  const buzz = kit.gain(1); pre.connect(buzz);
  const breath = kit.gain(V.breath * 0.9); kit.noise('pink', breath);
  const amp = kit.gain(0);
  const bands = [0, 1, 2].map((i) => kit.filter('bandpass', FORMANTS.ə[i] * V.form, [7, 9, 11][i]));
  const lv = [1, 0.55, 0.22];
  const mixed = kit.gain(1);
  bands.forEach((b, i) => { buzz.connect(b); breath.connect(b); const g = kit.gain(lv[i] * (i ? 1 : 1.4)); b.connect(g); g.connect(mixed); });
  const hum = kit.filter('lowpass', 420 * V.form, 0.7); buzz.connect(hum); const humG = kit.gain(0); hum.connect(humG); humG.connect(amp); // m, n
  mixed.connect(amp);
  const soft = kit.filter('lowpass', V.bright, 0.6), soft2 = kit.filter('lowpass', V.bright * 1.25, 0.5); amp.connect(soft); soft.connect(soft2);
  const out = kit.gain(gain * (bang ? 1.25 : quiet ? 0.6 : 1) * 0.9); soft2.connect(out); out.connect(kit.input);
  // consonant onsets: white noise through a band each time, into the same soft path
  const hissBand = kit.filter('bandpass', 5000, 1.4), hissG = kit.gain(0); kit.noise('white', hissBand); hissBand.connect(hissG); hissG.connect(soft);

  const F = src.frequency, A = amp.gain, H = humG.gain, S = hissG.gain;
  A.setValueAtTime(TINY, t0); H.setValueAtTime(0, t0); S.setValueAtTime(0, t0);
  const base = V.f0 * (bang ? 1.1 : 1);
  F.setValueAtTime(base, t0);
  let t = t0 + 0.02;
  said.forEach((s, i) => {
    const d = dur(s), k = i / Math.max(1, N - 1);
    // the pitch: a slow fall over the phrase, a lift on a stressed syllable, a rise at a question's end
    const L = V.lilt ?? 1;
    let f = base * (1 + L * (0.06 - 0.16 * k)) * (1 + (R() - 0.5) * 0.09 * L) * (1 + (s.stress ? 0.07 * L : 0));
    if (question && lastWord && i >= N - 2) f *= i === N - 1 ? 1 + 0.32 * Math.max(0.8, L) : 1.12;
    if (!question && lastWord && i === N - 1) f *= 1 - 0.1 * L;
    const oc = s.onset.slice(-1), soft = oc === 'c' && /^[eiy]/.test(s.vowel);
    const on = oc === 'c' && !soft ? ONSET.k : ONSET[oc] || (s.onset ? ONSET[s.onset[0]] : null);
    let tv = t; // the vowel's start
    if (on) {
      const [kind, fc, Q, len, lvl] = on;
      if (kind === 'hiss' || kind === 'breath' || kind === 'tick') {
        hissBand.frequency.setValueAtTime(fc * (kind === 'hiss' ? Math.min(1.15, V.form) : V.form), t); hissBand.Q.setValueAtTime(Q, t);
        S.setValueAtTime(0, t); S.linearRampToValueAtTime(lvl * (kind === 'tick' ? 0.6 : 1) * (quiet ? 0.7 : 1), t + Math.max(0.004, Math.min(0.012, len * 0.4))); S.linearRampToValueAtTime(0, t + len);
        tv = t + len * (kind === 'tick' ? 0.8 : 0.7);
      } else if (kind === 'hum') {
        H.setValueAtTime(0, t); H.linearRampToValueAtTime(0.5, t + 0.015); H.linearRampToValueAtTime(0, t + len + 0.02);
        A.setTargetAtTime(0.12, t, 0.012);
        tv = t + len;
      } else tv = t + len * 0.5; // w, l, r: a glide into the vowel
    }
    // the vowel: the formants glide to it, the level up, held, down
    const v1 = vowelOf(s.vowel), v2 = s.vowel.length > 1 ? vowelOf(s.vowel.slice(-1)) : v1;
    const fA = FORMANTS[v1], fB = FORMANTS[v2], vEnd = tv + d;
    bands.forEach((b, j) => { b.frequency.setTargetAtTime(fA[j] * V.form * (0.97 + R() * 0.06), tv - 0.01, 0.018); if (v2 !== v1) b.frequency.setTargetAtTime(fB[j] * V.form, tv + d * 0.55, 0.03); });
    F.setTargetAtTime(f, tv - 0.01, 0.025);
    const peak = (s.stress ? 1 : 0.82) * (0.9 + R() * 0.2) * (i === N - 1 && !lastWord ? 0.7 : 1);
    A.setTargetAtTime(peak, tv, 0.012);
    const fall = s.end ? 0.035 : 0.018;
    A.setTargetAtTime(s.end ? TINY : peak * 0.45, vEnd - fall, fall * 0.45);
    if (s.coda && /[st]$/.test(s.coda)) { hissBand.frequency.setValueAtTime(5200, vEnd - 0.01); S.setValueAtTime(0, vEnd - 0.01); S.linearRampToValueAtTime(0.16, vEnd + 0.005); S.linearRampToValueAtTime(0, vEnd + 0.04); }
    t = vEnd + (s.end ? s.pause / V.rate : 0);
  });
  A.setTargetAtTime(TINY, t, 0.03);
  const end = t + 0.25;
  kit.until(end);
  return { end, syllables: N, secs: +(end - t0).toFixed(2) };
}
