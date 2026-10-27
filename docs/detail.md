# LiDAR detail: 2 m ground near the player (shipped 2026-10-27)

The ground within about 300 m of the player is drawn from the Minnesota 2 m LiDAR. From there to about 900 m it is
drawn from a 5 m set made from the same data. Past that the game draws its 10 m tiles as before. The owner chose
2 m after comparing 10, 5 and 2 m in the game (the prototype; see "History" at the end).

**On by default** wherever the data has a `detail/` folder (v4 on R2: `https://data.gagekrumbach.com/bwca/v4/detail/`).

- **To turn it off:** open the game with `?detail=10` (or `?detail=off`). The 10 m game is then exactly as it was.
- **Switching at runtime:** `__game.tiles.detail.setEnabled(false)` (or `true`) in the console. Every chunk is let
  go and everything is re-seated on the 10 m ground over the next frames.
- **Where there is no detail:** with data that has no `detail/` folder (v3, an old v4), the index fails to load and
  nothing changes. Ontario and Quetico have no chunks, nor do all-water chunks, so the 10 m tiles stay there.

The data, its format and how it is baked are in [data-sources.md, "2 m detail"](data-sources.md#2-m-detail-lidar-near-the-player).

## Files

- `src/detail.js`: the main thread's half, `DetailStreamer` (`tiles.detail`). It handles the rings, installing and
  letting go, the blend, the ground query, the re-seating and the cliff thinning. `detailGrass` lifts the grass.
- `src/detail-build.js`: the worker's half. It holds `decodeChunk`, `chunkGround` (the drawn heights of a chunk's
  samples) and `buildChunk` (the mesh).
- `src/tile-worker.js`: the `chunk` message. The tile's grid, site and shade are kept for the next few chunks.
- `src/tiles.js`: hooks into the tile manager.
  - The workers are shared.
  - `groundAt` asks the detail first.
  - Evicting a tile lets its chunks go.
  - `treesNear` skips the hidden cliff modules.
  - `sortBin` and `binMoved` support the re-seating.
  - The terrain's quarter meshes are tagged.
- `src/main.js`: the grass hook.

## The rings

Distances are from the player to the chunk's nearest point.

| Level | Chunk | Installed inside | Let go past | Built ahead inside | Arrays dropped past |
|---|---|---|---|---|---|
| 2 m | 640 m (4 × 4 a tile) | 300 m | 400 m | 520 m | 640 m |
| 5 m | 1280 m (2 × 2 a tile) | 900 m | 1050 m | 1200 m | 1400 m |

- **A 2 m chunk is installed only once the 5 m chunk over it is in.** The 5 m ring is wider, so that chunk is always
  built first.
- **Every chunk needs its 10 m tile installed.** The worker reads the tile's data, and the chunk replaces part of
  that tile's mesh.
- **The workers are the tile workers.** A chunk wanted in its ring now goes before a tile that is more than one
  tile from the player's. A chunk built ahead goes only when no tile is waiting.
  - The first chunk of a tile that a worker builds carries a copy of the tile's data (as installed) and its forest
    shade. The worker keeps the last three tiles' grids and sites, and the last six 5 m chunks' heights.
- **Installs are whole.** One frame adds the chunk's meshes, hides what it covers and re-blends its neighbours.
  Installs run nearest first, under a 6 ms budget, with at least one a frame.

## What a chunk covers, and what covers it

The lattices all run through the 10 m cell centres, so the blocks nest exactly:

- **A 5 m chunk is exactly one quarter of its tile's 10 m terrain.** `tile-worker.js partTerrain` now buckets the
  10 m triangles by the quad they lie in, not their centroid, so each quarter mesh holds quads 128k … 128k + 127.
  The tile's quarter mesh is hidden while the 5 m chunk is in.
- **A 2 m chunk is exactly one quarter of its 5 m chunk.** The 5 m chunk is drawn as four meshes over one set of
  arrays, and the quarter under a 2 m chunk is hidden.
- **No coarser ground is ever drawn under detail,** so nothing can z-fight or poke through.

## Seams: the blend

**Every vertex carries three heights:**
- its own level's;
- the 5 m surface's, as the 5 m mesh draws it (2 m chunks only);
- the 10 m mesh's, as `meshHeightAt` draws it (with the shore band's subdivision and bumps).

It carries a normal for each too. On the main thread, `blend` sets each vertex to

- 2 m: `mix(mix(h10, h5, w5), own, w2)`
- 5 m: `mix(h10, own, w5)`

**The weights.** `w2` and `w5` are 1 inside the chunk. Within `BLEND` (50 m) of an edge or corner whose neighbour
at that level is not in, they ease to 0 (a smoothstep).
- Two chunks that share an edge compute the same weights along it, because each edge or corner term of one is an
  edge or corner term of the other. So at a boundary a chunk is exactly the coarser surface its neighbour draws.
- `w5` of a 2 m chunk is worked out in its 5 m parent's frame, from the parent's neighbours.
- A neighbour coming or going changes only the blend of the chunks round it. Only the band within 50 m of their
  edges is rewritten and uploaded. Nothing is rebuilt.

**What is left** is the T-junctions where a 2 m edge meets a 5 m one (the 5 m surface bends between the 2 m
vertices), and the one-unit difference between neighbours' shared samples (5 cm at 2 m, 10 cm at 5 m). A skirt hides
both. It hangs 2 m (2 m chunks) or 3 m (5 m chunks) below each edge, painted and lit as the edge, with both windings.

**Deep water.** A 10 m quad whose every sample is more than 30 m out in a lake is drawn as the 10 m mesh's own two
triangles (same split), not 25 squares of lattice. Its edges are straight in every level, so the finer squares
beside it meet it without a crack.

## Water and the shore

The water is unchanged.
- **Under water** (the 10 m shore distance below 0) the ground is the 10 m mesh: the lake bed.
- **Within 2 m inland** it eases from the waterline up to the LiDAR, so a face at the shore rises straight out of
  the water.
- **Within 30 m of the shore** it never sits under its own water's level.
- **The waterline** cuts the lattice as the 10 m mesh's does, with twin vertices painted land and bed.

The water shader's shore band (its depth under the surface) still reads the 10 m atlas. Under water that is the same
ground, so the band is unchanged.

**The paint** is the 10 m tile's: its site, its channels and the forest's shade, by vertex. The slope and the walls
are read off the chunk's own lattice, so a LiDAR face paints as rock.

## What stands on the ground

**`tiles.groundAt` answers from the finest chunk in** (`detail.heightAt`): the exact triangles, blend included. The
fans at the waterline are left out, which costs a few centimetres there. So all of these stand on what is drawn:
- the walker and its feet;
- the canoe set down, beached and pulled up;
- the camera's clearance;
- the lost items and the props built at runtime;
- the actors.

`world.heightAt` (the animals, the audio, the photo line of sight) stays the rough 10 m height, as before.

**Re-seating.** The worker placed the trees, rocks, cliff modules and props on the 10 m ground. When a chunk comes
in or goes, its rect (grown by `BLEND`) is re-seated by `detail.reseat`, under a 2 ms budget a frame. Each item moves
by `dyAt` (the drawn ground less the 10 m mesh) less what it was moved before, and the amount applied is kept per
item. This covers:

- **Every instance of the tile's bins** (trees, rocks, cliff modules, logs).
  - A bin's order is fixed first (`tiles.sortBin`, the sort the culling would make).
  - Its culling spheres are made again (`tiles.binMoved`).
- **The collision.** The solids' origins are moved and their shapes made again. The trunks' seats are moved and
  their radii measured again.
- **The props.** Every vertex of a merged campsite or a trail decal, and every ledge instance, moves by the dy
  where it stands.

**The grass.** The grass clumps stand on the 10 m surface in their shader. `detailGrass` adds a 2 m offset map
(192 m square) round the player. It is rebuilt every 32 m walked, or when the chunks change.

## The cliff modules

A cliff module (`cliffs.js`, placed from the 10 m cliff channel by `placement.js cliffFeatures`) is hidden where a
2 m chunk is in and the LiDAR already carries the face (`carriesFace`). The test runs along the module's fall line,
from 4 m in front of its foot to its back:
- the ground must rise by 0.6 of the module's height;
- it must be 50° or steeper over 4 m somewhere.

A real face at 2 m is 50–70°. A slope the 10 m channel called a cliff, but which the LiDAR shows at 30°, keeps its
module.

- A hidden module's instance is scaled to nothing, its matrix kept aside, and its solid is left out of the
  collision.
- It comes back when the 2 m chunk goes.
- Where no detail exists (Quetico, Ontario, past 300 m), the modules stay.
- The scree and the loose blocks stay.

## Numbers

See [performance.md, "LiDAR detail"](performance.md#lidar-detail-2-m-near-the-player-2026-10-27). In short: 1.41× the 10 m triangles drawn at Lake One and the palisade, no frame over 50 ms from the detail while travelling (worst 43 ms), 0.30 MB a km downloaded, 50–66 MB of chunk arrays installed.

## Not done / caveats

- **Props on a tile's edge.** A prop reaching over a tile edge onto a neighbour's installed chunk is built on the
  detail ground and never re-seated when that chunk goes. This is rare, and it is off by the chunk's dy, a few
  decimetres.
- **Tents pitched before a chunk came in** (`camp.js`) stay where they were pitched.
- **The pop at 300 m.** The cliff modules disappear when the 2 m chunk comes in, so a palisade's blocky modules give
  way to the LiDAR face at that distance.
- **The palisades lose their drama up close.** At the Border Route palisade every module within the 2 m ring passes
  the test, so the face is the LiDAR's alone. At 2 m the DEM smooths a vertical face into a rounded 50–60° slope,
  and the blocky 30 m columns of the modules are gone. The low shore faces (Lake One) gain the most. If the
  palisades should keep their modules, raise the steepness in `carriesFace` (0.9 now) or keep modules taller than
  about 20 m.
- **The Ontario edge.** On the Ontario side the chunk's samples are the v4 heights (data-sources.md), so nothing
  changes there.

## History: the prototype

The prototype (`?detail=2|5`, `scripts/detail-proto.mjs` and per-tile files in `public/data-detail/`) rebuilt
whole 2.56 km tiles round the player from the LiDAR. It cost:
- 3.3 M triangles and about 88 MB per tile at 2 m;
- several seconds of rebuilding at every tile edge.

What it showed:
- **The detail matters most where the terrain itself is the cliff.** At 10 m the Lake One shore face is a grassy
  40° slope with the cliff modules on it. At 2 m it is a sheer 7–9 m face out of the water.
- **Where the modules already draw a cliff** (the palisades), the 10 m ground hides little.

That per-tile path and its script are removed. The production chunks (`scripts/detail-bake.mjs`) replace them.
