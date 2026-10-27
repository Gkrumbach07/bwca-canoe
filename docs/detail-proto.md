# LiDAR detail prototype: 2 m and 5 m ground near the player (2026-10-27)

> **Decided, and superseded for the data.** The owner chose **2 m near the player**. The production bake is
> `scripts/detail-bake.mjs` (`npm run bake:detail`): 640 m chunks at 2 m and 1280 m chunks at 5 m for the whole US
> side. Its format, numbers and how to run it are in [data-sources.md, "2 m detail"](data-sources.md#2-m-detail-lidar-near-the-player).
> This page stays as the record of the comparison; the `?detail=` flag below still reads the prototype's own
> per-tile files from `scripts/detail-proto.mjs`, not the production chunks.

The owner asked to **see** what the Minnesota LiDAR looks like at 2 m and at 5 m near the player, next to today's
10 m, before choosing one. This is a prototype behind a URL flag. With the flag off the game is unchanged.

## Running it on a Mac

1. Get the v4 data into `public/data` (`npm run data:sync`, or a symlink to a `public-data-v4` folder) and install
   GDAL (`brew install gdal`).
2. `node scripts/detail-proto.mjs` cuts the two test tiles at 2 m and 5 m into `public/data-detail/` (git-ignored).
   It builds the GDAL VRT of the state's 2 m DEM in `data-cache/lidar/raw/` if it is missing, then reads only the
   windows it needs over HTTP. It takes about 10 s and writes 2.9 MB.
   - Options: `--area lakeone,palisade`, `--tiles 31_20,62_14`, `--res 2,5`, `--force`.
3. Run `npm run dev` and open one of:
   - `http://localhost:5173/?detail=2`: the 2 m ground.
   - `http://localhost:5173/?detail=5`: the 5 m ground.
   - `http://localhost:5173/?detail=10`: today's 10 m, with the switch armed.
4. With any of the three, you can switch in the console without reloading: `__game.tiles.detail.set(2)` (or `5`,
   or `10`). The tiles round you rebuild, one a frame, in a few seconds.
5. Where to go. The game starts next to the Lake One test tile, so just paddle there:
   - **Lake One shore cliff** (tile 31_20). Paddle to about x −19860, z 17340 and look south-west. The face is on
     the south-east shore of the narrows, at about (−19980, 17500).
   - **Border Route palisade** (tile 62_14). It is 78 km east, near Rose Lake. Paddle to (59180, 1470) and look
     south. The face is at about (59200, 1730), 200 m up from the shore.

## What the flag changes

**The ring.** A fine tile with a detail file at the chosen resolution is built from it when it is the tile under
the player or one of the eight round it. It is rebuilt when it comes into the ring or leaves it. These files are
involved:

- `src/detail.js`: the flag, the index, the ring, the runtime switch, and the grass offset.
- `src/detail-build.js`: the worker side.
- One-line hooks in `src/tiles.js`, `src/tile-worker.js`, `src/terrain-build.js` and `src/main.js`.

**The mesh.** The terrain of a detail tile is a regular lattice, one vertex every 2 m or 5 m. The lattice runs
through the 10 m cell centres, and the waterline is cut the same way as today. A 2 m tile is 1.7 M vertices and
3.3 M triangles. A 5 m tile is 280 k vertices and 0.55 M triangles. Today's tile is 110–130 k vertices and 0.2–0.24 M
triangles.

**Water.** The water itself is unchanged. Wherever the 10 m tile says water, the ground is the 10 m lake bed
(bathymetry), shaped as today. Within 2 m inland, the ground eases from the waterline up to the LiDAR, so a face
at the shore rises straight out of the water. The bake also sets the hydro-flattened water samples to the tile's
own level.

**Seams.** Within 60 m of the tile's edge the ground eases back to the 10 m mesh. On the edge it is that mesh
exactly. A 1.5 m skirt closes the slit where the 10 m neighbour has a vertex every 5 m in the shore band and the
2 m lattice has none (up to 0.3 m).

**Everything that stands on the ground reads the detail heights.** `surfaceAt` and `meshHeightAt` answer from the
lattice on a detail tile, so all of these follow it:
- the trees, the rocks and the cliff modules (placement in the worker);
- the site's steepness and the paint's walls;
- the props, the walker and the canoe set down, the camera's clearance (tiles.js `groundAt` reads the drawn mesh).

The grass clumps stand on the 10 m surface in their shader, so a 2 m offset map round the player (192 m square)
lifts them onto the detail ground.

**What stays at 10 m.** These still come from the 10 m tile, sampled bilinear as before:
- the colour, forest, rock and cliff channels;
- the water, the shore distance and the lake bed;
- `world.heightAt`, the rough height used by the animals, the audio and the photo line of sight.

## What it looks like

The shots are side by side, 10 | 5 | 2, with the same camera at 12:30 on 15 July, clear. They are taken in
headless Chromium with SwiftShader, so the game draws exactly as it does in play.

| Shot | What changes |
|---|---|
| Lake One, from the canoe, 200 m | Little at this distance. The dark band of the face is a little crisper at 5 m and 2 m. |
| Lake One, on foot at the top, from 40 m out on the water | **The big one.** At 10 m the "cliff" is a grassy 40° slope that the cliff modules sit on. At 5 m and 2 m it is a sheer 7–9 m rock face rising straight out of the water. 2 m adds the ledges and the overhang lines. 5 m is close to 2 m here. |
| Lake One, overview, 60 m up | The shoreline face reads as a clean step at 5 m and 2 m. Elsewhere it is nearly the same. |
| Palisade, from the canoe, 250 m | Nearly the same. The face is mostly drawn by the cliff modules (`cliffs.js`), which already stand on the 10 m cliff channel. |
| Palisade, on foot at the base | The ground at the foot changes: the talus apron and the bench move, and the modules seat lower at 2 m. The face itself is still the modules. |
| Palisade, overview, 80 m up | Very close. The cliff band is the modules in all three. |

**Takeaway.** The detail matters most where the terrain itself is the cliff: the low shore faces the modules don't
fully cover, and the ground you walk on. Where a cliff is already drawn by the modules (the palisades), the 10 m
ground hides little. In a rollout, the modules should be tuned (or thinned) where the lattice already carries the
face, or the two double up.

## What it costs

These numbers come from this sandbox: 4 cores, no GPU, Chromium with SwiftShader, 800 × 520, with one detail tile
in the ring. The triangle counts are exact. A frame here takes 1.6–3 s, so read the frame times only as ratios.
- **Drawn** is what one frame draws: the view, the shadow cascades and the mirror together.
- **Loaded** is the terrain of every loaded tile.
- **Terrain arrays** is their bytes, held once on the CPU and once on the GPU.

| Spot | | Drawn triangles | Draw calls | Frame (SwiftShader, median of 30) | Terrain loaded | Terrain arrays | JS heap |
|---|---|---|---|---|---|---|---|
| Lake One, canoe | 10 m | 2.83 M | 336 | 2.48 s | 4.96 M tris | 146 MB | 0.90 GB |
| | 5 m | 3.15 M (+11 %) | 335 | 2.53 s (+2 %) | 5.26 M | 155 MB | 0.96 GB |
| | 2 m | **6.63 M (+134 %)** | 335 | **2.93 s (+18 %)** | 8.05 M | 234 MB | 1.11 GB |
| Lake One, top of the face | 10 m | 1.80 M | 235 | 1.65 s | 4.96 M | 146 MB | 1.09 GB |
| | 5 m | 2.41 M (+34 %) | 278 | 2.54 s (noisy) | 5.26 M | 155 MB | 1.00 GB |
| | 2 m | **6.02 M (+234 %)** | 281 | 2.98 s (+80 %) | 8.05 M | 234 MB | 1.11 GB |
| Palisade, base of the face | 10 m | 2.55 M | 300 | 2.09 s | 6.65 M | 195 MB | 1.59 GB |
| | 5 m | 2.83 M (+11 %) | 304 | 2.18 s (+4 %) | 6.98 M | 205 MB | 1.43 GB |
| | 2 m | **4.89 M (+92 %)** | 304 | 2.34 s (+12 %) | 9.76 M | 284 MB | 1.58 GB |

**Draw calls barely move.** The detail tile is still the same 4 quarter-meshes. Only the triangles grow, in the
view and in every shadow cascade that touches the tile.

**One detail tile's terrain arrays:**
- 5 m: about +9 MB.
- 2 m: about +88 MB.
- Each is held on the CPU and again on the GPU.
- The JS heap reading is dominated by everything else, and the garbage collector's timing makes it noisy.

**Building a tile in the worker.** A 5 m tile takes 0.6–0.7 s plus 0.06–0.09 s for the lattice heights. A 2 m tile
takes 3.4–4.0 s plus 0.3–0.4 s. For comparison, today's whole terrain build is 0.5–1.0 s.

**The grass offset map.** It costs 5–10 ms each time it is rebuilt, which happens every 32 m walked or when a tile
installs.

**Memory, per detail tile.**
- At 2 m, the terrain arrays take about 88 MB, held on the CPU and again on the GPU (about 35 bytes per vertex and
  12 per triangle). That is 60 % of today's whole 5 × 5 neighbourhood of terrain, in one tile.
- At 5 m it is about 9 MB more than today's tile.

**A rollout's real cost.** In the test areas only one tile has detail, so the ring holds at most that tile. If every
tile had detail, the 3 × 3 ring would be:
- **2 m:** about 30 M triangles loaded and some 800 MB of terrain arrays, which is not shippable as it stands. It would need a nested LOD: 2 m
  only within about 300 m, in 640 m blocks (the tile is already cut into 16 blocks for culling), and 5 m or 10 m
  beyond.
- **5 m:** about 5 M triangles and some 120 MB for the ring. That is heavy but in reach, especially with the same
  block-level LOD.

## Data size if rolled out

| | 2 m | 5 m |
|---|---|---|
| Per tile (gzip; these two tiles, about 30 % lake) | 1.17–1.26 MB | 0.22–0.24 MB |
| Per tile, land-heavy (estimated) | 1.4–1.6 MB | 0.28–0.32 MB |
| Full US side, 1,436 tiles with LiDAR | **1.8–2.2 GB** | **0.33–0.45 GB** |
| Release total with today's 366 MB | 2.2–2.6 GB, over GitHub Pages' 1 GB | 0.7–0.8 GB, fits under 1 GB, tight |
| Per visit, the 3 × 3 ring | 11–14 MB | 2–3 MB |
| Per 2.56 km travelled, a new row of 3 | 3.5–4.5 MB | 0.7–0.9 MB |

For comparison, today's whole 5 × 5 neighbourhood of 10 m tiles is about 4 MB.

- **The format.** Int16 centimetres, delta-coded along each row, then gzip.
- **The fixes for 2 m:**
  - Quantising to 5 cm (the face loses nothing visible) and a predictor across rows would save perhaps 25–35 %.
  - Even then, 2 m needs other hosting: a bucket behind a CDN (docs/HOSTING.md `VITE_DATA_URL`), or detail only
    along the canoe routes and portages.
- **5 m fits Pages as is.**

## Not done / caveats

- Ontario has no LiDAR, so the bake fills any sample off the flight from the 10 m tile. Neither test tile has such
  samples.
- The ring is whole tiles, so crossing a tile edge rebuilds up to three tiles, and the 80 m far chunk shows for a
  few seconds while it does.
- A rollout wants blocks of 640 m, not tiles, built by distance.
- The cliff modules (`cliffs.js`) and the scree are still placed from the 10 m cliff channel. On a detail tile
  they sit on the real face, but they still draw their own blocky face over it.
- The frame times are SwiftShader on a shared CPU. Measure on real hardware before choosing; the triangle counts
  carry over exactly.
