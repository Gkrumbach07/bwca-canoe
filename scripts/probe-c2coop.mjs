// probe (c2-fix): chk-coop's guest season 1 left running (as while the host boots): does its own story move?
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const APP = (process.env.APP || 'http://localhost:5995').replace(/\/$/, ''), RELAY = process.env.RELAY || '';
const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
const { chromium } = createRequire(import.meta.url)(findPw());
const secs = Number(process.argv[2] || 150);
for (let run = 0; run < Number(process.argv[3] || 2); run++) {
  const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const B = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await B.goto(`${APP}/?relay=${encodeURIComponent(RELAY)}&story=1`, { timeout: 180000 });
  await B.waitForFunction(() => window.__game && window.__game.title && window.__game.story && (window.__game.title.state === 'title' || window.__game.title.state === 'game') && typeof window.__game.step === 'function', null, { timeout: 300000, polling: 500 });
  await B.evaluate(async () => { const g = window.__game; g.title.setPick('adventure'); await g.title.newSeason(g.world.entryPoints.find((e) => e.ep === 31), { confirm: false, start: { year: 2026, doy: 190 } }); });
  await B.waitForFunction(() => window.__game.title.state === 'game' && !window.__game.player.teleporting, null, { timeout: 150000, polling: 250 });
  await B.evaluate(async () => { const g = window.__game; g.walt.find({ key: 1, lake: 'Guest Own Lake' }); await new Promise((r) => setTimeout(r, 200)); g.story.debug.set('crews.seen'); g.story.flush(); g.slots.flush(); await new Promise((r) => setTimeout(r, 500)); });
  await B.evaluate(() => { const f = window.__game.storySeams.feed; window.__ev = []; f.tap((evt, data, how) => window.__ev.push(`${(window.__game.day.hours).toFixed(2)} ${evt}:${how}`)); });
  const own0 = await B.evaluate(() => window.__game.store.getItem('bwca-canoe:story2'));
  let last = '';
  const stepDt = Number(process.env.STEP_DT || 0);
  for (let t = 0; t < secs; t += 3) {
    if (stepDt) await B.evaluate((dt) => { window.__game.step(dt, Math.round(3 / dt)); }, stepDt); else await B.waitForTimeout(3000);
    const s = await B.evaluate(() => { const g = window.__game, o = g.outfitter, p = g.player; return { at: [+p.x.toFixed(1), +p.z.toFixed(1)], mode: p.mode, visit: o.visit ? `${o.visit.ep}:${o.visit.inside ? 'in' : 'out'}` : null, facts: Object.keys(g.story.facts()).join(','), ev: window.__ev.slice(-4), title: g.title.state, onb: g.onboarding && g.onboarding.pending ? g.onboarding.pending() : null, hours: +g.day.hours.toFixed(2) }; });
    const own = await B.evaluate(() => window.__game.store.getItem('bwca-canoe:story2'));
    const k = JSON.stringify({ ...s, hours: 0 });
    if (k !== last || own !== own0) { last = k; log(`run ${run} t=${t}`, JSON.stringify({ moved: own !== own0, ...s })); }
  }
  await b.close();
}
