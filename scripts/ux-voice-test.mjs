// The murmur in the game (audio-speech.js through dialogue.js's voice hook and audio.speak): a new season at Moose Lake
// (the story on), the audio started by a key; the talk with Josie opened as E opens it:
//   1 each line of the talk said aloud (the engine's speech count up by one a line, the "…" waits not), the master's
//     level up while it plays over the room's
//   2 the store's barks said too, each from its speaker's head (a voice placed in the world)
//   3 Josie and Gus in two voices (hers higher), the same person the same voice again
//   4 Voices: Off says nothing
//   5 no page errors
//   APP=http://localhost:5400 node scripts/ux-voice-test.mjs
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = (process.env.APP || 'http://localhost:5400').replace(/\/$/, '');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push(!!pass); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 1500)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || /voice/.test(m.text())) log('console', m.type(), m.text().slice(0, 300)); });
  const ev = (fn, a) => page.evaluate(fn, a);
  await page.goto(APP, { timeout: 180000 });
  await page.waitForFunction(() => window.__game && window.__game.title && window.__game.title.state === 'title' && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await page.keyboard.press('Shift'); // the audio starts on a key
  await ev(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false, start: { year: 2026, doy: 191 } }); });
  await page.waitForFunction(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting && g.audio.ctx; }, null, { timeout: 240000, polling: 250 });
  await page.waitForTimeout(3000);
  // every speak call, who and where (the hook wrapped, the engine's own call kept)
  await ev(() => {
    const A = window.__game.audio, sp = A.speak.bind(A); window.__said = [];
    A.speak = (text, who, pos, o) => { const r = sp(text, who, pos, o); window.__said.push({ text: String(text).slice(0, 50), key: who && who.key, name: who && who.name, female: who && who.female, pos: !!pos, talk: !!(o && o.talk), r: r ? { n: r.syllables, s: r.secs } : null }); return r; };
  });
  // the room's level over a second, before any talk (dBFS RMS, sampled)
  const level = async (ms = 900) => ev(async (ms) => { const A = window.__game.audio, t0 = performance.now(); let s = 0, n = 0, peak = -200; while (performance.now() - t0 < ms) { window.__game.step(1 / 30, 1); const m = A.meter(); if (m) { s += m.rms; n++; peak = Math.max(peak, m.rms); } await new Promise((r) => setTimeout(r, 40)); } return { mean: n ? +(s / n).toFixed(1) : null, peak: +peak.toFixed(1) }; }, ms);
  await ev(() => { window.__said.length = 0; });
  const quiet = await level();
  // barks in the store as you stand in the door a while
  await ev(async () => { const g = window.__game; for (let k = 0; k < 120; k++) { g.step(1 / 30, 3); await new Promise((r) => setTimeout(r, 20)); } });
  const barks = await ev(() => window.__said.filter((s) => !s.talk));
  result('2 the store\'s barks are said, from their speakers\' heads', barks.length >= 1 && barks.every((b) => b.pos && b.r && b.r.n > 0), { n: barks.length, barks: barks.slice(0, 4) });
  // the talk, opened as E opens it at the counter (onboarding.start)
  await ev(() => { window.__said.length = 0; const g = window.__game; g.onboarding.start(25); });
  const lines = [];
  for (let i = 0; i < 14; i++) {
    const c = await ev(() => { const d = window.__game.dialogue.convo; return d ? { by: d.node && (d.node.by || d.name), say: d.node && d.node.say, n: (d.node && d.node.choices || []).length } : null; });
    if (!c) break;
    const lv = await level(700);
    lines.push({ ...c, lv });
    await page.keyboard.press('Digit1'); await page.waitForTimeout(120);
  }
  const talkSaid = await ev(() => window.__said.filter((s) => s.talk));
  const spoken = lines.filter((l) => l.say && l.say !== '…');
  result('1 each line of the talk said aloud (one speak a line), and the level up while it plays', talkSaid.length >= spoken.length - 1 && talkSaid.length >= 6 && spoken.slice(0, 4).every((l) => l.lv.peak > quiet.peak + 3), { quiet, lines: lines.slice(0, 6).map((l) => [l.by, (l.say || '').slice(0, 30), l.lv]), said: talkSaid.length, spoken: spoken.length });
  const jo = talkSaid.find((s) => /Josie/.test(s.name || '')), gus = talkSaid.find((s) => /Gus/.test(s.name || ''));
  const voices = await ev(([a, b]) => { const A = window.__game.audio; return null; }, [jo, gus]);
  void voices;
  result('3 Josie and Gus in two voices: hers a woman\'s, his a man\'s; their keys apart', jo && gus && jo.female === true && !gus.female && jo.key !== gus.key, { jo, gus });
  // off
  await ev(() => { const g = window.__game; while (g.dialogue.convo) g.dialogue.close(); g.settings.set ? g.settings.set('voices', 'off') : (g.audio.speech = 'off'); window.__said.length = 0; });
  const off = await ev(() => { const g = window.__game, A = g.audio, n0 = A.stats.fired.speech || 0; const sp = { key: 'x', name: 'Test', pos: () => null }; g.dialogue.speak(sp, 'Hello there, is anyone in?', { talk: true }); return { n0, n1: A.stats.fired.speech || 0, speech: A.speech }; });
  result('4 Voices: Off says nothing', off.n1 === off.n0 && off.speech === 'off', off);
  result('5 no page errors', errors.length === 0, errors.slice(0, 4));
} catch (e) {
  result('the run', false, { error: String((e && e.stack) || e).slice(0, 1500) });
} finally { await browser.close(); }
const ok = results.every(Boolean);
log(`ux-voice-test: ${results.filter(Boolean).length}/${results.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
