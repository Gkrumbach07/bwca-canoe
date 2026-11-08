// A hand-driven headless Chromium for a replay (r2 replay): pages kept open, driven over a small local HTTP port.
//   APP=http://localhost:5207 PORT=5297 node scripts/r2-drive.mjs
//   curl -s localhost:5297/open -d '{"name":"a","query":""}'        a page (its own browser) at APP + query
//   curl -s localhost:5297/js?p=a --data-binary 'return window.__game.title.state'   an async function body, run in the page
//   curl -s localhost:5297/act?p=a -d '{"do":"key","k":"KeyE"}'      key | down | up | click (sel or x,y) | rclick | shot (path) | type
import http from 'node:http';
import { createRequire } from 'node:module';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
const APP = process.env.APP || 'http://localhost:5207', PORT = Number(process.env.PORT || 5297);
function findPw() { if (process.env.PW) return process.env.PW; const base = path.join(homedir(), '.npm/_npx'); for (const d of existsSync(base) ? readdirSync(base) : []) { const p = path.join(base, d, 'node_modules/playwright-core'); if (existsSync(p)) return p; } return 'playwright-core'; }
function findChrome() { if (process.env.CHROME) return process.env.CHROME; const base = path.join(homedir(), 'Library/Caches/ms-playwright'); const shells = existsSync(base) ? readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []; const order = [...shells.filter((s) => s.endsWith('-1234')), ...shells.reverse()]; for (const s of order) for (const d of readdirSync(path.join(base, s))) { const p = path.join(base, s, d, 'chrome-headless-shell'); if (existsSync(p)) return p; } return undefined; }
const { chromium } = createRequire(import.meta.url)(findPw());
const pages = new Map(), logs = new Map();
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s)); });
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), p = u.searchParams.get('p') || 'a', b = await body(req);
  const send = (v) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v, null, 0) + '\n'); };
  try {
    if (u.pathname === '/open') {
      const o = JSON.parse(b || '{}'), br = await chromium.launch({ executablePath: findChrome(), args: ['--use-angle=metal', '--ignore-gpu-blocklist'] });
      const page = await (await br.newContext({ viewport: { width: o.w || 1280, height: o.h || 800 } })).newPage();
      const L = []; logs.set(o.name, L);
      page.on('pageerror', (e) => L.push(`pageerror ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') L.push(`${m.type()} ${m.text().slice(0, 300)}`); });
      pages.set(o.name, { br, page });
      await page.goto(APP + (o.query || ''), { timeout: 180000 });
      return send({ ok: true });
    }
    if (u.pathname === '/close') { const q = pages.get(p); if (q) await q.br.close(); pages.delete(p); return send({ ok: true }); }
    if (u.pathname === '/logs') { const L = logs.get(p) || []; const out = L.splice(0); return send(out); }
    const { page } = pages.get(p) || {};
    if (!page) return send({ error: `no page ${p}` });
    if (u.pathname === '/js') { const v = await page.evaluate(`(async () => { ${b} })()`); return send(v === undefined ? null : v); }
    if (u.pathname === '/act') {
      const o = JSON.parse(b);
      if (o.do === 'key') await page.keyboard.press(o.k, { delay: o.ms || 60 });
      else if (o.do === 'down') await page.keyboard.down(o.k);
      else if (o.do === 'up') await page.keyboard.up(o.k);
      else if (o.do === 'type') await page.keyboard.type(o.text);
      else if (o.do === 'click' || o.do === 'rclick') { const button = o.do === 'rclick' ? 'right' : 'left'; if (o.sel) await page.click(o.sel, { button, timeout: o.timeout || 10000 }); else await page.mouse.click(o.x, o.y, { button }); }
      else if (o.do === 'move') await page.mouse.move(o.x, o.y);
      else if (o.do === 'fill') await page.fill(o.sel, o.text);
      else if (o.do === 'goto') await page.goto(APP + (o.query || ''), { timeout: 180000 });
      else if (o.do === 'shot') await page.screenshot({ path: o.path });
      else if (o.do === 'wait') await page.waitForFunction(`(() => { ${o.fn} })()`, null, { timeout: o.timeout || 120000, polling: 250 });
      return send({ ok: true });
    }
    send({ error: 'what?' });
  } catch (e) { send({ error: String(e && e.message || e).slice(0, 1500) }); }
}).listen(PORT, '127.0.0.1', () => console.log('drive on', PORT));
