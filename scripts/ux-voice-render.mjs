// Renders src/audio-speech.js offline (headless Chromium's OfflineAudioContext, no game, no Vite) to WAV files, for
// listening: each sample a person and a line, and one demo file of them all in a row.
//   node scripts/ux-voice-render.mjs [--out dir] [--max 2.2]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(arg('out', 'voice-samples'));
const MAX = Number(arg('max', 2.2));
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());

// [file, who, voice spec, line, options]
const SAMPLES = [
  ['01-josie-minute', 'Josie (the summer help)', { key: 'cast:josie', female: true }, 'Got a minute? Come to the counter.'],
  ['02-josie-gear', 'Josie', { key: 'cast:josie', female: true }, 'There\'s old gear in the back nobody rents. If you\'re not going to need it, it\'s yours.'],
  ['03-tauno-brm', 'Tauno (old man)', { key: 'cast:tauno', age: 'old' }, 'That\'s BRM fourteen.'],
  ['04-tauno-walk', 'Tauno', { key: 'cast:tauno', age: 'old' }, 'Walk with me. Not here.'],
  ['05-keeper-permit', 'A keeper (man)', { key: 'keeper:25', name: 'Dale' }, 'First permit\'s on us. Paddle safe out there!'],
  ['06-aili-coffee', 'Aili (old woman)', { key: 'cast:aili', female: true, age: 'old' }, 'Walt\'s sister, yes. Come in, the coffee\'s on.'],
  ['07-kid-leeches', 'A kid', { key: 'kid:1', age: 'kid' }, 'Want to see my leeches? I caught forty!'],
  ['08-tripper-question', 'A tripper (woman)', { key: 'visitor:7', female: true }, 'Did you come through the Kawishiwi? How was the carry?'],
  ['09-ranger', 'A ranger (man)', { key: 'visitor:ranger', name: 'Bob' }, 'Fire danger\'s high this week. Keep it small and drown it.'],
  ['10-long-capped', 'Josie, a long line (cut at about two seconds)', { key: 'cast:josie', female: true }, 'He came in every June for thirty years, same canoe, same pack, and one summer he just didn\'t, and nobody ever asked why.'],
];

const code = readFileSync(path.join(ROOT, 'src/audio-speech.js'), 'utf8').replace(/^export /gm, '');
const browser = await chromium.launch({ executablePath: process.env.CHROME });
try {
  const page = await (await browser.newContext()).newPage();
  await page.setContent('<!doctype html><title>voice</title>');
  await page.addScriptTag({ content: `${code}\nwindow.__speech = { voiceOf, speak, syllables };` });
  mkdirSync(OUT, { recursive: true });
  const SR = 44100, all = [];
  for (const [file, who, spec, line, opts] of SAMPLES) {
    const r = await page.evaluate(async ([spec, line, opts, SR, MAX]) => {
      const { voiceOf, speak } = window.__speech;
      const secs = 7, ctx = new OfflineAudioContext(1, SR * secs, SR);
      // the engine's running noises: looped white and pink buffers
      const mk = (pink) => { const b = ctx.createBuffer(1, SR * 2, SR), d = b.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (!pink) { d[i] = w * 0.5; continue; } b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; } const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; s.start(0); return s; };
      const src = { white: mk(false), pink: mk(true) };
      // a small room (the store): a short decaying noise impulse
      const ir = ctx.createBuffer(2, SR * 0.6, SR); for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / SR * 9) * 0.25; }
      const conv = ctx.createConvolver(); conv.buffer = ir;
      const master = ctx.createGain(); master.gain.value = 0.8; master.connect(ctx.destination);
      const input = ctx.createGain(); input.connect(master); const wet = ctx.createGain(); wet.gain.value = 0.18; input.connect(wet); wet.connect(conv); conv.connect(master);
      const kit = {
        ctx, t: 0.15, input, end: 0,
        osc(type, f, t0, t1) { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1); return o; },
        filter(type, f, Q = 0.7) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; },
        gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; },
        noise(kind, node) { src[kind].connect(node); return node; },
        until(t) { if (t > this.end) this.end = t; return this; },
      };
      const v = voiceOf(spec);
      const said = speak(kit, line, v, { max: MAX, ...(opts || {}) });
      const buf = await ctx.startRendering();
      const n = Math.min(buf.length, Math.ceil((said.end + 0.45) * SR));
      const d = buf.getChannelData(0).slice(0, n);
      let peak = 0; for (const x of d) peak = Math.max(peak, Math.abs(x));
      return { pcm: Array.from(d), voice: v, said, peak };
    }, [spec, line, opts || null, SR, MAX]);
    // normalise each sample to the same peak (-3 dBFS) so they compare; the game sets its own level
    const k = r.peak > 0 ? 0.7 / r.peak : 1, pcm = r.pcm.map((x) => x * k);
    writeWav(path.join(OUT, `${file}.wav`), pcm, SR);
    for (const x of pcm) all.push(x); for (let i = 0; i < Math.round(SR * 0.6); i++) all.push(0);
    console.log(file, who, `"${line}"`, `f0 ${r.voice.f0.toFixed(0)} Hz, form ${r.voice.form.toFixed(2)}, rate ${r.voice.rate.toFixed(2)}`, `${r.said.syllables} syllables, ${r.said.secs} s, raw peak ${r.peak.toFixed(3)}`);
  }
  writeWav(path.join(OUT, '00-all.wav'), all, SR);
  console.log('wrote', OUT);
} finally { await browser.close(); }

function writeWav(file, pcm, sr) {
  const n = pcm.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
  writeFileSync(file, b);
}
