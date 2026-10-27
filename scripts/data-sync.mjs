#!/usr/bin/env node
// Uploads the baked map data (public/data) to the bucket the app fetches it from. See docs/HOSTING.md.
//
//   npm run data:sync                      uploads to $DATA_SYNC_DEST
//   npm run data:sync -- --dry-run         shows what would change
//   npm run data:sync -- r2:bwca/bwca/v3   destination on the command line instead
//
// Destination: an rclone path (remote:bucket/prefix) or an s3:// URL. The tool is rclone for the former
// and the AWS CLI for the latter unless DATA_SYNC_TOOL says otherwise; DATA_SYNC_ENDPOINT points the AWS
// CLI at an S3-compatible store such as R2. The prefix should be the path part of VITE_DATA_URL.
//
// Headers: tiles/, far/ and overview.png are written as immutable (a year), index.json with a short
// max-age and last, so a new bake's tiles are all in place before the index that names them. Put each
// bake under its own prefix (v3, v4, …) rather than overwriting: the tiles are then truly immutable and
// the CDN never serves a stale one. The tiles are stored as they are (gzip bytes, application/octet-stream,
// no Content-Encoding): the client gunzips them, exactly as it does from the dev server. The LiDAR detail
// (detail/: scripts/detail-bake.mjs), when the bake has one, goes the same way: its chunks immutable, its index short.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positional = args.filter((a) => !a.startsWith('--'));
const dest = (process.env.DATA_SYNC_DEST || positional[0] || '').replace(/\/+$/, '');
const src = resolve(process.env.DATA_SYNC_SRC || 'public/data');
const tool = process.env.DATA_SYNC_TOOL || (dest.startsWith('s3://') ? 'aws' : 'rclone');
const endpoint = process.env.DATA_SYNC_ENDPOINT;
const IMMUTABLE = 'public, max-age=31536000, immutable';
const SHORT = 'public, max-age=300, must-revalidate';

const die = (msg) => { console.error(`data:sync: ${msg}`); process.exit(1); };
if (!dest) die('no destination: set DATA_SYNC_DEST (remote:bucket/prefix for rclone, s3://bucket/prefix for the AWS CLI) or pass it as an argument');
if (!existsSync(resolve(src, 'index.json'))) die(`no bake in ${src}: run npm run bake:all (or npm run bake for the Lake One demo)`);
if (tool !== 'rclone' && tool !== 'aws') die(`DATA_SYNC_TOOL must be rclone or aws, not ${tool}`);

function run(cmd, argv) {
  console.log(`\n$ ${cmd} ${argv.join(' ')}`);
  const r = spawnSync(cmd, argv, { stdio: 'inherit' });
  if (r.error) die(r.error.code === 'ENOENT' ? `${cmd} is not installed (brew install ${cmd === 'aws' ? 'awscli' : cmd})` : r.error.message);
  if (r.status !== 0) process.exit(r.status);
}

console.log(`data:sync: ${src} -> ${dest} with ${tool}${dryRun ? ' (dry run)' : ''}`);
if (tool === 'rclone') {
  const common = ['--transfers', '32', '--checkers', '32', '--checksum', '--fast-list', '--stats-one-line', '--stats', '10s', ...(dryRun ? ['--dry-run'] : [])];
  const subs = ['tiles', 'far', ...['detail/2m', 'detail/5m'].filter((d) => existsSync(resolve(src, d)))];
  for (const sub of subs) run('rclone', ['sync', resolve(src, sub), `${dest}/${sub}`, '--header-upload', `Cache-Control: ${IMMUTABLE}`, ...common]);
  run('rclone', ['copyto', resolve(src, 'overview.png'), `${dest}/overview.png`, '--header-upload', `Cache-Control: ${IMMUTABLE}`, ...common]);
  if (existsSync(resolve(src, 'detail/index.json'))) run('rclone', ['copyto', resolve(src, 'detail/index.json'), `${dest}/detail/index.json`, '--header-upload', `Cache-Control: ${SHORT}`, ...common]);
  run('rclone', ['copyto', resolve(src, 'index.json'), `${dest}/index.json`, '--header-upload', `Cache-Control: ${SHORT}`, ...common]);
} else {
  const common = [...(endpoint ? ['--endpoint-url', endpoint] : []), ...(dryRun ? ['--dryrun'] : [])];
  const subs = ['tiles', 'far', ...['detail/2m', 'detail/5m'].filter((d) => existsSync(resolve(src, d)))];
  for (const sub of subs) run('aws', ['s3', 'sync', resolve(src, sub), `${dest}/${sub}`, '--delete', '--cache-control', IMMUTABLE, '--content-type', 'application/octet-stream', ...common]);
  run('aws', ['s3', 'cp', resolve(src, 'overview.png'), `${dest}/overview.png`, '--cache-control', IMMUTABLE, '--content-type', 'image/png', ...common]);
  if (existsSync(resolve(src, 'detail/index.json'))) run('aws', ['s3', 'cp', resolve(src, 'detail/index.json'), `${dest}/detail/index.json`, '--cache-control', SHORT, '--content-type', 'application/json', ...common]);
  run('aws', ['s3', 'cp', resolve(src, 'index.json'), `${dest}/index.json`, '--cache-control', SHORT, '--content-type', 'application/json', ...common]);
}
console.log(`\ndata:sync: done. Point VITE_DATA_URL at the public URL of ${dest.replace(/^[^:]+:(\/\/)?/, '')}/ and rebuild the app.`);
