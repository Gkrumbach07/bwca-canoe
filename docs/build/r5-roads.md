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
