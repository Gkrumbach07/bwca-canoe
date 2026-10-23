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
// tessellation shows in the light), and its edges and corners are chamfered by bevels of uneven width (none on
// some edges, narrow on the sharp ridges, wide on the exposed ones) whose vertices carry the normals of the
// faces on either side, so an edge reads as a crisp or a weathered line that catches the sun. No box: no two
// faces parallel, the sides leaning in, the big faces made of two or three planes at shallow ridges so they
// are slightly convex. The families (docs/look.md, pass 3):
//   slanted   a shard, broader at its foot than its crest; placement tilts a group of them to one angle
//   flats     two to four slabs of irregular outline stacked, each smaller, stepped off unevenly and turned
//   erratic   a softened block: a round mass with two or three broad flat facets, a frost crack and divots
// Small rocks and pebbles are the slanted and flat kinds at a small scale. Every family stands on its base, the
// plane y = 0, inside FOOT, and placement seats it so that whole base is under the terrain mesh. Colour: a
// nearly flat pink-grey, lighter along the edges (the drybrush, by how sharp the edge is), soft pale lichen
// blotches on the faces that look up, then the occlusion baked in against a ground plane where the rock meets
// the ground (the faces running into it darken there).

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
// makes a face, the face's corners counter-clockwise seen from outside (and the plane, with whatever tags the
// caller put on it), or null if the planes bound nothing.
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
    faces.push({ n: n.clone(), ids, area, centroid: c.clone(), plane: planes[i] });
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
  // a polygon (its corners in order round it, not necessarily flat) fanned, wound as a whole to face `ref`:
  // its slivers keep the winding of the polygon rather than each guessing its own
  poly(ids, ref) {
    const n = new V3();
    for (let i = 0; i < ids.length; i++) {
      const a = this.p[ids[i]], b = this.p[ids[(i + 1) % ids.length]];
      n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y);
    }
    const o = n.dot(ref) < 0 ? [...ids].reverse() : ids;
    for (let i = 1; i + 1 < o.length; i++) this.idx.push(o[0], o[i], o[i + 1]);
  }
  transform(from, m) {
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = from; i < this.p.length; i++) { this.p[i].applyMatrix4(m); this.n[i].applyMatrix3(nm).normalize(); }
  }
}

// Adds one chamfered convex block. Every edge of the block bounded by `planes` gets a chamfer of its own width:
// o.bevel times o.edgeW(nf, ng, pa, pb, rng, planeF, planeG), from its two faces (normals, planes) and its ends (0 leaves the edge a crisp
// crease with no chamfer, so one rock has sharp ridges, broad rounded edges where it is exposed and none at its
// foot). The chamfer is a plane of the block itself, cutting the edge back by that width along both faces, so
// the corners where chamfers and faces meet come out of the plane intersection and the surface is closed
// whatever the widths. Its vertices carry the normals of the faces on either side, so a chamfer shades as a
// rounded edge. o.seg: edges longer than this are split so the colour has vertices to vary on; o.dimples: how
// many divots to press into its biggest faces; o.soft(face) true for a face whose normals follow
// o.softNormal(p) instead of its own (a boulder's small facets shade as one round mass, and the edges between two
// of them need no chamfer at all); rng for those. Returns false (and adds nothing) if the planes make no block.
function addBlock(B, planes, o, rng) {
  const plain = polytope(planes);
  if (!plain) return false;
  const isSoft = (p) => !p.chamfer && !!(o.soft && o.soft({ plane: p }));
  // the plain block's edges and their chamfer planes: the bisector of the two faces, through the lines `w` in
  // from the edge along each face
  const edges = new Map(), chamfers = [];
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  plain.faces.forEach((f, fi) => f.ids.forEach((a, k) => {
    const b = f.ids[(k + 1) % f.ids.length], kk = key(a, b), e = edges.get(kk);
    if (!e) edges.set(kk, { a, b, f: fi, g: -1 }); else e.g = fi;
  }));
  for (const e of edges.values()) {
    if (e.g < 0) return false; // not closed: a degenerate block
    const F = plain.faces[e.f], G = plain.faces[e.g], pa = plain.verts[e.a], pb = plain.verts[e.b];
    if (isSoft(F.plane) && isSoft(G.plane)) continue;
    const w = Math.min(pa.distanceTo(pb) * 0.3, o.bevel * (o.edgeW ? o.edgeW(F.n, G.n, pa, pb, rng, F.plane, G.plane) : 1));
    if (w < 0.004) continue;
    const d = new V3().subVectors(pb, pa).normalize(), m = new V3().crossVectors(d, F.n);
    if (m.dot(new V3().subVectors(F.centroid, pa)) < 0) m.negate(); // into face F
    const n = new V3().addVectors(F.n, G.n).normalize();
    chamfers.push({ n, h: n.dot(pa.clone().addScaledVector(m, w)), chamfer: { f: F.plane, g: G.plane, sharp: Math.acos(Math.min(1, F.n.dot(G.n))) } });
  }
  const poly = polytope([...planes, ...chamfers]);
  if (!poly) return false;
  const { verts, faces } = poly;
  const onPlane = (p, pl) => Math.abs(pl.n.dot(p) - pl.h) < 1e-5;
  const softAt = (pl, n, p) => (isSoft(pl) ? n.clone().lerp(o.softNormal(p), 0.85).normalize() : n);
  // which face lies across each edge of each face
  const across = new Map();
  faces.forEach((f, fi) => f.ids.forEach((a, k) => { const b = f.ids[(k + 1) % f.ids.length]; across.set(`${a}>${b}`, fi); }));
  const other = (a, b) => faces[across.get(`${b}>${a}`)];
  // how sharp an edge between two faces is, for the drybrush: a chamfer's is its edge's; a crease's its own,
  // unless both faces are soft (no edge at all)
  const sharpOf = (F, G) => {
    if (!G) return 0;
    if (F.plane.chamfer) return F.plane.chamfer.sharp;
    if (G.plane.chamfer) return G.plane.chamfer.sharp;
    if (isSoft(F.plane) && isSoft(G.plane)) return 0;
    return Math.acos(Math.min(1, Math.max(-1, F.n.dot(G.n))));
  };
  const segs = (len) => (len > o.seg * 1.5 ? 2 : 1);
  // a face's outline with its long edges split (every face splits a shared edge alike, so they meet exactly)
  const outline = (f) => {
    const out = [];
    f.ids.forEach((a, k) => {
      const b = f.ids[(k + 1) % f.ids.length], s = segs(verts[a].distanceTo(verts[b])), G = other(a, b);
      for (let t = 0; t < s; t++) out.push({ p: verts[a].clone().lerp(verts[b], t / s), corner: t === 0, sharp: sharpOf(f, G), a });
    });
    // a corner takes the sharper of its two edges
    for (let i = 0; i < out.length; i++) if (out[i].corner) out[i].sharp = Math.max(out[i].sharp, out[(i + out.length - 1) % out.length].sharp);
    return out;
  };
  const from = B.count;
  const dimpled = new Set();
  if (o.dimples) {
    const order = faces.map((f, i) => i).filter((i) => !faces[i].plane.chamfer && !isSoft(faces[i].plane) && faces[i].n.y > -0.3 && faces[i].area > 0.25).sort((a, b) => faces[b].area - faces[a].area);
    for (let i = 0; i < Math.min(o.dimples, order.length); i++) dimpled.add(order[Math.floor(rng() * Math.min(order.length, 4))]);
  }
  faces.forEach((f, fi) => {
    const rim = outline(f), ch = f.plane.chamfer;
    if (ch) {
      // a chamfer: its points on either face take that face's normal, its corner points its own
      const ids = rim.map(({ p }) => {
        const n = onPlane(p, ch.f) ? softAt(ch.f, ch.f.n, p) : onPlane(p, ch.g) ? softAt(ch.g, ch.g.n, p) : f.n;
        return B.vert(p, n, 2, ch.sharp);
      });
      B.poly(ids, f.n);
      return;
    }
    // a face: the rim, an inner ring on the faces that look up (room for a lichen blotch, and the drybrush
    // fades out between the two), a centre
    const pts = rim.map((r) => r.p);
    const big = f.area > 0.45, up = f.n.y > 0.3 && f.area > 0.6, soft = isSoft(f.plane);
    const centre = pts.reduce((a, p) => a.add(p), new V3()).divideScalar(pts.length);
    if (dimpled.has(fi)) centre.lerp(pts[Math.floor(rng() * pts.length)], 0.3);
    const rings = [0];
    if ((up && !soft) || dimpled.has(fi)) rings.push(0.5);
    const ringT = new Map();
    const ringIdx = rings.map((t) => pts.map((p, j) => { const q = p.clone().lerp(centre, t), v = B.vert(q, softAt(f.plane, f.n, q), t === 0 ? 1 : 0, t === 0 ? rim[j].sharp : 0); ringT.set(v, t); return v; }));
    const t0 = B.idx.length;
    for (let r = 0; r + 1 < rings.length; r++) for (let j = 0; j < pts.length; j++) {
      const j1 = (j + 1) % pts.length, A = ringIdx[r], C = ringIdx[r + 1];
      B.tri(A[j], A[j1], C[j1], f.n); B.tri(A[j], C[j1], C[j], f.n);
    }
    const last = ringIdx[ringIdx.length - 1];
    if (big || pts.length > 5 || dimpled.has(fi)) {
      const ci = B.vert(centre, softAt(f.plane, f.n, centre), 0);
      for (let j = 0; j < pts.length; j++) B.tri(last[j], last[(j + 1) % pts.length], ci, f.n);
    } else B.poly(last, f.n);
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

// A plane with normal along (x, y, z) through the point (px, py, pz)
const through = (x, y, z, px, py, pz) => { const n = new V3(x, y, z).normalize(); return { n, h: n.x * px + n.y * py + n.z * pz }; };
// Every family stands on its base, the plane y = 0, inside FOOT (unit scale): placement.js seats a rock by
// that outline (its ROCK_FOOT holds the same numbers), so a rock that reached past it could show its foot.
export const FOOT = { block: { x0: -1.6, x1: 1.05, z: 0.85 }, slab: { x: 1.18, z: 0.98 }, boulder: { x: 1.0, z: 0.92 } };
const inFoot = (B, from, f) => {
  for (let i = from; i < B.count; i++) {
    const p = B.p[i];
    if (p.y > 0.02) continue;
    if (f.x0 !== undefined ? p.x < f.x0 || p.x > f.x1 || Math.abs(p.z) > f.z : (p.x / f.x) ** 2 + (p.z / f.z) ** 2 > 1) return false;
  }
  return true;
};
// How wide a chamfer an edge gets (a factor on the block's bevel), from its two faces and its ends: none along
// the foot (it is in the ground) nor on the shallow ridges between two planes of one slightly convex face (they
// read by the turn of the light alone); otherwise now and then none (a crisp crease), mostly a narrow one (a
// sharp ridge that still catches the drybrush), and a wide, weathered one on some of the edges that stand up
// into the weather (high on the rock, between faces that look up).
function edgeWidth(nf, ng, pa, pb, rng, { foot = 0.02, plain = 0.22, wideP = 0.12, wideK = 0.4, wide = 1.2 } = {}) {
  if (pa.y < foot && pb.y < foot) return 0;
  if (nf.dot(ng) > Math.cos(0.3)) return 0;
  const exposed = smooth(-0.3, 0.8, (nf.y + ng.y) / 2) * smooth(0.1, 0.6, (pa.y + pb.y) / 2);
  const r = rng(), w = rng();
  if (r < plain) return 0;
  if (r < plain + wideP + wideK * exposed) return wide * (1 + w * 0.75);
  return 0.3 + w * 0.35;
}

// (a) A slanted rock: a shard of the jointed granite, the way it breaks out of the ground along its bedding.
// Built along x from the tail (-x, which placement's tilt puts in the ground) to the head (+x, which it lifts):
// the base on y = 0; the dip face on top, one big plane or two or three meeting at shallow ridges, so the face
// is slightly convex and rises a little toward the head; a steep head face (it leans back once tilted, so the
// shard is broader at its foot than at its crest); two sides at different angles that lean in toward the top
// (no two faces parallel) and narrow the shard toward one end; a tail sloped over so steeply that no tilt
// turns it to face down; then two to four cuts at varied angles that knock off corners and edges, so the crest
// is a few sharp ridges and facets, not a box's edge. No face looks down at any tilt placement gives it, so
// nothing overhangs the ground. Tilted 18–38° by placement and seated so the whole base is under the ground, a
// shard shows a long dip face rising out of the ground to the crest and its head face dropping back into it.
// Untilted (the far twin of every rock, the pieces of an outcrop) it is a wedge resting on its base.
const SHARD_TILT = 0.48; // the tilt the occlusion is baked at, the middle of placement's
function slantedRock(rng) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const A = 1.2 + rng() * 0.25, Bh = 0.7 + rng() * 0.15, W = 0.42 + rng() * 0.14, T = 0.55 + rng() * 0.25, k = 0.03 + rng() * 0.07;
    const side = () => 0.12 + rng() * 0.2;
    const planes = [
      plane(0, -1, 0, 0), // the base
      through((rng() - 0.5) * 0.2, side(), -1, 0, 0, -W * (0.85 + rng() * 0.3)),
      through((rng() - 0.5) * 0.2, side(), 1, 0, 0, W * (0.85 + rng() * 0.3)),
      through(1, -0.06 + rng() * 0.2, (rng() - 0.5) * 0.55, Bh, 0, 0),            // the head, steep once tilted
      through(-1, 0.8 + rng() * 0.5, (rng() - 0.5) * 0.4, -A, 0, 0),            // the tail, sloping (never facing down)
    ];
    // the dip face: one plane rising toward the head, a second making a shallow ridge along it (more often
    // than not), a third bending it over toward the crest now and then
    const c1 = (rng() < 0.5 ? -1 : 1) * (0.03 + rng() * 0.07);
    planes.push(through(-k, 1, c1, 0, T, 0));
    if (rng() < 0.65) { const zr = (rng() - 0.5) * 0.5, c2 = -Math.sign(c1) * (0.12 + rng() * 0.14); planes.push(through(-k * (0.6 + rng() * 0.8), 1, c2, 0, T - c1 * zr, zr)); }
    if (rng() < 0.4) { const xr = 0.15 + rng() * 0.35; planes.push(through(-k + 0.18 + rng() * 0.2, 1, (rng() - 0.5) * 0.1, xr, T + k * xr, 0)); }
    // the cuts: corners off the crest, a narrow facet along a top edge, a corner of the head
    let cut3 = planes;
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      const r = rng(), sz = rng() < 0.5 ? 1 : -1;
      let d, depth;
      if (r < 0.4) { d = new V3(0.5 + rng() * 0.6, 0.5 + rng() * 0.6, sz * (0.3 + rng() * 0.7)); depth = 0.1 + rng() * 0.18; }
      else if (r < 0.7) { d = new V3((rng() - 0.5) * 0.5, 0.7 + rng() * 0.4, sz * (0.8 + rng() * 0.4)); depth = 0.06 + rng() * 0.12; }
      else if (r < 0.85) { d = new V3(1, 0.6 + rng() * 0.8, (rng() - 0.5) * 0.4); depth = 0.07 + rng() * 0.13; }
      else { d = new V3(0.4 + rng() * 0.5, rng() * 0.3, sz); depth = 0.08 + rng() * 0.12; }
      cut3 = cut(cut3, d, depth * (0.8 + T * 0.3));
    }
    const B = new RockBuilder();
    // sharp ridges: a weathered, wide chamfer on only a few of the exposed edges
    if (!addBlock(B, cut3, { bevel: 0.035 + rng() * 0.02, seg: 1.0, edgeW: (n1, n2, pa, pb, r) => edgeWidth(n1, n2, pa, pb, r, { wideP: 0.05, wideK: 0.22 }) }, rng)) continue;
    if (!inFoot(B, 0, FOOT.block)) continue;
    // the bake sees it tilted as it stands, the ground through its head's foot
    return finish(B, rng, { ground: Bh * Math.sin(SHARD_TILT) - 0.03, reach: 0.8, bakeTilt: SHARD_TILT });
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

// One slab of a stack: an irregular outline of five to eight sides at uneven angles (the joints of the Shield
// granite never quite square), some upright and some sloping in toward the top, the top tilted against the base
// so the slab thins toward one end (and often bent down from a shallow ridge), a top edge chamfered off now
// and then; its base on y = 0. X, Z: half sizes of the outline; t: the thickness at its middle. Returns the
// planes and the top plane (the next slab rests on it).
function slabPlanes(rng, X, Z, t) {
  const m = 5 + Math.floor(rng() * 4), turn = rng() * Math.PI * 2;
  let planes = [];
  for (let i = 0; i < m; i++) {
    const a = turn + ((i + (rng() - 0.5) * 0.55) * Math.PI * 2) / m, c = Math.cos(a), s = Math.sin(a);
    const reach = Math.hypot(X * c, Z * s) * (0.8 + rng() * 0.18);
    planes.push(through(c, rng() < 0.55 ? rng() * 0.08 : 0.12 + rng() * 0.26, s, c * reach, 0, s * reach));
  }
  const g = rng() * Math.PI * 2, gm = 0.05 + rng() * 0.1;
  const top = through(-Math.cos(g) * gm, 1, -Math.sin(g) * gm, 0, t, 0);
  planes.push(top, plane(0, -1, 0, 0));
  // more often than not a second plane falling the other way from a shallow ridge across the top, so the slab
  // is thickest along the ridge and its top slightly convex
  if (rng() < 0.6) {
    const a = g + Math.PI + (rng() - 0.5) * 1.2, am = 0.06 + rng() * 0.08, d = (rng() - 0.3) * 0.5 * X;
    const px = Math.cos(g) * d, pz = Math.sin(g) * d;
    planes.push(through(-Math.cos(a) * am, 1, -Math.sin(a) * am, px, (top.h - top.n.x * px - top.n.z * pz) / top.n.y, pz));
  }
  if (rng() < 0.4) { const a = rng() * Math.PI * 2; planes = cut(planes, new V3(Math.cos(a), 0.9 + rng() * 0.8, Math.sin(a)), t * (0.25 + rng() * 0.3)); }
  return { planes, top };
}

// (b) Layered flats: two to four slabs stacked, the bottom one the biggest and thickest, each one above it
// smaller, stepped off its lower neighbour by an uneven amount in a direction that wanders, turned a little, and
// lying on its top (which is tilted, so the stack leans a degree or two more with every slab), like the sheet
// jointing of the Shield granite. The base on y = 0 inside FOOT.slab.
function layeredFlats(rng) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const B = new RockBuilder();
    const n = rng() < 0.45 ? 2 : rng() < 0.65 ? 3 : 4;
    let X = 1.0 + rng() * 0.12, Z = 0.68 + rng() * 0.22;
    let frame = new THREE.Matrix4(); // the lower slab's frame
    let drift = rng() * Math.PI * 2, ok = true;
    for (let i = 0; i < n && ok; i++) {
      const t = i === 0 ? 0.22 + rng() * 0.14 : 0.11 + rng() * 0.14;
      const { planes, top } = slabPlanes(rng, X, Z, t);
      const m = frame.clone().multiply(new THREE.Matrix4().makeRotationY(i === 0 ? 0 : (rng() - 0.5) * 1.0));
      const from = B.count;
      ok = addBlock(B, planes, { bevel: 0.025 + rng() * 0.015, seg: 1.4, matrix: m, edgeW: (nf, ng, pa, pb, r) => (i > 0 && pa.y < 0.02 && pb.y < 0.02 ? 0.6 : edgeWidth(nf, ng, pa, pb, r, { plain: 0.3, wideP: 0.06, wideK: 0.25, wide: 1.0 })) }, rng);
      if (ok && i === 0) ok = inFoot(B, from, FOOT.slab);
      if (!ok) break;
      // the next slab: smaller, its centre stepped off this one's toward one side by part of the room there is
      // that way (so it reaches this one's edge there, and seldom hangs far over it), lying on this one's top,
      // sunk a hair into it so no light shows between
      const sh = 0.55 + rng() * 0.33;
      drift += (rng() - 0.5) * 1.2;
      let Xn = X * sh, Zn = Z * (0.55 + rng() * 0.35);
      if (Zn > Xn) [Xn, Zn] = [Zn, Xn];
      const room = 0.85 * Math.hypot(X * Math.cos(drift), Z * Math.sin(drift)) - (Xn + Zn) / 2;
      const step = Math.max(0, room) * (0.5 + rng() * 0.45);
      const ox = Math.cos(drift) * step, oz = Math.sin(drift) * step, y = (top.h - top.n.x * ox - top.n.z * oz) / top.n.y - 0.015;
      const onTop = new THREE.Matrix4().makeTranslation(ox, y, oz).multiply(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), top.n)));
      frame = m.clone().multiply(onTop);
      X = Xn; Z = Zn;
    }
    if (!ok) continue;
    return finish(B, rng, { ground: 0, reach: 0.6 });
  }
  return fallbackRock(rng);
}

// (c) A glacial erratic: a softened block, not a cube. A rounded mass of twenty-odd tangent planes whose normals
// follow the ellipsoid (so it shades as one round shape and its edges need no chamfer), cut by two or three broad
// flat facets that keep their own normals and crisp drybrushed edges; wider than tall, its base flat on y = 0
// at its widest girth (so nothing of it overhangs the ground). A frost crack through it more often than not
// (the two halves opened a hair at the top) and two or three divots pressed into its facets.
function erratic(rng) {
  for (let attempt = 0; attempt < 10; attempt++) {
    // its outline at the ground about the 0.8 x scale circle tiles.js holds the walker off with
    const X = 0.82 + rng() * 0.1, Z = 0.7 + rng() * 0.13, top = 0.6 + rng() * 0.26, cy = 0.01 + rng() * 0.03;
    const ry = top - cy;
    const planes = roundPlanes(rng, 20 + Math.floor(rng() * 7), X, ry, Z, cy, -0.12, 0.05);
    // the broad facets: deep cuts at the side and the shoulder
    const nf = 2 + (rng() < 0.45 ? 1 : 0), a0 = rng() * Math.PI * 2;
    for (let i = 0; i < nf; i++) {
      const a = a0 + (i * Math.PI * 2) / nf + (rng() - 0.5) * 1.2, y = -0.05 + rng() * (i === 0 ? 0.9 : 0.6), r = Math.sqrt(Math.max(0, 1 - y * y));
      const d = new V3(r * Math.cos(a), y, r * Math.sin(a)).normalize();
      const p = { n: d, h: (Math.sqrt((X * d.x) ** 2 + (ry * d.y) ** 2 + (Z * d.z) ** 2) + d.y * cy) * (0.8 + rng() * 0.08), flat: true };
      planes.push(p);
    }
    planes.push({ ...plane(0, -1, 0, 0), flat: true });
    const softNormal = (p) => new V3(p.x / (X * X), (p.y - cy) / (ry * ry), p.z / (Z * Z)).normalize();
    // the crack's lips only a narrow chamfer
    const o = { bevel: 0.07 + rng() * 0.04, seg: 1.4, soft: (f) => !f.plane.flat, softNormal, edgeW: (n1, n2, pa, pb, r, P, Q) => (P.crack || Q.crack ? 0.3 : edgeWidth(n1, n2, pa, pb, r, { plain: 0.1 })) };
    const B = new RockBuilder();
    const crack = rng() < 0.55, divots = crack ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
    let ok;
    if (crack) {
      const a = rng() * Math.PI * 2, n = new V3(Math.cos(a), (rng() - 0.5) * 0.3, Math.sin(a)).normalize(), h = (rng() - 0.5) * 0.5, gap = 0.006 + rng() * 0.008;
      // each half leans away from the crack about a line along its foot
      const axis = new V3(0, 1, 0).cross(n).normalize(), foot = n.clone().multiplyScalar(h).setY(0), open = 0.008 + rng() * 0.012;
      const lean = (sgn) => new THREE.Matrix4().makeTranslation(foot.x, foot.y, foot.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, sgn * open)).multiply(new THREE.Matrix4().makeTranslation(-foot.x, -foot.y, -foot.z));
      const half1 = Math.round(divots / 2);
      ok = addBlock(B, [...planes, { n: n.clone(), h: h - gap, flat: true, crack: true }], { ...o, dimples: half1, matrix: lean(-1) }, rng)
        && addBlock(B, [...planes, { n: n.clone().negate(), h: -h - gap, flat: true, crack: true }], { ...o, dimples: divots - half1, matrix: lean(1) }, rng);
    } else ok = addBlock(B, planes, { ...o, dimples: divots }, rng);
    if (!ok || !inFoot(B, 0, FOOT.boulder)) continue;
    return finish(B, rng, { ground: 0, reach: 0.9, lichen: 1.2 });
  }
  return fallbackRock(rng);
}

function fallbackRock(rng) {
  const B = new RockBuilder();
  addBlock(B, [plane(1, 0.1, 0.05, 0.9), plane(-1, 0.2, 0, 1), plane(0.1, 0.3, 1, 0.55), plane(-0.1, 0.25, -1, 0.55), plane(-0.1, 1, 0, 0.6), plane(0, -1, 0, 0)], { bevel: 0.05, seg: 1.0, edgeW: edgeWidth }, rng);
  return finish(B, rng);
}

// The families by the names vegetation.js asks for: 'slab' the layered flats, 'block' the slanted rock (the
// cheapest, so it is also every rock's far twin), 'boulder' the erratic. All are about two units across and
// stand on their base at y = 0 inside FOOT (the slanted rock's tail goes deep below the ground once tilted);
// tiles.js holds the walker off a rock with a circle of 0.8 x its scale, props.js off an outcrop with 0.95 x.
export const ROCK_FAMILIES = { slab: layeredFlats, block: slantedRock, boulder: erratic };
export function angularRock(rng, kind = 'block') {
  return (ROCK_FAMILIES[kind] || slantedRock)(rng);
}
// A rock of a family from a seed (props.js: the campsite ledges).
export function rockGeometry(kind, seed) { return angularRock(mulberry32(seed), kind); }
