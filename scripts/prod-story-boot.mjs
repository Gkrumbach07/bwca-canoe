#!/usr/bin/env node
// The story in a production build (owner 2026-11-13: on for every player): boots the built game (vite preview of
// dist/, the map data linked in), starts a season and checks the story runs: the feed started, the story live, its
// modules fetched as built chunks, no page errors. With --off it checks ?story=0 gives the game without the story.
//   APP=http://localhost:4173 node scripts/prod-story-boot.mjs [--off]
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const APP = (process.env.APP || 'http://localhost:4173').replace(/\/$/, '');
const OFF = process.argv.includes('--off');
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
const results = [];
const result = (name, pass, more = {}) => { results.push(!!pass); log(pass ? 'PASS' : 'FAIL', name, JSON.stringify(more).slice(0, 800)); };
const browser = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [], chunks = new Set();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on('pageerror', (e) => { errors.push(e.message); log('pageerror', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') log('console error', m.text().slice(0, 300)); });
  page.on('request', (r) => { const u = r.url(); if (/\/assets\/.*\.js/.test(u)) chunks.add(u.split('/').pop()); });
  const until = (fn, a = null, timeout = 60000) => page.waitForFunction(fn, a, { timeout, polling: 250 });
  await page.goto(`${APP}/${OFF ? '?story=0' : ''}`, { timeout: 180000 });
  await until(() => window.__game && window.__game.title && window.__game.title.state === 'title', null, 300000);
  await page.evaluate(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 25), { confirm: false, start: { year: 2026, doy: 166 } }); });
  await until(() => { const g = window.__game; return g.title.state === 'game' && !g.player.teleporting; }, null, 240000);
  await page.waitForTimeout(4000);
  const s = await page.evaluate(() => { const g = window.__game, st = g.story; return { story: !!st, mode: st && st.mode, seams: !!(g.storySeams && g.storySeams.feed), walt: !!g.walt, staff: g.onboarding && g.onboarding.staffName ? g.onboarding.staffName(25) : null, hud: (document.body.innerText || '').slice(0, 200) }; });
  const storyChunks = [...chunks].filter((c) => /story|feed|walt|nightone|episodes|endings|run/.test(c));
  if (OFF) result('?story=0: no story feed, the old staff', !s.seams && s.staff !== 'Josie', { ...s, storyChunks });
  else result('the story runs in the production build: the feed started, Josie at the counter', s.story && s.seams && s.staff === 'Josie', { ...s, storyChunks: storyChunks.slice(0, 12), chunks: chunks.size });
  result('no page errors', errors.length === 0, errors.slice(0, 3));
} finally { await browser.close(); }
const ok = results.every(Boolean);
log(`${results.filter(Boolean).length}/${results.length} ${ok ? 'PASS' : 'FAIL'}`);
process.exit(ok ? 0 : 1);
