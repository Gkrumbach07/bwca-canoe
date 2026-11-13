// Round 7 stream 7a's kits for the story layer (story-props.js REGISTRY takes them in its 7a block): the props of S2's
// west site on Big Moose (the snag off the point, the serviceberry at the ridge's east end, the two birches at the top,
// the hollow log), S3's long rock and north bay (the loose stone on C1000's fire ring, the rotten birch where foxfire
// glows), and S4's stations and kill (a survey stake is a2's stationStake; the kill's bones). Same frame and contract as
// story-props.js: origin on the ground at the foot, +y up, -z toward the water; { geo, dots, top? }. One material.
import * as THREE from 'three';
import { PropBuilder, TILE, chunkStone } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const COL = {
  grey: C(0x8a8478), greyWet: C(0x5c574e), bark: C(0x5a4636), birch: C(0xe6e2d6), birchDark: C(0x2e2a26), leaf: C(0x4c6a34),
  leafDark: C(0x37502a), berry: C(0x3b2a4a), stem: C(0x6b4a3a), granite: C(0x97928a), flat: C(0x8b867c), rot: C(0x6a5a44),
  bone: C(0xd8d0bc), hair: C(0x7a6450), field: C(0x86817a),
};

// a deadhead snag standing in a metre of water off the point: a grey trunk from the bed, its top broken off a hand or two
// over the surface, one stub of a limb (Tie off's anchor, 60 S2)
function snag({ rng, level = 1 }) {
  const b = new PropBuilder(), top = Math.max(0.6, level + 0.5 + rng() * 0.4);
  b.cyl(V(0, -0.3, 0), V(0.08, top, 0.05), 0.2, 0.14, 8, TILE.BARK, (t) => COL.greyWet.clone().lerp(COL.grey, Math.min(1, t * 1.3)), { cap1: true, capTile: TILE.END, capCol: COL.grey, jitter: 0.02, rng });
  b.cyl(V(0.04, top - 0.35, 0.02), V(0.42, top - 0.1, 0.18), 0.05, 0.02, 5, TILE.BARK, COL.grey, { cap1: true });
  return { geo: b.build(), dots: [{ y: Math.max(0.3, level) + 0.2, r: 0.7 }] };
}
// a serviceberry at the ridge's east end: a clump of thin stems, leaf tufts up them; opts.stripped: pulled down,
// the stems bent over and few leaves left (the bear's work, the morning after)
function serviceberry({ rng, opts = {} }) {
  const b = new PropBuilder(), n = 7, H = 3.2;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng() * 0.6, lean = opts.stripped && k % 2 === 0 ? 0.9 : 0.18 + rng() * 0.15;
    const top = V(Math.cos(a) * H * lean, H * (opts.stripped && k % 2 === 0 ? 0.45 : 0.85 + rng() * 0.2), Math.sin(a) * H * lean);
    b.cyl(V(Math.cos(a) * 0.12, -0.05, Math.sin(a) * 0.12), top, 0.035, 0.012, 5, TILE.BARK, COL.stem);
    if (!opts.stripped || k % 2 === 1) for (let j = 0; j < 3; j++) {
      const t = 0.5 + j * 0.2, c = V(top.x * t, top.y * t, top.z * t), s = 0.38 + rng() * 0.2;
      b.cyl(c.clone().add(V(0, -s * 0.4, 0)), c.clone().add(V(0, s * 0.6, 0)), s, 0.05, 6, TILE.PLAIN, j % 2 ? COL.leaf : COL.leafDark, { cap0: true });
    }
  }
  return { geo: b.build(), dots: [{ y: 1.2, r: 1.2 }] };
}
// two birches close together at the ridge top (the gap the frame's shape stands in)
function twoBirches({ rng }) {
  const b = new PropBuilder();
  for (const [dx, H] of [[-1.4, 13 + rng() * 2], [1.4, 12 + rng() * 2]]) {
    b.cyl(V(dx, -0.2, 0), V(dx + (rng() - 0.5) * 0.4, H, 0), 0.17, 0.05, 8, TILE.BARK, (t) => (t < 0.08 ? COL.birchDark : COL.birch), { ts: [0, 0.08, 1], jitter: 0.01, rng });
    for (let j = 0; j < 4; j++) { const y = H * (0.6 + j * 0.1), s = 1.3 - j * 0.2; b.cyl(V(dx + (rng() - 0.5), y - s * 0.4, (rng() - 0.5)), V(dx, y + s * 0.7, 0), s, 0.1, 6, TILE.PLAIN, COL.leaf, { cap0: true }); }
  }
  return { geo: b.build(), dots: [{ y: 1.4, r: 2.2 }] };
}
// a hollow log in the deadfall (the calf's knock)
function hollowLog({ rng }) {
  const b = new PropBuilder(), L = 4.5;
  b.cyl(V(-L / 2, 0.22, 0), V(L / 2, 0.18, 0.2), 0.26, 0.22, 9, TILE.BARK, COL.rot, { cap0: true, cap1: true, capTile: TILE.END, capCol: C(0x2a2018), jitter: 0.02, rng });
  return { geo: b.build(), dots: [{ y: 0.25, r: 1.1 }] };
}
// the fire ring at C1000 and its loose top stone (the tin under it, 60 S3): a ring of field stones, one flat stone
// across the top course
function ringStone({ rng }) {
  const b = new PropBuilder(), R = 0.55;
  for (let k = 0; k < 9; k++) { const a = (k / 9) * Math.PI * 2, s = 0.13 + rng() * 0.06; chunkStone(b, new THREE.Matrix4().compose(V(Math.cos(a) * R, 0.05, Math.sin(a) * R), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), V(s, s * 0.8, s)), rng, COL.field); }
  chunkStone(b, new THREE.Matrix4().compose(V(R, 0.2, 0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.4, 0)), V(0.24, 0.06, 0.18)), rng, COL.flat);
  return { geo: b.build(), dots: [{ y: 0.22, r: 0.35 }] };
}
// a down birch rotting on the north shore: the white bark gone grey and split, the wood soft (foxfire's log)
function rottenBirch({ rng }) {
  const b = new PropBuilder(), L = 5;
  b.cyl(V(-L / 2, 0.16, 0), V(L / 2, 0.12, 0.4), 0.2, 0.15, 8, TILE.BARK, (t) => COL.birch.clone().lerp(COL.rot, 0.35 + 0.4 * Math.abs(Math.sin(t * 9))), { jitter: 0.03, rng });
  return { geo: b.build(), dots: [{ y: 0.18, r: 1.0 }] };
}
// the kill: a deer, mostly hair and bones (ravens over it, side7a-draw.js)
function killBones({ rng }) {
  const b = new PropBuilder();
  for (let k = 0; k < 6; k++) { const a = rng() * Math.PI, l = 0.3 + rng() * 0.3, x = (rng() - 0.5) * 1.2, z = (rng() - 0.5) * 0.8; b.cyl(V(x, 0.03, z), V(x + Math.cos(a) * l, 0.04, z + Math.sin(a) * l), 0.02, 0.015, 5, TILE.PLAIN, COL.bone); }
  for (let k = 0; k < 5; k++) { const pts = [], cx = (rng() - 0.5) * 1.6, cz = (rng() - 0.5) * 1.2; for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; pts.push(V(cx + Math.cos(a) * 0.3, 0.01, cz + Math.sin(a) * 0.22)); } b.face(pts, TILE.PLAIN, COL.hair, { ref: V(0, 1, 0) }); }
  return { geo: b.build(), dots: [{ y: 0.1, r: 1.0 }] };
}

export const KITS_7A = { snag, serviceberry, twoBirches, hollowLog, ringStone, rottenBirch, killBones };
