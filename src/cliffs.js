import * as THREE from 'three';
import { ROCK_KIT, ROCK_FILL } from './rocks.js';
import { makeLookMaterial } from './shading.js';
import { bakeOcclusion } from './occlusion.js';
import { CLIFF_MODULE } from './site.js';

// The cliff faces of the bluffs (docs/roadmap.md, the bluff pass). The terrain can only draw a cliff as a steep
// step of its 10 m mesh; a module stands over that step along the contour (placement.js cliffFeatures), a little
// proud of it, and gives it a vertical face of jointed Shield rock: columns and blocks split by vertical and
// horizontal joints, a bench across it two fifths of the way up (small trees root there), an upper tier set back
// over it, a ragged top whose blocks fall away into the hill, the outer columns lower so a run of modules steps
// down at its ends. Built as the shape sheet's rocks are (rocks.js: convex blocks from planes, crisp edges with
// narrow chamfers, drybrushed light along the edges, the occlusion baked in, so the joints go dark), in the
// cliff's dark green-grey; the material adds the water streaks, the lichen and the odd rust stain in world space
// (so neighbouring modules run on into each other).
//
// The frame (site.js CLIFF_MODULE): face at z = 0 looking along -z, x across [-0.5, 0.5], y up [0, 1], z into the
// hill [0, 1]; built at a nominal 14 m wide, 14 m tall, 9 m deep and scaled to unit, so an instance's scale is its
// size in metres on each axis (width, height, depth; the worker's squash and tall factors carry them).

const { RockBuilder, addBlock, cut, plane, through, noise3, smooth } = ROCK_KIT;
const V3 = THREE.Vector3;
const W0 = 14, H0 = 14, D0 = 9;
const LEDGE = CLIFF_MODULE.ledge * H0;
// the stretch of the module (metres) where every variant keeps the bench clear: elsewhere the upper tier may
// come forward over it and the lower tier stand taller or lower, so a run of modules shows short ledges rather
// than one long shelf
const BENCH = [CLIFF_MODULE.benchX[0] * W0 - 0.6, CLIFF_MODULE.benchX[1] * W0 + 0.6];
const onBench = (a, b) => b > BENCH[0] && a < BENCH[1];
// the cliff's colours: dark green-greys for the blocks, the pale grey the drybrush lifts the edges to, a pale
// grey-green lichen and a near-black one (rock tripe) on the faces
const ROCK = [0x7f857a, 0x787e72, 0x85887e, 0x737a70, 0x7c8076].map((h) => new THREE.Color(h));
const EDGE = new THREE.Color(0xb4b7a8), LICHEN = new THREE.Color(0x98a387), TRIPE = new THREE.Color(0x484b44);

// [a, b] cut into n pieces of uneven width (none under half the mean)
function splits(rng, a, b, n) {
  const w = Array.from({ length: n }, () => 0.5 + rng());
  const sum = w.reduce((s, v) => s + v, 0), out = [a];
  let x = a;
  for (const v of w) { x += ((b - a) * v) / sum; out.push(x); }
  out[n] = b;
  return out;
}

// A block of the face: between x0 and x1 (its sides leaning a degree or two), from y0 to its top yT (which falls
// away toward the back by `fall` per metre and leans across by `roll`), its front through zF, turned `turn`
// radians about the vertical (so neighbouring blocks catch the light differently) and leaning back by `lean`,
// back to the module's back; optionally a corner knocked off its top front (`chip` metres deep). Each block gets
// a tone of its own (B.tones).
function block(B, rng, { x0, x1, y0, yT, zF, turn = 0, lean = 0, fall = 0.06, roll = 0, chip = 0, far = false }) {
  const j = () => (rng() - 0.5) * 0.05, xm = (x0 + x1) / 2;
  let planes = [
    plane(0, -1, 0, -y0),
    through(-1, j(), j(), x0, 0, 0), through(1, j(), j(), x1, 0, 0),
    through(Math.sin(turn), lean, -Math.cos(turn), xm, (y0 + yT) / 2, zF),
    through(0, 0, 1, 0, 0, D0 * 1.02),
    through(roll, 1, fall, xm, yT, zF),
  ];
  if (chip > 0) planes = cut(planes, new V3((rng() - 0.5) * 1.6, 0.6 + rng() * 0.7, -1), chip);
  // chamfers: none along the buried foot, the back and the hidden sides; narrow on the joints; now and then a
  // wide weathered one along a top front edge
  const edgeW = (nf, ng, pa, pb, r) => {
    if ((pa.y < y0 + 0.05 && pb.y < y0 + 0.05) || (pa.z > D0 * 0.9 && pb.z > D0 * 0.9)) return 0;
    if (nf.dot(ng) > Math.cos(0.3)) return 0;
    const top = Math.max(nf.y, ng.y) > 0.6, front = Math.min(nf.z, ng.z) < -0.6;
    if (top && front) return r() < 0.35 ? 2.2 + r() : 0.8 + r() * 0.6;
    return r() < 0.3 ? 0 : 0.5 + r() * 0.5;
  };
  const from = B.count, ok = addBlock(B, planes, { bevel: far ? 0 : 0.09, seg: far ? 99 : 6, edgeW }, rng);
  if (ok) B.tones.push([from, B.count, rng()]);
  return ok;
}

// One module's blocks. style 'columns': narrower columns, long vertical joints, few cross joints; 'blocks':
// wider blocks, more cross joints and steps. far: a few big blocks, no chips, no chamfers (the far twin). The
// lower tier keeps its front within 0.4 m of z = 0 and turns little, and the upper tier's front stays behind
// 1.2 m, so the bench between them is there in every variant (site.js CLIFF_MODULE).
function buildBlocks(B, rng, style, far = false) {
  const cols = style === 'columns';
  const yBase = -0.14 * H0;
  B.tones = [];
  const nl = far ? 2 : cols ? 3 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2);
  const xl = splits(rng, -0.52 * W0, 0.52 * W0, nl), tops = [];
  for (let c = 0; c < nl; c++) {
    const bench = onBench(xl[c], xl[c + 1]);
    const zF = rng() * 0.03 * D0, top = bench || far ? LEDGE + (rng() - 0.5) * 0.02 * H0 : LEDGE * (0.7 + rng() * 0.6), turn = (rng() - 0.5) * 0.1;
    tops.push(top);
    // a cross joint now and then: the piece above it set back a little (a step, not the bench)
    if (!far && rng() < (cols ? 0.25 : 0.45)) {
      const yj = yBase + (top - yBase) * (0.4 + rng() * 0.35), step = 0.1 + rng() * 0.15;
      block(B, rng, { x0: xl[c], x1: xl[c + 1], y0: yBase, yT: yj, zF, turn, lean: rng() * 0.03, fall: 0.02 });
      block(B, rng, { x0: xl[c] + 0.04, x1: xl[c + 1] - 0.04, y0: yj, yT: top, zF: zF + step, turn: turn + (rng() - 0.5) * 0.06, lean: rng() * 0.05, fall: 0.03 });
    } else block(B, rng, { x0: xl[c], x1: xl[c + 1], y0: yBase, yT: top, zF, turn, lean: rng() * 0.04, fall: 0.03, far });
  }
  // the upper tier: set back over the bench, its own joints (they do not line up with the ones below), each
  // block turned and leaning its own way, ragged on top (corners knocked off, tops at different heights and
  // falling away into the hill), the outer ones lower and further back
  const nu = far ? 3 : cols ? 4 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 3);
  const xu = splits(rng, -0.52 * W0, 0.52 * W0, nu);
  for (let c = 0; c < nu; c++) {
    const mid = (xu[c] + xu[c + 1]) / 2, end = smooth(0.3, 0.5, Math.abs(mid) / W0), bench = far || onBench(xu[c], xu[c + 1]);
    // off the bench a block may come forward over the lower tier, standing on whatever is below it
    let y0 = LEDGE - 0.05;
    if (!bench) for (let k = 0; k < nl; k++) if (xl[k + 1] > xu[c] && xl[k] < xu[c + 1]) y0 = Math.min(y0, tops[k] - 0.3);
    const zF = (bench ? 0.19 + rng() * 0.08 : rng() < 0.5 ? 0.05 + rng() * 0.12 : 0.15 + rng() * 0.12) * D0 + end * (0.3 + rng() * 0.8);
    const yT = H0 * (0.86 + rng() * 0.16 - end * (0.14 + rng() * 0.16));
    const turn = (rng() - 0.5) * 0.36, lean = -0.03 + rng() * 0.13, fall = 0.1 + rng() * 0.25, roll = (rng() - 0.5) * 0.18;
    const chip = !far && rng() < 0.5 ? 0.4 + rng() * 1.0 : 0;
    if (!far && rng() < (cols ? 0.25 : 0.45)) {
      // a cross joint in the upper tier too, the piece above stepped back or jutting a little
      const yj = LEDGE + (yT - LEDGE) * (0.35 + rng() * 0.35);
      block(B, rng, { x0: xu[c] + 0.03, x1: xu[c + 1] - 0.03, y0, yT: yj, zF, turn, lean, fall: 0.03 });
      block(B, rng, { x0: xu[c] + 0.06, x1: xu[c + 1] - 0.06, y0: yj, yT, zF: zF + (rng() - 0.3) * 0.6, turn: turn + (rng() - 0.5) * 0.2, lean, fall, roll, chip });
    } else block(B, rng, { x0: xu[c] + 0.03, x1: xu[c + 1] - 0.03, y0, yT, zF, turn, lean, fall, roll, chip, far });
  }
}

// Colour per vertex (the block's tone, darker and damper toward the foot, the drybrush on the edges, lichen on
// what looks up), the occlusion bake against the module's own blocks and the ground at its foot, then the frame
// scaled to unit.
function finishModule(B, rng, bake = true) {
  const s = Math.floor(rng() * 100000), col = new Float32Array(B.count * 3), c = new THREE.Color();
  // each block its own tone (B.tones: [first vertex, end, 0..1])
  const toneOf = new Float32Array(B.count);
  for (const [a, b, t] of B.tones) for (let i = a; i < b; i++) toneOf[i] = t;
  for (let i = 0; i < B.count; i++) {
    const p = B.p[i], n = B.n[i];
    const tone = ROCK[Math.floor(toneOf[i] * ROCK.length * 0.999)];
    c.copy(tone).multiplyScalar(0.94 + (noise3(p.x * 0.6, p.y * 0.6, p.z * 0.6, s + 3) - 0.5) * 0.14);
    c.multiplyScalar(0.84 + 0.16 * smooth(0, 0.45 * H0, p.y));
    if (B.role[i] < 2) {
      c.lerp(LICHEN, 0.55 * smooth(0.35, 0.8, n.y) * smooth(0.45, 0.62, noise3(p.x * 0.5 + 9, p.y * 0.5, p.z * 0.5, s + 1)));
      c.lerp(TRIPE, 0.3 * (1 - smooth(0.3, 0.7, Math.abs(n.y))) * smooth(0.66, 0.8, noise3(p.x * 0.35, p.y * 0.35 + 5, p.z * 0.35, s + 2)));
    }
    const brush = smooth(0.25, 1.3, B.sharp[i]) * (0.45 + 0.25 * Math.max(0, n.y));
    if (B.role[i] === 2) c.lerp(EDGE, brush);
    else if (B.role[i] === 1) c.lerp(EDGE, brush * 0.12);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(B.p.flatMap((p) => [p.x, p.y, p.z]), 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.n.flatMap((n) => [n.x, n.y, n.z]), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(B.idx);
  geo.computeBoundingBox();
  if (bake) bakeOcclusion(geo, { ground: 0, reach: 2.4, rays: 10, floor: 0.42 });
  // to the unit frame: positions by 1 / size, normals by size (the inverse transpose), renormalised
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), v = new V3();
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) / W0, pos.getY(i) / H0, pos.getZ(i) / D0);
    v.set(nrm.getX(i) * W0, nrm.getY(i) * H0, nrm.getZ(i) * D0).normalize();
    nrm.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// A cliff module (the near variant): even variants columnar, odd ones blocky.
export function cliffModule(rng, v) {
  const B = new RockBuilder();
  buildBlocks(B, rng, v % 2 ? 'blocks' : 'columns');
  return finishModule(B, rng);
}
// Its far twin: two blocks below the bench and three above, no chips, no bake (the occlusion would not read).
export function cliffModuleFar(rng) {
  const B = new RockBuilder();
  buildBlocks(B, rng, 'blocks', true);
  return finishModule(B, rng, false);
}

// The cliff's material: the rock's (plain Lambert, the sky fill desaturated and lifted as rocks.js does it) with
// the face's own marks laid on in world space: water streaks running down the steep faces (dark, a metre or so
// across and several long), lichen in pale patches (more on what looks up), and now and then a rust stain. Each
// fades before it could shimmer.
export function makeCliffMaterial() {
  const u = { uRockFill: { value: new THREE.Vector2(ROCK_FILL.saturation, ROCK_FILL.lift) } };
  const m = makeLookMaterial({}, {
    wrap: 0, name: 'look-cliff',
    compile: (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCliffW;\nvarying vec3 vCliffN;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  { vec4 cw = vec4( transformed, 1.0 ); vec3 cn = objectNormal;
  #ifdef USE_INSTANCING
    mat3 cim = mat3( instanceMatrix );
    cw = instanceMatrix * cw; cn = cim * ( cn / vec3( dot( cim[ 0 ], cim[ 0 ] ), dot( cim[ 1 ], cim[ 1 ] ), dot( cim[ 2 ], cim[ 2 ] ) ) );
  #endif
    vCliffW = ( modelMatrix * cw ).xyz; vCliffN = normalize( mat3( modelMatrix ) * cn ); }`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCliffW;\nvarying vec3 vCliffN;')
        .replace('void RE_IndirectDiffuse_Look(', 'uniform vec2 uRockFill;\nvoid RE_IndirectDiffuse_Look(')
        .replace('reflectedLight.indirectDiffuse += irradiance * lookSky',
          'vec3 rockIrr = mix( vec3( dot( irradiance, vec3( 0.2126, 0.7152, 0.0722 ) ) ), irradiance, uRockFill.x ) * uRockFill.y;\n  reflectedLight.indirectDiffuse += rockIrr * lookSky')
        .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 cn = normalize( vCliffN );
    float steepF = 1.0 - smoothstep( 0.45, 0.75, abs( cn.y ) );
    vec2 across = normalize( vec2( -cn.z, cn.x ) + vec2( 1e-4, 0.0 ) );
    float px = length( fwidth( vCliffW ) );
    // on a steep face: along it and up it; on a top: the ground plan
    vec2 q = mix( vCliffW.xz, vec2( dot( vCliffW.xz, across ), vCliffW.y ), step( 0.5, steepF ) );
    float streak = lookFbm( vec2( q.x / 0.8, q.y / 7.0 ), 51u, 3 );
    diffuseColor.rgb *= 1.0 - 0.3 * smoothstep( 0.46, 0.26, streak ) * steepF * lookFade( 0.8, px );
    float lich = smoothstep( 0.58, 0.7, lookFbm( q / 1.5 + vec2( 4.1, -2.3 ), 52u, 2 ) ) * mix( 0.45, 1.0, smoothstep( 0.3, 0.8, cn.y ) ) * lookFade( 1.5, px );
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.36, 1.42, 1.16 ), 0.7 * lich );
    float rust = smoothstep( 0.78, 0.86, lookFbm( vec2( q.x / 3.0, q.y / 9.0 ) + vec2( 2.9, -7.7 ), 54u, 2 ) ) * steepF;
    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 1.5, 0.95, 0.62 ), 0.55 * rust );
  }`);
    },
  });
  m.userData.u = u;
  return m;
}
