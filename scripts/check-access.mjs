#!/usr/bin/env node
// Round world (2026-11-02): the sweeps' numbers for the campsites, on the release's ground: how many could be walked up to
// from the water before (straight down the shore's fall line from the ring, as the shelf ran) and how many by their landing
// and way now (src/camp-access.json), with the exceptions, and the latrine's walk from the ring then and now. It runs
// scripts/camp-access.mjs --verify. (The outfitters' yards need the game's near ring and stores: the round's in-page sweep.)
//
//   node scripts/check-access.mjs [--data public/data]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, 'camp-access.mjs'), '--verify', ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
