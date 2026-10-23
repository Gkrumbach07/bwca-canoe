# The look

Firewatch is the target, as close as a procedural game with generated textures can get. Read this before
touching anything that draws. The first plan (five passes on the low-poly, toon-ramped renderer) got the
floor, the light and the tree shapes part way and then showed its limits: one flat colour per triangle
makes every ground transition a polygon edge, crowns made of lumps never join their trunks, and the toon
ramps band the highlights and make shadow edges crawl. So the renderer pivots. The world, the tiles, the
placement, the water, the player and the HUD stay. How things are drawn changes.

## What Campo Santo did (Jane Ng's 2014 art Q&A, parts 1–3)

- Most of the colour comes from lighting, fog and colour correction, not textures. Rock diffuse is nearly
  flat grey with an occlusion bake multiplied in and edges drybrushed light; only the sandstone has a hue.
- One interpolation manager moves the sun, the sky, two fog systems and the grade together.
- The look is "graphic": distant things become flat colours with clean silhouettes. Fog takes a colour
  ramp by distance (two ramps when the sun matters), and the tree shader raises its alpha cutoff with
  distance so far trees puff into simple shapes. Shapes poking into negative space are simple and sharp.
- Trees are mesh trunks with painted foliage cards. Rocks follow a shape sheet: grouped slanted rocks all
  at one angle with large smooth planes, layered flat rocks, large boulders as one simple shape with a few
  divots, small slanted rocks, pebbles.
- Nothing is cel-shaded. "Feels real" is a smooth sphere grounded by soft occlusion.

## The frame

Late afternoon on a point. The sun is low and warm from one side; sunlit surfaces warm and saturated,
shade cool and blue, nothing muddy between. Under the spruce the floor is needle duff with moss, soft
patches that blend into each other over a few metres, with long blue trunk shadows across it. Grass only
where grass grows, as lighter clumps catching the sun. Trunks fat near the camera and thin far away, with
branches that carry the foliage. Crowns are soft clusters, bright on top and dark underneath, that puff
into flat shapes with distance. Rocks are simple planes and edges, grey, coloured by the light. The far
shore is a flat pale silhouette. The frame reads in three values: near dark, middle lit, far pale.

## The rules

1. **Value structure.** Near dark, middle lit, far pale. Depth comes from the fog ramp, not detail.
2. **Light.** Smooth. One warm key, a sky fill, soft stable shadows, occlusion wherever two things meet.
   No toon ramps, no rims, no steps.
3. **Colour.** Flat, calm materials; the colour arrives through the sun, the fog and the grade.
4. **Surfaces.** Big soft patches. Transitions blend over metres. Detail is sparse and placed.
5. **Silhouettes.** Simple and sharp against what is behind, simpler the further away.
6. **No violet by day.** Daytime shade is blue (hue 200–225), never lilac. Every warm stop in the day tables
   is yellow-orange (green well above blue) and every cool one cyan-blue (green above red), so no blend between
   them can pass through violet; pink and violet belong to the sky at dusk and night only (keys −5 and −1). A
   grade curve that holds green below both red and blue anywhere turns every grey there magenta, so the shade
   lifts blue, then green, over red, and at the black point green lifts as much as blue. A warm glow is never
   added on top of blue sky (orange plus blue is violet where they meet): the warm band rises instead.

## The passes

Each ships on its own and is judged from the point by the lodge on Lake One (entry point 30) at noon,
17:30 and dusk, third person, plus a close-up and a wide shot across the lake. Since phase 1 every change is
judged on the look board (working notes): ten fixed spots at those hours and a July evening, one sheet.

| # | Pass | Files | Done when |
|---|---|---|---|
| 1 | **Ground and light.** Terrain as a painted splat: per-vertex weights for five or six ground materials (duff, moss, grass, rock, burn, sand), blended per pixel through a world-space noise so transitions are soft 2–6 m bands, mottle at three scales, canopy darkening; the shoreline keeps its cut, the class cuts go. Smooth lighting everywhere: Lambert (wrapped for foliage), hemisphere fill as the sky probe, toon ramps and the rim removed from terrain, ground cover, rocks and leaves. Occlusion baked per vertex into tree, rock and prop variants; the screen-space pass filtered or dropped. Soft stable shadows on the existing cascades. A shared lighting-and-fog shader chunk every material uses from here on. | `terrain.js`, `terrain-build.js`, `groundcover.js`, `rocks.js` (materials), `vegetation.js` (materials only), `post.js`, `sunlight.js` | No polygon edge anywhere on the ground; no banding on any surface; shadows that neither crawl nor shimmer when the camera turns; things sit on the ground. |
| 2 | **Foliage as cards on branches.** Trunk plus a branch skeleton; foliage as alpha-tested cards along the branches from a generated leaf-cluster texture (canvas at startup), normals pushed outward from the crown centre so clusters shade as soft volumes, alpha cutoff rising with distance; spruce and pine as tiers of needle fans on the trunk; shrubs and grass as card tufts, sparse, coloured from the ground. Far LOD as a few big cards. | `vegetation.js`, `geobuilder.js`, `groundcover.js`, a new `textures.js` | Every leaf is attached to a branch; no floating pieces from any angle; far trees puff into flat shapes; seasons still turn and drop the leaves. |
| 3 | **Rocks.** The shape sheet: slanted groups sharing one angle, layered flats, big simple boulders, pebbles; placement in groups. Flat grey diffuse coloured by the light, baked occlusion, edges lightened by curvature. | `rocks.js`, `placement.js` (rock groups), `props.js` (outcrops) | A shore of rock reads like the sheet; no two groups at the same angle; rocks sit in the ground. |
| 4 | **Atmosphere and grade.** Fog as a colour ramp by distance with a second ramp toward the sun, blended by the angle to it; a sun disc with god rays at half resolution; a three-stop sky; colour grading by curves; all keyed from the day cycle so sun, sky, fog and grade move together. | `fog.js`, `sky.js`, `post.js`, `daycycle.js` | The far shore is a flat pale shape at every hour; the same frame reads in three values at noon, 17:30 and dusk; dawn and night keep their character. |

Pass 1 goes first: the others build on its shader chunk. Passes 2, 3 and 4 then run in parallel.

## What landed after the pivot

All merged on main by 2026-10-22 (`docs/roadmap.md`, phase 1). The interfaces other code leans on are in the
sections below.

| Pass | What changed | Files |
|---|---|---|
| **Grade** | The lilac out: every daytime stop of the day tables and the grade curves rebuilt to the no-violet rule; the sky's gradient and glow made one GLSL chunk shared with the water; toward a low sun the warm bands rise (`skyLift`). | `daycycle.js`, `sky.js` |
| **Water and lake plants** | The water's colour is the lake's own (depth over the measured Secchi depth) lit by the frame's light, and it mirrors the sky dome and, in a quarter-size pass, the shore, its trees and the canoe. Ripples by wind; a soft shore band. Lake plants: pad rafts with lilies, reeds, pondweed, wild rice, keyed by season. | `water.js`, `aquatic.js`, `aquatic-textures.js`, `floating.js`, `wake.js`, `placement.js` (`placeAquatic`) |
| **Crowns** | Fuller, lighter crowns: denser sprites, normals turned skyward, cards keep 55 % of the baked occlusion, a leaf glow where the sun comes through thin edges, far twins matched in value. | `vegetation.js`, `textures.js`, `geobuilder.js` |
| **Rocks** | Shards, irregular slabs and soft boulders with chamfers cut as planes of the solid; rocks seated on the drawn mesh; groups with one or two dominant rocks and pebbles at their feet. | `rocks.js`, `placement.js`, `tile-worker.js`, `terrain-build.js` (`meshHeightAt`) |
| **Built props** | Dock, shack, rack, campsites, trails and signs built the way they would be, on one atlas material, worn, with box occlusion; the trail a decal that paints the ground under it. | `props.js`, `prop-kit.js`, `tasks.js` |
| **Canoe and paddler** | A lofted 17 ft tripper with its fittings and a Duluth pack, a skinned paddler with arm and leg IK (feet planted on the ground under each foot), a water line that rides the swell, the first-person eye. | `canoe.js`, `hull.js`, `figure.js`, `gear.js`, `hullwater.js`, `loft.js` |
| **Phase 1 polish** | One exact ground query used by everything that stands outside placement; the hull seated on it; the dead water rows gone from the day tables; the look board. | `tiles.js`, `prop-kit.js`, `props.js`, `player.js`, `camera.js`, `daycycle.js`, `lookboard.js` |

## What stays and what we do not do

The pipeline stays: procedural meshes built in the worker, instanced per species, streamed in tiles. Textures
are generated at startup and kept simple; hand-painted ones can replace them later in the same slots. No
baked lightmaps, no PBR, no external assets.

## Working notes

- Test in the browser with `window.__game.step(dt, n)` (the hidden pane runs no animation frames); close
  the title card, close the outfitter's panel, wait for `player.teleporting` to clear, then step. Set the
  hour with `__game.day.setClock(2026, 295, hours)`.
- A worktree has no `public/data` or `node_modules`: link them only if missing (`[ -e public/data ] ||
  ln -s …`), or you make a self-referencing loop that hangs every dev server. Give the server its own port.
- `npx -y eslint@8 --no-eslintrc --env browser,es2022,worker --parser-options=ecmaVersion:2023,sourceType:module --rule 'no-undef: error' src/` before committing.
- Shader uniforms added through `onBeforeCompile` go in the declarations, not the body; `vColor` is a vec4
  in r186; alpha-tested cards cast shadows only when the material sets `alphaTest` so the depth pass sees it.
- The look board: `await __game.lookboard()` renders every spot of `SPOTS` at every hour of `SETS`
  (lookboard.js) into one labelled sheet and returns `{ url, frames, … }` (a PNG data URL; downloaded too when
  the page is visible). `{ spots: ['Lake One bluff'], sets: ['22 Oct 17:30'] }` takes a subset, `{ type:
  'image/jpeg' }` a smaller file. It holds the animation loop, the clock, the weather and the wind while it runs
  and puts them, the player and the canvas size back after. A set may carry its own `weather` (a weather.js state,
  held for the frame; without it the forecast's own) and `wind` (m/s, 2 when not given) and `from` (bearing);
  the default board has a July storm at 15:00 and a fog morning. Add a spot by adding an entry; keep spots within
  a few kilometres of the lodge so the tiles stay loaded. The full sheet (60 frames) takes 3–6 s once the tiles
  are in.
- The dev server's watcher skips `.claude/` (worktrees), `public/data`, `data-cache`, `node_modules` and `dist`,
  matched relative to the folder it serves, so the main checkout ignores worktree edits while a server started
  inside a worktree still reloads on its own edits. `strictPort` is on: pass a free `--port`.
- The hidden pane leaves the canvas 0 × 0, so the camera's projection is NaN: anything that unprojects fails
  and frustum culling is off (draw calls and triangles read about 4x high). Force a size first
  (`camera.aspect`, `renderer.setSize`, `post.resize`), and dispatch a window `resize` event afterwards to put
  it back. Screenshots of the pane show only the page; capture with `renderer.domElement.toDataURL()` in the
  same task as the draw.
- Long runs: `javascript_tool` gives up after 45 s, so start a run as a promise on `window` and poll it.
  `player.teleport` streams tiles only while frames run, so step while awaiting it. The trip is saved on
  `pagehide` too: set `__game.saver.enabled = false` before reloading, or the next load starts at the last spot.
  A page-side `import('/src/x.js')` can be a second copy of a module Vite has re-served as `?t=…`: import the
  URL the game loaded.

## The shared light (from pass 1)

- Every lit material composes `src/shading.js`: start from a `MeshLambertMaterial`, call `applyLook(shader, { wrap })`
  first in `onBeforeCompile`, then patch; or use `makeLookMaterial(params, { wrap, name, compile })`. Give each
  variant its own `name` (it keys the program cache). `wrap`: 0 for ground, rock, bark and props; 0.667 for
  foliage (`dotNL * 0.6 + 0.4`); `'varying'` reads `attribute float aWrap` per vertex (vegetation: `smoothToon`
  in `rocks.js` tags leaves 0.667 and bark 0). `lookSky` (fragment float, default 1) scales the hemisphere fill
  for a point that sees less sky. `lookHash`, `lookNoise`, `lookFbm`, `lookFade` are world-space noise in both
  stages (integer-lattice hashes: exact at any coordinate, no seams).
- The fog hook: `lookFog.pars` is declared after `<fog_pars_fragment>` and `lookFog.fragment` replaces
  `<fog_fragment>` in every composed material; both resolve to fog.js's ramps (below).
- Occlusion is baked per vertex into the colour (`src/occlusion.js` `bakeOcclusion(geo, { rays, reach, ground,
  floor })`): `smoothToon`, `creasedToon` and `angularRock` call it, so every tree, shrub, boulder, outcrop and
  the hull carry it. New geometry for passes 2 and 3 should go through the same call. There is no screen-space
  AO pass any more.
- Shadows: `sunlight.js` replaces three's per-pixel-rotated PCF disc with a fixed 5 x 5 tent of hardware taps,
  `shadow.radius / 2` texels apart, so penumbrae are smooth and do not crawl when the view turns.
- The ground: `terrain-build.js` `splatAt` writes eight material weights (`aSplatA` duff, moss, meadow, burn;
  `aSplatB` rock, dark rock, lichen rock, shore) and `aFloor` (canopy shade, sunny stand, bed, bed depth); the
  shader (`terrain.js` `glslGround`, uniforms `groundUniforms`) blends them. The ground cover evaluates the same
  `groundColor` from the class map plus the cover atlas's fourth byte (moss and shade nibbles).

## The air, the sky and the grade (pass 4, grade)

- One fog for every material (built-in, look, water, clouds, mist, wake): fog.js replaces three's fog chunks,
  so import it before any material compiles. Inside `#ifdef USE_FOG` a shader can call `fogAt(vFogDir)` (vec4:
  the haze's colour, and how much it covers, 0..1) or `fogApply(colour, vFogDir)` (the haze laid over a
  colour, which is all `<fog_fragment>` does). The water applies it itself, once per pixel, and leaves the
  mirrored shore as its own pass hazed it.
- The ramps: `fogState.away` and `fogState.sunward`, 16 steps each even in u = s / (s + 600 m), s the view
  distance through air that thins with height; blended toward the sun by `fogParams`. The day cycle builds a pair
  per sun-altitude key from the `fog*` rows of its tables. Tune live: edit `DAY_TABLES.T.<row>[key]` in the
  console, then `DAY_TABLES.rebuild()`.
- The sky: `glslSky` (sky.js) is the dome's gradient and glow as one chunk, `skyGradient(d, zenith, mid,
  horizon, sunDir, lift)` and `skyGlow(d, sunDir, sunColor, glow.xy)`. The dome's uniforms are `uZenith`,
  `uMid`, `uHorizon`, `uSunColor`, `uGlow` (amount, power, lift) and `uSunDir`; the water holds those very
  uniform objects (main.js passes `sky.material.uniforms` to `WaterSystem`) and calls the same two functions,
  so the mirrored sky is the dome by construction. Renaming a uniform or changing a signature means water.js
  follows.
- The post chain (post.js): the scene renders into a 4-sample multisampled HalfFloat target (MSAA; the canvas
  itself has none), god rays at half resolution, then one pass for ACES, the sRGB transfer, the per-key curves,
  saturation, vignette and dither. The day cycle writes `post.look` each frame (set `post.look.vignette`, not
  the uniform). Because the target is multisampled, `alphaToCoverage: true` works on alpha-cut materials: the
  lake plants use it. The foliage cards still cut with `discard` against `uCardCut` (vegetation.js: the cutoff
  falls with distance from the eye, so far crowns fill out into flat shapes; a custom depth material cuts the
  same way for the shadows); coverage on them is untried (roadmap, phase 2).
- The water's colour comes from the lake and the light, not the day tables: the table keeps only `foam`, and
  the day cycle writes the water's `uFoam`, `uIce` and `uSunDir`.
- Rain wets the world: `applyWet(shader, { porosity, gloss })` (weather.js) after a look material's own colour
  patches darkens the albedo by `WEATHER.uWetness` times the porosity (ground 1, rock and cliff 0.5, bark and
  wood 1, leaves 0.3) and adds a faint sky sheen on what faces up. The terrain, the grass, the cards, the rocks,
  the cliffs, the props and the trail decal compose it; a new look material should too.
- A building storm's anvils (sky.js) stand 6.5–7.6 km upwind, sheared across the line of sight; the cumulus within
  60 degrees of upwind goes while they show, so they stand clear over it.

## Foliage (pass 2, crowns)

- The sprites live in one generated atlas (textures.js). Each has a fixed slot (`SLOTS[name]`: rectangle, anchor,
  halo) and geometry bakes UVs from it (`spriteUV(name, s, t)`), so a slot never moves. A hand-painted sprite
  drops in with `setSprite(name, image)` or `await loadSprite(name, url)`; the far sprites (`farOval`,
  `farCone`, `farPine`) are composed from the near ones once, so replace those too.
- The leaf glow wraps three's `RE_Direct` in the card material (`uLeafGlow`: strength, lobe power, fade start and
  end); it depends on the names `LambertMaterial` and `RE_Direct` in shading.js's light chunk.

## Water and lake plants

- The column (the lake pass, water.js): what comes up out of the water is the bed seen through it and the veil of
  light the water scatters back. A tint pass (the near patch drawn once more just before the surface, renderOrder 9,
  multiply blending) multiplies the column's colour into everything the opaque pass left under the water (the bed, its
  stones and logs, the weed): per channel exp(-K x path x `COLUMN.transmit`), the path down to the bed and back up
  the refracted view, K = 1.7 / Secchi x the lake's spectral shape (clear: green passes most; stained: red does) + the
  water's own red. The surface then lays the veil over it (1 - exp(-veil x (path / Secchi)^veilPow): little in the first
  half of the Secchi depth, about half at it) showing `WATER_LOOK` `clear`, `deep` or `stain`, and the Fresnel mirror
  over all; past the patch the darkening folds into the veil. `COLUMN` and `WATER_LOOK` are live-tunable.
- Each lake's Secchi depth: the DNR's 301 soundings as measured, every other lake estimated in world.js
  (`estimateSecchi`: the bake's regional figure moved by max depth, pond size, flow and name, `CLEAR_LAKES` set
  outright); the estimate is the lake record's `secchi` too (`secchiBaked` keeps the bake's).
- The bed (terrain-build.js `bedPre`, terrain.js): under water the splat carries sand, cobble, silt and bedrock in
  aSplatA and a weed bed in aSplatB.x, aFloor = (Secchi / 10, 0, 1, true depth / 16); the shader paints sand ripples,
  rounded cobble over gravel, mottled silt, jointed bedrock, weed tufts, the deep ooze and caustics in the sun
  (`uBedLook`, `uBedMats`; water.js drives `uBedTime` and `uBedSun`). placement.js `bedFeatures` puts boulders (the
  boulder species) and scree-block stones on the stony beds, sunken logs off wooded shores and awash logs in the
  quiet shallows.
- `REFLECTION = { scale, reach, full }` sets the mirror pass. Terrain, trees, snags and outcrops go on
  `REFLECT_SHORE_LAYER` as tiles come in; the canoe and the rod on `REFLECT_LAYER`. The setting (R) turns the
  pass off and the water mirrors the sky alone; the pass also stops 150 m inland.
- The shore's ripple lines are contours of the shore distance (a 10 m lattice, interpolated), so they are kept to
  the last 2.8 m of water and broken into dashes a metre or three long; further out its contours would run on as
  long strings across a bay.
- `aquatic.js`: kinds 0 pads (variants: plain, spatterdock with raised pads, white lily, yellow lily), 1 reeds
  (bulrush, reed, cattail, sedge tussock), 2 weed (pondweed, milfoil), 3 wild rice; the `AQUA` uniforms `uGrow` (pads
  on the surface June to mid-September), `uBloom`, `uTan`, `uIceHide` come from the season. placement.js
  `placeAquatic` grows each where it grows (the bed's softness, a marshy or rocky shore behind, shelter, an inlet, the
  lake's stain); its depths are to the drawn bed (`surfaceAt`), not the raw cells. A bin is culled by distance from
  the middle of its own instances plus their spread, not its 640 m region's centre.

## Rocks

- `rockGeometry(kind, seed)` and `makeRockMaterial()` (rocks.js): `block` (a shard), `slab`, `boulder`. Each
  family's base is y = 0 inside `FOOT`; placement.js's `ROCK_FOOT` holds the same outlines: change one, change
  the other. `seatRock(ground, foot, …)` sinks a rock until its whole outline is under the ground it is given.

## The ground things stand on

- The terrain mesh is not the height field: the shore band's rock bumps and the flat triangles between vertices
  put it up to a metre off `surfaceAt` (bilinear) near the shore. Two exact queries:
  - `world.tiles.groundAt(x, z)` (tiles.js): the game's ground. Each installed fine tile keeps a `MeshGround`
    (prop-kit.js) over the very arrays its mesh draws (no copy; the bucket list is skipped when the triangles
    come in quad order, as they do), so a query is the triangle under the point: exact to 1e-12 m, about 75 ns.
    A tile's mesh runs from half a cell into it to half a cell into the next, so the quad lattice picks the
    tile. Off an installed mesh it falls back to `meshHeightAt` on the world's cells. The walker
    (`player.groundAt`, and through it the paddler's feet), the hull set down or beached (`restHull`), the
    props, the lost items and the camera's clearance all read it.
  - `meshHeightAt(grid, x, z, cache)` (terrain-build.js): the same mesh computed from any grid, for the worker
    and placement (no mesh exists yet there); the plain split in a cell the waterline cuts, a few centimetres off.
- `restHull` lays the hull along the slope and across it (roll up to 17°), then settles it until its sampled
  bottom (keel and bilges, from hull.js `keelAt` and `section`) touches the ground without cutting in.
- prop-kit.js: `propMaterial()` (one material for every prop: a 16-cell generated atlas with worn paint),
  `PropBuilder`, `occlude(geo, boxes, { ground })` (occlusion against a few boxes and the ground), `bakeSelf`,
  `chunkStone`, `MeshGround`, and the trail decal's material, which paints terrain.js's `groundColor` under it.

## Canoe and paddler

- `hull.js` holds the hull's shape for anyone who needs it (`HULL`, `section`, `keelAt`, `outerAt`, `floorAt`,
  `sheerY`); `canoe.js` builds the rig: `canoe.ground` (set by player.js) is the ground under each foot,
  `canoe.eye(out, yawRel, pitch, dt)` the first-person eye, `canoe.hull` the hull's pivot (`dropHull` lifts it
  0.3 m above the height it is given).
- The hull and the figure bake their occlusion in the background after load (loft.js `bakeLater`): wait for
  `bakesPending() === 0` before judging colours.

## Performance and quality (phase 2)

- **Timing a frame.** Use the wall time of frames drawn back to back with a one-pixel `readPixels` at each end
  (quality.js `frameCost(targets)`): that is the frame as the slower of the CPU and the GPU sets it. The GPU timer
  queries (`EXT_disjoint_timer_query_webgl2`) read two to three times high per pass on ANGLE over Metal (the gaps
  between passes count as GPU time; a half-resolution blur reads 3 ms), so compare passes by switching them off and
  timing the frame. quality.js `profile(__game)` still gives exact per-pass CPU time, calls and triangles. Hold the
  animation loop while timing; even a hidden pane sometimes runs it.
- **Per-instance culling** (tiles.js `InstanceCuller`). The bins that cost (full geometry or casting shadows) and the
  variant-group meshes beside them are drawn through proxies: one for the view, one per cascade, each holding only
  the instances that can show in its pass. The bin leaves layer 0 and keeps the mirror's shore layer, so
  `water.renderReflection` still draws it whole with its forced geometry and counts. updateVegetationLOD stays the
  authority on visibility, geometry, count and shadow; the proxies copy them every frame and share the material, so
  the sway, the swell and the seasons need nothing. A mesh is prepared once before its first cull (a few per frame,
  under `CULL.budget` ms; until then it draws whole): **its instances are sorted in place along a Morton curve of
  16 m cells inside each variant group**, so the bin's `b.matrices` (and `e.vegBins`) are no longer in placement
  order; nothing may rely on that order. Chunks of neighbours are tested first, then instances in the chunks that
  straddle a plane, and a proxy is refilled and uploaded only when what it holds changed. View proxies are culled in
  `scene.onBeforeRender` (main camera only), cascade proxies in `sunlight.js cascadeHooks` (called once the cascades
  are fitted, inside the shadow pass); a cascade proxy is visible only during the shadow pass and answers the shadow
  pass's frustum test for its own cascade only. `CULL.farSmall` drops instances under that radius past 60 m from the
  far cascade (1.5 m whenever the shadow reach is under 300 m, which is every preset but Ultra).
- **Tile groups are frozen** once installed (tiles.js `freeze`): their world matrices are computed once and the
  scene's per-frame matrix walk skips them (it walked ~24 000 objects). Anything added to a tile group later must set
  its own `matrixWorld`, as the variant-group meshes and the proxies do.
- **Quality presets** (quality.js `PRESETS`, settings.js `quality`): Low, Medium, High, Ultra and Auto. A preset only
  sets the display rows (shadow map size, `shadowReach`, `lod`, `vegDensity`, `reflections`, `reflectionScale`,
  `antialias` 4 / 2 / fxaa / off, `godRays`, `renderScale`); changing a row by hand makes it Custom. **Ultra is the
  game as it was** (2048 maps to 300 m, MSAA 4x, the mirror at a quarter size). Every preset keeps the shadows on, so
  switching never recompiles. Auto times High (then Ultra, or Medium and Low) behind the title card a few seconds
  after the first start and keeps the best under 11 ms (`AUTO_BUDGET`); `__game.settings.runAuto()` reruns it. FXAA
  is compiled into the grade pass by a define (as a uniform branch it cost 2 ms even when off).
- **The occlusion bakes are cached** (occlusion.js): keyed by a hash of the positions, normals, index and options,
  their per-vertex factors kept in IndexedDB (`bwca-occlusion`), so a second start skips them; bump `BAKE_VERSION`
  if the bake itself changes. main.js awaits `occlusionCacheReady` before the kits are built. The bake walks a
  uniform grid along each ray and gives exactly the brute-force result (checked on all 239 startup bakes).
- **Numbers** (M4 Pro, 1920 × 1080, pixel ratio 1, synced wall time per frame with the simulation, best of 5 x 20
  frames; the machine was shared, so expect ±10 %):

  | Spot | Before | Ultra | High | Medium | Low |
  |---|---|---|---|---|---|
  | Lodge 12:00 | 10.6 ms, 895 calls, 15.0 M tris | 8.3 ms, 781, 9.4 M | 8.4 | 6.9 | 4.7 ms, 319, 3.7 M |
  | Lodge 17:30 | 10.4 ms, 877, 14.9 M | 8.4 ms, 787, 8.9 M | 7.9 | 7.4 | 5.0 ms, 349, 3.3 M |
  | Open lake 17:30 | 10.2 ms, 972, 14.3 M | 8.2 ms, 837, 8.4 M | 8.4 | 6.4 | 4.8 ms, 322, 3.1 M |
  | Forest 17:30 | 9.7 ms, 920, 13.9 M | 8.5 ms, 854, 9.2 M | 7.9 | 7.5 | 4.5 ms, 342, 3.6 M |

  At 1080p this machine is CPU-bound near 6 ms of draw submission on Ultra (three's traversal of ~22 000 tile meshes
  in each of four scene walks a frame, and ~800 draws); the GPU part is ~7–8 ms and scales with pixels (4K Ultra:
  18 ms). The shadow pass was 2.5 ms of the 10.4 before; with the culling the shadow pass draws 2.6 M triangles, not
  6.6 M. On-screen frame rate is still unmeasured (the pane stayed hidden).
