# BWCA Canoe

A small low-poly canoeing game set on real terrain in the Boundary Waters Canoe Area Wilderness: the whole
wilderness, from Crane Lake to the Pigeon River, streamed in 2.56 km tiles as you paddle. You start at the
Lake One landing (entry point 30) east of Ely, Minnesota.

- **Real elevation**: USGS 3DEP / SRTM heights via the public AWS Terrain Tiles (Terrarium encoding).
- **Real lakes, portages, campsites and entry points**: OpenStreetMap, from an offline Geofabrik extract.
- **Everything else is procedural**: terrain colouring, lake beds, nine tree species with per-tree variation,
  shoreline boulders, campsites (fire grate, log, tent), portage trails and markers, the canoe, the paddler
  and the paddle stroke, the water, the sky and the clouds. No external assets.
- **Streamed world**: a 10 m grid of 200 x 69 km (138 million cells) is baked into 2,106 tiles; the game keeps
  the 5 x 5 tiles around the canoe built (terrain, water, forest, lake plants, trails) in a pool of web
  workers, a coarse 80 m far field underneath, and lets the rest go.
- **GPS simulation**: the canoe's real-world latitude/longitude is broadcast as the device location,
  so other tabs that ask for geolocation see you paddling (see *GPS simulator* below).
- **A day in the Boundary Waters**: a 20-minute day/night cycle drives the sun, a sky-matched haze, the
  clouds, the water, stars and moonlight, with dawn mist over the lakes. Lakes are clear in the shallows
  (lily pads, reeds and weeds grow in sheltered water) and tannin-dark in the deep. Loons drift, dive and
  call; wind, lapping water and paddle dips are synthesized, no samples.
- **The look**: flat categorical colours on a faceted ground; trees, shrubs, rocks and the canoe are welded
  smooth and shaded with a stepped toon ramp, after Firewatch; grass tufts and fireweed near the camera.

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
| W / S | paddle forward / back |
| A / D | turn (sweep strokes) |
| Shift | hustle |
| E | portage when near a landing, launch at the far end |
| M | enlarge the map (three times the area) |
| V | switch between first-person and chase camera |
| [ / ] | step the time of day back / forward an hour |
| P | pause the clock |
| N | mute / unmute the synthesized soundscape |
| R | toggle the canoe's water reflection (costs a second scene pass) |
| 1 / 2 / 3 | game speed 1× / 2× / 4× |
| mouse drag / wheel | look around / zoom |
| click the map | teleport to the nearest open water (anywhere in the wilderness) |
| entry point list | teleport to one of the BWCA entry point landings |

Paddle up to a portage landing (the trail marker on shore) and press **E**: the canoe is shouldered and you
walk the real trail with W/S. Portage lengths are shown in rods, as they are on every BWCA map.

The map is drawn as a paper topographic sheet in the spirit of the Fisher and McKenzie maps: hypsometric
tints, 10 m contours, pale-blue lakes, red dashed portages with rod counts, red campsite dots and serif
lake names. It is a window around the canoe: loaded tiles are drawn from their own cells, the 80 m far
field fills in beyond them. `M` opens it wide.

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
   its interior DEM heights, robust to shoreline trees). River polygons keep their own level so rapids do
   not merge lakes at different heights. Unnamed channels and bays take the name of the nearest named lake
   reachable by water (one multi-source flood fill).
6. **Shore shaping**: lake beds are carved below their level and shoreline land is lifted above it, in
   bands again, then the tiles are cut.
7. **Output** in `public/data/`:
   - `index.json`: grid and projection, per-tile flags (has water, height range), the lake table (names,
     display names, levels, centroids), basins, every portage (polyline, rods, launch points), campsites,
     entry points and the start position.
   - `tiles/{tx}_{ty}.bin`: gzip of `[height Int16 dm][lake id Uint16][shore distance Int16 dm]` for
     268 x 268 cells: the 256-cell tile plus a 6-cell halo on every side, so a tile can be built (terrain,
     forest, props) from its own bytes alone, and shared edge vertices come out bit-identical on both sides.
   - `far/{fx}_{fy}.bin`: the same layout on an 80 m grid (block means; the deepest cell decides the lake id)
     in 256-cell far tiles for the far field.
   - `overview.png`: an 80 m/px shaded map of the whole area.

Entry points come from OSM features named `… BWCA Entry Point` where they exist, otherwise from the hand
list in `scripts/entrypoints.json` (number, name, the OSM lake name and an approximate position); edit that
file to add or correct landings.

## Runtime

- `src/world.js` loads `index.json` and answers every spatial query (`heightAt`, `shoreAt`, `lakeIdAt`,
  `levelAt`) through the loaded tiles, falling back to the far field and then to flat ground.
- `src/tiles.js` (`TileManager`) keeps the 5 x 5 tiles around the canoe and 3 x 3 far tiles loaded. A pool of
  workers (`src/tile-worker.js`) fetches and gunzips a tile, places the forest, the lake vegetation and the
  ground-cover map deterministically from the global cell coordinates (`src/placement.js`), builds the
  terrain (`src/terrain-build.js`) and the water mesh (`src/water-build.js`) as transferable typed arrays;
  the main thread wraps them into meshes, one tile per frame, and builds the tile's trails and campsites
  (`src/props.js`). Tiles outside the neighbourhood are dropped least-recently-wanted first; far chunks
  stand in wherever a fine tile is missing.
- **Floating origin**: every tile's geometry and instance matrices are local to the tile corner, and the
  water shaders work relative to the corner of the player's tile. All wave frequencies are rounded to whole
  periods per 2,560 m (`src/waves.js`), so the origin can jump by a tile without the swell changing phase.
- **The surface atlas**: the water keeps a sliding 256-cell atlas of shore distance, water level, terrain
  height and ground cover around the canoe (`src/water.js`). The same GLSL (`glslSurface`) gives every
  shader the terrain surface and the swell exactly as the water patch renders it: lily pads, reeds, foam
  bubbles and loons ride it (`src/floating.js`, `src/wake.js`), grass stands on it (`src/groundcover.js`),
  the mist is masked by it (`src/mist.js`).
- The day/night cycle (`src/daycycle.js`) drives the lights, the sky dome, the clouds, the water colours, the
  stars, the mist and the colour grade (`src/post.js`); the haze is matched to the sky by overriding three's
  fog chunks (`src/fog.js`).

## GPS simulator

A web page cannot change what other tabs see from `navigator.geolocation`, so the game ships with a small
companion extension in `extension/` that does it:

1. Open `chrome://extensions`, turn on *Developer mode*, choose *Load unpacked* and pick the `extension/`
   folder.
2. Keep the game tab open. The extension receives every position fix the game publishes and overrides
   `navigator.geolocation.getCurrentPosition` / `watchPosition` in every other tab.
3. Click the extension's toolbar icon to switch the simulation on or off.

The game also publishes the fix on a `BroadcastChannel` named `bwca-canoe-geo` and in `localStorage`
(`bwca-canoe-geo`) for same-origin pages, and overrides `navigator.geolocation` on its own page.

## Lake depth and clarity

The bed is currently carved from the shoreline (about 9 % grade, capped at 14 m) and every lake uses the
same clarity (`uClarity`, 3 m, a typical Secchi depth for these tannin-stained lakes). Real data exists
and could replace both: the Minnesota DNR *Lake Bathymetric DEM* (5 m rasters for surveyed lakes) and
contour shapefiles on the MN Geospatial Commons, and Secchi clarity readings per lake from the DNR
LakeFinder / MPCA lake water quality pages.

## Layout

```
scripts/        bake pipeline (config, OSM extract, elevation, bake)
src/            the game (three.js, ES modules; tile-worker.js runs in web workers)
extension/      the GPS simulator Chrome extension (MV3)
public/data/    baked tiles, not committed
```
