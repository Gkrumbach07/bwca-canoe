# The look

What the picture is aiming at, the rules that get there, and the passes that build it. Read this before
touching anything that draws. The references are Firewatch (light, air, the floor), The Witness (clean
colour, occlusion) and Rime (painterly gradients). We get there with colour, light and shape on the
existing pipeline: procedural low-poly meshes, instanced per species, streamed in tiles, toon ramps for
the sun. No painted textures, no foliage cards, no baked lightmaps, no PBR.

## The frame

Late afternoon on a point. The sun is low and warm from one side and everything splits into two clear
families: sunlit surfaces warm and saturated, shade cool and blue, nothing muddy between. Under the
spruce the floor is orange-brown needle duff with patches of moss, calm and nearly empty of detail, with
long blue trunk shadows across it. Grass is only where grass grows (the point, the clearing by the
lodge, the burn), as lighter clumps catching the sun. Trunks are fat near the camera and thin far away;
birches carry dark scars and a lit side, spruce have ragged tips and dead lower branches. Crowns are
clusters, bright on top and dark underneath, with a thin bright rim where the sun is behind them, and the
ground darkens under each. The water is deep blue-green with a crisp reflection. The far shore is a flat
pale-teal silhouette, the sky grades from a warm horizon to deep blue. The frame reads in three values:
a dark near edge, a lit middle, a pale far.

## The rules

1. **Value structure.** Near dark, middle lit, far pale. Depth comes from air, not detail.
2. **Light.** One warm key, one cool fill, hard shadows near the player, occlusion wherever two things meet.
3. **Palette.** Saturated and light in the sun, blue in the shade. Dark values only for the near frame.
4. **Surfaces.** Big calm patches of colour. Detail is sparse and placed, never carpeted.
5. **Silhouettes.** Every tree, rock and ridge reads as a shape against what is behind it.

## The passes

Each ships on its own and is judged by a screenshot from the lodge on Lake One (entry point 30) at
noon, at 17:30 and at dusk, third person, standing on the point.

| # | Pass | Files | Done when |
|---|---|---|---|
| 1 | **Floor.** Cover by ground class: duff and moss under forest with grass at a fifth of today's density; grass on meadow, burn and shore. Tufts three times sparser, clustered, wider and softer, coloured as the ground with a lit tip, never darker than the ground. Low-frequency colour patches across the terrain; darkening under canopies in the cover field. | `groundcover.js`, `placement.js` (coverField), `terrain-build.js` palette | The ground reads as ground: the floor's colour is visible between tufts, trunk shadows show on it. |
| 2 | **Light.** A near shadow cascade (~60 m, full strength) beside the far map, soft filtering, shadows at 85%. Cooler, dimmer sky fill while the sun is up; stronger, warmer key. Half-resolution ambient occlusion in the post chain. | `main.js`, `daycycle.js`, `post.js` | Trunk shadows crisp on the floor at noon and long at six; the walker, the boulder and the beached canoe sit on the ground. |
| 3 | **Palette and air.** Lit-and-shade pairs for every ground and canopy class, lighter and more saturated. Aerial perspective tinted toward the sky with a height falloff, a low sun glow, the grade re-tuned over the new colours. | `terrain-build.js` palette, `vegetation.js` colours, `fog.js`, `sky.js`, `post.js` | The same frame at noon, golden hour and dusk, each in three values. |
| 4 | **Trees.** Trunks in segments with a bend, base flare and girth spread 0.6–1.5; scars and stubs on birch, dead lower branches on spruce, a shade side in the vertex colour. Crowns as 6–12 clusters, top-to-underside gradient, a backlit rim. Spruce as uneven whorls with a ragged tip. Height spread 0.6–1.6 with giants, snags and leaners. 10–12 variants per species. Near LOD only. | `vegetation.js`, `rocks.js` (toon material) | Twenty trees in view with no two alike; the far LOD unchanged. |
| 5 | **Composition.** Clumped density from noise with glades and thickets, an understory of hazel, alder, saplings and ferns, deadfall and stumps, bigger outcrops breaking the floor. | `placement.js`, `props.js` | A walk from the lodge to the point passes through three kinds of forest. |

Passes 1, 2 and 4 touch disjoint files and run in parallel. Pass 3 tunes over 1 and 2; pass 5 builds on 1 and 4.

## Working notes

- Test in the browser with `window.__game.step(dt, n)` (the hidden pane runs no animation frames); close the title card, close the outfitter's panel, wait for `player.teleporting` to clear, then step.
- A worktree has no `public/data`: symlink it to the main checkout's, and give the dev server its own port.
- `npx -y eslint@8 --no-eslintrc --env browser,es2022,worker --parser-options=ecmaVersion:2023,sourceType:module --rule 'no-undef: error' src/` before committing.
- Shader uniforms added through `onBeforeCompile` go in the declarations, not the body; `vColor` is a vec4 in r186.
