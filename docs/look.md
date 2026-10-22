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

## The passes

Each ships on its own and is judged from the point by the lodge on Lake One (entry point 30) at noon,
17:30 and dusk, third person, plus a close-up and a wide shot across the lake.

| # | Pass | Files | Done when |
|---|---|---|---|
| 1 | **Ground and light.** Terrain as a painted splat: per-vertex weights for five or six ground materials (duff, moss, grass, rock, burn, sand), blended per pixel through a world-space noise so transitions are soft 2–6 m bands, mottle at three scales, canopy darkening; the shoreline keeps its cut, the class cuts go. Smooth lighting everywhere: Lambert (wrapped for foliage), hemisphere fill as the sky probe, toon ramps and the rim removed from terrain, ground cover, rocks and leaves. Occlusion baked per vertex into tree, rock and prop variants; the screen-space pass filtered or dropped. Soft stable shadows on the existing cascades. A shared lighting-and-fog shader chunk every material uses from here on. | `terrain.js`, `terrain-build.js`, `groundcover.js`, `rocks.js` (materials), `vegetation.js` (materials only), `post.js`, `sunlight.js` | No polygon edge anywhere on the ground; no banding on any surface; shadows that neither crawl nor shimmer when the camera turns; things sit on the ground. |
| 2 | **Foliage as cards on branches.** Trunk plus a branch skeleton; foliage as alpha-tested cards along the branches from a generated leaf-cluster texture (canvas at startup), normals pushed outward from the crown centre so clusters shade as soft volumes, alpha cutoff rising with distance; spruce and pine as tiers of needle fans on the trunk; shrubs and grass as card tufts, sparse, coloured from the ground. Far LOD as a few big cards. | `vegetation.js`, `geobuilder.js`, `groundcover.js`, a new `textures.js` | Every leaf is attached to a branch; no floating pieces from any angle; far trees puff into flat shapes; seasons still turn and drop the leaves. |
| 3 | **Rocks.** The shape sheet: slanted groups sharing one angle, layered flats, big simple boulders, pebbles; placement in groups. Flat grey diffuse coloured by the light, baked occlusion, edges lightened by curvature. | `rocks.js`, `placement.js` (rock groups), `props.js` (outcrops) | A shore of rock reads like the sheet; no two groups at the same angle; rocks sit in the ground. |
| 4 | **Atmosphere and grade.** Fog as a colour ramp by distance with a second ramp toward the sun, blended by the angle to it; a sun disc with god rays at half resolution; a three-stop sky; colour grading by curves; all keyed from the day cycle so sun, sky, fog and grade move together. | `fog.js`, `sky.js`, `post.js`, `daycycle.js` | The far shore is a flat pale shape at every hour; the same frame reads in three values at noon, 17:30 and dusk; dawn and night keep their character. |

Pass 1 goes first: the others build on its shader chunk. Passes 2, 3 and 4 then run in parallel.

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
