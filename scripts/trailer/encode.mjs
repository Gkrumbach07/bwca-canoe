#!/usr/bin/env node
// The trailer's cut: the shots' numbered PNGs (frame-server.mjs wrote them, one folder per shot) joined in the order
// of shots.js with each shot's crossfade into the next, faded up from black at the start and down at the end, encoded
// to H.264 at 1920 x 1080, 30 fps, and a 1280 x 720 copy for the web. Silent: the game's sound is synthesized live
// by Web Audio in real time and cannot follow the stepped, slower-than-real-time capture.
//
//   node scripts/trailer/encode.mjs --frames /path/to/frames --out /path/to/trailer.mp4 [--web /path/to/trailer-720p.mp4]
//                                   [--ffmpeg /opt/homebrew/bin/ffmpeg] [--crf 16] [--only dawn,moose]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SHOTS } from './shots.js';

const FPS = 30;
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const FRAMES = path.resolve(opt('frames', 'trailer-frames'));
const OUT = path.resolve(opt('out', 'trailer.mp4'));
const WEB = opt('web', null);
const FFMPEG = opt('ffmpeg', '/opt/homebrew/bin/ffmpeg');
const CRF = opt('crf', '16');
const only = opt('only', null);

const shots = SHOTS.filter((s) => !s.skip && (!only || only.split(',').includes(s.name))).map((s) => {
  const dir = path.join(FRAMES, s.name);
  const n = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^\d{5}\.png$/.test(f)).length : 0;
  if (n !== Math.round(s.seconds * FPS)) throw new Error(`${s.name}: ${n} frames in ${dir}, expected ${Math.round(s.seconds * FPS)}`);
  return { name: s.name, dir, n, dur: n / FPS, fade: s.fade || 0 };
});

// xfade needs a length: a cut is a one-frame dissolve
const inputs = [], parts = [];
shots.forEach((s) => inputs.push('-framerate', String(FPS), '-i', path.join(s.dir, '%05d.png')));
let label = '[0:v]', length = shots[0].dur;
const plan = [{ shot: shots[0].name, at: 0, dur: shots[0].dur }];
for (let i = 1; i < shots.length; i++) {
  const fade = Math.max(1 / FPS, shots[i - 1].fade);
  const offset = +(length - fade).toFixed(4);
  parts.push(`${label}[${i}:v]xfade=transition=fade:duration=${fade.toFixed(4)}:offset=${offset}[x${i}]`);
  label = `[x${i}]`;
  plan.push({ shot: shots[i].name, at: offset, dur: shots[i].dur });
  length = offset + shots[i].dur;
}
const total = length;
parts.push(`${label}fade=t=in:st=0:d=0.8,fade=t=out:st=${(total - 0.7).toFixed(3)}:d=0.7,format=yuv420p[v]`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
const run = (argv) => {
  const r = spawnSync(FFMPEG, argv, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${r.status})`);
};
console.log(`${shots.length} shots, ${total.toFixed(2)} s`);
for (const p of plan) console.log(`  ${p.at.toFixed(2).padStart(6)} s  ${p.shot} (${p.dur.toFixed(1)} s)`);
run(['-v', 'error', '-y', ...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', '-r', String(FPS),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', OUT]);
console.log(`wrote ${OUT}`);
if (WEB) {
  run(['-v', 'error', '-y', '-i', OUT, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
    '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', path.resolve(WEB)]);
  console.log(`wrote ${path.resolve(WEB)}`);
}
