# Roadmap

Where the game goes after the look overhaul (`docs/look.md`). Each phase ends with its work merged on main
and checked on the look board. Agreed with the owner on 2026-10-22; phase 3 takes the "alive" track first.

## Phase 1: integrate and lock it in

- **Done:** the pivot (ground and light, foliage cards, rocks, atmosphere) and the six look branches (grade,
  water and lake plants, crowns, rocks, built props, canoe and paddler) are merged.
- **Polish:** seat everything on the drawn ground (the walker, trees, rocks and props still sit on the height
  field, up to 0.4 m off the mesh near shores; `meshHeightAt` in `terrain-build.js` is exact); drop the dead
  water rows in the day cycle; relabel the reflection setting (it mirrors the shore now); bring `docs/look.md`
  up to date.
- **Look board:** a script that renders a fixed set of spots and hours into one contact sheet, so every change
  is judged on the same frames.
- **Bluff pass:** steep ground reads like the real Lake One bluffs. Trees up slopes to about 45°, a cliff class
  only for the near-vertical band (covered with jointed cliff meshes along the contour, Firewatch-style), talus
  as a scree ground material with dense small blocks at the cliff foot, no slab confetti on steep faces, cliff
  colour dark green-grey with streaks. Species by habitat: jack pine on thin dry rock and burns, red and white
  pine on dry ridges and old shores, black spruce and tamarack in wet lowlands, cedar along shores and wet
  ground, balsam fir and white spruce in moist mixed forest, birch and aspen on slopes, talus edges and burns.

## Phase 2: performance and the look's leftovers

- **Performance, done** (`docs/look.md`, Performance and quality): per-instance culling for the view and each
  shadow cascade, quality presets Low to Ultra with Auto, the occlusion bakes cached in IndexedDB. Ultra is the old
  look at ~20 % less frame time; Low is under half the old frame time. Still to do: the on-screen frame rate on the
  owner's machine with the pane visible.
- Leftovers: far trees reading as columns; spruce sprays reading as fern fronds close up; lit crowns olive
  rather than orange at golden hour; full-shade ground at golden hour too dark; grass colour slipping at ground
  transitions; alpha-to-coverage on the cards.
- The biggest single gain left: hand-painted leaf and needle sprites dropped into `src/textures.js`'s slots.

## Phase 3: alive

- **Weather:** clear, broken cloud, overcast, morning fog on the water, rain (on the water, the ground and the
  hull), a passing storm with wind, lightning and thunder, all keyed through the day cycle and the fog ramps.
- **Wind in the trees:** crowns sway and leaf cards flutter with the wind's speed and gusts (aspen and birch
  most, pines least), the understory and reeds bending, all from the same wind the water reads.
- **Sound:** loon calls across the lake, wind in the pines and birches, paddle drips and strokes, footsteps by
  ground, rain on the hull, thunder rolling down the lake, quiet nights with frogs in summer.
- **Wildlife:** loons (exist), a beaver and its lodge, a moose at a shore, eagles, fish rising at dusk,
  dragonflies over the reeds in summer.

## Phase 4: share it

A public build (GitHub Pages workflow and the external data URL exist), a short trailer from the look board's
spots, and a decision on touch and mobile. Nothing is published without the owner's go-ahead.

## Later: the trip as a game

Route planning on real portages to a destination lake, claiming a campsite before dark, pitching the tent,
cooking and sleeping through the night, weather as a real risk on big water, photos and journal entries as the
record. Most of the parts exist (outfitters, energy, food, tasks, fishing, the journal).
