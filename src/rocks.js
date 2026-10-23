import * as THREE from 'three';
import { mergeVertices, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './rng.js';
import { makeLookMaterial, FOLIAGE_WRAP } from './shading.js';
import { bakeOcclusion } from './occlusion.js';

// The solid register: smooth, rounded volumes under the look's smooth Lambert (shading.js), with occlusion
// baked into the vertex colour (occlusion.js), the way Firewatch paints rock, bark and canopy: the colour
// arrives through the light. No ramp, no rim.

// The material for bark, props, the canoe and the walker: plain Lambert. (The name is the old one, kept so
// the canoe, the props and the fishing kit need no change; nothing in it is toon any more.)
export function makeToonMaterial(opts = {}) { return makeLookMaterial(opts, { wrap: 0, name: 'look-solid' }); }

// The rock: plain Lambert on a nearly flat warm grey, so the colour comes from the light. Only the sky fill is
// turned for it: the hemisphere's blue sky over its dark ground drew every face turned from the sun a cold
// navy on the pink-grey granite. The fill keeps its coolness but loses most of its saturation and is raised by
// a third, so the shade side reads a cool grey with the form still in it (a uniform: tune it live).
export const ROCK_FILL = { saturation: 0.4, lift: 1.3 };
export function makeRockMaterial() {
  const u = { uRockFill: { value: new THREE.Vector2(ROCK_FILL.saturation, ROCK_FILL.lift) } };
  const m = makeLookMaterial({}, {
    wrap: 0, name: 'look-rock',
    compile: (shader) => {
      Object.assign(shader.uniforms, u);
      shader.fragmentShader = shader.fragmentShader
        .replace('void RE_IndirectDiffuse_Look(', 'uniform vec2 uRockFill;\nvoid RE_IndirectDiffuse_Look(')
        .replace('reflectedLight.indirectDiffuse += irradiance * lookSky',
          'vec3 rockIrr = mix( vec3( dot( irradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), irradiance, uRockFill.x ) * uRockFill.y;\n  reflectedLight.indirectDiffuse += rockIrr * lookSky');
    },
  });
  m.userData.u = u;
  return m;
}
// Vegetation: the wrap is read per vertex (aWrap, written by smoothToon): leaves wrap the light past the
// terminator (dotNL * 0.6 + 0.4), bark does not.
export function makeFoliageMaterial(opts = {}, compile = null, name = 'look-foliage') {
  return makeLookMaterial(opts, { wrap: 'varying', name, compile });
}

// Which vertices are foliage: greens and yellows with some saturation (bark, snow-white birch and grey are
// not), the same test vegetation.js uses for the leaves the seasons turn.
const _c = new THREE.Color(), _hsl = { h: 0, s: 0, l: 0 };
function tagWrap(geo) {
  const col = geo.getAttribute('color'), w = new Float32Array(col.count);
  for (let i = 0; i < col.count; i++) {
    _c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).getHSL(_hsl);
    w[i] = _hsl.s > 0.2 && _hsl.h > 0.1 && _hsl.h < 0.47 ? FOLIAGE_WRAP : 0;
  }
  geo.setAttribute('aWrap', new THREE.BufferAttribute(w, 1));
  return geo;
}

// Where a welded part stands on the ground: anything taller than 0.8 m whose base reaches within 0.6 m of
// its origin is a plant (trees are sunk ~0.3 m into the ground by placement), so its occlusion bake gets a
// ground plane there; small parts (the walker's pieces, the fishing kit) float free.
function groundOf(geo) {
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  return b.min.y < 0.6 && b.max.y > 0.8 ? 0.3 : null;
}

// GeoBuilder output is flat: three unshared vertices per face. Weld the faces that share a position and a
// colour and recompute the normals, so each coloured part (a canopy cone, a trunk, a hull) shades as one
// smooth volume while the colour boundaries stay crisp; tag the foliage for the wrapped light and bake the
// occlusion into the colour.
export function smoothToon(geo) {
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-4);
  g.computeVertexNormals();
  tagWrap(g);
  bakeOcclusion(g, { ground: groundOf(g) });
  g.computeBoundingSphere();
  return g;
}

// Like smoothToon, but edges sharper than `angle` stay creased: for a hull or a box, where the keel and
// the stem must not blur into the sides. Occlusion baked in, no ground (a hull floats).
export function creasedToon(geo, angle = Math.PI / 3) {
  geo.deleteAttribute('normal');
  const g = toCreasedNormals(mergeVertices(geo, 1e-4), angle);
  bakeOcclusion(g, { rays: 20 });
  g.computeBoundingSphere();
  return g;
}

// ---------- the Shield rock: Campo Santo's shape sheet ----------------------------------------------------
//
// Every rock is one or more convex blocks cut from planes, the way granite breaks along its joints: a block
// is the intersection of half-spaces, its faces are big flat planes with one normal each (so nothing of the
// tessellation shows in the light), and its edges and corners are chamfered by a narrow bevel whose vertices
// carry the normals of the faces on either side, so an edge reads as a crisp, slightly rounded line that
// catches the sun. The families (docs/look.md, pass 3):
//   slanted   a wedge-like block whose top is one big plane; placement tilts a group of them to one angle
//   flats     two to four slabs stacked, each smaller, offset and turned a little: the Shield's sheet jointing
//   erratic   one rounded block of many cuts with a frost crack through it and a divot or two in its faces
// Small rocks and pebbles are the slanted and flat kinds at a small scale. Colour: a nearly flat pink-grey,
// lighter along the edges (the drybrush, by how sharp the edge is), soft pale lichen blotches on the faces
// that look up, then the occlusion baked in against a ground plane at y = 0, where the rock meets the ground
// on the flat (placement sinks it further on a slope).

const V3 = THREE.Vector3;
const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const plane = (x, y, z, h) => { const n = new V3(x, y, z).normalize(); return { n, h }; };

// 3D value noise for the colour (lichen, tone), in [0, 1]
function hash3(x, y, z, s) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1440662683) + Math.imul(s, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function noise3(x, y, z, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const f = (t) => t * t * (3 - 2 * t), fx = f(x - x0), fy = f(y - y0), fz = f(z - z0);
  const L = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash3(x0 + i, y0 + j, z0 + k, s);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), fx), L(c(0, 1, 0), c(1, 1, 0), fx), fy), L(L(c(0, 0, 1), c(1, 0, 1), fx), L(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}

// The convex block bounded by planes { n (unit), h }: n·p <= h. Returns its corners and, for every plane that
// makes a face, the face's corners counter-clockwise seen from outside, or null if the planes bound nothing.
function polytope(planes) {
  const verts = [], on = [];
  const t1 = new V3(), t2 = new V3(), t3 = new V3();
  const np = planes.length;
  for (let i = 0; i < np; i++) for (let j = i + 1; j < np; j++) for (let k = j + 1; k < np; k++) {
    const a = planes[i], b = planes[j], d = planes[k];
    t1.crossVectors(b.n, d.n);
    const det = a.n.dot(t1);
    if (Math.abs(det) < 1e-7) continue;
    t2.crossVectors(d.n, a.n); t3.crossVectors(a.n, b.n);
    const p = new V3().copy(t1).multiplyScalar(a.h).addScaledVector(t2, b.h).addScaledVector(t3, d.h).divideScalar(det);
    let inside = true;
    for (let m = 0; m < np && inside; m++) if (planes[m].n.dot(p) > planes[m].h + 1e-6) inside = false;
    if (!inside) continue;
    let q = verts.findIndex((v) => v.distanceToSquared(p) < 1e-9);
    if (q < 0) { q = verts.length; verts.push(p); on.push(new Set()); }
    on[q].add(i); on[q].add(j); on[q].add(k);
  }
  const faces = [], c = new V3(), u = new V3(), w = new V3(), d = new V3();
  for (let i = 0; i < np; i++) {
    const ids = [];
    for (let q = 0; q < verts.length; q++) if (on[q].has(i)) ids.push(q);
    if (ids.length < 3) continue;
    const n = planes[i].n;
    c.set(0, 0, 0); for (const q of ids) c.add(verts[q]); c.divideScalar(ids.length);
    u.set(Math.abs(n.x) < 0.9 ? 1 : 0, Math.abs(n.x) < 0.9 ? 0 : 1, 0).cross(n).normalize(); w.crossVectors(n, u);
    const ang = new Map(ids.map((q) => { d.subVectors(verts[q], c); return [q, Math.atan2(d.dot(w), d.dot(u))]; }));
    ids.sort((a, b) => ang.get(a) - ang.get(b));
    let area = 0;
    for (let k = 1; k + 1 < ids.length; k++) area += t1.subVectors(verts[ids[k]], verts[ids[0]]).cross(t2.subVectors(verts[ids[k + 1]], verts[ids[0]])).dot(n) / 2;
    if (area < 1e-5) continue; // the plane only touches an edge or a corner
    faces.push({ n: n.clone(), ids, area, centroid: c.clone() });
  }
  if (faces.length < 4) return null;
  return { verts, faces };
}

// Accumulates the rock's vertices and triangles. Per vertex: position, normal, role (0 a face, 1 the rim of a
// face, 2 a bevel or a corner), how sharp the edge it belongs to is (radians between the faces).
class RockBuilder {
  constructor() { this.p = []; this.n = []; this.role = []; this.sharp = []; this.idx = []; }
  get count() { return this.p.length; }
  vert(p, n, role, sharp = 0) { this.p.push(p.clone()); this.n.push(n.clone()); this.role.push(role); this.sharp.push(sharp); return this.p.length - 1; }
  // a triangle wound to face `ref`
  tri(a, b, c, ref) {
    const pa = this.p[a], e1 = new V3().subVectors(this.p[b], pa), e2 = new V3().subVectors(this.p[c], pa);
    if (e1.cross(e2).dot(ref) < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  transform(from, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = from; i < this.p.length; i++) { this.p[i].applyMatrix4(m); this.n[i].applyMatrix3(nm).normalize(); }
  }
}

// Adds one chamfered convex block. o.bevel: the chamfer's width; o.seg: edges longer than this are split so the
// colour has vertices to vary on; o.dimples: how many divots to press into its biggest faces; rng for those.
// Returns false (and adds nothing) if the planes make no usable block.
function addBlock(B, planes, o, rng) {
  const poly = polytope(planes);
  if (!poly) return false;
  const { verts, faces } = poly;
  // the edges, each seen from its two faces
  const edges = new Map();
  let minEdge = Infinity;
  faces.forEach((f, fi) => f.ids.forEach((a, k) => {
    const b = f.ids[(k + 1) % f.ids.length], key = a < b ? `${a},${b}` : `${b},${a}`;
    let e = edges.get(key);
    if (!e) { e = { a, b, f: fi, g: -1, len: verts[a].distanceTo(verts[b]) }; edges.set(key, e); minEdge = Math.min(minEdge, e.len); }
    else e.g = fi;
  }));
  for (const e of edges.values()) if (e.g < 0) return false; // not closed: a degenerate block
  // each face's corners pushed in along the face by the bevel width (the polygon offset), checked for folding
  let bevel = Math.min(o.bevel, minEdge * 0.3);
  let inset = null;
  for (let attempt = 0; attempt < 4 && !inset; attempt++, bevel *= 0.5) {
    inset = faces.map((f) => {
      const k = f.ids.length;
      return f.ids.map((q, i) => {
        const v = verts[q], pv = verts[f.ids[(i + k - 1) % k]], nv = verts[f.ids[(i + 1) % k]];
        const m1 = new V3().subVectors(v, pv).cross(f.n).negate().normalize(); // n x e: into the face
        const m2 = new V3().subVectors(nv, v).cross(f.n).negate().normalize();
        return v.clone().addScaledVector(m1.clone().add(m2), bevel / (1 + m1.dot(m2)));
      });
    });
    const folded = faces.some((f, fi) => f.ids.some((q, i) => {
      const j = (i + 1) % f.ids.length;
      return new V3().subVectors(inset[fi][j], inset[fi][i]).dot(new V3().subVectors(verts[f.ids[j]], verts[q])) <= 0;
    }));
    if (folded) inset = null;
  }
  if (!inset || bevel < 0.004) return false;
  const segs = (len) => (len > o.seg * 1.5 ? 2 : 1);
  const sharpOf = (fi, gi) => Math.acos(Math.min(1, Math.max(-1, faces[fi].n.dot(faces[gi].n))));
  const from = B.count;
  // the faces: the rim (the inset polygon, its long edges split), an inner ring on the big faces (the drybrush
  // fades out between the two), a mid ring on those that look up (room for a lichen blotch), a centre
  const rims = [], dimpled = new Set();
  if (o.dimples) {
    const order = faces.map((f, i) => i).filter((i) => faces[i].n.y > -0.3 && faces[i].area > 0.25).sort((a, b) => faces[b].area - faces[a].area);
    for (let i = 0; i < Math.min(o.dimples, order.length); i++) dimpled.add(order[Math.floor(rng() * Math.min(order.length, 4))]);
  }
  faces.forEach((f, fi) => {
    const k = f.ids.length, rim = [], start = [], rimSharp = [], edgeSharp = [];
    for (let i = 0; i < k; i++) {
      const j = (i + 1) % k, e = edges.get(f.ids[i] < f.ids[j] ? `${f.ids[i]},${f.ids[j]}` : `${f.ids[j]},${f.ids[i]}`);
      edgeSharp.push(sharpOf(e.f, e.g));
      start.push(rim.length);
      const m = segs(e.len);
      for (let t = 0; t < m; t++) { rim.push(inset[fi][i].clone().lerp(inset[fi][j], t / m)); rimSharp.push(edgeSharp[i]); }
    }
    // a rim corner takes the sharper of its two edges
    for (let i = 0; i < k; i++) rimSharp[start[i]] = Math.max(edgeSharp[i], edgeSharp[(i + k - 1) % k]);
    rims.push({ rim, start });
    const big = f.area > 0.45, up = f.n.y > 0.3 && f.area > 0.6;
    const centre = rim.reduce((a, p) => a.add(p), new V3()).divideScalar(rim.length);
    if (dimpled.has(fi)) centre.lerp(rim[Math.floor(rng() * rim.length)], 0.3);
    const rings = [0];
    if (up || dimpled.has(fi)) rings.push(0.5);
    const ringT = new Map();
    const ringIdx = rings.map((t) => rim.map((p, j) => { const v = B.vert(p.clone().lerp(centre, t), f.n, t === 0 ? 1 : 0, t === 0 ? rimSharp[j] : 0); ringT.set(v, t); return v; }));
    const t0 = B.idx.length;
    for (let r = 0; r + 1 < rings.length; r++) for (let j = 0; j < rim.length; j++) {
      const j1 = (j + 1) % rim.length, A = ringIdx[r], C = ringIdx[r + 1];
      B.tri(A[j], A[j1], C[j1], f.n); B.tri(A[j], C[j1], C[j], f.n);
    }
    const last = ringIdx[ringIdx.length - 1];
    if (big || rim.length > 5 || dimpled.has(fi)) {
      const ci = B.vert(centre, f.n, 0);
      for (let j = 0; j < rim.length; j++) B.tri(last[j], last[(j + 1) % rim.length], ci, f.n);
    } else {
      for (let j = 1; j + 1 < rim.length; j++) B.tri(last[0], last[j], last[j + 1], f.n);
    }
    if (dimpled.has(fi)) {
      // a divot: the inside of the face pressed in, deepest at the centre, its normals from the new shape
      const depth = (0.04 + rng() * 0.05) * Math.sqrt(f.area), inner = new Set();
      for (let i = t0; i < B.idx.length; i++) if (B.role[B.idx[i]] === 0) inner.add(B.idx[i]);
      for (const v of inner) { const t = ringT.has(v) ? ringT.get(v) : 1; B.p[v].addScaledVector(f.n, -depth * t * t * (3 - 2 * t)); }
      const acc = new Map([...inner].map((v) => [v, new V3()])), e1 = new V3(), e2 = new V3();
      for (let i = t0; i < B.idx.length; i += 3) {
        const a = B.idx[i], b = B.idx[i + 1], c = B.idx[i + 2];
        const nrm = e1.subVectors(B.p[b], B.p[a]).cross(e2.subVectors(B.p[c], B.p[a]));
        for (const v of [a, b, c]) if (acc.has(v)) acc.get(v).add(nrm);
      }
      for (const [v, s] of acc) if (s.lengthSq() > 0) B.n[v].copy(s.normalize());
    }
  });
  // the bevels: a strip along every edge between the two rims
  for (const e of edges.values()) {
    const rimOf = (fi, a, b) => {
      const f = faces[fi], k = f.ids.length, i = f.ids.indexOf(a), R = rims[fi];
      const j = (i + 1) % k;
      if (f.ids[j] === b) { const out = []; const end = j === 0 ? R.rim.length : R.start[j]; for (let s = R.start[i]; s <= end; s++) out.push(R.rim[s % R.rim.length]); return out; }
      return rimOf(fi, b, a).reverse(); // the edge runs the other way round this face
    };
    const P = rimOf(e.f, e.a, e.b), Q = rimOf(e.g, e.a, e.b), s = sharpOf(e.f, e.g);
    const nf = faces[e.f].n, ng = faces[e.g].n, ref = new V3().addVectors(nf, ng);
    const pi = P.map((p) => B.vert(p, nf, 2, s)), qi = Q.map((p) => B.vert(p, ng, 2, s));
    for (let t = 0; t + 1 < pi.length; t++) { B.tri(pi[t], pi[t + 1], qi[t + 1], ref); B.tri(pi[t], qi[t + 1], qi[t], ref); }
  }
  // the corners: where three or more faces meet, a small polygon between their bevels
  verts.forEach((v, q) => {
    const fs = [];
    faces.forEach((f, fi) => { const i = f.ids.indexOf(q); if (i >= 0) fs.push([fi, i]); });
    if (fs.length < 3) return;
    const ref = fs.reduce((a, [fi]) => a.add(faces[fi].n), new V3()).normalize();
    const u = new V3(Math.abs(ref.x) < 0.9 ? 1 : 0, Math.abs(ref.x) < 0.9 ? 0 : 1, 0).cross(ref).normalize(), w = new V3().crossVectors(ref, u);
    const pts = fs.map(([fi, i]) => ({ p: inset[fi][i], n: faces[fi].n })), c = pts.reduce((a, x) => a.add(x.p), new V3()).divideScalar(pts.length);
    pts.sort((A, Bp) => Math.atan2(new V3().subVectors(A.p, c).dot(w), new V3().subVectors(A.p, c).dot(u)) - Math.atan2(new V3().subVectors(Bp.p, c).dot(w), new V3().subVectors(Bp.p, c).dot(u)));
    let sharp = 0;
    for (let i = 0; i < pts.length; i++) sharp = Math.max(sharp, Math.acos(Math.min(1, pts[i].n.dot(pts[(i + 1) % pts.length].n))));
    const ids = pts.map((x) => B.vert(x.p, x.n, 2, sharp));
    for (let i = 1; i + 1 < ids.length; i++) B.tri(ids[0], ids[i], ids[i + 1], ref);
  });
  if (o.matrix) B.transform(from, o.matrix);
  return true;
}

// The support of a set of points along n (how far they reach that way).
const support = (pts, n) => pts.reduce((m, p) => Math.max(m, n.dot(p)), -Infinity);
// Cut a corner or an edge off a block: a plane along n, `depth` in from the furthest corner that way.
function cut(planes, n, depth) {
  const poly = polytope(planes);
  if (!poly) return planes;
  return [...planes, { n: n.clone().normalize(), h: support(poly.verts, n.clone().normalize()) - depth }];
}

// The granite's colours (linear, via THREE.Color): a pink-grey and a cooler grey for the faces, the pale warm
// grey the drybrush lifts the edges to, a pale sage lichen and a dark one.
const GRANITE = [0x9c958e, 0x97948f, 0x9f978d, 0x93918d].map((h) => new THREE.Color(h));
const EDGE = new THREE.Color(0xd8d0c4), LICHEN = new THREE.Color(0x96a476), DARK_LICHEN = new THREE.Color(0x58554e);

// Paint and bake: the colour per vertex (tone, lichen, drybrush), then the occlusion against a ground plane.
// `bakeTilt`: turn the rock this far about z for the bake (a slanted rock stands tilted, its tail in the ground).
function finish(B, rng, { ground = 0, reach = 0.9, bakeTilt = 0, lichen = 1 } = {}) {
  const base = GRANITE[Math.floor(rng() * GRANITE.length)].clone().multiplyScalar(0.94 + rng() * 0.1);
  const s = Math.floor(rng() * 100000), col = new Float32Array(B.count * 3), c = new THREE.Color();
  const lich = lichen * (0.5 + rng() * 0.7); // some rocks carry more of it than others
  for (let i = 0; i < B.count; i++) {
    const p = B.p[i], n = B.n[i];
    c.copy(base).multiplyScalar(1 + (noise3(p.x * 1.1, p.y * 1.1, p.z * 1.1, s) - 0.5) * 0.14);
    if (B.role[i] < 2) {
      const up = smooth(0.3, 0.75, n.y);
      c.lerp(LICHEN, Math.min(0.8, 0.7 * lich * up * smooth(0.47, 0.64, noise3(p.x * 1.3 + 9, p.y * 1.3, p.z * 1.3, s + 1))));
      c.lerp(DARK_LICHEN, 0.35 * lich * smooth(-0.1, 0.4, n.y) * smooth(0.68, 0.8, noise3(p.x * 2.2, p.y * 2.2 + 5, p.z * 2.2, s + 2)));
    }
    // the drybrush: the bevels catch it by how sharp their edge is, the rim of a face half as much
    const brush = smooth(0.25, 1.3, B.sharp[i]) * (0.5 + 0.2 * Math.max(0, n.y));
    if (B.role[i] === 2) c.lerp(EDGE, brush);
    else if (B.role[i] === 1) c.lerp(EDGE, brush * 0.12);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n.flatMap((n) => [n.x, n.y, n.z]), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(B.idx);
  if (bakeTilt) geo.rotateZ(bakeTilt);
  geo.computeBoundingBox();
  bakeOcclusion(geo, { ground, reach, rays: 24, floor: 0.45 });
  // the bake sees nothing over a vertex below its ground plane: those darken toward the floor instead, so a
  // face running into the ground darkens where it meets it
  const pos = geo.getAttribute('position'), cc = geo.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - 0.55 * smooth(0, 0.3, ground - pos.getY(i));
    cc.setXYZ(i, cc.getX(i) * k, cc.getY(i) * k, cc.getZ(i) * k);
  }
  if (bakeTilt) geo.rotateZ(-bakeTilt);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// (a) A slanted rock: a wedge-like block, its top one big plane, longer than wide, the head end cut back at an
// angle and a corner or two knocked off. Built flat: x runs from the tail (-a) to the head (+b), the bottom
// rises a little toward the head (the wedge), the origin is where the bottom meets the ground. Placement
// tilts it about z by the group's angle (the head up, the tail into the ground) and turns the group about y.
function slantedRock(rng) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const a = 0.8 + rng() * 0.25, b = 0.95 + rng() * 0.3, w = 0.42 + rng() * 0.25, t = 0.45 + rng() * 0.3, wedge = 0.08 + rng() * 0.2;
    let planes = [
      plane(1, -0.2 + rng() * 1.0, (rng() - 0.5) * 0.5, b), plane(-1, rng() * 0.3, (rng() - 0.5) * 0.3, a),
      plane((rng() - 0.5) * 0.14, 0, 1, w * (0.85 + rng() * 0.3)), plane((rng() - 0.5) * 0.14, 0, -1, w * (0.85 + rng() * 0.3)),
      plane(0, 1, 0, t), plane(wedge, -1, 0, 0),
    ];
    const cuts = 1 + Math.floor(rng() * 2.5);
    for (let i = 0; i < cuts; i++) {
      const sx = rng() < 0.7 ? 1 : -1, sz = rng() < 0.5 ? 1 : -1;
      planes = cut(planes, new V3(sx * (0.3 + rng()), 0.3 + rng() * 0.9, sz * (0.2 + rng() * 0.9)), (0.1 + rng() * 0.18) * (0.6 + t));
    }
    const B = new RockBuilder();
    if (!addBlock(B, planes, { bevel: 0.045 + rng() * 0.02, seg: 1.0 }, rng)) continue;
    return finish(B, rng, { ground: 0.05, reach: 0.8, bakeTilt: 0.45 });
  }
  return fallbackRock(rng);
}

// Planes tangent to an ellipsoid (radii rx, ry, rz about centre cy on the y axis) in n directions spread over
// the sphere (a turned Fibonacci set, jittered), each pushed in a little at random: a rounded block of big
// facets. `minY`: directions further down than this are left out (the base is cut flat instead).
function roundPlanes(rng, n, rx, ry, rz, cy, minY = -1, jitter = 0.08) {
  const out = [], turn = rng() * Math.PI * 2, golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), a = turn + i * golden + (rng() - 0.5) * 0.5;
    const d = new V3(r * Math.cos(a), y + (rng() - 0.5) * 0.2, r * Math.sin(a)).normalize();
    if (d.y < minY) continue;
    const h = Math.sqrt((rx * d.x) ** 2 + (ry * d.y) ** 2 + (rz * d.z) ** 2) * (1 - rng() * jitter) + d.y * cy;
    out.push({ n: d, h });
  }
  return out;
}

// One slab of a stack. Granite joints run in two sets about square to each other plus the sheet joints that
// part it horizontally, so a slab is a rough rectangle: four sides about a right angle apart, some upright
// and some sloping in toward the top, a corner or two cut off, a nearly flat top, its bottom on y = 0.
// X, Z: half sizes; t: thickness.
function slabPlanes(rng, X, Z, t) {
  const turn = (rng() - 0.5) * 0.3;
  let planes = [];
  for (let k = 0; k < 4; k++) {
    const a = turn + (k * Math.PI) / 2 + (rng() - 0.5) * 0.25, c = Math.cos(a), s = Math.sin(a);
    const n = new V3(c, rng() < 0.5 ? rng() * 0.08 : 0.12 + rng() * 0.3, s).normalize();
    planes.push({ n, h: (k % 2 ? Z : X) * (0.9 + rng() * 0.15) * Math.hypot(n.x, n.z) + n.y * t * 0.5 });
  }
  planes.push(plane((rng() - 0.5) * 0.08, 1, (rng() - 0.5) * 0.08, t), plane(0, -1, 0, 0));
  const cuts = 1 + Math.floor(rng() * 2.6);
  for (let i = 0; i < cuts; i++) {
    const a = turn + Math.PI / 4 + Math.floor(rng() * 4) * (Math.PI / 2) + (rng() - 0.5) * 0.7;
    planes = cut(planes, new V3(Math.cos(a), rng() * 0.3, Math.sin(a)), (0.15 + rng() * 0.35) * Math.min(X, Z));
  }
  if (rng() < 0.35) { const a = rng() * Math.PI * 2; planes = cut(planes, new V3(Math.cos(a), 1 + rng(), Math.sin(a)), t * (0.3 + rng() * 0.3)); }
  return planes;
}

// (b) Layered flats: two to four slabs stacked, the bottom one thick and partly in the ground, each one above
// it smaller, pushed the same way and turned a little, like the sheet jointing of the Shield granite.
function layeredFlats(rng) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const B = new RockBuilder();
    const n = rng() < 0.55 ? 2 : rng() < 0.8 ? 3 : 4;
    let X = 1.0 + rng() * 0.2, Z = 0.7 + rng() * 0.25, y = -0.08 - rng() * 0.08, ox = 0, oz = 0, yaw = 0;
    const drift = rng() * Math.PI * 2;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const t = i === 0 ? 0.3 + rng() * 0.14 : 0.16 + rng() * 0.16;
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(ox, y, oz);
      ok = addBlock(B, slabPlanes(rng, X, Z, t), { bevel: 0.035 + rng() * 0.015, seg: 1.4, matrix: m }, rng);
      y += t * 0.95;
      // the next one smaller and stepped off toward one side (now and then hanging over the edge)
      const sh = 0.55 + rng() * 0.3;
      const step = X * (1 - sh) * (0.8 + rng() * 0.6);
      ox += Math.cos(drift + (rng() - 0.5) * 0.6) * step; oz += Math.sin(drift + (rng() - 0.5) * 0.6) * step;
      X *= sh; Z *= 0.6 + rng() * 0.35; yaw += (rng() - 0.5) * 0.6;
    }
    if (!ok) continue;
    return finish(B, rng, { ground: 0, reach: 0.6 });
  }
  return fallbackRock(rng);
}

// (c) A glacial erratic: one rounded block of a dozen or so big facets, wider than tall, its base flat and in
// the ground, a frost crack through it more often than not (the two halves opened a hair at the top) and two
// or three divots in all.
function erratic(rng) {
  for (let attempt = 0; attempt < 8; attempt++) {
    // its outline at the ground about the 0.8 x scale circle tiles.js holds the walker off with
    const X = 0.86 + rng() * 0.14, Z = 0.74 + rng() * 0.16, top = 0.7 + rng() * 0.32, low = -0.3;
    const ry = (top - low) / 2, cy = (top + low) / 2;
    const planes = [...roundPlanes(rng, 13 + Math.floor(rng() * 5), X, ry, Z, cy, -0.55, 0.1), plane(0, -1, 0, -low)];
    const B = new RockBuilder(), bevel = 0.09 + rng() * 0.04;
    const crack = rng() < 0.6, divots = crack ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    let ok;
    if (crack) {
      const a = rng() * Math.PI * 2, n = new V3(Math.cos(a), (rng() - 0.5) * 0.3, Math.sin(a)).normalize(), h = (rng() - 0.5) * 0.6, gap = 0.006 + rng() * 0.008;
      // each half leans away from the crack about a line along its foot
      const axis = new V3(0, 1, 0).cross(n).normalize(), foot = n.clone().multiplyScalar(h).setY(low), open = 0.008 + rng() * 0.012;
      const lean = (sgn) => new THREE.Matrix4().makeTranslation(foot.x, foot.y, foot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, sgn * open)).multiply(new THREE.Matrix4().makeTranslation(-foot.x, -foot.y, -foot.z));
      const half1 = Math.round(divots / 2);
      ok = addBlock(B, [...planes, { n: n.clone(), h: h - gap }], { bevel, seg: 1.4, dimples: half1, matrix: lean(-1) }, rng)
        && addBlock(B, [...planes, { n: n.clone().negate(), h: -h - gap }], { bevel, seg: 1.4, dimples: divots - half1, matrix: lean(1) }, rng);
    } else ok = addBlock(B, planes, { bevel, seg: 1.4, dimples: divots }, rng);
    if (!ok) continue;
    return finish(B, rng, { ground: 0, reach: 0.9, lichen: 1.2 });
  }
  return fallbackRock(rng);
}

function fallbackRock(rng) {
  const B = new RockBuilder();
  addBlock(B, [plane(1, 0, 0, 1), plane(-1, 0, 0, 1), plane(0, 0, 1, 0.7), plane(0, 0, -1, 0.7), plane(0, 1, 0, 0.6), plane(0, -1, 0, 0.1)], { bevel: 0.05, seg: 1.0 }, rng);
  return finish(B, rng);
}

// The families by the names vegetation.js asks for: 'slab' the layered flats, 'block' the slanted rock (the
// cheapest, so it is also every rock's far twin), 'boulder' the erratic. All are about two units across and
// stand on y = 0 (the slanted rock's tail goes below it once tilted); tiles.js holds the walker off a rock
// with a circle of 0.8 x its scale, props.js off an outcrop with 0.95 x.
export const ROCK_FAMILIES = { slab: layeredFlats, block: slantedRock, boulder: erratic };
export function angularRock(rng, kind = 'block') {
  return (ROCK_FAMILIES[kind] || slantedRock)(rng);
}
// A rock of a family from a seed (props.js: the campsite ledges).
export function rockGeometry(kind, seed) { return angularRock(mulberry32(seed), kind); }
