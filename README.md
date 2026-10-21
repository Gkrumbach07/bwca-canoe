# BWCA Canoe

A small low-poly canoeing game set on real terrain in the Boundary Waters Canoe Area Wilderness:
the Lake One → Lake Two → Lake Three → Lake Four chain east of Ely, Minnesota (entry point 30).

- **Real elevation**: USGS 3DEP / SRTM heights via the public AWS Terrain Tiles (Terrarium encoding).
- **Real lakes, portages and campsites**: OpenStreetMap, pulled straight from the OSM API.
- **Everything else is procedural**: terrain colouring, lake beds, six tree species with per-tree variation,
  shoreline boulders, campsites (fire grate, log, tent), portage trails and markers, the canoe, the paddler
  and the paddle stroke, the water, the sky and the clouds. No external assets.
- **GPS simulation**: the canoe's real-world latitude/longitude is broadcast as the device location,
  so other tabs that ask for geolocation see you paddling (see *GPS simulator* below).
- **A day in the Boundary Waters**: a 20-minute day/night cycle drives the sun, a sky-matched haze, the
  clouds, the water, stars and moonlight, with dawn mist over the lakes. Lakes are clear in the shallows
  (lily pads, reeds and weeds grow in sheltered water) and tannin-dark in the deep. Loons drift, dive and
  call; wind, lapping water and paddle dips are synthesized, no samples.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. The baked map data is already in `public/data/`. To re-bake (different area,
resolution or fresh OSM data) edit `CFG` at the top of `scripts/bake.mjs` and run:

```bash
npm run bake
```

Downloads are cached in `data-cache/`. The bake needs network access to `api.openstreetmap.org` and
`s3.amazonaws.com/elevation-tiles-prod`.

## Controls

| Key | Action |
|---|---|
| W / S | paddle forward / back-paddle |
| A / D | turn (sweep strokes) |
| Shift | hustle |
| E | portage when near a landing, launch at the far end |
| M | enlarge the map |
| V | switch between first-person and chase camera |
| [ / ] | step the time of day back / forward an hour |
| P | pause the clock |
| N | mute / unmute the synthesized soundscape |
| R | toggle the canoe's water reflection |
| 1 / 2 / 3 | game speed 1× / 2× / 4× |
| mouse drag / wheel | look around / zoom |
| click the minimap | teleport to the nearest open water |

Paddle up to a portage landing (the trail marker on shore) and press **E**: the canoe is shouldered and you
walk the real trail with W/S. Portage lengths are shown in rods, as they are on every BWCA map.

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

## Lake depth and clarity

The bed is currently carved from the shoreline (about 9 % grade, capped at 14 m) and every lake uses the
same clarity (`uClarity`, 3 m, a typical Secchi depth for these tannin-stained lakes). Real data exists
and could replace both: the Minnesota DNR *Lake Bathymetric DEM* (5 m rasters for surveyed lakes) and
contour shapefiles on the MN Geospatial Commons, and Secchi clarity readings per lake from the DNR
LakeFinder / MPCA lake monitoring data. Both are free downloads; wiring them in means sampling the
bathymetry raster in `scripts/bake.mjs` where the bed is carved and writing a per-lake `clarity` into
`world.json`.

## Layout

```
scripts/bake.mjs    data pipeline: OSM + elevation → public/data/{world.json,height.bin,lake.bin,sdist.bin}
src/world.js        loads the bake, height / shore-distance / lake queries, lat-lon conversion
src/terrain.js      chunked flat-shaded terrain with procedural colouring
src/water.js        water shader (low-poly swell, depth tint, Fresnel, glitter, shoreline foam)
src/sky.js          sky dome shader and low-poly clouds
src/vegetation.js   tree and boulder generators, forest placement into regional instanced meshes
src/props.js        portage trail ribbons, trail markers, campsites
src/canoe.js        canoe hull loft, paddle, paddler rig, stroke and portage-carry animation
src/player.js       paddling physics, shoreline collision, portage state machine
src/camera.js       chase camera
src/hud.js          HUD text, prompts, minimap
src/geo.js          GPS broadcast to the extension and same-origin tabs
src/fog.js          sky-matched fog, patched into three's fog shader chunks
src/daycycle.js     time of day: sun, moon, stars, and every colour keyed on sun elevation
src/post.js         colour grading pass (lift, split toning, saturation, vignette)
src/aquatic.js      lily pads, reeds and submerged weeds in sheltered shallows
src/groundcover.js  grass and fireweed on a camera-following patch
src/loons.js        loons: drift, dive, resurface, flee, call
src/mist.js         dawn mist sheets over the water
src/audio.js        synthesized wind, lapping, paddle dips and loon calls
src/floating.js     materials that ride the swell or sway on the bed
extension/          Chrome/Edge MV3 extension that spoofs navigator.geolocation everywhere
```

Map data © OpenStreetMap contributors (ODbL). Elevation: USGS 3DEP / NASA SRTM via Mapzen/AWS Terrain Tiles.
