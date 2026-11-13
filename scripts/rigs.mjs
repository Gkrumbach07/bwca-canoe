// The regression runner: the browser rigs in N workers against the one Vite (APP) and relay (RELAY) that
// ~/pw/bwca-run.sh started, longest first, then the timing-sensitive ones alone; one `RIG <name> exit=<c> :: <summary> ::
// <fails>` line per rig at the end, in RIGS order (the old loop-r4-all.sh lines), and the wall time.
//
//   ~/pw/bwca-run.sh <wt> <vite-port> <wrangler-port> -- node scripts/rigs.mjs [options] [rig ...]
//   (or scripts/loop-r4-all.sh, which calls this)
//
// Options (each also an environment variable):
//   --jobs N        JOBS=N      parallel workers (default 3). JOBS=1: one at a time in RIGS order, the old serial run
//   rig ...         RIGS="..."  the rigs to run (names as in scripts/, coop/ ones with their folder); default ALL below
//   --full          FULL=1      the roads rigs' full sweeps (r4/r5-roads-test without --regress: about 40 + 60 min)
//   --solo "a b"    SOLO="..."  the rigs run alone, after the pool, nothing else running (default SOLO below)
//   --changed REF   CHANGED=REF only the rigs a change touches (below): REF against the working tree, or A..B
//   --record        RECORD=1    record each rig's dependencies (scripts/rig-deps-hook.mjs) and write scripts/rig-deps.json
//   --dry                       print what would run (and why, with --changed) and stop
//   --merge-deps                write scripts/rig-deps.json from rig-logs/deps/*.json as they are (a recording cut short,
//                               or rigs recorded in several runs) and stop
//   --minfree MB    MINFREE=MB  a rig starts only while the host has this much memory available (default 5000; one
//                               rig's Chromium takes 3-4 GB on fedora's GPU; on ben's CPU r4-final-test alone passed 20 GB)
//   --retry         RETRY=1     a rig that failed in the pool is run once more alone; its line says "retried"
// Logs: rig-logs/<rig>.log (coop/x as coop_x.log). Times: scripts/rig-times.json, each rig's last duration (seconds),
// rewritten after every run but a --record one; it orders the pool, longest first. Timeouts as loop-r4-all.sh: 1500 s, 3600 s for
// r2-starter-test, r4-roads-test and r5-roads-test (exit 124 when one runs out, its whole process group stopped); three
// times those under --record.
// The runner exits 0 (as the old loop did); read the RIG lines.
//
// The regression mode of the roads rigs: r4-roads-test and r5-roads-test are passed --regress (a fixed sample of 19
// routes, the round-4 known spots and known failures among them; r5 four looks), unless FULL=1.
//
// Co-op rigs run in the pool like the rest: each opens its own room (coop.js newCode, a random six letters) in its own
// browser contexts, so two at once never meet; LANES below can put rigs that must not overlap in one lane.
//
// Running only what a change touches (--changed REF):
//   scripts/rig-deps.json (made by --record: every rig run once with V8 coverage) holds, per src file, the rigs that
//   loaded it and, per function, the rigs that ran it. The changed lines of a src .js file (git diff -U0 from the merge
//   base) pick the rigs that ran the innermost function holding each line (module top-level code: every rig that
//   loaded the file); lines are mapped from the merge base's copy to the recorded copy by git's own diff of the two.
//   Whole-file picks (every rig that loaded it): .css, tile-worker.js and what it imports
//   (worker code is not covered), a file whose recorded copy is not in this repo; and a rig that fetched a file's
//   source as text (r4-roads-test reads player.js) takes that file whole.
//   ALL rigs: package*.json, vite.config.*, index.html, public/, server/ for the co-op rigs only, a src .bin/.json data
//   file that any recorded rig loaded (a data file no rig loaded, such as story text behind STORY_ON, picks none), and
//   rig-deps.json missing or recorded at a commit this repo does not have.
//   A rig's own script (and the scripts/ modules and src/ files it imports in node) picks that rig; a rig with no
//   record is picked. docs/, *.md and the runner's own files pick nothing. SMOKE below is always added.
//   Hunks that only touch comments or blank lines, and a package.json whose "scripts" alone changed, pick nothing.
//   It prints each pick and its reason. Re-record (--record) after a round lands: coverage says what ran then.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);
export const ALL = 'gl-a-test gl-b-test gl-c-test gl-d-test gl-e-test gl-join-test glf-f1-store-ui-test glf-f2-trip-tasks-test glf-f3-names-keepers-test gl-ground-lint r2-tickets-test r2-pma-test r2-starter-test r2-join-test r2-wizard-test r2-markers-test r2-ep-check r2-npc-motion-test r2-npc2-test r3-replay-test r3-replay-play r3-start-test r3-guide-test r3-join-test r3-journal-test r3-locator-test r3-final-test r3-final-play edge-test e3-roads-test loop-tasks-test coop/game-loop coop/give coop/adventure coop/parties coop/r2-replay loop-r4-test r4-loopfix-test r4-roads-test r5-roads-test round4-test r4-body-test r4-tut-test r4-cabins-test r4-final-test r5-mapkit-test r5-fixes-test r5-final-test r4-doorstep-check'.split(' ');
// known flaky under timing (rerun once): run alone
export const SOLO = 'gl-e-test r2-npc2-test r3-journal-test r3-final-play r4-loopfix-test'.split(' ');
// always picked by --changed: of the rigs that are not flaky, the three whose recorded coverage together runs the most of
// the game's functions (2405 of the 3932 that tell rigs apart): r3-start-test (a new season from the title, the wizard,
// the outfitter's start), r4-final-test (the round-4 loop: drive, permit, carry, cabins, the truck), coop/adventure (two
// browsers on the relay). (r3-final-play covers most alone, 2371, but is flaky.)
export const SMOKE = ['r3-start-test', 'r4-final-test', 'coop/adventure'];
const LANES = {}; // rig -> lane name: rigs in one lane never run at once (none needed: see Co-op above)
const TIMEOUT = { 'r2-starter-test': 3600, 'r4-roads-test': 3600, 'r5-roads-test': 3600 };
const REGRESS_ARGS = { 'r4-roads-test': ['--regress'], 'r5-roads-test': ['--regress'] };
const TIMES = 'scripts/rig-times.json', DEPS = 'scripts/rig-deps.json', HOOK = 'scripts/rig-deps-hook.mjs';
const RUNNER_FILES = new Set(['scripts/rigs.mjs', HOOK, TIMES, DEPS, 'scripts/loop-r4-all.sh']);

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (k) => { const i = argv.indexOf(`--${k}`); if (i < 0) return false; argv.splice(i, 1); return true; };
const env = process.env;
const on = (v) => v === '1' || v === 'true' || v === 'yes';

const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', o.quiet ? 'ignore' : 'inherit'] });
const git = (...a) => sh('git', a, { quiet: true });
const fmt = (s) => (s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : s >= 60 ? `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`);
const now = () => new Date().toTimeString().slice(0, 8);
const logName = (r) => `rig-logs/${r.replace(/\//g, '_')}.log`;

// ---- the selector ------------------------------------------------------------------------------------------------------
// static imports of a JS file (relative ones), resolved; for the rigs' node-side graph and tile-worker.js's
const importsOf = (file, text) => {
  const out = [], re = /(?:^|[^\w.])(?:import|export)\s*(?:[^'"()]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;
  for (let m; (m = re.exec(text));) out.push(path.normalize(path.join(path.dirname(file), m[1] || m[2])));
  return out;
};
const closure = (start, read) => {
  const seen = new Set(), todo = [start];
  while (todo.length) { const f = todo.pop(); if (seen.has(f)) continue; seen.add(f); const t = read(f); if (t != null) todo.push(...importsOf(f, t)); }
  return seen;
};
const readAt = (rev) => (f) => { try { return rev ? git('show', `${rev}:${f}`) : readFileSync(f, 'utf8'); } catch { return null; } };
// old-side line ranges of each changed file: { file: [[a, b], ...] } (an insertion after line n: [n, n + 1])
// (a hunk whose every removed and added line is blank or a comment changes no code: it is left out, and counted)
const commentOnly = (t) => { const x = t.trim(); return !x || x.startsWith('//') || x.startsWith('*') || x.startsWith('/*'); };
const changedLines = (from, to) => {
  const out = {}, skipped = {}, args = ['diff', '-U0', '--no-color', '--no-ext-diff', '-M', from]; if (to) args.push(to);
  let cur = null, h = null;
  const close = () => { if (h && cur) { if (/\.(m?js|css)$/.test(cur) && h.lines.every(commentOnly)) skipped[cur] = (skipped[cur] || 0) + 1; else out[cur].push(h.range); } h = null; };
  for (const l of git(...args).split('\n')) {
    let m;
    if ((m = /^diff --git a\/(.+?) b\/(.+)$/.exec(l))) { close(); cur = m[1]; out[cur] = out[cur] || []; if (m[2] !== m[1]) out[m[2]] = out[m[2]] || []; continue; }
    if (cur && (m = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/.exec(l))) { close(); const a = +m[1], n = m[2] == null ? 1 : +m[2]; h = { range: n === 0 ? [a, a + 1] : [a, a + n - 1], lines: [] }; continue; }
    if (h && /^[-+]/.test(l) && !/^(---|\+\+\+) /.test(l)) h.lines.push(l.slice(1));
  }
  close();
  return { out, skipped };
};
// package.json: only its "scripts" changed (npm run names) is not the page's build
const pkgScriptsOnly = (base, to) => {
  try {
    const a = JSON.parse(git('show', `${base}:package.json`)), b = JSON.parse(to ? git('show', `${to}:package.json`) : readFileSync('package.json', 'utf8'));
    delete a.scripts; delete b.scripts; return JSON.stringify(a) === JSON.stringify(b);
  } catch { return false; }
};
// base-copy line -> recorded-copy line, from git's diff of the two blobs
const lineMap = (recBlob, baseBlob) => {
  if (!recBlob || !baseBlob || recBlob === baseBlob) return (l) => l;
  const hunks = []; // [recStart, recLen, baseStart, baseLen] (git diff -U0 <recorded> <base>)
  for (const l of git('diff', '-U0', '--no-color', recBlob, baseBlob).split('\n')) { const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(l); if (m) hunks.push([+m[1], m[2] == null ? 1 : +m[2], +m[3], m[4] == null ? 1 : +m[4]]); }
  return (l) => {
    let delta = 0;
    for (const [os, ol, ns, nl] of hunks) {
      const end = nl > 0 ? ns + nl - 1 : ns;
      if (nl > 0 && l >= ns && l <= end) return ol > 0 ? os + Math.min(l - ns, ol - 1) : Math.max(1, os); // a line the record has not got: its place there
      if (end < l) delta += ol - nl; else break;
    }
    return l + delta;
  };
};
const maskRigs = (deps, hex) => { const m = BigInt('0x' + (hex || '0')), out = []; deps.rigs.forEach((r, i) => { if ((m >> BigInt(i)) & 1n) out.push(r); }); return out; };

export function select(spec, rigs, { log = console.log } = {}) {
  const [from0, to] = spec.includes('..') ? spec.split(/\.{2,3}/) : [spec, null];
  const base = git('merge-base', from0, to || 'HEAD').trim();
  const picks = new Map(); // rig -> [reasons]
  const pick = (r, why) => { if (!rigs.includes(r)) return; if (!picks.has(r)) picks.set(r, []); const a = picks.get(r); if (a.length < 4 && !a.includes(why)) a.push(why); };
  const all = (why) => { for (const r of rigs) pick(r, why); };
  const { out: changed, skipped } = changedLines(base, to);
  const files = Object.keys(changed);
  log(`changed: ${files.length} files, ${spec} (merge base ${base.slice(0, 8)}${to ? '' : ', against the working tree'})`);
  let deps = null, stale = null;
  if (!existsSync(DEPS)) stale = `${DEPS} missing`;
  else {
    deps = JSON.parse(readFileSync(DEPS, 'utf8'));
    try { git('cat-file', '-e', `${deps.sha}^{commit}`); } catch { stale = `${DEPS} recorded at ${String(deps.sha).slice(0, 8)}, not in this repo`; }
  }
  if (stale) { all(stale); log(`  ALL: ${stale}`); }
  const byFile = deps ? deps.files : {};
  for (const r of rigs) if (deps && !deps.rigs.includes(r)) pick(r, 'no deps recorded for it');
  // the rigs' own scripts and what they import in node
  const nodeDeps = new Map();
  for (const r of rigs) { const f = `scripts/${r}.mjs`; for (const d of closure(f, readAt(to))) { if (!nodeDeps.has(d)) nodeDeps.set(d, []); nodeDeps.get(d).push(r); } }
  const worker = closure('src/tile-worker.js', readAt(to || null));
  for (const f of worker) for (const g of closure(f, readAt(base))) worker.add(g);
  const rigsOfFile = (f) => (byFile[f] ? maskRigs(deps, byFile[f].loaded) : []);
  const summary = [];
  for (const f of files) {
    const lines = changed[f], before = picks.size; let why = null;
    if (RUNNER_FILES.has(f)) why = 'the runner itself: none';
    else if (!lines.length && skipped[f]) why = 'comments only: none';
    else if (f === 'package.json' && pkgScriptsOnly(base, to)) why = 'its "scripts" only: none';
    else if (/^(package(-lock)?\.json|vite\.config\.[cm]?[jt]s|index\.html)$/.test(f) || f.startsWith('public/')) { all(`${f} (the page's build)`); why = 'ALL'; }
    else if (f.startsWith('server/')) { for (const r of rigs) if (r.startsWith('coop/')) pick(r, `${f} (the relay)`); why = 'the co-op rigs'; }
    if (!why && nodeDeps.has(f)) { for (const r of nodeDeps.get(f)) pick(r, f === `scripts/${r}.mjs` ? 'its own script' : `${f} (imported by its script in node)`); if (!f.startsWith('src/')) why = `${nodeDeps.get(f).length} rig scripts`; }
    if (!why && f.startsWith('src/') && !stale) {
      const rec = byFile[f], loaded = rigsOfFile(f);
      if (!rec) why = 'loaded by no recorded rig: none';
      else if (/\.(bin|json)$/.test(f)) { all(`${f} (data, loaded by ${loaded.length} rigs)`); why = 'data: ALL'; }
      else if (/\.css$/.test(f) || worker.has(f) || !rec.fns) {
        const k = /\.css$/.test(f) ? 'a stylesheet' : worker.has(f) ? 'worker code' : 'no coverage for it';
        for (const r of loaded) pick(r, `${f} (${k}: whole file)`); why = `${k}: ${loaded.length} rigs`;
      } else {
        for (const r of maskRigs(deps, rec.fetched)) pick(r, `${f} (its source read as text by the rig: whole file)`);
        let baseBlob = null; try { baseBlob = git('rev-parse', `${base}:${f}`).trim(); } catch { /* added in this change */ }
        let recOk = true; try { git('cat-file', '-e', rec.blob); } catch { recOk = false; }
        if (!recOk) { for (const r of loaded) pick(r, `${f} (recorded copy not in this repo: whole file)`); why = `whole file: ${loaded.length} rigs`; }
        else {
          const map = lineMap(rec.blob, baseBlob), fns = rec.fns, hitBy = new Set();
          for (const [a, b] of lines) for (let l = a; l <= b; l++) {
            const L = map(l); let best = null;
            for (const fn of fns) if (fn[0] <= L && L <= fn[1] && (!best || fn[1] - fn[0] < best[1] - best[0])) best = fn;
            const who = best ? maskRigs(deps, best[2]) : loaded; // (no listed function holds it: module top level, or a function every loading rig ran)
            for (const r of who) { hitBy.add(r); pick(r, `${f}:${l}${best ? ` (in the function at ${best[0]}-${best[1]})` : ' (run by every rig that loads it)'}`); }
          }
          why = `${hitBy.size} of the ${loaded.length} rigs that load it ran the changed lines`;
        }
      }
    }
    if (!why && f.startsWith('src/') && stale) why = 'ALL (stale deps)';
    if (!why) why = 'none';
    summary.push(`  ${f.padEnd(44)} ${String(lines.length).padStart(3)} hunks${skipped[f] ? ` (+${skipped[f]} comment-only)` : ''}  ${why}${picks.size > before ? `  (+${picks.size - before} new)` : ''}`);
  }
  for (const s of summary.slice(0, 200)) log(s);
  if (summary.length > 200) log(`  ... and ${summary.length - 200} more files`);
  for (const r of SMOKE) pick(r, 'smoke set');
  const out = rigs.filter((r) => picks.has(r));
  log(`picked ${out.length} of ${rigs.length}:`);
  for (const r of out) log(`  ${r.padEnd(28)} ${picks.get(r).join('; ')}`);
  return out;
}

// ---- recording -----------------------------------------------------------------------------------------------------------
function writeDeps(rigs, dir) {
  const sha = git('rev-parse', 'HEAD').trim(), names = [], per = [];
  for (const r of [...new Set([...ALL, ...rigs])]) { const f = path.join(dir, r.replace(/\//g, '_') + '.json'); if (!existsSync(f)) continue; names.push(r); per.push(JSON.parse(readFileSync(f, 'utf8'))); } // (every rig with a record there: a run of a few rigs re-records those and keeps the rest)
  const files = {};
  const bit = (i) => 1n << BigInt(i), hex = (m) => m.toString(16);
  per.forEach((d, i) => {
    for (const f of d.files) { files[f] = files[f] || { loaded: 0n }; files[f].loaded |= bit(i); }
    for (const f of d.fetched || []) { files[f] = files[f] || { loaded: 0n }; files[f].fetched = (files[f].fetched || 0n) | bit(i); }
  });
  // functions: the union of every function seen, each with the rigs that ran it; a function run by the same rigs as the
  // innermost one round it is left out (the lookup takes the innermost listed function: the same answer)
  const fnsOf = {};
  per.forEach((d, i) => {
    for (const [f, F] of Object.entries(d.fns || {})) {
      const m = (fnsOf[f] = fnsOf[f] || new Map());
      for (const [s, e] of F.all) { const k = s + ',' + e; if (!m.has(k)) m.set(k, [s, e, 0n]); }
      for (const [s, e] of F.hit) m.get(s + ',' + e)[2] |= bit(i);
    }
  });
  for (const [f, m] of Object.entries(fnsOf)) {
    files[f] = files[f] || { loaded: 0n };
    const list = [...m.values()].sort((a, b) => a[0] - b[0] || b[1] - a[1]), kept = [], stack = [];
    for (const fn of list) {
      while (stack.length && stack[stack.length - 1][1] < fn[0]) stack.pop();
      const parent = stack.length ? stack[stack.length - 1][2] : files[f].loaded;
      if (fn[2] !== parent) kept.push([fn[0], fn[1], hex(fn[2])]);
      stack.push(fn);
    }
    files[f].fns = kept;
  }
  for (const f of Object.keys(files)) { try { files[f].blob = git('rev-parse', `HEAD:${f}`).trim(); } catch { files[f].blob = null; } files[f].loaded = hex(files[f].loaded); if (files[f].fetched) files[f].fetched = hex(files[f].fetched); }
  const sorted = Object.fromEntries(Object.keys(files).sort().map((f) => [f, files[f]]));
  writeFileSync(DEPS, JSON.stringify({ sha, recorded: new Date().toISOString(), rigs: names, files: sorted }, null, 0).replace(/("src\/[^"]+":)/g, '\n$1') + '\n');
  console.log(`wrote ${DEPS}: ${names.length} rigs, ${Object.keys(files).length} files, at ${sha.slice(0, 8)}`);
}

// ---- running -------------------------------------------------------------------------------------------------------------
const summarize = (file) => {
  let t = ''; try { t = readFileSync(file, 'utf8'); } catch { /* none */ }
  const L = t.split('\n');
  const s = (L.filter((l) => /[0-9]+\/[0-9]+ (passed|checks)|passed|broken|FAIL/.test(l)).pop() || '').slice(0, 200);
  const fl = L.filter((l) => /^\S+ +FAIL|  FAIL/.test(l)).slice(0, 4).map((l) => l.slice(0, 160) + '|').join('');
  return { s, fl };
};

function runOne(r, { full, record, depsDir }) {
  return new Promise((resolve) => {
    mkdirSync('rig-logs', { recursive: true });
    const f = logName(r), fd = openSync(f, 'w'), t0 = Date.now(), limit = (TIMEOUT[r] || 1500) * 1000 * (record ? 3 : 1); // (coverage makes a rig 2-4 times slower: a recording gets three times the time, so it is not cut short)
    const e = { ...env };
    if (record) { e.RIG_DEPS_OUT = path.join(depsDir, r.replace(/\//g, '_') + '.json'); e.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --import ${pathToFileURL(path.join(ROOT, HOOK)).href}`.trim(); }
    const args = [`scripts/${r}.mjs`, ...(full ? [] : REGRESS_ARGS[r] || [])];
    const p = spawn(process.execPath, args, { cwd: ROOT, env: e, stdio: ['ignore', fd, fd], detached: true });
    let timedOut = false;
    const kill = (sig) => { try { process.kill(-p.pid, sig); } catch { /* gone */ } };
    const timer = setTimeout(() => { timedOut = true; kill('SIGTERM'); setTimeout(() => kill('SIGKILL'), 10000); }, limit);
    running.add(kill);
    p.on('close', (code, sig) => {
      clearTimeout(timer); running.delete(kill); closeSync(fd);
      kill('SIGKILL'); // (a Chromium the rig left behind)
      resolve({ r, code: timedOut ? 124 : code ?? 128 + (sig === 'SIGKILL' ? 9 : 15), secs: (Date.now() - t0) / 1000 });
    });
  });
}
const running = new Set();
const memAvail = () => { try { const m = /MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8')); return m ? +m[1] / 1024 : Infinity; } catch { return Infinity; } };
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { for (const k of running) k('SIGTERM'); process.exit(130); });

async function main() {
  const jobs = Math.max(1, Number(opt('jobs') || env.JOBS || 3));
  const changedSpec = opt('changed') || env.CHANGED;
  const soloArg = opt('solo');
  const minFree = Number(opt('minfree') || env.MINFREE || 5000);
  if (flag('merge-deps')) { writeDeps(argv.length ? argv : env.RIGS ? env.RIGS.trim().split(/\s+/) : ALL, 'rig-logs/deps'); return; }
  const full = flag('full') || on(env.FULL), record = flag('record') || on(env.RECORD), dry = flag('dry'), retry = flag('retry') || on(env.RETRY);
  let rigs = argv.length ? argv : env.RIGS ? env.RIGS.trim().split(/\s+/) : ALL;
  const missing = rigs.filter((r) => !existsSync(`scripts/${r}.mjs`));
  if (missing.length) console.log(`no such rig: ${missing.join(' ')}`);
  if (changedSpec) rigs = select(changedSpec, rigs);
  if (dry || !rigs.length) { if (!changedSpec) console.log(rigs.join('\n')); return; }
  const solo = new Set((soloArg ?? env.SOLO ?? SOLO.join(' ')).split(/\s+/).filter(Boolean));
  let times = {}; try { times = JSON.parse(readFileSync(TIMES, 'utf8')); } catch { /* first run */ }
  const key = (r) => (full && REGRESS_ARGS[r] ? `${r} full` : r);
  const est = (r) => times[key(r)] ?? 300;
  const depsDir = 'rig-logs/deps';
  if (record) mkdirSync(depsDir, { recursive: true });
  const T0 = Date.now(), results = new Map();
  console.log(`${now()} ${rigs.length} rigs, jobs=${jobs}${full ? ', FULL' : ''}${record ? ', recording deps' : ''}; app ${env.APP || '(APP unset)'} relay ${env.RELAY || '-'}`);
  const done = (x, how) => { results.set(x.r, x); console.log(`  ${now()} ${how} ${x.r} exit=${x.code} ${fmt(x.secs)} [${results.size}/${rigs.length}]`); };
  if (jobs === 1) {
    for (const r of rigs) done(await runOne(r, { full, record, depsDir }), 'done');
  } else {
    const pool = rigs.filter((r) => !solo.has(r)).sort((a, b) => est(b) - est(a));
    const lanesBusy = new Set(); let active = 0;
    await new Promise((resolve) => {
      let waiting = null, lastStart = 0, warned = false;
      const next = () => {
        if (!pool.length && !active) return resolve();
        while (active < jobs && pool.length) {
          // (the first always starts; another waits 20 s after the last start, so that one's Chromium has taken its memory,
          // and for minfree MB available)
          const since = Date.now() - lastStart, low = memAvail() < minFree;
          if (active > 0 && (since < 20000 || low)) {
            if (low && !warned) { console.log(`  ${now()} waiting: ${Math.round(memAvail())} MB available, under ${minFree}`); warned = true; }
            if (!waiting) waiting = setTimeout(() => { waiting = null; next(); }, low ? 15000 : 20000 - since);
            break;
          }
          warned = false; lastStart = Date.now();
          const i = pool.findIndex((r) => !LANES[r] || !lanesBusy.has(LANES[r])); if (i < 0) break;
          const r = pool.splice(i, 1)[0]; active++; if (LANES[r]) lanesBusy.add(LANES[r]);
          runOne(r, { full, record, depsDir }).then((x) => { active--; if (LANES[r]) lanesBusy.delete(LANES[r]); done(x, 'done'); next(); });
        }
      };
      next();
    });
    for (const r of rigs.filter((q) => solo.has(q))) done(await runOne(r, { full, record, depsDir }), 'solo');
    if (retry) for (const r of rigs.filter((q) => !solo.has(q) && results.get(q).code !== 0)) {
      const first = results.get(r); const x = await runOne(r, { full, record: false, depsDir });
      x.retried = first.code; done(x, 'retry');
    }
  }
  const wall = (Date.now() - T0) / 1000;
  if (!record) for (const x of results.values()) times[key(x.r)] = Math.round(x.secs); // (coverage slows a recording run: its times are not kept)
  if (!record) writeFileSync(TIMES, JSON.stringify(Object.fromEntries(Object.keys(times).sort().map((k) => [k, times[k]])), null, 1) + '\n');
  for (const r of rigs) {
    const x = results.get(r), { s, fl } = summarize(logName(r));
    console.log(`RIG ${r} exit=${x.code} :: ${s} :: ${fl}${x.retried != null ? ` :: retried alone (first exit=${x.retried})` : ''}`);
  }
  const sum = [...results.values()].reduce((t, x) => t + x.secs, 0);
  console.log(`WALL ${fmt(wall)} (${Math.round(wall)} s) for ${rigs.length} rigs, jobs=${jobs}; the rigs' own times add up to ${fmt(sum)}; failed: ${[...results.values()].filter((x) => x.code !== 0).map((x) => x.r).join(' ') || 'none'}`);
  if (record) writeDeps(rigs, depsDir);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
