// Co-op phase 3, stream B (the owner, 2026-11-01: "note animations are also not synced (jump, other animations)"): a
// friend's figure does what they are doing, not only where they are. The pose (coop.js, 15 Hz) carries `an` when the
// body is doing more than standing, striding or paddling, and the friend's actor (actors.js Person.drive's anim, the
// gait's own air, crouch, wade and rod hands; poses.js sitPose and swimPose) draws it with the player's own poses.
//
//   an (in the pose, only what is on; absent when nothing is):
//     j    [dy, vy, airT]  in a hop or a fall on foot: the figure's height over the ground, its upward speed, seconds in the air. The
//                          friend's screen flies it on ballistically from the pose's time to the drawn time, so the arc
//                          is smooth between poses (GRAVITY as player.js)
//     ld   0..1            a landing sinking into the knees, fading
//     cr   0..1            crouched for a low chore (gathering wood, picking berries, the fire: camp.js state.crouch)
//     mk   'wade'          wading (the knees high)
//     sit  y               on a seat (a bench, a stump, the latrine): the seat's top
//     fz   [R3, L3, dir3, up3, knob3, yaw, lean, look]   the rod up: fishing.js's hands (canoe rig space), on foot or afloat
//     rod  [x, y, z, qx, qy, qz, qw]                      and the rod itself in that space (casting, reeling, a fish on)
//   About 40 bytes in a jump, 150 with the rod up; nothing at all otherwise. The swim is the pose's own mode (coop.js).
//
//   Not sent (drawn as the stride or the stand): the vault and the climb over a rock (timed moves with their own
//   geometry), the arms on a held job (the saw, the axe, the douse, the pitch, the hang: the crouch shows the low ones),
//   things in the hands (packs.js state.held), the camera raised, eating and drinking, the landed fish in the hands.
//
//   const anim = new CoopAnim(coop, { fishing })   (main.js, after the coop); anim.stats() for the tests
import * as THREE from 'three';
import { buildRod } from './gear.js';

const GRAVITY = 9.81;     // player.js's
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const v3 = (v) => [r3(v.x), r3(v.y), r3(v.z)];
const fin = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);

export class CoopAnim {
  constructor(coop, { fishing = null } = {}) {
    this.coop = coop; this.fishing = fishing;
    this.rods = new Map();   // peer id → { root, parent }
    this.sent = 0;
    coop.poseFns.add((m) => this.encode(m));
    coop.drawFns.add((r, s, T) => this.apply(r, s, T));
    coop.onPeers((what, peer) => {
      if (what === 'leave' && peer) this.dropRod(peer.id);
      if (what === 'gone') for (const id of [...this.rods.keys()]) this.dropRod(id);
      if (what === 'welcome') { const keep = new Set(coop.peers().map((q) => q.id)); for (const id of [...this.rods.keys()]) if (!keep.has(id)) this.dropRod(id); }
    });
  }
  // --- what this body is doing, into the pose ----------------------------------------------------------------------
  encode(m) {
    const g = this.coop.g, p = g.player, c = g.canoe, st = c && c.state;
    if (!p || !st) return;
    const a = {};
    if (p.mode === 'walk') {
      if (st.air) a.j = [r2(c.rig.position.y - p.groundAt(p.x, p.z)), r2(st.vy || 0), r2(st.airT || 0)];
      if (st.land > 0.03) a.ld = r2(st.land);
      if (st.crouch > 0.02) a.cr = r2(st.crouch);
      const mv = p.move;
      if (mv && mv.kind === 'wade') a.mk = 'wade';
      if (mv && mv.kind === 'sit') a.sit = r2(Number.isFinite(mv.top) ? mv.top : c.rig.position.y + 0.45);
    }
    const F = this.fishing, fz = st.fishing;
    if (fz && F && F.rodUp && (p.mode === 'walk' || p.mode === 'paddle') && !a.sit) {
      a.fz = [...v3(fz.R), ...v3(fz.L), ...v3(fz.dir), ...v3(fz.up), ...v3(fz.knobAxis), r3(fz.yaw || 0), r3(fz.lean || 0), r3(fz.look || 0)];
      const rod = F.rod;
      if (rod && rod.visible) a.rod = [...v3(rod.position), r3(rod.quaternion.x), r3(rod.quaternion.y), r3(rod.quaternion.z), r3(rod.quaternion.w)];
    }
    for (const k in a) { m.an = a; this.sent++; return; }
  }
  // --- a friend's, onto their actor (every frame, after coop.js has placed them; s the sample, T their time drawn) ---
  apply(r, s, T) {
    const P = r.person, an = s.an;
    if (!an || s.m === 'swim' || s.m === 'carry') { P.anim = null; this.showRod(r, null); return; }
    const A = (r.anim || (r.anim = { fzv: { R: new THREE.Vector3(), L: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), knobAxis: new THREE.Vector3(), yaw: 0, lean: 0, look: 0 } }));
    A.air = false; A.y = NaN; A.vy = 0; A.airT = 0; A.land = NaN; A.crouch = 0; A.mk = null; A.sit = NaN; A.fz = null;
    if (s.m === 'walk') {
      if (fin(an.j, 3)) {
        // flown on from the pose's time to the time drawn (back before it too, between two poses)
        const dT = (T - s.ts) / 1000, ground = Number.isFinite(P.y) ? P.y : 0;
        A.air = true; A.vy = an.j[1] - GRAVITY * dT; A.airT = Math.max(0, an.j[2] + dT);
        A.y = ground + Math.max(0, an.j[0] + an.j[1] * dT - 0.5 * GRAVITY * dT * dT);
      }
      if (Number.isFinite(an.ld)) A.land = an.ld;
      if (Number.isFinite(an.cr)) A.crouch = Math.max(0, Math.min(1, an.cr));
      if (an.mk === 'wade') A.mk = 'wade';
      if (Number.isFinite(an.sit)) A.sit = an.sit;
    }
    if (fin(an.fz, 18)) {
      const f = an.fz, z = A.fzv;
      z.R.set(f[0], f[1], f[2]); z.L.set(f[3], f[4], f[5]); z.dir.set(f[6], f[7], f[8]); z.up.set(f[9], f[10], f[11]); z.knobAxis.set(f[12], f[13], f[14]);
      z.yaw = f[15]; z.lean = f[16]; z.look = f[17];
      A.fz = z;
    }
    P.anim = A;
    this.showRod(r, A.fz && fin(an.rod, 7) ? an.rod : null, s.m);
  }
  // the friend's rod, in their hands' space: the figure's frame on foot, the hull's afloat
  showRod(r, at, mode) {
    let R = this.rods.get(r.id);
    if (!at) { if (R) R.root.visible = false; return; }
    const parent = mode === 'paddle' ? r.boat.root : r.person.bind && r.person.bind.kind === 'foot' ? r.person.bind.root : null; // (the root: scaled with the figure)
    if (!parent) { if (R) R.root.visible = false; return; }
    if (!R) {
      const mat = this.coop.g.actors && this.coop.g.actors.material;
      if (!mat) return;
      R = { root: buildRod(mat).root }; R.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.rods.set(r.id, R);
    }
    if (R.root.parent !== parent) parent.add(R.root);
    R.root.position.set(at[0], at[1], at[2]); R.root.quaternion.set(at[3], at[4], at[5], at[6]);
    R.root.visible = true;
  }
  dropRod(id) { const R = this.rods.get(id); if (R) { R.root.removeFromParent(); this.rods.delete(id); } }
  stats() { return { sent: this.sent, rods: [...this.rods.values()].map((R) => ({ visible: R.root.visible, inScene: !!R.root.parent })) }; }
}
