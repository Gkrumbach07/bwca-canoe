# BWCA Canoe

A small low-poly canoeing game set on real terrain in the Boundary Waters Canoe Area Wilderness: the whole
wilderness, from Crane Lake to the Pigeon River, streamed in 2.56 km tiles as you paddle. You start at the
Lake One landing (entry point 30) east of Ely, Minnesota.

- **Real elevation**: USGS 3DEP / SRTM heights via the public AWS Terrain Tiles (Terrarium encoding).
- **Real lakes, portages, campsites and entry points**: OpenStreetMap, from an offline Geofabrik extract.
- **Real depths** where the Minnesota DNR has mapped the lake: its bathymetric contours shape the bed
  (85 lakes in the Boundary Waters, Snowbank at 43 m, Loon at 64 m); the HUD shows the depth under the canoe.
- **Everything else is procedural**: terrain colouring, lake beds, six tree species with per-tree variation,
  shoreline boulders, campsites (fire grate, log, tent), portage trails and markers, the canoe, the paddler
  and the paddle stroke, the water, the sky and the clouds. No external assets.
- **Streamed world**: a 10 m grid of 200 x 69 km (138 million cells) is baked into 2,106 tiles; the game keeps
  the 5 x 5 tiles around the canoe built (terrain, water, forest, trails) in a pool of web workers, a coarse
  80 m far field underneath, and lets the rest go. Memory stays around 400 MB and the frame cost near
  3.5 M triangles, the same as the old single-area build.
- **GPS simulation**: the canoe's real-world latitude/longitude is broadcast as the device location,
  so other tabs that ask for geolocation see you paddling (see *GPS simulator* below).

## Run

```bash
npm install
npm run bake:all
npm run dev
```

Open http://localhost:5173. The baked map data lives in `public/data/` and is not committed (about 250 MB
of tiles); the first bake downloads the Minnesota OpenStreetMap extract (290 MB) and about 5,800 elevation
tiles (500 MB) into `data-cache/`, then bakes the whole wilderness in about a minute (3 GB of RAM). Re-bakes
use the cache and finish in the same minute. For a quick test bake of the Lake One area only:

```bash
npm run bake
```

Other areas: `node scripts/bake.mjs --bbox S,W,N,E` (degrees). The areas and the grid/tile layout are in
`scripts/config.mjs`. If `osmium` is installed the extract is cut to the area first (seconds); without it the
extract is scanned in Node (about 15 s). The bake needs network access to `download.geofabrik.de` and
`s3.amazonaws.com/elevation-tiles-prod` the first time.

## Controls

| Key | Action |
|---|---|
| W / S | paddle forward / back-paddle |
| A / D | turn (sweep strokes) |
| Shift | hustle |
| E | portage when near a landing, launch at the far end |
| M | enlarge the map (three times the area) |
| R | toggle water reflections (costs a second scene pass) |
| 1 / 2 / 3 | game speed 1× / 2× / 4× |
| mouse drag / wheel | look around / zoom |
| click the map | teleport to the nearest open water (anywhere in the wilderness) |
| entry point list | teleport to one of the 55 BWCA entry point landings |

Paddle up to a portage landing (the trail marker on shore) and press **E**: the canoe is shouldered and you
walk the real trail with W/S. Portage lengths are shown in rods, as they are on every BWCA map.

## Data pipeline

`npm run bake:all` runs `scripts/bake.mjs --all`:

1. **OpenStreetMap** (`scripts/osm-extract.mjs`, `scripts/osmpbf.mjs`): downloads the Geofabrik Minnesota
   extract once, cuts it to the area (osmium when available), and reads water polygons (`natural=water`,
   riverbanks, reservoirs; multipolygon relations are stitched), portage ways (`portage=*`, `canoe=portage`,
   `highway=portage`), campsites (`tourism=camp_site`) and landing points of interest with a dependency-free
   PBF reader. The result is cached as JSON per area.
2. **Elevation** (`scripts/elevation.mjs`): Terrarium z14 tiles for the area are cached and sampled
   bilinearly, row by row.
3. **One global 10 m grid** in a local metres projection with a single origin at the area centre (x east,
   z south; the ~1 % scale drift over 70 km of latitude is accepted). The grid is padded to whole tiles.
4. **Bands with a halo**: elevation sampling, the exact Euclidean distance transform to the shoreline
   (clamped at 3 km) and the shore smoothing run in 1024-row bands with a 320-row halo wider than the clamp,
   so every value equals a whole-grid computation and nothing changes across band or tile edges.
5. **Basins, levels, names** on the full grid: connected lake water shares one level (a low percentile of
   its interior DEM heights, robust to shoreline trees). Rivers and creeks get a **per-cell level** instead:
   a monotone non-increasing profile is fitted along each OSM waterway line (a running low percentile of the
   DEM, then pool-adjacent-violators, anchored to the lakes the line passes through and reversed when the
   DEM says the way was drawn upstream), then spread across the river's width. Creeks that OSM maps only as
   lines are rasterized as channels about two cells wide so they exist as water. Unnamed channels and bays
   take the name of the nearest named lake reachable by water (one multi-source flood fill).
6. **Depth** (`scripts/bathymetry.mjs`): the DNR *Lake Bathymetric Contours* for the area are fetched once
   through the Geospatial Commons REST service and cached. Each contour line is rasterized as a known depth,
   the first ring of water cells is pinned at zero, every cell starts from its nearest known depth and sixty
   Gauss-Seidel sweeps relax the rest into a smooth bed. Lakes without a DNR map keep a synthetic bed that
   drops at about 9 % from the shore, capped at 14 m.
7. **Shore shaping**: lake beds are carved below their level and shoreline land is lifted above it, in
   bands again, then the tiles are cut.
8. **Output** in `public/data/`:
   - `index.json`: grid and projection, per-tile flags (has water, height range), the lake table (names,
     display names, levels, centroids), basins, every portage (polyline, rods, launch points), campsites,
     entry points and the start position.
   - `tiles/{tx}_{ty}.bin`: gzip of `[height Int16 dm][lake id Uint16][shore distance Int16 dm][water level Int16 dm]` for
     268 x 268 cells: the 256-cell tile plus a 6-cell halo on every side, so a tile can be built (terrain,
     forest, props) from its own bytes alone, and shared edge vertices come out bit-identical on both sides.
   - `far/{fx}_{fy}.bin`: the same layout on an 80 m grid (block means; the deepest cell decides the lake id)
     in 256-cell far tiles for the far field.
   - `overview.png`: an 80 m/px shaded map of the whole area for the minimap.

Entry points come from OSM features named `… BWCA Entry Point` where they exist, otherwise from the hand
list in `scripts/entrypoints.json` (number, name, the OSM lake name and an approximate position); edit that
file to add or correct landings.

## Runtime

- `src/world.js` loads `index.json` and answers every spatial query (`heightAt`, `shoreAt`, `lakeIdAt`,
  `levelAt`) through the loaded tiles, falling back to the far field and then to flat ground.
- `src/tiles.js` (`TileManager`) keeps the 5 x 5 tiles around the canoe and 3 x 3 far tiles loaded. A pool of
  workers (`src/tile-worker.js`) fetches and gunzips a tile, places the forest deterministically from the
  global cell coordinates (`src/placement.js`), builds the terrain (`src/terrain-build.js`) and the water
  mesh (`src/water-build.js`) as transferable typed arrays; the main thread wraps them into meshes, one tile
  per frame, and builds the tile's trails and campsites (`src/props.js`). Tiles outside the neighbourhood
  are dropped least-recently-wanted first; far chunks stand in wherever a fine tile is missing.
- **Floating origin**: every tile's geometry and instance matrices are local to the tile corner, and the
  water shaders work relative to the corner of the player's tile. All wave frequencies are rounded to whole
  periods per 2,560 m (`src/waves.js`), so the origin can jump by a tile without the swell changing phase.
- The water patch samples a sliding 256-cell atlas of shore distance and level around the canoe
  (`src/water.js`); the minimap draws loaded tiles from their own cells over the baked overview (`src/hud.js`).

## GPS simulator

A web page cannot change what other tabs see from `navigator.geolocation`, so the game ships with a small
companion extension in `extension/` that does it:

1. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**, click **Load unpacked**
   and pick the `extension/` folder.
2. Keep the game tab open. The HUD panel under the map turns green when the extension is talking to it.
3. Any page you load afterwards (Google Maps, a weather site, your own app) gets the canoe's position,
   heading, speed and altitude from `getCurrentPosition` / `watchPosition`, and `permissions.query` reports
   geolocation as granted. Pages that were already open need a reload.
4. The extension's toolbar popup shows the current fix and has a switch to turn spoofing off, which falls
   back to the real geolocation API.

The game also publishes the fix on a `BroadcastChannel` named `bwca-canoe-geo` and in `localStorage`
(`bwca-canoe-geo`) for same-origin pages, and overrides `navigator.geolocation` on its own page.

## Layout

```
scripts/config.mjs        areas, grid and tile layout, projection
scripts/osmpbf.mjs        dependency-free OpenStreetMap PBF reader
scripts/osm-extract.mjs   Geofabrik download, osmium cut, water / portage / campsite / POI extraction
scripts/elevation.mjs     Terrarium tile prefetch and row sampler
scripts/bathymetry.mjs    DNR lake depth contours from the Geospatial Commons REST service
scripts/bake.mjs          the tiled bake: bands, basins, shores, tiles, far field, overview, index.json
scripts/entrypoints.json  hand list of BWCA entry points
src/world.js              index loading, tile slots, height / shore / lake / level queries, lat-lon conversion
src/grid.js               shared grid queries; TileGrid (one halo'd tile) for the worker and props
src/tiles.js              TileManager: worker pool, neighbourhood, LRU, far field, visibility
src/tile-worker.js        fetch + gunzip + build one tile off the main thread
src/terrain-build.js      terrain geometry and ground colours (pure); src/terrain.js: material and mesh
src/placement.js          deterministic forest placement (pure); src/vegetation.js: species geometry, instancing, LOD
src/water-build.js        far water mesh (pure); src/water.js: shaders, floating origin, sliding atlas, reflection
src/waves.js              swell constants shared by the shaders and the canoe
src/sky.js                sky dome shader and low-poly clouds (wrap around the camera)
src/props.js              per-tile portage trail ribbons, trail markers, campsites
src/canoe.js              canoe hull loft, paddle, paddler rig, stroke and portage-carry animation
src/player.js             paddling physics, shoreline collision, portage state machine, teleport
src/camera.js             chase camera
src/hud.js                HUD text, prompts, tiled minimap, entry point list
src/wake.js               hull foam and paddle splash particles on the water surface
src/geo.js                GPS broadcast to the extension and same-origin tabs
extension/                Chrome/Edge MV3 extension that spoofs navigator.geolocation everywhere
```

Known limits: only the 85 lakes with a DNR depth map have real depth, the rest use the synthetic bed; river
surfaces follow the DEM profile, so a rapid shows as a steady drop rather than a step; creeks are two cells (20 m) wide because of the 10 m grid; the Canadian side of
the border lakes is only as complete as the Minnesota extract makes it (add `north-america/canada/ontario` to
`CFG.extracts` in `scripts/config.mjs` for the Quetico shore).

Map data © OpenStreetMap contributors (ODbL). Elevation: USGS 3DEP / NASA SRTM via Mapzen/AWS Terrain Tiles.
Lake depths: Minnesota DNR Lake Bathymetric Contours, Minnesota Geospatial Commons.
