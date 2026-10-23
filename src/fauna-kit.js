import * as THREE from 'three';
import { makeLookMaterial } from './shading.js';
import { addSurface, INSTANCE_ORIGIN } from './floating.js';
import { makeAO, trianglesOf } from './loft.js';
import { REFLECT_LAYER } from './water.js';

// The kit the wildlife is made from (loons.js, fauna.js, fauna-models.js): one material in the look's smooth
// light with a small plumage hook, an indexed geometry builder with the occlusion bake folded in, pools of
// instanced parts that take a matrix per animal per frame, and the world queries the animals spawn from.
//
// The plumage hook. A loon's checkered back or its striped necklace would take thousands of triangles as
// geometry; instead each vertex carries aPat = (kind, u, v, occlusion) and the fragment draws the marks:
//   kind 1  white spots in staggered rows, one per unit cell of (u, v) (bigger cells: bigger squares)
//   kind 2  white stripes across u inside the band 0 < v < 1 (a necklace)
// The marks are antialiased by their own derivatives and fade to their mean tone once a cell gets near a
// pixel, so a far loon is a dark shape and never shimmers. The occlusion (w) darkens the white the way the
// baked colour darkens everything else.

const glslPatVertex = /* glsl */ `
attribute vec4 aPat;
varying vec4 vPat;
`;
const glslPatFragment = /* glsl */ `
{
  float kind = vPat.x;
  vec2 uv = vPat.yz, fw = max(fwidth(uv), vec2(1e-4));
  float mark = 0.0, mean = 0.0, px = max(fw.x, fw.y);
  if (kind > 0.5 && kind < 1.5) {
    vec2 c = uv;
    c.x += 0.5 * mod(floor(c.y), 2.0);
    vec2 f = abs(fract(c) - 0.5);
    float d = max(f.x, f.y * 1.2);
    mark = 1.0 - smoothstep(0.19 - px * 0.7, 0.19 + px * 0.7, d);
    mean = 0.12;
  } else if (kind > 1.5 && kind < 2.5) {
    float band = smoothstep(-fw.y, fw.y, uv.y) * (1.0 - smoothstep(1.0 - fw.y, 1.0 + fw.y, uv.y));
    float s = abs(fract(uv.x) - 0.5);
    mark = band * (1.0 - smoothstep(0.2 - fw.x, 0.2 + fw.x, s));
    mean = band * 0.4;
  }
  mark = mix(mark, mean, smoothstep(0.22, 0.55, px));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.84, 0.85, 0.82) * vPat.w, mark);
}
`;

function patCompile(shader) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\n' + glslPatVertex)
    .replace('#include <color_vertex>', '#include <color_vertex>\n\tvPat = aPat;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\nvarying vec4 vPat;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n' + glslPatFragment);
}

// The two materials every animal draws with: `solid` for things that stand, perch or fly, `float` for the
// swimmers, which ride the drawn swell exactly as floating.js's things do (sampled at each instance's
// origin, so a whole bird bobs as one).
export function makeFaunaMaterials(water) {
  const solid = makeLookMaterial({}, { wrap: 0, name: 'fauna', compile: patCompile });
  const float = makeLookMaterial({}, {
    wrap: 0, name: 'fauna-float', compile: (shader) => {
      patCompile(shader);
      addSurface(shader, water);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + INSTANCE_ORIGIN + '{ transformed.y += renderedWave(ipRel, uWaterTime) / sy; }');
    },
  });
  return { solid, float };
}

// ---------------------------------------------------------------------------------------------------------
// Geometry: an indexed builder whose vertices carry a colour and the plumage attribute. Rings lofted into
// tubes share their vertices, so normals come out smooth; separate lofts stay separate (a bill, an ear).

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _t = new THREE.Vector3(), _ex = new THREE.Vector3(), _ey = new THREE.Vector3();
export const col = (h) => new THREE.Color(h);

export class Shape {
  constructor() { this.p = []; this.c = []; this.q = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(p, c, k = 0, u = 0, v = 0) { this.p.push(p.x, p.y, p.z); this.c.push(c.r, c.g, c.b); this.q.push(k, u, v, 1); return this.count - 1; }
  tri(a, b, c) { this.i.push(a, b, c); }
  // A ring of n points round centre c, square to the axis t, its first point toward `side`: rx along side,
  // ry along t x side. `paint(th, p)` -> [Color, kind, u, v] per point (th 0 at side, pi/2 at t x side).
  ring(c, t, side, n, rx, ry, paint) {
    _t.copy(t).normalize();
    _ex.copy(side).addScaledVector(_t, -side.dot(_t));
    if (_ex.lengthSq() < 1e-6) _ex.set(1, 0, 0).addScaledVector(_t, -_t.x);
    if (_ex.lengthSq() < 1e-6) _ex.set(0, 0, 1).addScaledVector(_t, -_t.z);
    _ex.normalize();
    _ey.crossVectors(_t, _ex).normalize();
    const out = [];
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2, p = c.clone().addScaledVector(_ex, Math.cos(th) * rx).addScaledVector(_ey, Math.sin(th) * ry);
      const [cc, kind = 0, u = 0, v = 0] = paint(th, p);
      out.push({ p, c: cc, k: kind, u, v });
    }
    return out;
  }
  // Loft rings (from ring()) into a tube, faces outward; caps close the ends with a fan to the centre (or to
  // `tipStart` / `tipEnd` points, for a pointed end).
  loft(rings, { capStart = false, capEnd = false, tipStart = null, tipEnd = null } = {}) {
    const idx = rings.map((r) => r.map((q) => this.vert(q.p, q.c, q.k, q.u, q.v)));
    const ctr = (r) => r.reduce((s, q) => s.add(q.p), V3()).multiplyScalar(1 / r.length);
    const a = rings[0], b = rings[1], c0 = ctr(a);
    const n = V3().crossVectors(V3().subVectors(a[1].p, a[0].p), V3().subVectors(b[0].p, a[0].p));
    const flip = n.dot(V3().subVectors(a[0].p, c0)) < 0;
    for (let r = 0; r < idx.length - 1; r++) {
      const A = idx[r], B = idx[r + 1], m = A.length;
      for (let k = 0; k < m; k++) {
        const k1 = (k + 1) % m;
        if (flip) { this.tri(A[k], B[k], B[k1]); this.tri(A[k], B[k1], A[k1]); } else { this.tri(A[k], A[k1], B[k1]); this.tri(A[k], B[k1], B[k]); }
      }
    }
    const cap = (r, ix, tip, end) => {
      const q = r[0], cc = this.vert(tip || ctr(r), q.c, q.k, q.u, q.v), m = ix.length;
      for (let k = 0; k < m; k++) { const k1 = (k + 1) % m; if (flip !== end) this.tri(cc, ix[k], ix[k1]); else this.tri(cc, ix[k1], ix[k]); }
    };
    if (capStart || tipStart) cap(rings[0], idx[0], tipStart, false);
    if (capEnd || tipEnd) cap(rings[rings.length - 1], idx[idx.length - 1], tipEnd, true);
    return this;
  }
  // a loft along a polyline of [point, rx, ry] with rings square to the line; `side` orients the rings
  tube(pts, side, n, paint, opts) {
    const rings = pts.map(([p, rx, ry], i) => {
      const t = pts[Math.min(pts.length - 1, i + 1)][0].clone().sub(pts[Math.max(0, i - 1)][0]);
      return this.ring(p, t, side, n, rx, ry, (th, q) => paint(th, q, i / (pts.length - 1)));
    });
    return this.loft(rings, opts);
  }
  // a small closed lump (an eye, a nose): an octahedron squashed by (sx, sy, sz)
  bead(c, r, color, sx = 1, sy = 1, sz = 1) {
    const d = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(([x, y, z]) => this.vert(V3(c.x + x * r * sx, c.y + y * r * sy, c.z + z * r * sz), color));
    const F = [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]];
    for (const [a, b, e] of F) this.tri(d[a], d[b], d[e]);
    return this;
  }
  // another shape's triangles, mirrored across z = 0 (the winding turned so the faces stay outward)
  mirrorZ() {
    const s = new Shape();
    for (let k = 0; k < this.count; k++) {
      s.p.push(this.p[k * 3], this.p[k * 3 + 1], -this.p[k * 3 + 2]);
      s.c.push(this.c[k * 3], this.c[k * 3 + 1], this.c[k * 3 + 2]);
      s.q.push(this.q[k * 4], this.q[k * 4 + 1], this.q[k * 4 + 2], 1);
    }
    for (let t = 0; t < this.i.length; t += 3) s.i.push(this.i[t], this.i[t + 2], this.i[t + 1]);
    return s;
  }
  merge(o) { const base = this.count; this.p.push(...o.p); this.c.push(...o.c); this.q.push(...o.q); for (const x of o.i) this.i.push(x + base); return this; }
  // The geometry, the occlusion baked into its colours and into aPat.w: `ground` is a plane the thing stands
  // in (or the water it floats in), `reach` how far an occluder still counts.
  build({ reach = 0.2, floor = 0.45, ground = null, rays = 20 } = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setIndex(this.i);
    g.computeVertexNormals();
    const job = makeAO(g, trianglesOf(g), { rays, reach, floor, ground });
    job.next();
    const C = new Float32Array(this.c), Q = new Float32Array(this.q);
    for (let v = 0; v < this.count; v++) { const k = job.k[v]; C[v * 3] *= k; C[v * 3 + 1] *= k; C[v * 3 + 2] *= k; Q[v * 4 + 3] = k; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('aPat', new THREE.Float32BufferAttribute(Q, 4));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------------------------------------
// A pool of one part (a loon's body, a moose's leg) drawn for every animal of a kind in one instanced call.
// Each frame: begin(), push(matrix) for each animal showing that part, end(). The bounding sphere is kept
// round the pushed instances so the pool is culled with the view like anything else; nothing allocates.

export class Parts {
  constructor(scene, geo, material, max, { shadow = false, reflect = true, name = 'fauna' } = {}) {
    const m = new THREE.InstancedMesh(geo, material, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0; m.visible = false; m.castShadow = shadow; m.receiveShadow = true;
    m.boundingSphere = new THREE.Sphere();
    m.matrixAutoUpdate = false;
    m.name = name;
    if (reflect) m.layers.enable(REFLECT_LAYER);
    scene.add(m);
    this.mesh = m; this.n = 0; this.max = max;
    this.radius = geo.boundingSphere.radius;
    this.lo = new THREE.Vector3(); this.hi = new THREE.Vector3();
  }
  begin() { this.n = 0; this.lo.set(Infinity, Infinity, Infinity); this.hi.set(-Infinity, -Infinity, -Infinity); }
  push(matrix) {
    if (this.n >= this.max) return;
    const e = matrix.elements, a = this.mesh.instanceMatrix.array, o = this.n * 16;
    for (let k = 0; k < 16; k++) a[o + k] = e[k];
    const x = e[12], y = e[13], z = e[14];
    if (x < this.lo.x) this.lo.x = x; if (y < this.lo.y) this.lo.y = y; if (z < this.lo.z) this.lo.z = z;
    if (x > this.hi.x) this.hi.x = x; if (y > this.hi.y) this.hi.y = y; if (z > this.hi.z) this.hi.z = z;
    this.n++;
  }
  end() {
    const m = this.mesh;
    m.count = this.n; m.visible = this.n > 0;
    if (!this.n) return;
    m.instanceMatrix.needsUpdate = true;
    m.boundingSphere.center.addVectors(this.lo, this.hi).multiplyScalar(0.5);
    m.boundingSphere.radius = this.lo.distanceTo(this.hi) * 0.5 + this.radius * 1.6;
  }
  get triangles() { const g = this.mesh.geometry; return (g.index ? g.index.count : g.attributes.position.count) / 3; }
}

// ---------------------------------------------------------------------------------------------------------
// Scratch for composing matrices without allocating: an animal's frame, then a part's offset and turn in it.

const _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YZX'), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _local = new THREE.Matrix4();
// an animal's frame: at (x, y, z), turned by yaw (about y, the model faces +x), then pitch (about z, nose up
// positive) and roll (about x), uniformly scaled
export function frameMatrix(out, x, y, z, yaw, pitch = 0, roll = 0, scale = 1) {
  _e.set(roll, yaw, pitch, 'YZX');
  _q.setFromEuler(_e);
  _s.set(scale, scale, scale);
  _p.set(x, y, z);
  return out.compose(_p, _q, _s);
}
// a part in its parent's frame: offset (ox, oy, oz), turned by Euler angles (rx, ry, rz) in `order`, scaled
// along its own axes
export function partMatrix(out, parent, ox, oy, oz, rx = 0, ry = 0, rz = 0, order = 'XYZ', sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, order);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  _p.set(ox, oy, oz);
  _local.compose(_p, _q, _s);
  return out.multiplyMatrices(parent, _local);
}

// ---------------------------------------------------------------------------------------------------------
// The world, as the animals read it. Everything here is a plain number or writes into `out`; no allocation.

// unit xz toward deeper water (the gradient of the shore distance) into out {x, z}
export function deeper(world, x, z, out) {
  const e = world.cell;
  const gx = world.shoreAt(x + e, z) - world.shoreAt(x - e, z), gz = world.shoreAt(x, z + e) - world.shoreAt(x, z - e);
  const L = Math.hypot(gx, gz) || 1;
  out.x = -gx / L; out.z = -gz / L;
  return out;
}
// water depth at a point (0 on land)
export function depthAt(world, x, z) {
  if (world.shoreAt(x, z) >= 0) return 0;
  return Math.max(0, world.levelAt(x, z) - world.heightAt(x, z));
}
// how sheltered a spot on the water is: of `rays` rays `reach` metres out (sphere-traced on the shore
// distance, as placement.js does for the lake plants), the share that reach land
export function shelterAt(world, x, z, rays = 8, reach = 60) {
  let hits = 0;
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * Math.PI * 2 + 0.2, dx = Math.cos(a), dz = Math.sin(a);
    for (let t = 0; t < reach;) { const s = world.shoreAt(x + dx * t, z + dz * t); if (s >= 0) { hits++; break; } t += Math.max(-s * 0.9, 4); }
  }
  return hits / rays;
}
// a straight run over water from (x0, z0) to (x1, z1) keeping `clear` metres off the shore
export function waterRun(world, x0, z0, x1, z1, clear = 2) {
  const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.ceil(d / 6));
  for (let i = 1; i <= n; i++) { const t = i / n; if (world.shoreAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t) > -clear) return false; }
  return true;
}

export const smooth = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const wrapAngle = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
// turn `a` toward `b` by at most `rate` radians
export const turnToward = (a, b, rate) => { const d = wrapAngle(b - a); return a + (Math.abs(d) < rate ? d : Math.sign(d) * rate); };
// the heading (model +x turned by yaw) that points along world (dx, dz)
export const headingOf = (dx, dz) => Math.atan2(-dz, dx);

// The hour as the animals feel it: `dawn` and `dusk` are 1 in the hours round sunrise and sunset (the moose's
// and the beaver's hours, the fish's evening rise), `day` once the sun is well up, `night` after dark.
export function lightOf(day, out) {
  const ss = day.sunriseSunset || {}, rise = ss.rise ?? 5.5, set = ss.set ?? 19.5, h = day.hours;
  out.dawn = smooth(rise - 1.4, rise - 0.6, h) * (1 - smooth(rise + 1.2, rise + 2.2, h));
  out.dusk = smooth(set - 2.0, set - 1.0, h) * (1 - smooth(set + 0.9, set + 1.6, h));
  out.elev = Math.asin(clamp(day.sunDir.y, -1, 1)) * 180 / Math.PI;
  out.day = smooth(4, 14, out.elev);
  out.night = 1 - smooth(-12, -4, out.elev);
  return out;
}

// Sound: the contract the audio side implements (audio.emit(kind, { x, y, z, size })), guarded, with the old
// loon calls as the fallback when it is not there yet.
export function emit(audio, kind, x, y, z, size = 1, dist = 0) {
  if (!audio) return;
  if (audio.emit) { audio.emit(kind, { x, y, z, size }); return; }
  if (kind.startsWith('loon-') && audio.loonCall) audio.loonCall(dist, kind === 'loon-tremolo' ? 'tremolo' : 'wail');
  else if ((kind === 'splash' || kind === 'beaver-slap') && audio.splash && dist < 120) audio.splash(size * (1 - dist / 140));
}

// ---------------------------------------------------------------------------------------------------------
// The top of what stands at (x, z) in the streamed forest: a tree's crown, a snag's broken top, a boulder.
// Finds the instance in the tile's vegetation bins whose trunk is within `near` metres and casts a ray down
// through its own geometry (the variant that bin draws near the camera), so a perched bird sits on the tree
// that is drawn there. Returns { y, sp } or null; only called when a perch or a rock is being picked.

const _ray = new THREE.Raycaster(), _mesh = new THREE.Mesh(), _hits = [], _im = new THREE.Matrix4(), _world = new THREE.Matrix4();
const _down = new THREE.Vector3(0, -1, 0), _from = new THREE.Vector3();
const AXIS = [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]];
const CROWN = [[0, 0]];
for (const r of [0.5, 1.0, 1.6]) for (let k = 0; k < 8; k++) CROWN.push([Math.cos(k * Math.PI / 4 + r) * r, Math.sin(k * Math.PI / 4 + r) * r]);
_mesh.material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }); // foliage cards face every way
export function topOf(world, x, z, near = 1.2, crown = false) {
  const tm = world.tiles;
  if (!tm) return null;
  const [tx, ty] = world.tileOf(x, z), e = tm.tiles.get(tm.key(tx, ty));
  if (!e || e.state !== 'ready' || !e.veg || !e.group) return null;
  let best = null;
  for (const m of e.veg) {
    const l = m.userData.lod, sp = m.userData.sp;
    if (sp === undefined || !l || Math.abs(x - l.cx) > (l.half || 320) + 4 || Math.abs(z - l.cz) > (l.half || 320) + 4) continue;
    const arr = m.instanceMatrix.array, total = l.total || m.count, ox = e.ox, oz = e.oz;
    for (let i = 0; i < total; i++) {
      const px = arr[i * 16 + 12] + ox, pz = arr[i * 16 + 14] + oz;
      if (Math.abs(px - x) > near || Math.abs(pz - z) > near) continue;
      // the variant this instance draws: its group's near geometry, else the bin's full geometry
      let geo = l.full;
      if (l.groups) { let g = 0, start = 0; while (g < l.groups.counts.length - 1 && i >= start + l.groups.counts[g]) { start += l.groups.counts[g]; g++; } geo = l.groups.geos[g] || l.full; }
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      _im.fromArray(arr, i * 16);
      m.parent.updateWorldMatrix(true, false);
      _world.multiplyMatrices(m.parent.matrixWorld, m.matrix).multiply(_im);
      _mesh.geometry = geo; _mesh.matrixWorld.copy(_world);
      // a few rays round the trunk's axis: one straight down it can slip between the cards of the leader
      // (crown: a disc of rays over the whole top, for the highest point of it, where a bird can sit in sight)
      for (const [ox, oz] of crown ? CROWN : AXIS) {
        _from.set(px + ox, world.heightAt(x, z) + 120, pz + oz);
        _ray.set(_from, _down); _ray.far = 200;
        _hits.length = 0;
        _mesh.raycast(_ray, _hits);
        for (const h of _hits) if (!best || h.point.y > best.y) best = { y: h.point.y, sp, x: crown ? h.point.x : px, z: crown ? h.point.z : pz, tx: px, tz: pz };
      }
    }
  }
  return best;
}
