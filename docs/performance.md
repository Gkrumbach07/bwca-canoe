# Performance, and the engine question (2026-10-26)

The owner asked on 2026-10-26: "Performance and saves — do we need to switch game engines?"

**No.** The measurements below say the game is bound by the CPU, by how many separate things it asks the renderer to
draw each frame. Changing engines doesn't fix that, and the browser itself sets the cost of each draw. Switching would
also mean rewriting 47 000 lines and losing instant play from GitHub Pages. This round cut the frame in half on a
slow CPU while keeping three.js:

- Low at 1366 × 768 on a CPU throttled ×4 went from 20–30 ms a frame to 11–17 ms; Ultra from 27–35 ms to 18–26 ms.
- The triangles fell by a third to a half, and the shader programs no longer creep: all of them compile behind the
  title card.

The next step is batching the forest's draws, and three.js has the tools for it (see the last section).

## How it was measured

- **The machine.** An Apple M4 Pro (14 CPU cores, 20 GPU cores). The page ran in Chromium 1234, headless with
  `--use-angle=metal`, at 1366 × 768 and a device pixel ratio of 1. The scratchpad's driver (`round-a-c/`) drove it
  through Playwright.
- **An ordinary laptop's CPU.** Chrome's own CPU throttling (DevTools protocol `Emulation.setCPUThrottlingRate`,
  ×4). This slows the page's main thread about to a 2018–2020 laptop i5 (a quarter of the M4 Pro's single-core
  speed). It does not slow the GPU.
- **An ordinary laptop's GPU.** It can't be emulated, so it was measured here and scaled:
  - GPU time per frame comes from frames drawn back to back at 1.5×, 2×, 2.5× and 3× the pixels (where the GPU is
    the slower), with a line fitted through those points and read at the real size (perf.js `PF.gpuFit`). The fit's
    intercept is the work that doesn't scale with pixels: vertices, shadow maps, the draws themselves.
  - An Intel Iris Xe (the integrated GPU in most 2021–2025 Windows laptops) has about a quarter of the M4 Pro's
    FLOPS, bandwidth and texture rate. Its GPU time is taken as **4–6×** the M4 Pro's.
  - An older Intel UHD 620 is about 20× slower.
  - `EXT_disjoint_timer_query_webgl2` is reported too (`gpuQ`), but on ANGLE over Metal it counts the gaps between
    passes and reads high.
- **Frame time.**
  - The whole frame: the simulation plus the draw, frames back to back with a one-pixel read at each end. That's
    whichever of the CPU and the GPU is slower, as the frame rate sees it.
  - `sim`: the simulation alone.
  - `cpu`: the time `draw()` takes to return.
  - Each number is the best of two to four runs.
- **The five places** (`round-a-c/scenes/`):
  - **Open water on Lake One** at (−20040, 19418), 12:00 in July, looking down the lake to the far shore and the
    island.
  - **A portage in the green tunnel**: half-way along the Lake One–Confusion Trail (42 rods), on foot, 10:00.
  - **A full camp at dusk**: the first built site out from EP 30, the tent pitched, the fire lit, 21 June at
    sunset + 0.4 h (21:35), still air, the mosquitoes out, the view across the fire to the tent.
  - **Inside the Kawishiwi store**, a step in from the door, 11:00.
  - **A whitecapped Snowbank**: the wind held at 11 m/s, 13:00, looking downwind across the lake.
- **The base.** main at 94f7f9a (live), extracted to `shots/base/` and served by the same Vite server, so it ran in
  a second page of the same browser. The A/B runs alternate between the two pages, round by round.
- **A caveat.** The machine was shared with five other agents' browsers the whole time (load average 5–57), so a
  single number can be off by 20–50 %. The **interleaved** A/B tables below are the ones to trust; the full
  four-preset table was taken base first, then this build, ten minutes apart. The counts (draw calls, triangles,
  programs) are exact.

## The answer in one table: Low at 1366 × 768, the CPU throttled ×4

Interleaved, four rounds each, the base (main 94f7f9a) against this build. Each cell is the best round, with the
median in brackets.

| Place | Frame, base | Frame, now | Draw (CPU), base → now | Simulation, base → now | Draw calls |
|---|---|---|---|---|---|
| Open water, Lake One | 26.4 ms (31.5) | **12.5 ms** (13.7) | 17.7 → 10.0 ms | 6.1 → 1.3 ms | 292 → 250 |
| Portage, the green tunnel | 29.5 ms (32.8) | **17.1 ms** (22.8) | 21.0 → 11.7 ms | 6.1 → 0.4 ms | 387 → 340 |
| Camp at dusk | 25.3 ms (27.7) | **17.3 ms** (18.9) | 18.3 → 11.6 ms | 3.1 → 1.7 ms | 422 → 379 |
| Inside the store | 23.3 ms (25.0) | **14.1 ms** (15.6) | 15.5 → 9.1 ms | 2.8 → 1.2 ms | 342 → 307 |
| Snowbank, whitecaps | 19.6 ms (22.2) | **10.6 ms** (12.3) | 12.5 → 6.4 ms | 2.7 → 1.4 ms | 295 → 264 |

- **The CPU side.** On a CPU a quarter as fast as this one, Low now holds 60 fps on open water, at the store and on
  Snowbank. In the woods (the portage, the camp) it holds about 55–60. The base held 30–40 everywhere.
- **The GPU side, Low.** On the M4 Pro it is 2.1–3.7 ms (it was 2.9–6.1). At 4–6× that is 8–22 ms on an Iris Xe, and
  10.5–18 ms at 5×:
  - A 2021-or-later thin-and-light laptop runs Low at about 55–60 fps on the water and 50–55 in the woods at dusk.
  - An older UHD 620 laptop runs it at about 20–30.

GPU time per frame, fitted, interleaved, the median of three rounds (M4 Pro, 1366 × 768), base → now:

| Place | Low | Ultra | What is left at Low |
|---|---|---|---|
| Open water, Lake One | 2.9 → 2.1 ms | 8.8 → 7.3 ms | the lake bed under the water and the water itself, per pixel |
| Portage, the green tunnel | 4.2 → 2.9 ms | 10.8 → 9.5 ms | the forest's vertices, in the view and the shadow cascades |
| Camp at dusk | 6.1 → 3.7 ms | 14.8 → 14.0 ms | the forest: half of it (3.2 ms, 1.5 ms with the forest hidden; `toggles.js`) |
| Inside the store | 3.5 → 2.5 ms | 9.5 → 8.4 ms | the forest outside, drawn behind the walls |
| Snowbank, whitecaps | 2.9 → ~1 ms | 9.2 → 7.0 ms | the water, per pixel (the fit is loose on open water) |


## Before and after, every preset

Base (main 94f7f9a) → this build. One run each, about ten minutes apart. The frames at ×1 and the GPU column are noisy
at the ±20 % level; the counts are exact.

| Place | Preset | Draw calls | Triangles | Frame, CPU ×1 | Frame, CPU ×4 | GPU (M4 Pro, fitted) |
|---|---|---|---|---|---|---|
| Open water, Lake One, 12:00 | Low | 303 → 265 | 3.5 M → 1.9 M | 6.1 → 2.9 ms | 29.6 → 13.3 ms | 3.0 → 2.3 ms |
|  | Medium | 562 → 561 | 7.1 M → 4.4 M | 8.8 → 6.1 ms | 35.5 → 22.8 ms | 7.5 → 5.8 ms |
|  | High | 813 → 831 | 8.7 M → 5.2 M | 13.6 → 8.0 ms | 45.3 → 26.1 ms | 8.9 → 7.9 ms |
|  | Ultra | 843 → 841 | 9.0 M → 5.4 M | 9.8 → 8.3 ms | 40.2 → 26.8 ms | 8.5 → 8.6 ms |
| Portage (the green tunnel), 10:00 | Low | 372 → 331 | 4.6 M → 2.4 M | 7.5 → 3.8 ms | 32.6 → 19.0 ms | 4.4 → 3.3 ms |
|  | Medium | 696 → 692 | 8.9 M → 6.0 M | 8.9 → 7.1 ms | 38.3 → 26.8 ms | 8.1 → 7.0 ms |
|  | High | 947 → 953 | 11.0 M → 7.6 M | 10.9 → 9.3 ms | 44.5 → 29.0 ms | 10.8 → 9.4 ms |
|  | Ultra | 955 → 961 | 11.5 M → 8.2 M | 10.9 → 9.6 ms | 52.7 → 31.4 ms | 11.5 → 9.3 ms |
| Camp at dusk, fire and bugs, 21:35 | Low | 415 → 375 | 4.4 M → 2.7 M | 8.1 → 3.8 ms | 33.3 → 18.1 ms | 7.0 → 3.8 ms |
|  | Medium | 653 → 643 | 7.2 M → 5.1 M | 9.5 → 7.9 ms | 38.7 → 24.5 ms | 8.1 → 7.4 ms |
|  | High | 782 → 792 | 9.8 M → 7.5 M | 11.7 → 10.9 ms | 42.3 → 30.5 ms | 11.8 → 10.8 ms |
|  | Ultra | 797 → 806 | 10.4 M → 7.8 M | 12.1 → 11.3 ms | 40.8 → 29.4 ms | 11.3 → 11.3 ms |
| Inside the Kawishiwi store, 11:00 | Low | 340 → 310 | 3.4 M → 2.2 M | 7.2 → 3.0 ms | 31.5 → 14.0 ms | 5.8 → 2.7 ms |
|  | Medium | 626 → 633 | 7.2 M → 5.5 M | 10.1 → 6.4 ms | 37.2 → 22.5 ms | 10.9 → 6.2 ms |
|  | High | 804 → 817 | 8.8 M → 6.6 M | 10.1 → 8.2 ms | 38.8 → 29.9 ms | 9.0 → 8.1 ms |
|  | Ultra | 821 → 833 | 9.4 M → 7.1 M | 9.5 → 8.4 ms | 38.4 → 26.7 ms | 9.2 → 8.3 ms |
| Whitecapped Snowbank, 11 m/s, 13:00 | Low | 297 → 278 | 3.7 M → 2.1 M | 5.2 → 4.2 ms | 29.3 → 14.2 ms | – |
|  | Medium | 427 → 436 | 5.2 M → 3.2 M | 11.5 → 5.5 ms | 34.5 → 19.0 ms | – |
|  | High | 538 → 583 | 6.0 M → 3.6 M | 8.4 → 8.2 ms | 36.1 → 22.6 ms | 6.3 → 8.2 ms |
|  | Ultra | 557 → 594 | 6.1 M → 3.6 M | 8.4 → 8.4 ms | 44.7 → 22.9 ms | 7.9 → 7.9 ms |

(Snowbank's fit at Low and Medium came out negative: open water has too little geometry for the pixel scaling to
separate, and the frame there is under 3 ms either way.)

### Ultra, interleaved

The same four-round interleaving at Ultra. Each cell is the best round, base → now, with the median in brackets.

| Place | Frame, CPU ×4 | Frame, CPU ×1 | Draw (CPU) ×4 | Draw calls |
|---|---|---|---|---|
| Open water, Lake One | 35.3 → **26.0 ms** (39.7 → 28.1) | 10.2 → 8.3 ms | 27.2 → 21.6 ms | 833 → 839 |
| Portage, the green tunnel | 34.7 → **22.4 ms** (36.2 → 24.5) | 10.9 → 9.3 ms | 24.9 → 17.7 ms | 974 → 978 |
| Camp at dusk | 34.1 → **25.8 ms** (35.2 → 26.0) | 14.1 → 10.8 ms | 26.2 → 20.7 ms | 809 → 818 |
| Inside the store | 33.5 → **25.7 ms** (34.8 → 27.5) | 10.4 → 9.1 ms | 24.3 → 19.4 ms | 828 → 833 |
| Snowbank, whitecaps | 27.4 → **18.4 ms** (32.0 → 19.5) | 7.8 → 6.0 ms | 18.9 → 13.7 ms | 582 → 572 |

- **Triangles fell by a third to a half everywhere.** The terrain is now culled by quarter tile, and the far rocks
  are 16 triangles, not 128.
- **The CPU frame at ×4 fell by a third at every preset.** Ultra went from 27–35 ms to 18–26 ms in the interleaved
  runs.
- **The GPU frame on the M4 Pro barely moved at High and Ultra.** There it was spent per pixel and on the passes
  (the mirror, MSAA 4×, the god rays). At Low and Medium it fell 15–50 %.
- **Draw calls are the same at Medium and above.** The terrain went from one mesh a tile to four quarters, which
  added as many calls as the rest of the work took away. They are 10–14 % fewer at Low, where the far field ends
  sooner and the understory casts no shadow.

### Programs (the shader creep)

A tour of one session (`round-a-c/tour.js`): the store, Lake One at noon, dusk and night, Snowbank, Lake Two, east
and west, 210 m inland on foot, rain, a storm, every preset in turn, then a camp at dusk with the tent and the fire.

| | At the title | After the tour |
|---|---|---|
| Base | 67 | 71 (+3 shadow-depth programs the first time inland, +1 the FXAA grade) |
| This build | 79 | **79** |

**How the creep happened.** Three draws the shadow map before it sets up the frame's lights, so each depth program
takes on whatever light state the scene's last render left.

- With the mirror on, that is the mirror's state (no lights).
- With no mirror (Low, or more than 150 m from the shore), it is the last main pass's.

So the first walk inland compiled every caster's depth program again: the "64 → 76 over four days" in
`docs/hubs.md`. The god rays, the FXAA grade and the mirror's variants of the wildlife came the same way: each
compiled the first time it was needed, a hitch of tens of milliseconds on a laptop.

**The fix.** They are all compiled behind the title card now (`quality.js prewarmPasses`, 0.25 s here and 0.8 s at
×4, spread over three tasks).

### Load time and memory

The production build (`vite build`) was served from disk with the data next to it, with no network. Times are to the
title card.

| | CPU ×1, first visit | CPU ×1, return visit | CPU ×4, first visit | CPU ×4, return visit | Downloaded | JS heap at the title |
|---|---|---|---|---|---|---|
| Base | 3.7 s | 2.8 s | 9.2 s | 6.1 s | 18.6 MB in 46 requests | 600–670 MB |
| This build | 3.6 s | 2.8 s | 8.9 s | 6.1 s | 18.4 MB in 45 requests | 620–660 MB |

- **The download.**
  - About 18 MB arrives before the title card: the 2.7 MB of JS (0.8 MB gzipped), index.json (5.6 MB, 1.1 MB
    gzipped by Pages), overview.png (3.7 MB), the 3 × 3 tiles and the far field.
  - Over the wire that is about 13 MB. That is 4 s at 25 Mbit/s, 1 s at 100.
  - A first visit also bakes the occlusion and caches it in IndexedDB. That costs another 0.9 s at ×1 and 3 s at ×4.
  - Coming soon (stream P2-B's creek levels): each tile worker fetches `water-grade.bin` (818 KB gzipped) once.
- **Memory in play.**
  - The JS heap is 0.8–1.1 GB around Lake One and 1.5 GB after a jump to Snowbank, because 36 tiles stay cached.
  - The browser's renderer process is 0.4–0.6 GB more, and the GPU process 0.4–0.9 GB.
  - The geometry and instance arrays are 480–670 MB of that: the forest's instance matrices (64 bytes a tree, about
    3.5 M of them within the cached tiles) and the terrain.
  - This round didn't change memory. An 8 GB laptop runs it, and a 4 GB Chromebook won't. Keeping 25 tiles instead
    of 36 (tiles.js `MAX_LOADED`) would save about a quarter.

## What changed

1. **The frozen tiles' matrix walk** (tiles.js `freeze`).
   - **The problem.** Three r186 still recurses into every child of a group whose `matrixWorldAutoUpdate` is off.
     The ~25 000 vegetation meshes and proxies of the frozen tiles were each called on every render. That was 14 %
     of the main thread at Lake One.
   - **The fix.** A frozen tile's walk now goes only into its groups (the props). The terrain, the far water and the
     vegetation's meshes and proxies set their own `matrixWorld`, as they already did.
2. **The vegetation LOD, amortized** (tiles.js `update`).
   - **The problem.** `updateVegetationLOD` walked all ~16 000 bins of the 25 tiles every frame (9 % of the main
     thread).
   - **The fix.** A tile is looked at again only once the camera has moved a step that could change a decision
     there: 1 m in the tile underfoot, or a fiftieth of the distance to a far tile. It also runs at once when the
     tile's meshes or the LOD scale change. The simulation's CPU fell from 1.8 ms to 0.5 ms a frame at Lake One.
3. **The terrain in quarters** (tile-worker.js `partTerrain`, tiles.js `terrainParts`).
   - **The problem.** A fine tile's terrain was one mesh of ~200 000 triangles. A shadow cascade that touched a
     corner of a tile drew all of it: 1.15 M triangles of terrain in Lake One's shadow pass.
   - **The fix.** The worker sorts the triangles into 4 × 4 blocks along a Morton curve, so each quarter of the tile
     is one run of the index. The tile is drawn as four meshes over the same arrays, each with its own draw range
     and sphere.
   - **The result.** Shadow terrain 1.15 M → 0.41 M triangles; the view's and the mirror's 1.0–1.2 M → 0.8 M.
   - **Why quarters and not blocks.** Blocks cut the triangles a little more but added ~100 draw calls, which cost a
     slow CPU more than the triangles cost the GPU.
4. **A real far twin for the rocks** (rocks.js `farRock`).
   - **The problem.** Past 750 m the boulders and the scree drew the 128-triangle slanted rock and the 76-triangle
     scree block. That was 1.7 M triangles of boulders in Lake One's view, the single biggest item in the frame.
   - **The fix.** They now draw a plain convex block of 10–20 triangles, painted like the near ones. Boulders (3–7 m
     across) are culled at 2.2 km, not 3.2: a pixel or two at that distance, in the haze.
5. **No program creep** (quality.js `prewarmPasses`; above).
6. **Low** (quality.js `PRESETS.low`, main.js round A-C).
   - Its shadows reach 80 m, not 120.
   - At half the undergrowth the understory casts no shadow. The cascade proxies were 18 of the shadow pass's 121
     draw calls on the portage trail.
   - At half the tree detail distance the far field ends at 8.4 km, not 12. Each far chunk is two draw calls, and
     Low drew some thirty of them.
   - It still draws at 0.75 of the pixels with FXAA, with no mirror and no god rays.
7. **Auto** (quality.js `deviceClass`, `benchmark`, `AutoWatch`).
   - **Where it starts.** From the GPU's name (`WEBGL_debug_renderer_info`), the cores and the memory:
     - Intel HD and UHD, the phone GPUs, a software renderer, two cores or 2 GB: Low alone.
     - Intel Iris, AMD's APU graphics, Apple's base M chips, four cores or 4 GB: Medium first, then High or Low.
     - Anything else: High first, as before.
   - **The benchmark.** The tiles are now brought to each preset's LOD before the preset is timed. Before, it timed
     High with the LOD of whatever ran before it.
   - **Watching.** Auto now keeps watching in play. When the median frame is over 22 ms (under ~45 fps) for 8 s with
     the game up, it steps down one preset and says so in the console. It never steps up by itself.
   - **Checked.** At ×4, Auto picked Low from the title (High timed 20–28 ms, Medium 14–23).

Before and after shots at a fixed camera on the portage and on Lake One, at Ultra, are in the round's worktree (not
committed): `shots/cmp-look-portage.png` and `shots/cmp-look-lake.png`. They differ by 0.3 % of pixels (the bugs and the ripples moving), with nothing changed in
the look.

## Where the frame goes now

A CPU profile of the camp at Low, throttled ×4 (`round-a-c/results/prof-camp-low-x4.cpuprofile`):

| | Share of the main thread |
|---|---|
| Drawing: three's WebGLRenderer.render (the scene walk, frustum tests, per-object uniforms and program checks, the GL calls) | 78 % |
| … of which the culling proxies' fill (tiles.js `fill`, per chunk of instances, for the view and two cascades) | 9 % |
| The simulation: the player, the camera's sight line, the pointer, the tiles, the fauna, the needs, the HUD | 22 % |

(Shares of the frame's own work: the throttle's pauses, which the profile shows as "(program)", are left out.) At ×1 on
the M4 Pro the same frame is about 3 ms of CPU and 4 ms of GPU.

- **It is the CPU.** On an ordinary laptop, three's per-object work is the bottleneck: about 25–40 µs a draw call at
  ×4, for 250–960 draw calls a frame.
- **Where the draws come from.** The forest is 55–65 % of them, because each species, each 640 m region, each of
  the three variant groups near the camera, and each of the view and two shadow cascades is its own draw. The
  terrain quarters, the far field, the water, the props, the people and the sky make up the rest.
- **Triangles cost the GPU, not the frame rate.** At Ultra the M4 Pro's GPU spends 8–11 ms, about half of it in
  vertices and the shadow and mirror passes. On an integrated GPU, Ultra and High are out of reach for any engine
  drawing this much forest at this distance; Low is the setting for those machines.

## Budgets per preset

At 1366 × 768. These are what each preset is held to; check them with `round-a-c/suite.mjs` after any big change to
what the world draws.

| Preset | Draw calls | Triangles | Programs | Frame, CPU ×4 (median) | GPU, M4 Pro | Who it is for |
|---|---|---|---|---|---|---|
| Low | ≤ 400 | ≤ 3 M | ≤ 85, all at the title | ≤ 17 ms (60 fps) | ≤ 4 ms (≈ 16–20 ms on an Iris Xe) | Intel Iris Xe and UHD, older laptops, a slow CPU |
| Medium | ≤ 700 | ≤ 6.5 M | same | ≤ 27 ms | ≤ 8 ms | Apple M1 and M2, AMD's 680M and 780M, entry discrete GPUs, with a CPU at least twice the ×4 one |
| High | ≤ 1000 | ≤ 8.5 M | same | ≤ 30 ms | ≤ 12 ms | discrete GPUs (GTX 1660 class and up), Apple Pro and Max, a recent desktop CPU |
| Ultra | ≤ 1000 | ≤ 9 M | same | ≤ 32 ms | ≤ 15 ms | the same, with MSAA 4× and the mirror at a quarter size |

Also for every preset:

- The JS heap stays under 1.6 GB.
- No program compiles after the title card. `__game.renderer.info.programs.length` stays where `__game.prewarmed`
  left it.
- New content adds no lights. A light coming or going recompiles every lit material.

## The engine question

### The codebase

| | |
|---|---|
| JavaScript | 115 files, 58 000 lines (47 000 not blank or comments) |
| GLSL | about 2 000 lines in 70 shader blocks, 19 ShaderMaterials, 13 `onBeforeCompile` patches of three's own materials in 9 files, 6 patches of three's shader chunks (the fog ramps, the stable shadow taps, the cascade bias) |
| How deep three goes | 86 different `THREE.*` classes, 1 059 uses; the cascaded sun built on three's own shadow pass (sunlight.js); the per-instance culler living inside three's shadow pass (tiles.js) |
| The rest | 3 100 lines of docs, the bake scripts, the GPS companion extension, 584 commits since 21 October |

About 60 % of it is the game: the inventory, tasks, the store, dialogue, camp, fishing, the needs, the HUD's DOM,
the world data, the bake. Only a JavaScript engine would keep any of it as it is.

### What each move would cost and buy

| Option | What it costs | What it would fix | What we would lose |
|---|---|---|---|
| **Unity (WebGL / WebGPU build)** | All 47 000 lines rewritten in C#, every shader in ShaderLab/HLSL, the bake's output re-imported; months | Per-draw CPU is lower in Unity's C++ core, and the SRP batcher groups draws by shader. But the web build still reaches the GPU through the browser's WebGL calls, and on Pages it runs on one thread | Instant play: a 10–40 MB engine and player download before the title (we load 18 MB including the map). Pages can't send the Content-Encoding its pre-compressed files want, so they unpack in JavaScript and start slower. Its threads need SharedArrayBuffer, which needs COOP/COEP headers Pages can't send. The HTML HUD would be rebuilt in Unity UI |
| **Godot 4 (web export)** | The same rewrite in GDScript (Godot 4's C# had no web export as of 2025), the shaders in Godot's shader language | Not the bottleneck: the web export runs the Compatibility renderer (WebGL2), which gives up much of Godot's lighting, and submits its draws from one thread on Pages (4.3 and later can export without threads; earlier versions need COOP/COEP) | The same download and startup cost (an engine of 35–40 MB, about 9 MB compressed) before the title |
| **Unreal** | No supported web target since UE 4.24 | — | The browser altogether |
| **Babylon.js** | The rendering half rewritten (~20 000 lines: the materials, the shadows, the post chain, the instancing), the game kept | Babylon's per-draw overhead is in the same range as three's (both are JavaScript over WebGL2); its thin instances and its WebGPU engine are what three also has | Nothing on hosting, but months spent to land where we are |
| **Three's WebGPURenderer** | Every GLSL patch rewritten as TSL node materials (2 000 lines of GLSL and the 13 patches), the post chain as TSL passes, the cascaded sun and the culler re-hooked into a different renderer | WebGPU's draws are cheaper for the browser to validate, and render bundles can replay the static forest. It falls back to WebGL2 where WebGPU is missing. But it still walks the scene and binds each object in JavaScript, much as the WebGL renderer does, so the draw count stays the limit until the draws are batched anyway | Nothing on hosting; it stays a static page on Pages |
| **Stay on three.js + WebGL2, batch the draws** | Days, not months, in the files that already own it (vegetation.js, tiles.js) | The measured bottleneck directly | Nothing |

### The recommendation

Stay on three.js and WebGL2, and keep the game a static page on GitHub Pages. The data says why:

1. **The bottleneck is the number of draws.** It isn't the language, the GPU or the engine's features. At ×4 the
   frame is ~78 % three's per-object submission and ~22 % our own simulation. The GPU has room at Low.
   - Every engine above that runs in a browser submits through the same WebGL (or WebGPU) calls the browser
     validates.
   - Any engine would be held back by 250–960 separate draws on a slow CPU.
   - Unity's web build would be single-threaded on Pages, like us.
2. **The two biggest wins were inside three.**
   - This round's: an extra walk over 25 000 objects, an LOD pass over 16 000 meshes, and 3–4 M triangles of
     undivided terrain and over-detailed far rocks.
   - The next one is too: batching the forest.
3. **A switch costs the codebase and instant play.**
   - 47 000 lines rewritten, in another language for Unity or Godot.
   - A tens-of-megabytes engine download and startup.
   - The HTML HUD and every look decision in `docs/look.md` redone.
   - Pages can't send the COOP/COEP headers that threaded web builds need, nor the Content-Encoding that big
     pre-compressed engine files want.

### Next, in order of what it buys

1. **Batch the forest** (vegetation.js, tiles.js).
   - **The change.** A species' bins, variant groups and culling proxies in a tile become one `THREE.BatchedMesh`.
     Three r186 has it: several geometries under one material, per-instance matrices, colours and visibility, and
     one multi-draw call through `WEBGL_multi_draw`. The culler's chunks feed its per-instance visibility instead of
     refilling proxies.
   - **What it buys, by estimate.** The forest's 55–65 % of the draws becomes about one draw per species per tile
     per pass: roughly 40 % fewer draw calls in the woods, so the ×4 frame at Low would drop from ~17 ms to ~12 ms.
   - **The catch.** The mirror's whole-bin draws and the colliders that read `e.vegBins` must keep their data.
2. **Terrain LOD** for the far quarters (tile-worker.js): a 20 m index over the same vertices away from the shore
   bands, with skirts at the seams: by estimate about −0.4 M triangles at Low and −0.5 M in the mirror.
3. **The mirror's light state.** The mirror pass sees no lights and the main pass does, so three looks up every lit
   material's program twice a frame (~0.4 ms at ×1 at Medium and above). A mirror drawn at a different render depth
   (as three's Reflector does, inside the main pass) would keep its own light state.
4. **Memory.** Keep fewer tiles at Low (`MAX_LOADED` 36 → 25), and store the forest's instance matrices compactly
   (position, yaw, scale and tilt in 20 bytes, expanded on the GPU).
5. **WebGPU, later.** Once the forest is batched, three's WebGPURenderer with render bundles is the step after. It
   means rewriting the GLSL as TSL, and it stays on Pages.

## For the next person measuring

- **The driver and scripts** are in the planning session's scratchpad (session e939fbdb…, folder `round-a-c/`, built
  on the content join's driver). They aren't in the repo:
  - `driver.mjs`:
    - `/throttle?rate=4`, `/profile` (a CPU profile of frames, self and total time per function), `/mem`
      (process RSS)
    - `/use?p=b&url=…` (a second page for A/B)
    - `/loadtime?which=a|b&rate=&fresh=` (a production build served from `build-*/dist`)
  - `perf.js`: page side, `PF.counts`, `PF.drawCost`, `PF.drawCpu`, `PF.simCost`, `PF.fullCost`, `PF.gpuFit`,
    `PF.spot`.
  - `who.js`: draw calls and triangles per pass and per kind of object.
  - `tour.js`: program creep.
  - `toggles.js`: GPU cost by part.
  - `suite.mjs`, `ab.mjs`, `gpuab.mjs`.
- **Traps:**
  - `performance.memory` and frame times swing with other work on the machine. Interleave A and B, and take the
    best of several runs.
  - Under CPU throttling, the profile's "(program)" is the throttle's own pauses.
  - A page-side `import('/src/x.js')` is a second copy of the module (`bwca-vite-module-copy`). Toggle a module's
    state through `__game` or the settings, not through a fresh import.
  - The GPU timer queries read high on ANGLE over Metal (above).
  - The shadow pass doesn't run with the sun down (main.js `draw`), so a dusk scene has no shadow cost.
