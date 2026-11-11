# Round 5, stream R: every road, and the truck on its wheels

The owner, 2026-11-10: *"Roads aren't everywhere. I go outside the boundary waters and I don't see any roads, which there
should be. Just put roads where you see roads. The trucks float in the air."*

Branch `claude/r5-roads` from main 1057fb6.

## What changed

**Every drivable way in the box is in the 3D world** (scripts/roads.mjs, OpenStreetMap via the Geofabrik extracts):
highways, county and forest roads, gravel, two-tracks, residential streets and driveways. That is 26,905 roads and
4,301 km, against round 4's 130 roads and 77 km (the last stretch into each lot). Each road is graded into the ground
the way the lot roads were (road-grade.js). Its corridor is kept clear of trunks, brush, the wetlands' near ring and
mire hummocks. Its ribbon goes into the tile's trail decal by class: blacktop with a centre line on the county roads
and highways, gravel, and two-tracks with grass on the crown. Driveways and parking aisles are drawn narrower.
Where a road crosses water it gets a bridge: 497 of them, the longest 170 m.
- The lakes' ice roads (Vermilion's, `ice_road=yes`) are left out. They are a winter thing.
- A run over water longer than 220 m gets no bridge. These are ways the map puts on a lake.
- Gated ways (`access=no`) are drawn, because they are there. The truck's routes keep off them.
- A way is drawn to 25 m short of the box's edge. Past the box there is no ground.

**The roads come a tile at a time.** They no longer come as one table in the first bundle.
- `src/roads.bin` (3.2 MB) holds one gzipped piece per fine tile: 834 pieces, the largest 59 KB. Each piece holds every
  road within 80 m of its tile, with heights, shoulders and the fades at the ends.
- The tile worker fetches its tile's piece with an HTTP range request alongside the tile (roads.js `tileRoads`). It
  grades the tile's ground with it and keeps the forest off the roads. The decoded piece comes back with the built tile.
- The main thread installs the piece with the tile and drops it when the tile is evicted (`installTileRoads` /
  `dropTileRoads`). road-grade.js answers each point from its own tile's piece, so the drawn mesh, `groundAt`, the
  walker and the truck agree.
- The 80 m far mesh draws no road. Past the fine tiles' 4.6 km the fog has them.
- `src/roads.json` keeps three things: the truck's routes (unchanged from round 4), the bridges, and the stretches the
  routes run on. That last part is for scripts/edge.mjs, scripts/cabins.mjs and the rigs. It is no longer drawn.

**The truck sits on its four wheels.** truck.js `pose` reads the ground drawn under each tyre (`tiles.groundAt`, or a
bridge's deck). It pitches the body by the axles, rolls it by the sides and sets it on the plane through the four
wheels. Where the ground twists, the body rises until no tyre is pressed in more than 4 cm. Round 4 read only the middle
of each axle and each side, took the higher of the two means, and had the track 0.16 m narrower than the tyres.

## The files

scripts/roads.mjs (the bake, on a host), src/roads.bin, src/roads.json, src/roads.js, src/road-grade.js,
src/tile-worker.js (the piece per tile), src/tiles.js (install and drop), src/props.js (each tile's own chains, the decal
lifted a step at a time), src/truck.js, src/thicket.js and src/mire-relief.js (one line each: the roads' clearing),
scripts/r5-roads-test.mjs (new), scripts/loop-r4-all.sh (adds it).

Rebake on a host: `node scripts/roads.mjs --osm ~/bwca-cache/roads` (about a minute on ben).

**The bridges' ends.** Within 10 m of each bridge's end, the road is kept at its own graded level. It does not fade to
the bank's ground by the water, and road-grade.js grades it right to the water's edge, so the bank meets the deck. These
are the abutments, marked per point in roads.bin. A route's own small bridges (round 4's, found every 2 m) now take the
road's level rather than the bank's ground. Round 4's EP 40 bridge-end dip was 0.22 m below the road at the bank.

## For the join and the other streams

- **Cabins (cabins.js `blocked`):** a cabin is skipped when `nearestRoad` finds a road within 22 m. With every road in
  the world, 9 of the 30 spots fall within 22 m of one. Most of those roads are the cabin's own driveway, 8 to 22 m off.
  The cabins stream (or the join) should measure from the road's edge (`nearestRoad(...).d - road.hw`) with a smaller
  clearance, or skip driveways (`road.svc`). Otherwise those cabins drop out once this merges.
- **The map (map-roads.bin, scripts/edge.mjs):** the map letters the highways and county roads (OSM trunk to tertiary)
  and the spurs to the lots. The 3D world now has every road. To put "the same roads in both", edge.mjs should add the
  minor classes, simplified, to map-roads.bin. That is the map stream's file, so it is not changed here.
- **roads.json `roads`** keeps the routes' stretches (with heights) for edge.mjs, cabins.mjs and the round 4 rigs. The
  game no longer draws them.

## Also in this stream

- **Grass on the roads:** the grass tufts come from each 10 m cell's cover, read with a bilinear filter, so a road kept
  bare only out to its trees' clearing still grew tufts on its surface. The grass now has a clearing of its own: a
  gravel or blacktop road's half width plus 7.5 m (`roads.js GRASS_OFF`). Two-tracks stay lawns.
- **Ponds by the road:** near the shore the game stands its ground up to the water's level (detail-build.js, within
  30 m). A pond perched 2.5 m over EP 50's two-track, 30 m off, stood the road's vertices up through it. Past 6 m from
  the shore, a road's core is no longer stood up, and it eases back over the shoulder. The bake does the same.
- **Junctions on the water:** a road wholly over water had no height when a junction's level was worked out, which put
  Tomahawk Road's crossing at EP 34 at half the road's height. Fixed in the bake.
- **The decal:** a road's rows are 3 vertices across every 3.5 m, instead of 5 across every 2.5 m. They are graded flat
  across their core, so they need no more to lie on the ground. A town's streets now cost about a third of the
  triangles they did.
- **The Moose Lake Boat Access post:** a portage's sign now looks for a spot off the road out to 12 m, not 8.

## What is left

- **The detail's blend band.** Within 40 m of the shore, the 10 m mesh is not graded: its tees have to stay the mean of
  their ends (terrain-build.js ROAD_FROM). Where a 2 m chunk eases into the 10 m mesh at its ring's edge, a road there
  rises toward the ungraded mesh, by up to 2 m on a hillside road. With the player standing at the spot, the ground is
  on the road's height to the centimetre (EP 43, 50 and 54 were probed). The rigs that look 100 m or more from the player
  count these: r4-roads checks 2 and 3, and r5-roads check 2.
- **The truck's twist.** The truck is a rigid body on four wheels. Where the ground under it twists, it sits on the
  plane through its tyres, so two tyres stand a little off the ground and two press a little in. Across 51 routes, 147
  of 243,540 frames (0.06 %) have a tyre more than 0.10 m off. The worst are 0.16 to 0.40 m, at EP 75, 50, 62, 34, 43
  and 14 (made two-tracks on steep ground, or the blend band). The ground never comes through the body.

## Measured

Cost, on the same host with `?roads=off`:
- No new shader program: 86 at every look, with the roads and without.
- Each decal that holds only road rows is a draw call the roads add, in a tile that had no trail before. At the
  looks, 0 to 9 of them are drawn: Ely 9, Winton 7, Echo 6, the Grade 5, the Fernberg 2, the Gunflint Trail 0. At the
  home store (e3-roads-test) it is 1, plus the truck's own call.
- Triangles: the road rows are 3 across every 3.5 m. A town of streets (Ely, 1,089 roads in its tile) adds about
  0.3 M triangles; a forest road adds 0.05 to 0.15 M.
- Bytes before the title: roads.json is 81 KB gzipped, against round 4's 65 KB. roads.bin's index and the pieces
  round the start come to about 110 KB on the dev server (by range). Each tile's piece after that is 3 KB at the median
  and 59 KB at the most (Ely).
- Install steps: the worst were 200 to 500 ms with the roads and the same without, on a loaded host. Nothing here is
  new: the decal's lift now runs a step at a time.

The truck, every route posed every 0.3 m, its four tyres against the ground drawn under them (r5-roads-test check 2):

| | routes | worst tyre off the ground | routes with a tyre > 0.15 m off | the ground through the body |
|---|---:|---|---:|---|
| main 1057fb6 | 47 of 51 | 1.75 m (EP 50), 1.39 (EP 20), 1.27 (EP 40) | 32 | yes (EP 20, EP 50) |
| this branch | 51 | 0.40 m (EP 75); 147 of 243,540 frames over 0.10 m | 6 | never |
