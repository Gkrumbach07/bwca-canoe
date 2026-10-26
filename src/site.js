// What the ground is like at every cell of one tile, from the tile's own data (its halo included): how steep the
// drawn ground is, where it stands as a cliff band and where the scree lies under one, ridge and hollow, the
// lie toward the sun, how wet and how deep the soil is, and where the Shield is bare. The terrain's paint
// (terrain-build.js), the forest, the rocks and the cliffs (placement.js) all read these arrays, so they agree.
// Pure data (no three.js): it runs in the build worker.
//
// Seams: a cell's answer is the same in the two tiles that share it as long as nothing reaches past the halo
// (six cells). The fields the paint reads reach at most five cells (the cliff band four, the scree under it one
// more), so the terrain's vertices along a seam match exactly; the forest and the rocks read only core cells.
//
// The cliffs (docs/roadmap.md, the bluff pass). The 10 m elevation data smears a cliff into a ramp: on Lake One the
// steepest 10 m cells are 32–40°. Where such a ramp meets the water the terrain's shore band (terrain-build.js
// shoreShape) pins the waterline to the lake and the mesh climbs the rest in one step a few metres inland, 50–70°
// and 6–19 m high: those steps are the bluffs the paddler sees. So the cliff test is made on the drawn ground, not
// on the data: the steepest five metres of the mesh along its fall line at 42–52° or more, a step of at least
// 4–7 m over 20 m, and a run of such cells along the contour (a single steep cell is a boulder, not a cliff).
// Inland, where the data itself holds a cliff (the steep country to the east), the drawn ground is the data and
// the same test finds it.
import { smoothstep, clamp, fbm } from './rng.js';
import { surfaceAt } from './terrain-build.js';
import { burnAt, knobAt, sandAt, meadowAt } from './fields.js';
import { landOf, KIND, KIND_LAND, OPEN_FOREST, CLIFF as FORM, cliffClass, cliffStrength, ROCK_TINT } from './land.js'; // d2 land

// The shore's rock (the shoreline pass). In the Boundary Waters the forest runs to the water almost everywhere; the
// rock shows as a ledge or a boulder band a few metres wide at the foot of the trees (the paint draws that from the
// vertex's own shore distance, finer than a cell: terrain-build.js splatAt), as a bare rim on the points and
// headlands that face open water, as the odd low granite shelf where the knobs stand highest, and as the open
// shelf of a campsite. `open` measures the point: the share of water on two rings round a cell, OPEN.rings metres
// out (from a cell one past the core that is five cells: inside the halo, so both tiles agree); a point stands over
// OPEN.point, a cove under OPEN.cove.
export const OPEN = { rings: [20, 40], point: [0.5, 0.68], cove: [0.3, 0.45] };
// A campsite's shelf: bare granite from the site down to its landing, SHELF.r metres round that line (the cleared
// sites are the exclusions' points with a positive radius: props.js exclusionsFor), when the site lies within
// SHELF.shore metres of the water. The forest keeps off it (placement.js), so the landing is open from the water.
export const SHELF = { r: [7, 13], shore: 32 };

const tan = (deg) => Math.tan((deg * Math.PI) / 180);
// steep: the drawn steepness (rise over run of the steepest five metres) that starts and completes a cliff;
// rise: the step over 20 m (m) that does the same; band: the band strength a cell needs to carry a cliff face.
export const CLIFF = { steep: [tan(42), tan(52)], rise: [4, 7], band: 0.45 };
// d2 land: the LiDAR's faces as the band (see below): the cell's relief (m) from which a face starts to count and from which
// it is whole; a lone face cell (no face beside it) counts `lone` of that; past `inland` metres from the water a face
// needs `inlandAdd` metres more (the paddler sees the shore's walls; the inland ones only from a portage)
export const FACE = { relief: [5.5, 8.5], lone: 0.6, inland: [60, 160], inlandAdd: 2.5 };
// The cliff module's frame (cliffs.js builds every variant in it, placement.js places trees on it): the face at
// z = 0 looking along -z, x across [-0.5, 0.5], y up [0, 1], z into the hill [0, 1]. Every variant has a bench
// across its whole width at y = ledge: the lower tier's top, its front within z [0, 0.05], the upper tier's front
// set back past z 0.13, along x within `benchX` at least, so a tree stood there at z within `ledgeZ` is on rock
// whichever variant draws it (a bin far off draws all its modules with one variant).
export const CLIFF_MODULE = { ledge: 0.42, ledgeZ: [0.08, 0.12], benchX: [-0.3, -0.06] };

// Per-cell arrays (Float32Array side * side, cell centres, local index lj * side + li):
//   S      the data's slope (rise over run), the five-point 20 m average terrain-build.js rockSlope takes
//   dx dz  downhill (unit, xz) from the data, for the lie toward the sun; south: dz (+z is south)
//   tpi    height over the mean of the 90 m square around (m): + a ridge or knob, - a hollow
//   ux uz  uphill (unit, xz) on the drawn ground; steep: its steepest five metres (rise over run); rise: its step
//          over 20 m along that line (m)
//   cliff  0..1, the cliff band (steep, a real step, part of a run along the contour)
//   talus  0..1, scree: the cliff's own foot and the cell or two under it, as far as the cliff is tall
//   wet    0..1, flat low ground: a hollow, a bog, the flats along a quiet shore
//   soil   0..1, how deep the soil is: thin on rock, ridges and steep ground, deep in hollows and on the flats
//   bare   0..1, bare bedrock (the points and headlands, the odd granite shelf on a shore, the ridge tops, a
//          campsite's shelf), over 0.5 is bare
//   sun    -1..1, the lie toward the sun: + a dry warm south face, - a cool moist north face (0 on the flat)
//   open   0..1, the share of open water round a cell within OPEN.rings (from 15 m out in the lake to 45 m inland)
//   beach  0..1, a sand beach: a sheltered cove, gentle ground, the sandy field (the shore cells only)
//   camp   0..1, a campsite's open shelf (SHELF): bare, and kept clear of trees and brush (placement.js)
// exclusions: the cleared ground (props.js exclusionsFor, flat [x1, z1, x2, z2, radius] segments), for the campsites'
// shelves; without it no shelf is drawn.
export class Site {
  constructor(grid, exclusions = null) {
    const n = grid.side, N = n * n, cell = grid.cell;
    this.grid = grid; this.n = n; this.cell = cell;
    const A = () => new Float32Array(N);
    const H = A(), S = A(), dx = A(), dz = A(), tpi = A(), ux = A(), uz = A(), steep = A(), rise = A(), cliff = A(), talus = A();
    const wet = A(), soil = A(), bare = A(), sun = A(), sd = A(), open = A(), beach = A(), camp = A();
    Object.assign(this, { H, S, dx, dz, tpi, ux, uz, steep, rise, cliff, talus, wet, soil, bare, sun, sd, open, beach, camp });
    // d2 land: the agencies' land under this tile (land.js), or null (a v3 tile: every field below is today's)
    const L = landOf(grid);
    this.land = L;
    const form = L && L.cliff ? (k) => (L.cliff[k] > 1 ? cliffClass(L.cliff[k]) : 0) : () => 0;
    const at = (li, lj) => clamp(lj, 0, n - 1) * n + clamp(li, 0, n - 1);
    for (let k = 0; k < N; k++) { H[k] = grid.h[k] * 0.1; sd[k] = grid.sd[k] * 0.1; }

    // the data's slope and fall line
    const gx = A(), gz = A(), sl = A();
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li;
      gx[k] = (H[at(li + 1, lj)] - H[at(li - 1, lj)]) / (2 * cell);
      gz[k] = (H[at(li, lj + 1)] - H[at(li, lj - 1)]) / (2 * cell);
      sl[k] = Math.hypot(gx[k], gz[k]);
    }
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li, l = at(li - 1, lj), r = at(li + 1, lj), u = at(li, lj - 1), d = at(li, lj + 1);
      S[k] = (2 * sl[k] + sl[l] + sl[r] + sl[u] + sl[d]) / 6;
      const ax = 2 * gx[k] + gx[l] + gx[r] + gx[u] + gx[d], az = 2 * gz[k] + gz[l] + gz[r] + gz[u] + gz[d], L = Math.hypot(ax, az);
      if (L > 1e-6) { dx[k] = -ax / L; dz[k] = -az / L; }
    }

    // ridge and hollow: height over the mean of the 9 x 9 cells around (a summed-area table)
    const R = 4, sat = new Float64Array((n + 1) * (n + 1));
    for (let lj = 0; lj < n; lj++) { let row = 0; for (let li = 0; li < n; li++) { row += H[lj * n + li]; sat[(lj + 1) * (n + 1) + li + 1] = sat[lj * (n + 1) + li + 1] + row; } }
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const a0 = Math.max(0, li - R), a1 = Math.min(n, li + R + 1), b0 = Math.max(0, lj - R), b1 = Math.min(n, lj + R + 1);
      const sum = sat[b1 * (n + 1) + a1] - sat[b0 * (n + 1) + a1] - sat[b1 * (n + 1) + a0] + sat[b0 * (n + 1) + a0];
      tpi[lj * n + li] = H[lj * n + li] - sum / ((a1 - a0) * (b1 - b0));
    }

    // the drawn ground: its fall line over 20 m and its steepest five metres along it (shaped as the mesh is)
    const c0 = A();
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li;
      // (d2 land: the LiDAR's faces and ledges want their fall line wherever they are)
      const lidar = form(k) >= FORM.talus && sd[k] > -12;
      if (sd[k] < -12 || (S[k] < 0.33 && Math.abs(sd[k]) > 12 && !lidar)) { steep[k] = S[k]; continue; }
      const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj), s = (px, pz) => surfaceAt(grid, px, pz);
      const ex = (s(x + 10, z) - s(x - 10, z)) / 20, ez = (s(x, z + 10) - s(x, z - 10)) / 20, G = Math.hypot(ex, ez);
      if (G < 0.15) { steep[k] = G; if (lidar && (dx[k] || dz[k])) { ux[k] = -dx[k]; uz[k] = -dz[k]; } continue; }
      const vx = ex / G, vz = ez / G;
      ux[k] = vx; uz[k] = vz;
      let prev = s(x - vx * 10, z - vz * 10), first = prev, top = 0;
      for (let t = -5; t <= 10; t += 5) { const h = s(x + vx * t, z + vz * t); top = Math.max(top, (h - prev) / 5); prev = h; }
      steep[k] = top; rise[k] = prev - first;
      c0[k] = smoothstep(CLIFF.steep[0], CLIFF.steep[1], top) * smoothstep(CLIFF.rise[0], CLIFF.rise[1], rise[k]);
    }
    // the band: a steep cell counts once a neighbour along the contour is steep too, fully with two
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li;
      if (c0[k] < 0.05) continue;
      let cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const q = at(li + di, lj + dj);
        if (c0[q] < 0.5) continue;
        const along = Math.abs(di * ux[k] + dj * uz[k]) / Math.hypot(di, dj);
        if (along < 0.6) cnt += 1;
      }
      cliff[k] = c0[k] * Math.min(1, cnt / 2);
    }
    // d2 land: where the LiDAR has looked (its byte is not 0), the cliff band is the faces it found (a 2 m pixel at 50°
    // and 3 m of relief in the cell), as strong as the cell's relief makes them a wall (4–6 m), a lone face cell (a
    // big boulder's flank, a knob) a little over half; the drawn step of a steep bank is no cliff there. Its height
    // stands in for the drawn step's rise below (the scree's reach). Where the LiDAR saw nothing, today's band.
    const faceRise = L && L.cliff ? A() : null;
    if (faceRise) {
      const isFace = (q) => L.cliff[q] > 1 && cliffClass(L.cliff[q]) === FORM.face;
      for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
        const k = lj * n + li;
        if (!L.cliff[k]) continue;
        if (!isFace(k) || sd[k] < -6) { cliff[k] = 0; continue; }
        let nb = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && isFace(at(li + di, lj + dj))) nb++;
        const m = cliffStrength(L.cliff[k]), add = FACE.inlandAdd * smoothstep(FACE.inland[0], FACE.inland[1], sd[k]);
        cliff[k] = smoothstep(FACE.relief[0] + add, FACE.relief[1] + add, m) * (nb ? 1 : FACE.lone);
        faceRise[k] = m * 1.3;
      }
    }
    // the scree: at the cliff's own foot and down its fall line from it, one cell under any cliff of 4 m and
    // more, two under one of 12 m and more
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li;
      let t = cliff[k] * 0.6;
      for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
        const far = Math.max(Math.abs(di), Math.abs(dj));
        if (!far) continue;
        const q = at(li + di, lj + dj), c = cliff[q];
        if (c < 0.05) continue;
        // this cell must lie down the cliff's fall line from it: the way from the cliff to here (-di, -dj) runs
        // against the cliff's uphill
        const L = Math.hypot(di, dj), down = (di * ux[q] + dj * uz[q]) / L;
        if (down < 0.55) continue;
        const rq = faceRise && faceRise[q] ? Math.max(rise[q], faceRise[q]) : rise[q];
        const reach = far === 1 ? smoothstep(3, 8, rq) : smoothstep(12, 22, rq);
        t = Math.max(t, c * reach * smoothstep(0.55, 0.85, down));
      }
      talus[k] = t;
    }
    // d2 land: the LiDAR's rough steep ground (30–50°, 30 cm rough and more): under a face it is the face's scree; on
    // its own it is a ledge, the stepped rock of a steep knob or a hillside's broken bedrock, which the forest climbs
    // (ledge: bare rock below, slabs and blocks in placement.js)
    const ledge = faceRise ? A() : null;
    if (ledge) for (let k = 0; k < N; k++) {
      if (L.cliff[k] <= 1 || cliffClass(L.cliff[k]) !== FORM.talus || sd[k] < 0) continue;
      const r = smoothstep(8, 16, cliffStrength(L.cliff[k]));
      if (talus[k] > 0.05) talus[k] = Math.max(talus[k], (0.45 + 0.4 * r) * smoothstep(0.05, 0.4, talus[k]));
      else ledge[k] = 0.35 + 0.65 * r;
    }
    this.ledge = ledge;

    // how open to the lake each cell near a shore stands (points and coves), and the sand beaches in the coves
    const [r1, r2] = OPEN.rings;
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li, d = sd[k];
      if (d < -15 || d > 45) continue;
      const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj);
      let w = 0;
      for (let q = 0; q < 12; q++) { const a = (q / 12) * Math.PI * 2; if (grid.shoreAt(x + Math.cos(a) * r1, z + Math.sin(a) * r1) < 0) w += 1; }
      for (let q = 0; q < 16; q++) { const a = ((q + 0.5) / 16) * Math.PI * 2; if (grid.shoreAt(x + Math.cos(a) * r2, z + Math.sin(a) * r2) < 0) w += 1.5; }
      open[k] = w / 36;
      if (d > 0 && d < 20) {
        // gentle: the land's own rise from the lake (the data's slope there also holds the drop into the lake)
        const cove = 1 - smoothstep(OPEN.cove[0], OPEN.cove[1], open[k]), rise = (H[k] - grid.levelAt(x, z, 4)) / Math.max(d, 4);
        beach[k] = cove * (1 - smoothstep(0.06, 0.12, rise)) * smoothstep(0.66, 0.74, sandAt(x, z));
      }
    }
    // the campsites near the water this tile can see
    const camps = [];
    if (exclusions) {
      const x0 = grid.cellX(grid.i0) - 20, x1 = grid.cellX(grid.i0 + n - 1) + 20, z0 = grid.cellZ(grid.j0) - 20, z1 = grid.cellZ(grid.j0 + n - 1) + 20;
      for (let s = 0; s < exclusions.length; s += 5) {
        const cx = exclusions[s], cz = exclusions[s + 1];
        if (exclusions[s + 4] <= 0 || cx !== exclusions[s + 2] || cz !== exclusions[s + 3]) continue;
        if (cx < x0 || cx > x1 || cz < z0 || cz > z1) continue;
        const cs = grid.shoreAt(cx, cz);
        if (cs <= -2 || cs >= SHELF.shore) continue;
        // its landing: straight down to the water from the site (as props.js lays the ledge and the fire ring)
        const dir = grid.deeperDir(cx, cz), reach = Math.max(0, cs) + 2;
        camps.push(cx, cz, cx + dir.x * reach, cz + dir.z * reach, cs);
      }
    }

    // the habitat fields
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li, x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj), s = S[k], d = sd[k];
      const ridge = smoothstep(0.6, 3.2, tpi[k]), hollow = smoothstep(0.4, 2.6, -tpi[k]);
      const flat = 1 - smoothstep(0.035, 0.12, s);
      // the bare Shield: on a shore, a rim on the points and headlands that face open water (deeper and barer where
      // the knob field stands up) and a low granite shelf on gentle ground where the knobs stand highest, both within
      // a cell or so of the water (the waterline's ledge itself is the paint's); the knobs on the ridge tops inland,
      // off the slopes; partly bare on steep ground that is not a cliff; the scree; a campsite's shelf
      const kv = knobAt(x, z), knob = smoothstep(0.64, 0.76, kv);
      const point = smoothstep(OPEN.point[0], OPEN.point[1], open[k]);
      const shelf = smoothstep(0.76, 0.86, kv) * (1 - smoothstep(0.08, 0.22, s));
      const rim = (1 - smoothstep(5, 16, d)) * Math.max(point * (0.55 + 0.45 * knob), 0.9 * shelf * (1 - 0.6 * hollow));
      const top = knob * ridge * (1 - smoothstep(0.35, 0.6, s)) * smoothstep(20, 45, d);
      let b = Math.max(rim, top, 0.42 * smoothstep(0.5, 0.95, s));
      for (let c = 0; c < camps.length; c += 5) {
        // from the site down to its landing, SHELF.r round that line, fading uphill of the site
        const ax = camps[c], az = camps[c + 1], ex = camps[c + 2] - ax, ez = camps[c + 3] - az, L2 = ex * ex + ez * ez || 1;
        const t = clamp(((x - ax) * ex + (z - az) * ez) / L2, 0, 1), dist = Math.hypot(x - ax - ex * t, z - az - ez * t);
        if (dist < SHELF.r[1]) camp[k] = Math.max(camp[k], (1 - smoothstep(SHELF.r[0], SHELF.r[1], dist)) * (1 - smoothstep(camps[c + 4] + 2, camps[c + 4] + 9, d)));
      }
      bare[k] = d < 0 ? 0 : Math.max(b, camp[k], talus[k] * 0.5);
      // the lie toward the sun, on ground steep enough for it to matter
      sun[k] = dz[k] * smoothstep(0.04, 0.3, s);
      // wet: flat ground in a hollow, flat ground in the broad lowland patches a bog field marks out (the 10 m
      // data cannot see the drainage of a bog complex a few hundred metres across), or flat ground along a shore
      // that lies barely over the lake (a fen, a beaver meadow, a bog behind a bay); never on a ridge. (The lake's
      // level is looked for within four cells: the paint reads `wet` for the bog's moss, so it may reach no further.)
      let low = 0;
      if (d > 0 && d < 40) {
        const lv = grid.levelAt(x, z, 4);
        low = 1 - smoothstep(0.6, 3.0, H[k] - lv);
      }
      const shoreFlat = low * (1 - smoothstep(0.05, 0.16, s));
      // (its seed keeps the bog fields off the ground the lodge frame on Lake One looks across, where the look is judged)
      const boggy = smoothstep(0.42, 0.62, fbm(x * 0.0035 + 3, z * 0.0035, 3, 196));
      const w = (flat * (0.15 + 0.6 * hollow + 0.75 * boggy) + 0.65 * shoreFlat * (0.5 + 0.5 * boggy)) * (1 - ridge) * (1 - bare[k]);
      wet[k] = d < 0 ? 1 : clamp(w * (0.8 + 0.4 * fbm(x * 0.009 + 7, z * 0.009, 2, 177)), 0, 1);
      // soil: thin on rock, ridges and steep ground, deep in the hollows and the wet flats (peat)
      soil[k] = d < 0 ? 0 : clamp(0.6 + 0.3 * hollow + 0.2 * wet[k] - 0.45 * ridge - 0.9 * smoothstep(0.2, 0.75, s) - bare[k], 0, 1);
    }
    // d2 land: the agencies' ground over the noise's, cell by cell (landData below); null on a v3 tile
    const extra = L ? this.landData(L, at) : [];
    // the lake's own cells beside a shore carry the wetness and the bare rock of the land beside them (the mean of
    // their land neighbours), so what reads these bilinearly at the waterline (the paint, the lake plants) sees the
    // shore's ground, not the lake's (wet 1, bare 0); further out wet stays 1
    const wet0 = Float32Array.from(wet), bare0 = Float32Array.from(bare), beach0 = Float32Array.from(beach), camp0 = Float32Array.from(camp);
    const extra0 = extra.map((a) => Float32Array.from(a)), se = new Float64Array(extra.length); // d2 land: its fields too
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li;
      if (sd[k] >= 0 || sd[k] < -15) continue;
      let cnt = 0, sw = 0, sb = 0, ss = 0, sc = 0;
      se.fill(0);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const q = at(li + di, lj + dj);
        if (sd[q] < 0) continue;
        cnt++; sw += wet0[q]; sb += bare0[q]; ss += beach0[q]; sc += camp0[q];
        for (let e = 0; e < extra.length; e++) se[e] += extra0[e][q];
      }
      if (cnt) { wet[k] = sw / cnt; bare[k] = sb / cnt; beach[k] = ss / cnt; camp[k] = sc / cnt; for (let e = 0; e < extra.length; e++) extra[e][k] = se[e] / cnt; }
    }
  }

  // d2 land: what the survey says each land cell is, over what the noise fields made of it (a cell the survey missed,
  // ground kind 0, keeps them). New per-cell arrays, read like the others (bilinear at, by local index):
  //   meadow   0..1, open sedge and grass: the marsh and the wet meadow, half the open bog; on dry ground the open types
  //            of the forest map (a recent burn's grass, a clearing, a shrub field)
  //   sphag    0..1, the bog's sphagnum floor (terrain.js: ochre and rust over the moss)
  //   boulder  0..1, how bouldery: the LiDAR's rough gentle ground, the boulder fields, the soil survey's stony ground
  //   tintR/G/B  the bedrock unit's tint of the rock (land.js ROCK_TINT), 1 where unmapped
  // and over today's: wet (the wetland's own wetness; dry ground held under its kind's `dry`, so no bog where the survey
  // found none), bare (the mapped outcrops; the ledges; none in a wetland), beach (the mapped sand) and soil. In
  // Ontario, where nothing was surveyed, the forest map's open kinds (bog, fen, shrub swamp, marsh, wet meadow) stand
  // for the ground kinds; everywhere else there the noise's. Returns the new arrays, for the shore's water cells.
  landData(L, at) {
    const n = this.n, N = n * n, grid = this.grid, { sd, wet, bare, beach, soil, talus, camp, tpi, S } = this;
    const A = () => new Float32Array(N);
    const meadow = A(), sphag = A(), boulder = A(), tintR = A(), tintG = A(), tintB = A(), kind = new Uint8Array(N), wallK = A().fill(1);
    // (kind: the ground kind each land cell is drawn as, Ontario's from the forest map's open kinds; 0 = the noise's.
    // wallK: how much of a steep drawn wall the paint shows as the cliff's rock (terrain-build.js groundPre): all of it
    // at a face the LiDAR found and where it did not look, most at its ledges, little elsewhere, where the LiDAR's 10 m
    // ground is steep but its 2 m ground found no rock: a wooded hillside)
    Object.assign(this, { meadow, sphag, boulder, tintR, tintG, tintB, kind, wallK });
    const OPEN_KIND = { 13: KIND.openBog, 14: KIND.wetMeadow, 15: KIND.shrubSwamp, 16: KIND.marsh, 17: KIND.wetMeadow };
    for (let lj = 0; lj < n; lj++) for (let li = 0; li < n; li++) {
      const k = lj * n + li, d = sd[k];
      const t = ROCK_TINT[L.rock ? Math.min(ROCK_TINT.length - 1, L.rock[k]) : 0];
      tintR[k] = t[0]; tintG[k] = t[1]; tintB[k] = t[2];
      if (d < 0) continue;
      if (L.cliff && L.cliff[k]) { const c = L.cliff[k] > 1 ? cliffClass(L.cliff[k]) : 0; wallK[k] = c === FORM.face ? 1 : c === FORM.talus ? 0.75 : 0.15; }
      const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj), ft = L.forest ? L.forest[k] : 0;
      let kd = L.ground ? L.ground[k] : 0;
      if (!kd && OPEN_KIND[ft]) kd = OPEN_KIND[ft];
      kind[k] = kd;
      const K = KIND_LAND[kd];
      // boulders: the LiDAR's rough gentle ground (25–60 cm), a boulder field, the soil survey's stone cover (to 25 %)
      let b = 0;
      if (L.cliff && L.cliff[k] > 1 && cliffClass(L.cliff[k]) === FORM.boulder) b = 0.7 * smoothstep(5.5, 11, cliffStrength(L.cliff[k]));
      if (kd === KIND.boulder) b = Math.max(b, 0.8);
      if (L.stone && L.stone[k] < 255) { const c = 100 * (L.stone[k] / 254) ** 2; b = Math.max(b, 0.5 * smoothstep(3, 25, c)); }
      boulder[k] = b;
      if (!K) { meadow[k] = meadowAt(x, z, d, wet[k]); continue; }
      // wet: the wetland's own (a little uneven), or the land's lie held under the kind's dry cap
      if (K.wet >= 0) wet[k] = clamp(K.wet * (0.92 + 0.16 * fbm(x * 0.02 + 5, z * 0.02, 2, 251)), 0, 1);
      else wet[k] = Math.min(wet[k], K.dry);
      let m = K.meadow;
      if (kd === KIND.upland && OPEN_FOREST[ft]) m = Math.max(m, OPEN_FOREST[ft].meadow);
      meadow[k] = m;
      sphag[k] = Math.max(K.sphag, ft === 13 ? 0.8 : ft === 14 ? 0.4 : 0);
      // bare rock: the mapped outcrop (D-02) all but bare; a ledge the LiDAR found; none in a wetland or on sand
      let br = bare[k];
      // (a mapped outcrop is bare in patches: knobs and ledges of rock with moss, blueberry and pine between, barest on the
      // rises and along the water)
      if (kd === KIND.rock) {
        const ridge = smoothstep(0.4, 2.4, tpi[k]), patch = smoothstep(0.36, 0.62, fbm(x * 0.03 + 9, z * 0.03, 3, 253));
        br = Math.max(br, clamp(0.32 + 0.6 * patch + 0.3 * ridge + 0.35 * (1 - smoothstep(4, 16, d)), 0, 0.98));
      }
      else if (K.wet >= 0 || kd === KIND.sand) br = Math.max(camp[k], talus[k] * 0.5);
      // a ledge the LiDAR found is broken rock in patches (the forest climbs the rest); a face is bare round its cliff module,
      // as much as it is a wall (site.js cliff), so a steep hillside of low faces stays wooded between its walls
      const lp = smoothstep(0.4, 0.6, fbm(x * 0.04 - 3, z * 0.04, 2, 257));
      if (this.ledge && this.ledge[k] && K.wet < 0) br = Math.max(br, (0.2 + 0.4 * this.ledge[k]) * (0.55 + 0.6 * lp));
      if (L.cliff && L.cliff[k] > 1 && cliffClass(L.cliff[k]) === FORM.face && K.wet < 0) br = Math.max(br, 0.2 + 0.55 * this.cliff[k]);
      bare[k] = br;
      if (kd === KIND.sand && d < 30) beach[k] = Math.max(beach[k], 1 - smoothstep(18, 30, d));
      // the soil, as today's from the new wet and bare
      const ridge = smoothstep(0.6, 3.2, tpi[k]), hollow = smoothstep(0.4, 2.6, -tpi[k]);
      soil[k] = clamp(0.6 + 0.3 * hollow + 0.2 * wet[k] - 0.45 * ridge - 0.9 * smoothstep(0.2, 0.75, S[k]) - bare[k], 0, 1);
    }
    return [meadow, sphag, boulder, tintR, tintG, tintB, wallK];
  }

  // local cell index of world (x, z), clamped to the tile's extent
  index(x, z) {
    const g = this.grid, n = this.n;
    return clamp(g.cellJ(z) - g.j0, 0, n - 1) * n + clamp(g.cellI(x) - g.i0, 0, n - 1);
  }
  // an array bilinearly at world (x, z) (cell centres carry the values, as the terrain's vertices do)
  at(arr, x, z) {
    const g = this.grid, n = this.n;
    const fx = (x - g.originX) / g.cell - 0.5 - g.i0, fz = (z - g.originZ) / g.cell - 0.5 - g.j0;
    const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
    const i0 = clamp(i, 0, n - 1), i1 = clamp(i + 1, 0, n - 1), j0 = clamp(j, 0, n - 1), j1 = clamp(j + 1, 0, n - 1);
    const v00 = arr[j0 * n + i0], v10 = arr[j0 * n + i1], v01 = arr[j1 * n + i0], v11 = arr[j1 * n + i1];
    return (v00 * (1 - a) + v10 * a) * (1 - b) + (v01 * (1 - a) + v11 * a) * b;
  }
  // everything at a point for the forest (bilinear), into `o`
  sample(x, z, o = {}) {
    for (const key of ['S', 'tpi', 'cliff', 'talus', 'wet', 'soil', 'bare', 'sun', 'steep', 'open', 'beach']) o[key] = this.at(this[key], x, z);
    o.burn = burnAt(x, z);
    return o;
  }
}
