// Hanging the food barrel (the camp redone, 2026-10-24: "you have to hang your blue food barrel"). With a blue barrel in
// reach (on you, at your feet, in the canoe beside you) and a tree near whose lowest limb is high enough, hold E at the
// tree: the rope goes over the limb, the barrel is tied on and hoisted, and it hangs well out from the trunk with its
// bottom three metres off the ground, the rope tied off round the trunk. E at a hung barrel lets it down again. A hung
// barrel is in reach only once lowered, or from under it (to look in: inventory.js REACH).
//
// The trees are the drawn ones (tiles.js vegBins: each tree's species, place and scale): a white pine's, a red pine's or
// a big birch's lowest limb, where its crown starts (camera.js CROWN's measures of the drawn trees), four to seven and a
// half metres up. The spruces, the cedars and the jack pines branch to the ground and hold no barrel. The limb itself is
// drawn here (a bare bough out from the trunk at that height, on the props' one material) with the rope tied off; the
// barrel and its rope up to the limb are containers.js's (inventory at.limb).
//
// In Adventure, food left on the ground at a camp overnight may be found: a gentle, rare raid (bearNight, from camp.wake)
// takes a meal or two and says so in the morning. A hung barrel never; a sealed barrel on the ground seldom; Sandbox never.
import * as THREE from 'three';
import { hold } from './hold.js';
import { inventory as INVENTORY } from './inventory.js';
import { itemDef } from './items.js';
import { TILE, PropBuilder, propMaterial } from './prop-kit.js';

// the species whose lowest limb can take a barrel (vegetation.js SPECIES order): height at unit scale, where the crown
// starts as a share of it (camera.js CROWN)
const HANG_TREES = { 0: { name: 'white pine', h: 19.5, base: 0.22 }, 2: { name: 'red pine', h: 19, base: 0.45 }, 3: { name: 'birch', h: 13, base: 0.25 } };
const LIMB = [4.0, 7.5];        // m above the ground at the trunk: a limb you can throw a rope over and that holds the barrel high
const OUT = 1.8;                // m out from the trunk the rope comes down (two metres from the trunk, as the rangers ask)
const CLEAR = 3.0;              // m from the ground to the hung barrel's bottom
const AT_TREE = 3.4;            // m from the trunk within which E hangs the barrel from it
const AT_HUNG = 3.4;            // m from a hung barrel's rope (or its trunk) within which E lets it down
export const BARRELS = { barrel30: 0.47, barrel60: 0.64 }; // the barrels' heights (containers.js BARREL)
const CELL = 16;

export const HANG = [
  { name: 'Rope over the limb', doing: 'Throwing the rope over the limb', minutes: 3, seconds: 1.5 },
  { name: 'Tied on', doing: 'Tying the barrel on', minutes: 2, seconds: 1.0 },
  { name: 'Hoisted', doing: 'Hoisting it up and tying off on the trunk', minutes: 3, seconds: 1.6 },
];
export const LOWER = [
  { name: 'Untied', doing: 'Untying the rope from the trunk', minutes: 1, seconds: 0.8 },
  { name: 'Lowered', doing: 'Letting it down hand over hand', minutes: 2, seconds: 1.3 },
];

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };
const lower = (s) => String(s).charAt(0).toLowerCase() + String(s).slice(1);
// a barrel as a line says it ("the small blue barrel", not "the blue barrel, 30 L")
const barrelName = (item) => ({ barrel30: 'small blue barrel', barrel60: 'big blue barrel' })[item] || lower((itemDef(item) || { name: 'barrel' }).name);

export class Hang {
  // camp: camp.js's Camp (its world, tiles, player, scene, hud, trip, note)
  constructor(camp, { inventory = INVENTORY } = {}) {
    this.camp = camp; this.inv = inventory;
    this.byTile = new WeakMap(); // a tile's hangable trees, hashed by cell
    this.limbs = new Map();      // what is drawn at a tree: key (container id, or 'pending') -> { mesh, sig }
    this.pending = null;         // a hang let go before the barrel was up: { ref, tree, done }
  }
  get player() { return this.camp.player; }
  get tiles() { return this.camp.tiles; }

  // --- the trees ----------------------------------------------------------------------------------------------------
  // a tile's trees that can take a barrel, gathered once: { x, z, y (its base), gy (the ground), limb (world y), sp, name }
  treesOf(e) {
    let h = this.byTile.get(e);
    if (h) return h;
    h = new Map();
    const bins = e.vegBins || [];
    for (const b of bins) {
      const K = HANG_TREES[b.sp];
      if (!K || !b.count) continue;
      const M = b.matrices;
      for (let i = 0; i < b.count; i++) {
        const o = i * 16, s = Math.hypot(M[o + 4], M[o + 5], M[o + 6]);
        if (s < 0.05) continue;
        const x = M[o + 12] + e.ox, y = M[o + 13], z = M[o + 14] + e.oz;
        const t = { x, z, y, s, sp: b.sp, name: K.name, limbAt: y + K.base * K.h * s };
        const key = Math.floor(x / CELL) * 65536 + Math.floor(z / CELL);
        let a = h.get(key); if (!a) h.set(key, (a = [])); a.push(t);
      }
    }
    this.byTile.set(e, h);
    return h;
  }
  // the hangable trees within r of (x, z): their limb's height over the ground checked (LIMB), the nearest first
  treesNear(x, z, r) {
    const T = this.tiles, w = this.camp.world, out = [];
    if (!T || !T.tiles || !w.tileOf) return out;
    const [tx0, ty0] = w.tileOf(x - r, z - r), [tx1, ty1] = w.tileOf(x + r, z + r);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const e = T.tiles.get(T.key(tx, ty));
      if (!e || e.state !== 'ready' || !e.vegBins) continue;
      const h = this.treesOf(e);
      for (let cz = Math.floor((z - r) / CELL); cz <= Math.floor((z + r) / CELL); cz++) for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++) {
        const a = h.get(cx * 65536 + cz);
        if (!a) continue;
        for (const t of a) {
          const d = Math.hypot(t.x - x, t.z - z);
          if (d > r) continue;
          const gy = T.groundAt(t.x, t.z), up = t.limbAt - gy;
          if (up < LIMB[0] || up > LIMB[1]) continue;
          out.push({ ...t, gy, up, d });
        }
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }
  // where a barrel would hang from tree t, for the walker standing at (px, pz): the rope OUT metres from the trunk on
  // the walker's side (or the open side), on land and clear of the other trunks; null when there is no such spot
  spotFor(t, px, pz, H = BARRELS.barrel60) {
    const T = this.tiles, w = this.camp.world;
    let a0 = Math.atan2(pz - t.z, px - t.x);
    for (const da of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const a = a0 + da, dx = Math.cos(a), dz = Math.sin(a), x = t.x + dx * OUT, z = t.z + dz * OUT;
      if (!w.isReady(x, z) || w.shoreAt(x, z) < 0.8) continue;
      const gy = T.groundAt(x, z), top = gy + CLEAR + H; // the barrel's top hanging
      if (t.limbAt - top < 0.25) continue;
      if (T.treesNear(x, z, 0.35).some((o) => !o.shape && !o.box && Math.hypot(o.x - t.x, o.z - t.z) > 0.5)) continue; // another trunk under the rope
      const tr = T.treesNear(t.x, t.z, 0.3).find((o) => !o.shape && !o.box && Math.hypot(o.x - t.x, o.z - t.z) < 0.5);
      return { x, z, gy, dx, dz, limb: t.limbAt, tree: { x: t.x, z: t.z, gy: t.gy, sp: t.sp, name: t.name, r: tr ? tr.r : 0.25, dx, dz } };
    }
    return null;
  }

  // --- the frame ----------------------------------------------------------------------------------------------------
  // each frame (camp.update): the limbs drawn for the barrels hung (from the save too) and a hang under way
  update() {
    const inv = this.inv, seen = new Set();
    const pe0 = this.pending;
    if (inv && inv.attached) for (const c of inv.containers) {
      if (c.where !== 'hung' || !c.at || !c.at.tree) continue;
      // tied on at the rope's foot and the hang given up (walked off, a reload): untied, it stands there on the ground
      if (c.at.up === false && !(pe0 && pe0.ref === c.id)) { inv.setDown(c.id, { x: c.at.x, z: c.at.z, heading: c.at.heading || 0 }, { left: false, force: true }); continue; }
      seen.add(c.id);
      this.drawLimb(c.id, c.at.tree, c.at.limb, 'tied');
    }
    const pe = this.pending;
    if (pe && pe.done >= 1) {
      const c = inv.cont(pe.ref);
      if (!c || (c.where !== 'ground' && c.where !== 'hung' && !inv.inReach(c)) || Math.hypot(pe.tree.x - this.player.x, pe.tree.z - this.player.z) > 40) this.pending = null;
      else if (c.where !== 'hung') { seen.add('pending'); this.drawLimb('pending', pe.tree, pe.limb, pe.done >= 2 ? 'tied' : 'dangle'); }
    }
    for (const [k, L] of this.limbs) if (!seen.has(k)) { L.mesh.removeFromParent(); L.mesh.geometry.dispose(); this.limbs.delete(k); }
  }
  // the limb out from the trunk at its height, the rope over it (dangling to the ground until the barrel is tied on, then
  // tied off round the trunk); built in the trunk's own frame (its base on the ground), so the floats stay small
  drawLimb(key, tree, limb, rope) {
    const sig = `${tree.x.toFixed(2)},${tree.z.toFixed(2)},${limb.toFixed(2)},${rope}`;
    let L = this.limbs.get(key);
    if (L && L.sig === sig) return;
    const b = new PropBuilder(), gy = tree.gy, ly = limb - gy, dx = tree.dx, dz = tree.dz, sx = -dz, sz = dx;
    const at = (o, y, s = 0) => V(dx * o + sx * s, y, dz * o + sz * s);
    const bark = new THREE.Color(0x4f4236), rope0 = new THREE.Color(0xcbbf9a), tr = (tree.r || 0.25) * 0.85 + 0.015;
    // the limb: from inside the trunk, out and a little up, tapering; a couple of broken-off twigs on it
    b.tube([at(0, ly - 0.22), at(OUT * 0.45, ly - 0.06), at(OUT, ly), at(OUT + 0.75, ly + 0.16)], (u) => 0.075 * (1 - u) + 0.022 * u, 6, TILE.BARK, bark, { cap1: true });
    b.tube([at(OUT * 0.55, ly - 0.04), at(OUT * 0.75, ly + 0.28, 0.2)], (u) => 0.022 * (1 - u) + 0.008 * u, 4, TILE.BARK, bark, { cap1: true });
    b.tube([at(OUT * 1.15, ly + 0.05), at(OUT * 1.3, ly + 0.3, -0.18)], (u) => 0.016 * (1 - u) + 0.006 * u, 4, TILE.BARK, bark, { cap1: true });
    const r = 0.0075, top = ly + 0.06;
    if (rope === 'dangle') {
      // thrown over: both ends hanging to the ground either side of the limb
      b.tube([at(OUT - 0.03, top), at(OUT - 0.04, 0.05)], r, 4, TILE.ROPE, rope0);
      b.tube([at(OUT + 0.03, top), at(OUT + 0.05, 0.04, 0.06)], r, 4, TILE.ROPE, rope0);
    } else {
      // over the limb and down at a slant to the trunk, a few turns round it at chest height
      b.tube([at(OUT - 0.02, top), at(OUT - 0.08, top - 0.05), at(tr + 0.02, 1.42)], r, 4, TILE.ROPE, rope0);
      const ring = [];
      for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI * 2; ring.push(V(Math.cos(a) * tr, 1.38 + 0.04 * (k / 12), Math.sin(a) * tr)); }
      b.tube(ring, r * 1.2, 4, TILE.ROPE, rope0);
    }
    const geo = b.build();
    if (!L) {
      const mesh = new THREE.Mesh(geo, propMaterial());
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'hang-limb';
      this.camp.scene.add(mesh);
      L = { mesh, sig };
      this.limbs.set(key, L);
    } else { L.mesh.geometry.dispose(); L.mesh.geometry = geo; L.sig = sig; }
    L.mesh.position.set(tree.x, gy, tree.z);
    L.mesh.updateMatrixWorld(true);
  }

  // --- the prompts --------------------------------------------------------------------------------------------------
  // the barrels you could hang now: a blue barrel in reach (inventory.reachable: on you, at your feet, in the canoe by you)
  barrels() {
    const inv = this.inv;
    if (!inv || !inv.attached) return [];
    return inv.reachable().filter((c) => BARRELS[c.item] && c.where !== 'hung' && c.where !== 'in');
  }
  // the barrel hung up in a tree nearest (px, pz) within AT_HUNG of its rope or its trunk (not one still being hoisted)
  hungNear(px, pz) {
    const inv = this.inv;
    if (!inv || !inv.attached) return null;
    let best = null, bd = AT_HUNG;
    for (const c of inv.containers) {
      if (c.where !== 'hung' || !c.at || c.at.up === false) continue;
      const t = c.at.tree, d = Math.min(Math.hypot(c.at.x - px, c.at.z - pz), t ? Math.hypot(t.x - px, t.z - pz) : Infinity);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }
  // E at a hang let go (carry on: the rope over the limb, or the barrel tied on at its foot), at a hung barrel (let it
  // down), or with a barrel in reach at a tree with a high limb (hang it); true when it set the prompt
  prompts() {
    const p = this.player;
    if (p.mode !== 'walk' || hold.active) return false;
    const pe = this.pending;
    if (pe && pe.done >= 1 && Math.hypot(pe.tree.x - p.x, pe.tree.z - p.z) < AT_TREE + 1) {
      const c = this.inv.cont(pe.ref);
      if (c && (c.where === 'ground' || c.where === 'hung' || this.inv.inReach(c))) {
        hold.offer(pe.done >= 2 ? 'Carry on hoisting the barrel' : 'Carry on hanging the barrel', `${HANG[pe.done - 1].name.toLowerCase()} so far`, this.hangOpts(c, pe.spot, pe.done));
        return true;
      }
    }
    const hung = this.hungNear(p.x, p.z);
    if (hung) {
      const t = hung.at.tree;
      hold.offer('Let the barrel down', `the ${barrelName(hung.item)}, from the ${t ? t.name : 'tree'}`, this.lowerOpts(hung));
      return true;
    }
    const bs = this.barrels();
    if (!bs.length) return false;
    const trees = this.treesNear(p.x, p.z, AT_TREE);
    for (const t of trees) {
      const c = bs.find((k) => k.where === 'back' || k.where === 'chest' || k.where === 'hands') || bs[0];
      const spot = this.spotFor(t, p.x, p.z, BARRELS[c.item]);
      if (!spot) continue;
      hold.offer('Hang the barrel', `from the ${t.name}, a limb ${Math.round(t.up)} m up`, this.hangOpts(c, spot, 0));
      return true;
    }
    return false;
  }

  // the hold for a hang: the rope over (drawn dangling), the barrel tied on (it comes off you and stands at the rope's
  // foot), then hoisted to CLEAR off the ground as E is held. Let go before it is up and it stays down, the rope over the
  // limb, for a hold to carry on from.
  hangOpts(c, spot, from) {
    const inv = this.inv, H = BARRELS[c.item] || 0.6, p = this.player;
    const low = spot.gy + H / 2 + 0.02, high = spot.gy + CLEAR + H / 2;
    const at = (y) => ({ x: spot.x, y, z: spot.z, heading: Math.atan2(-spot.dz, spot.dx), limb: spot.limb + 0.06 });
    const tieOn = () => { if (inv.cont(c.id) && inv.cont(c.id).where !== 'hung') { inv.hang(c.id, at(low)); const k = inv.cont(c.id); if (k && k.at) { k.at.tree = spot.tree; k.at.up = false; } } };
    return {
      id: 'hang', label: 'Hanging the barrel', phases: HANG, at: from, near: { x: p.x, z: p.z, r: 1.5 },
      onPhase: (i) => {
        if (i === 0) this.pending = { ref: c.id, tree: spot.tree, limb: spot.limb, spot, done: 1 };
        if (i === 1) { if (this.pending) this.pending.done = 2; tieOn(); }
        if (i === 2) {
          const k = inv.cont(c.id); if (!k) return;
          if (k.where !== 'hung') tieOn();
          k.at.y = high; k.at.up = true; this.pending = null;
          inv.emit('hung');
          const tag = this.camp.reachArea ? this.camp.reachArea() : null; if (tag && k.at) k.at.camp = tag.key || 'camp';
          this.camp.note(`The ${barrelName(c.item)} hangs from the ${spot.tree.name}, ${CLEAR} m up and ${OUT.toFixed(1).replace('.0', '')} m out from the trunk.`, 5);
          this.camp.log('hang', { item: c.item, tree: spot.tree.name, x: Math.round(spot.x), z: Math.round(spot.z) });
        }
      },
      onTick: (k) => { if (k > 2) { let b = inv.cont(c.id); if (b && b.where !== 'hung') { tieOn(); b = inv.cont(c.id); } if (b && b.where === 'hung' && b.at) b.at.y = low + (high - low) * ease(k - 2); } },
      // let go: tied on, it stays tied at the rope's foot (back down if it was part way up), for a hold to hoist it
      onStop: (job) => {
        const b = inv.cont(c.id);
        if (b && b.where === 'hung' && b.at && b.at.up === false) b.at.y = low;
        if (this.pending) { this.pending.done = Math.max(1, job.done); if (job.done < 1) this.pending = null; }
        if (job.done >= 1 && job.done < 3) this.camp.note(`${HANG[job.done - 1].name}. Hold E there to carry on.`, 3);
      },
    };
  }
  // the hold to let it down: untied from the trunk, then lowered to the ground at the rope's foot (where it is yours to
  // pick up, open or carry off). Let go before it is down and it goes back up.
  lowerOpts(c) {
    const inv = this.inv, H = BARRELS[c.item] || 0.6, a = c.at, high = a.y, low = (a.tree ? this.tiles.groundAt(a.x, a.z) : a.y - CLEAR) + H / 2 + 0.02, p = this.player;
    return {
      id: 'lower', label: 'Lowering the barrel', phases: LOWER, at: 0, near: { x: p.x, z: p.z, r: 1.5 },
      onTick: (k) => { const b = inv.cont(c.id); if (b && b.where === 'hung' && k > 1) b.at.y = high + (low - high) * ease(k - 1); },
      onPhase: (i) => {
        if (i < 1) return;
        const b = inv.cont(c.id); if (!b) return;
        const tag = this.camp.reachArea ? this.camp.reachArea() : null;
        inv.setDown(b.id, { x: a.x, z: a.z, heading: a.heading || 0, ...(tag ? { camp: tag.key || 'camp' } : {}) }, { left: false, force: true });
        this.camp.note(`The ${barrelName(c.item)} is down.`, 3);
      },
      onStop: () => { const b = inv.cont(c.id); if (b && b.where === 'hung') b.at.y = high; },
    };
  }

  // --- the night ----------------------------------------------------------------------------------------------------
  // In Adventure, the morning after a night at (x, z): food left on the ground within 60 m (not hung) may have been got
  // into: a pack or a pile now and then, a sealed barrel seldom; a meal or two goes. The morning's line, or null.
  bearNight(x, z, rnd = Math.random) {
    const inv = this.inv, c0 = this.camp;
    if (!inv || !inv.attached || !c0.adventure) return null;
    const FOOD = new Set(['meal', 'snack', 'forage', 'fish', 'food']);
    for (const c of inv.containers) {
      const k = inv.root(c);
      if (k.where !== 'ground' || !k.at || Math.hypot(k.at.x - x, k.at.z - z) > 60) continue;
      const food = c.grid.filter((e) => !e.box && FOOD.has((itemDef(e.id) || {}).kind));
      if (!food.length) continue;
      if (rnd() > (BARRELS[c.item] ? 0.05 : 0.12)) continue;
      const n = Math.min(food.length, 1 + (rnd() < 0.4 ? 1 : 0));
      const gone = [];
      for (let i = 0; i < n; i++) { const e = food[i]; const t = inv.take(c.id, e.uid, 1); if (t) gone.push(itemDef(t.id).name); }
      if (!gone.length) continue;
      const nm = itemDef(c.item).name, where = BARRELS[c.item] ? 'pried at the blue barrel left on the ground until the lid gave' : c.item === 'pile' ? 'found the food left lying on the ground' : `got into the ${/^Duluth/.test(nm) ? nm : lower(nm)} left on the ground`;
      c0.log('bear', { item: c.item, gone });
      return `A bear came through in the night and ${where}: ${gone.length > 1 ? `${lower(gone[0])} and ${lower(gone[1])}` : lower(gone[0])} gone, the wrappers in the brush. Hang the food tonight.`;
    }
    return null;
  }
}
