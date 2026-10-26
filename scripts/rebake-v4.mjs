#!/usr/bin/env node
// d2 bake: the whole v4 rebake in one go, into a folder beside the target, swapped in by rename when every step is done
// (a game reading the target meanwhile never sees half a bake).
//
//   BWCA_CACHE=/path/to/data-cache node scripts/rebake-v4.mjs [--out /path/to/public-data-v4] [--old public/data]
//
//   1. bake.mjs --all             the tiles (format v4), the far field, the index
//   2. rapids.mjs --grade none    the real falls and rapids over the new levels
//   3. rapids-bake.mjs            those drops baked into the tiles; src/rapids.json `v4` (the release's list of drops)
//   4. lake-facts.mjs --offline   src/lake-facts-v4.json, the DNR's facts joined to the new lake ids
//   5. v4-check.mjs               water and land agree, no lake lost, the entry points, the channels (against --old)
//   6. the swap: <out>.next -> <out> (the old one removed)
// It never writes the main checkout's public/data (bake.mjs refuses), and the scratch files go to <out>.work/.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CFG, log } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', CFG.outDir));
const old = arg('--old', 'public/data');
const next = out + '.next', work = out + '.work';
const env = { ...process.env, BWCA_CACHE: path.resolve(CFG.cacheDir) };
const node = (script, ...args) => {
  const t0 = Date.now();
  log(`> ${script} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, ['--max-old-space-size=12288', path.join('scripts', script), ...args], { stdio: 'inherit', env });
  if (r.status !== 0) throw new Error(`${script} failed (${r.status})`);
  return (Date.now() - t0) / 1000;
};
const free = () => { const r = spawnSync('df', ['-k', path.dirname(out)], { encoding: 'utf8' }); const f = r.stdout.trim().split('\n').pop().split(/\s+/); return +f[3] / 1048576; };
if (free() < 15) throw new Error(`under 15 GB free on ${path.dirname(out)}: stopping`);

const t0 = Date.now(), times = {};
fs.rmSync(next, { recursive: true, force: true });
fs.mkdirSync(work, { recursive: true });
times.bake = node('bake.mjs', '--all', '--out', next);
const baked = JSON.parse(fs.readFileSync(path.join(next, 'index.json'), 'utf8')).source.baked;
const table = path.join(work, `rapids-${baked.replace(/[:.]/g, '-')}.json`);
times.rapids = node('rapids.mjs', '--data', next, '--grade', 'none', '--out', table, '--report', table.replace(/\.json$/, '-report.json'));
times.rapidsBake = node('rapids-bake.mjs', '--data', next, '--table', table, '--src', 'src/rapids.json');
times.lakeFacts = node('lake-facts.mjs', '--offline', '--cache', path.join(env.BWCA_CACHE, 'lakefinder'), '--data', next, '--out', 'src/lake-facts-v4.json');
times.check = node('v4-check.mjs', '--data', next, '--old', old, '--out', path.join(work, 'check.json'));
if (fs.existsSync(out)) fs.renameSync(out, out + '.old');
fs.renameSync(next, out);
fs.rmSync(out + '.old', { recursive: true, force: true });
const du = spawnSync('du', ['-sk', out], { encoding: 'utf8' }).stdout.split(/\s+/)[0];
log(`rebake done in ${((Date.now() - t0) / 60000).toFixed(1)} min (${Object.entries(times).map(([k, v]) => `${k} ${v.toFixed(0)} s`).join(', ')}): ${out}, ${(du / 1024).toFixed(0)} MB, baked ${baked}`);
