# Performance baseline (round 4, before the story)

Measured 2026-11-08/09 on `claude/r4-tests` (main aeaffbb, round 3 live, plus this round's test fixes and the tracker's
sync-on-unveil; nothing that draws). The point is a fixed yardstick before the story adds people, props and scenes:
rerun the same script on the same host after a change and compare.

The rig: `scripts/perf-baseline.mjs`. One headless Chromium (playwright-core, the hosts' `~/pw/chrome.sh`: ANGLE over
EGL on the NVIDIA card) against the Vite dev server. For each profile and quality a fresh browser context (its own
storage, so Auto runs its own benchmark), the load timed, a new Adventure season at Moose Lake (entry point 25) on
Saturday 11 July 2026, the staff talk given and finished, the page's own animation loop stopped, then six fixed scenes.
Each scene is set up, settled, warmed 60 frames and measured 240 frames.

A frame is one `__game.step(1/30, 1)`: one simulation step and one draw, with a one-pixel `readPixels` before and after so
the GPU's work is inside the time. That is whichever of CPU and GPU is slower, the way the frame rate sees it. Draw calls
and triangles count every pass of the frame (shadow cascades, the mirror, the composer): the renderer's counters are
reset before each frame. Heap is the JS heap after a forced GC (CDP `Runtime.getHeapUsage`). Load is wall time from
`goto` to the title card with the world in. "Season to game" is the start button to the first frame at the dock.

| scene | what it is |
|---|---|
| store | inside the Moose Lake store at its busiest morning hour (`npcs.storeParties`' fullest, 7.6–10.8 h: the parties' week is drawn per season), third person, facing the counter |
| dock | the dock at that hour, from off its foot looking along it (the r2-npc-perf spot) |
| map | the dock scene with the HUD's sheet open over the home country, 36 km across |
| portage | carrying the canoe (W held, steered along the trail) on Moose Lake – Wind Lake, 883 m, 1.9 km from the store |
| night | 22:30, 12 m off a party's fire at their camp 460 m from the store (one camp drawn) |
| paddle | paddling (W held) on Lake Insula along its longest open line (880 m: the islands) |

Profiles: **desktop** 1920x1080; **modest** 1280x720 with the CPU throttled x4 (CDP `Emulation.setCPUThrottlingRate`)
while loading and while measuring (the scene set-up and streaming run unthrottled). The GPU is still the host's, so
"modest" is a slow CPU on a good GPU, not an integrated laptop. Qualities: **auto** (the preset Auto's benchmark
picks, recorded) and **low**.

## ben: Intel Core Ultra 7 265 (20 cores), 31 GB, NVIDIA GeForce RTX 5060 Ti (driver 610.57), Fedora kernel 7.1

Load average 0.6–3 during the run (idle but for this). ANGLE's renderer string: `ANGLE (NVIDIA Corporation, NVIDIA
GeForce RTX 5060 Ti/PCIe/SSE2, OpenGL ES 3.2)`. Auto picked **Ultra** in both profiles.

Frame ms (median / p90 / p99), draw calls and triangles a frame (medians), JS heap after GC:

| profile | quality | scene | median | p90 | p99 | calls | triangles | heap MB |
|---|---|---|---|---|---|---|---|---|
| desktop | auto (Ultra) | store | 14.5 | 15.8 | 17.2 | 803 | 9.5 M | 201 |
| desktop | auto (Ultra) | dock | 11.1 | 13.9 | 37.0 | 784 | 10.4 M | 208 |
| desktop | auto (Ultra) | map | 17.3 | 21.9 | 32.5 | 783 | 10.5 M | 221 |
| desktop | auto (Ultra) | portage | 10.2 | 11.5 | 13.1 | 594 | 7.3 M | 236 |
| desktop | auto (Ultra) | night | 9.8 | 10.9 | 18.0 | 524 | 6.0 M | 240 |
| desktop | auto (Ultra) | paddle | 9.6 | 10.8 | 13.3 | 642 | 6.1 M | 243 |
| desktop | low | store | 7.9 | 10.8 | 20.6 | 458 | 3.0 M | 210 |
| desktop | low | dock | 10.2 | 13.2 | 44.0 | 443 | 4.6 M | 217 |
| desktop | low | map | 9.9 | 15.0 | 23.6 | 443 | 4.6 M | 228 |
| desktop | low | portage | 10.9 | 11.7 | 14.1 | 365 | 4.2 M | 244 |
| desktop | low | night | 8.7 | 9.8 | 12.2 | 296 | 2.6 M | 248 |
| desktop | low | paddle | 6.9 | 9.0 | 29.8 | 278 | 2.7 M | 255 |
| modest | auto (Ultra) | store | 41.3 | 65.0 | 128.9 | 859 | 10.1 M | 207 |
| modest | auto (Ultra) | dock | 39.0 | 51.7 | 181.3 | 798 | 10.0 M | 212 |
| modest | auto (Ultra) | map | 39.9 | 55.2 | 110.0 | 781 | 10.0 M | 228 |
| modest | auto (Ultra) | portage | 32.4 | 39.4 | 43.9 | 594 | 7.3 M | 237 |
| modest | auto (Ultra) | night | 28.9 | 35.0 | 51.5 | 524 | 6.0 M | 239 |
| modest | auto (Ultra) | paddle | 40.8 | 49.3 | 405.9 | 656 | 6.9 M | 248 |
| modest | low | store | 28.8 | 48.2 | 115.7 | 477 | 3.3 M | 210 |
| modest | low | dock | 28.7 | 32.7 | 103.2 | 434 | 4.4 M | 216 |
| modest | low | map | 30.2 | 46.9 | 100.1 | 431 | 4.4 M | 234 |
| modest | low | portage | 26.4 | 31.5 | 36.1 | 365 | 4.2 M | 242 |
| modest | low | night | 22.6 | 26.7 | 35.4 | 295 | 2.6 M | 245 |
| modest | low | paddle | 21.7 | 29.5 | 128.8 | 276 | 2.7 M | 255 |

Shader programs: **86** in every scene, profile and quality (main.js's note said 79 at the title in round A-C; the
round-3 people, gems and cards brought it to 86, and nothing compiles late). Geometries grow with the ground streamed
in, 490 → 810 over a run; textures 36–40.

Load (dev server, 250 requests, 60.7 MB before the title):

| profile | to the title | season to game | heap at the dock |
|---|---|---|---|
| desktop auto | 10.2 s | 2.3 s | 198 MB |
| desktop low | 9.9 s | 4.1 s | 197 MB |
| modest auto (CPU x4) | 21.9 s | 3.2 s | 198 MB |
| modest low (CPU x4) | 18.7 s | 2.7 s | 197 MB |

### How steady the numbers are

An earlier full run on ben the same hour (same build, scenes in another order, ben's load average 0.6) read the
desktop/Low medians 7.0 (store), 6.0 (dock), 6.6 (map), 6.8 (portage), 5.8 (night), 5.1 (paddle): up to 4 ms lower
than the table. Two causes: the store crowd is drawn per season (8 or 9 party people, at 7.6–10.8 h), and the host is
shared. Treat a difference under ~3 ms in a median, or any p99 on its own, as noise. Compare medians and draw calls;
calls and triangles barely move between runs (±5 %).

## fedora: Intel Core i5-12600KF (16 threads), 31 GB, NVIDIA GeForce RTX 3060 (driver 615.71)

Load average under 0.7 during the run. Auto picked **Medium** on the desktop profile and **Low** on the modest one
(on ben it picked Ultra for both: the benchmark is the title scene, and ben's faster CPU and GPU fit Ultra in its 11 ms).

| profile | quality | scene | median | p90 | p99 | calls | triangles | heap MB |
|---|---|---|---|---|---|---|---|---|
| desktop | auto (Medium) | store | 16.1 | 19.8 | 33.1 | 708 | 7.8 M | 203 |
| desktop | auto (Medium) | dock | 14.3 | 20.6 | 46.8 | 709 | 9.2 M | 210 |
| desktop | auto (Medium) | map | 14.5 | 22.2 | 30.4 | 706 | 9.2 M | 221 |
| desktop | auto (Medium) | portage | 11.7 | 13.5 | 16.2 | 495 | 5.5 M | 238 |
| desktop | auto (Medium) | night | 11.8 | 16.3 | 25.0 | 471 | 5.2 M | 240 |
| desktop | auto (Medium) | paddle | 12.3 | 16.2 | 42.3 | 552 | 5.7 M | 241 |
| desktop | low | store | 12.4 | 16.8 | 31.0 | 458 | 3.0 M | 208 |
| desktop | low | dock | 10.7 | 18.5 | 42.4 | 435 | 4.3 M | 214 |
| desktop | low | map | 11.1 | 17.6 | 23.5 | 440 | 4.4 M | 224 |
| desktop | low | portage | 9.4 | 11.1 | 15.3 | 365 | 4.2 M | 242 |
| desktop | low | night | 8.3 | 12.0 | 17.7 | 295 | 2.6 M | 245 |
| desktop | low | paddle | 8.4 | 12.2 | 28.7 | 272 | 2.3 M | 252 |
| modest | auto (Low) | store | 47.4 | 76.4 | 162.0 | 467 | 3.0 M | 207 |
| modest | auto (Low) | dock | 44.6 | 58.3 | 196.8 | 439 | 4.5 M | 211 |
| modest | auto (Low) | map | 42.3 | 64.9 | 117.4 | 434 | 4.5 M | 228 |
| modest | auto (Low) | portage | 34.5 | 40.5 | 44.6 | 365 | 4.2 M | 236 |
| modest | auto (Low) | night | 29.8 | 37.1 | 69.8 | 296 | 2.6 M | 238 |
| modest | auto (Low) | paddle | 31.9 | 39.9 | 124.5 | 275 | 2.3 M | 241 |
| modest | low | store | 52.0 | 82.5 | 155.3 | 485 | 3.2 M | 206 |
| modest | low | dock | 45.4 | 55.7 | 193.0 | 435 | 4.5 M | 211 |
| modest | low | map | 42.5 | 58.7 | 108.2 | 429 | 4.5 M | 227 |
| modest | low | portage | 33.5 | 40.0 | 47.9 | 365 | 4.2 M | 234 |
| modest | low | night | 28.7 | 37.4 | 49.6 | 296 | 2.6 M | 237 |
| modest | low | paddle | 31.3 | 39.5 | 142.3 | 276 | 2.2 M | 244 |

Programs 86 here too. Load: to the title 12.5–12.8 s (desktop), 23.5–23.7 s (CPU x4); season to game 3.2–5.5 s.

## What it says

- **The store and the dock are the heaviest scenes**: 800 calls and 10 M triangles at Ultra, about twice the paddle's
  draw cost. They are where the story adds people and props, so they are the first numbers to watch.
- **The map open costs more than the scene under it** at Ultra (17.3 ms against the dock's 11.1): the 3D scene keeps
  drawing at full cost behind the sheet, and the sheet paints on top.
- **CPU-bound on a slow CPU**: at CPU x4 the frame triples (ben: Ultra 29–41 ms, Low 22–30 ms; fedora Low 29–52 ms). Low halves the draw calls
  but saves only a quarter of the frame there, so the per-frame JS (people, parties, tiles, HUD) is most of it.
- **Auto's pick does not see the CPU cost of play**: its benchmark draws the scene behind the title card, which has
  none of the store's or the parties' JS. On ben it picked Ultra even at CPU x4, and the store ran at ~24 fps; on
  fedora at CPU x4 it picked Low and the store still ran at ~21 fps, so on a slow CPU no preset reaches 30 fps there.
- **Hitches**: the p99s at 100–400 ms come with tiles streaming (paddle, dock) and the crowd's first frames (store),
  not with compiles (the program count never moves).

## Rerun it for an A/B

On ben or fedora, never the Mac (the owner's rule), with the host otherwise idle (`uptime` under ~2):

```sh
git push -f ben HEAD:refs/heads/<branch>
ssh ben '~/pw/bwca-wt.sh <branch> <name>'
ssh ben '~/pw/bwca-run.sh <name> <vite-port> - -- node scripts/perf-baseline.mjs --label "<what>" --out ~/bwca-logs/<name>/perf.json'
```

The script prints a markdown table and writes the full JSON (every scene's setup, preset, frame stats, calls,
triangles, programs, geometries, textures and heap; the host's CPU, cores, memory and load). Arguments:
`--profiles desktop,modest`, `--qualities auto,low` (also `medium`, `high`, `ultra`),
`--scenes store,dock,map,portage,night,paddle`, `--frames 240`, `--warm 60`. A full run is about 6 minutes on ben.

For an A/B, run the old build and the new one on the same host back to back (two worktrees at two Vite ports, or one
after the other), the same arguments, and take each side's best of two or three runs; compare medians and calls. For a
finer A/B of one scene, `scripts/r2-npc-perf.mjs` alternates two tabs frame batch by frame batch.

Limits: the dev server's load times (each module fetched apart) are not the GitHub Pages build's; headless Chromium
has no compositor or vsync; "modest" throttles the CPU only.
