// The dependency recorder for scripts/rigs.mjs --record: preloaded into a rig's node process (NODE_OPTIONS="--import
// <this file>"), it patches playwright-core's chromium.launch so every page the rig opens runs with V8 JS coverage, and
// every request the page makes is noted. When a page, a context or the browser is closed (and at exit) it writes what the
// rig touched to $RIG_DEPS_OUT:
//   { files: ["src/main.js", ...]                    every /src/ file the pages requested (modules, workers, data)
//     fetched: ["src/player.js", ...]                /src/ files read as text by fetch (a rig reading the source)
//     fns: { "src/truck.js": { all: [[s, e], ...],   every function V8 reported in the file, in the file's own lines
//                              hit: [[s, e], ...] } } those that ran (count > 0) on any page of this rig }
// Line numbers are 1-based lines of the file on disk (Vite's served text is aligned back to it line by line). Code that
// runs in a worker (tile-worker.js and what it imports) is not covered here: the selector takes those files whole.
// Nothing changes for the rig itself; without RIG_DEPS_OUT this file does nothing.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const OUT = process.env.RIG_DEPS_OUT;
if (OUT) {
  const req = createRequire(path.join(process.cwd(), 'package.json'));
  let pw = null;
  try { pw = req(process.env.PW || 'playwright-core'); } catch (e) { console.error('rig-deps-hook: no playwright-core', e.message); }
  const files = new Set(), fetched = new Set(), fns = new Map(); // fns: path -> { all: Map(key -> [s, e]), hit: Set(key) }
  const live = new Set(); // pages with coverage running
  const srcOf = (u) => { try { const p = new URL(u).pathname; return p.startsWith('/src/') ? decodeURIComponent(p.slice(1)) : null; } catch { return null; } };

  // Vite's served text against the file on disk: served line index -> file line index (0-based)
  const align = (served, orig) => {
    const S = served.split('\n'), O = orig.split('\n'), map = new Int32Array(S.length);
    let i = 0, j = 0;
    while (j < S.length) {
      if (i >= O.length) { map[j++] = O.length - 1; continue; }
      if (S[j] === O[i]) { map[j++] = i++; continue; }
      let k = 1; while (k <= 6 && j + k < S.length && S[j + k] !== O[i]) k++;
      if (k <= 6 && j + k < S.length) { while (k-- > 0) map[j++] = i; continue; } // served lines Vite added
      let d = 1; while (d <= 6 && i + d < O.length && O[i + d] !== S[j]) d++;
      if (d <= 6 && i + d < O.length) { i += d; continue; } // file lines Vite dropped
      map[j++] = i++; // a line rewritten in place (an import's path)
    }
    return map;
  };
  const lineStarts = (t) => { const a = [0]; for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 10) a.push(k + 1); return a; };
  const lineOf = (starts, off) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo; };

  const take = (entries) => {
    for (const e of entries) {
      const p = srcOf(e.url); if (!p || !/\.(m?js)$/.test(p) || !e.source) continue;
      let orig; try { orig = readFileSync(path.join(process.cwd(), p), 'utf8'); } catch { continue; }
      const map = align(e.source, orig), starts = lineStarts(e.source);
      let F = fns.get(p); if (!F) fns.set(p, (F = { all: new Map(), hit: new Set() }));
      for (const f of e.functions) {
        const r = f.ranges[0]; if (!r) continue;
        const s = map[lineOf(starts, r.startOffset)] + 1, en = map[lineOf(starts, Math.max(r.startOffset, r.endOffset - 1))] + 1;
        const key = s + ',' + en; F.all.set(key, [s, en]);
        if (r.count > 0) F.hit.add(key);
      }
    }
  };
  const write = () => {
    const o = { files: [...files].sort(), fetched: [...fetched].sort(), fns: {} };
    for (const [p, F] of [...fns].sort((a, b) => (a[0] < b[0] ? -1 : 1))) o.fns[p] = { all: [...F.all.values()], hit: [...F.hit].map((k) => F.all.get(k)) };
    try { mkdirSync(path.dirname(OUT), { recursive: true }); writeFileSync(OUT, JSON.stringify(o)); } catch (e) { console.error('rig-deps-hook: write', e.message); }
  };
  const stop = async (page) => {
    if (!live.has(page)) return; live.delete(page);
    try { take(await page.coverage.stopJSCoverage()); } catch { /* the page is gone */ }
    write();
  };
  const watch = async (page) => {
    page.on('request', (r) => { const p = srcOf(r.url()); if (!p) return; files.add(p); const t = r.resourceType(); if (t === 'fetch' || t === 'xhr') fetched.add(p); });
    page.on('worker', (w) => { const p = srcOf(w.url()); if (p) files.add(p); });
    try { await page.coverage.startJSCoverage({ resetOnNavigation: false }); live.add(page); } catch (e) { console.error('rig-deps-hook: coverage', e.message); }
    const close = page.close.bind(page);
    page.close = async (...a) => { await stop(page); return close(...a); };
  };
  const wrapContext = (ctx) => {
    if (ctx.__rigDeps) return ctx; ctx.__rigDeps = true;
    const newPage = ctx.newPage.bind(ctx), close = ctx.close.bind(ctx);
    ctx.newPage = async (...a) => { const p = await newPage(...a); await watch(p); return p; };
    ctx.close = async (...a) => { for (const p of ctx.pages()) await stop(p); return close(...a); };
    return ctx;
  };
  const wrapBrowser = (b) => {
    const newContext = b.newContext.bind(b), newPage = b.newPage.bind(b), close = b.close.bind(b);
    b.newContext = async (...a) => wrapContext(await newContext(...a));
    b.newPage = async (...a) => { const p = await newPage(...a); await watch(p); return p; };
    b.close = async (...a) => { for (const c of b.contexts()) for (const p of c.pages()) await stop(p); write(); return close(...a); };
    return b;
  };
  if (pw && pw.chromium) {
    const launch = pw.chromium.launch.bind(pw.chromium);
    pw.chromium.launch = async (...a) => wrapBrowser(await launch(...a));
    if (pw.chromium.launchPersistentContext) { const lpc = pw.chromium.launchPersistentContext.bind(pw.chromium); pw.chromium.launchPersistentContext = async (...a) => wrapContext(await lpc(...a)); }
  }
  process.on('exit', write); // (what was gathered so far, if the rig exits with pages still open)
}
