// Co-op phase 3, stream B (the owner, 2026-11-01: "note animations are also not synced (jump, other animations)"): a
// friend's figure does what they are doing, not only where they are. The pose (coop.js, 15 Hz) carries `an` when the
// body is doing more than standing, striding or paddling, and the friend's actor (actors.js Person.drive's anim, the
// gait's own air, crouch, wade and rod hands; poses.js sitPose, swimPose, makeMoves and workArms) draws it with the
// player's own poses.
// Round 2 (the owner, 2026-11-01: "Animations for climbing, arm movements, eating, all that fishing line need to be
// added"): the vault and the climb, the arms at a held job, eating, drinking and the camera up, the things in the hands,
// the landed fish held up, and the line with its lure or bobber. The height the body stands on is the pose's own `y`
// (coop.js), so a hop now flies from it.
//
//   an (in the pose, only what is on; absent when nothing is):
//     j    [dy, vy, airT]  in a hop or a fall on foot: the figure's height over the ground, its upward speed, seconds in the air. The
//                          friend's screen flies it on ballistically past the newest pose from the pose's own y (coop.js),
//                          so the arc is smooth between poses (GRAVITY as player.js)
//     ld   0..1            a landing sinking into the knees, fading
//     cr   0..1            crouched for a low chore (gathering wood, picking berries, the fire: camp.js state.crouch)
//     mk   'wade'          wading (the knees high)
//     sit  y               on a seat (a bench, a stump, the latrine): the seat's top
//     mv   [k, u, dur, from x y z, to x y z, top, nearD, far, heading]   a vault (k 0) or a climb (k 1): player.js's move,
//                          u flown on by dur between poses; drawn with the player's own (poses.js makeMoves)
//     hd   [R, L]          what is in each hand: an item id ([id, cm] for a fish), a container's kind, a long thing's id, or
//                          null. A loose thing is drawn in the fist as ours (item-models.js holdMatrix); any of them hangs
//                          that arm (the gait's state.held)
//     ar   [kind, t]       the arms at work, t seconds in: 'saw', 'douse', 'pitch', 'hang', 'work' (hold.js's job under
//                          way), 'eat', 'drink' (for a second and a half after it), 'photo' (photo.js raised: the camera at
//                          the face); poses.js workArms
//     fz   [R3, L3, dir3, up3, knob3, yaw, lean, look]   the rod up: fishing.js's hands (canoe rig space), on foot or afloat
//     rod  [x, y, z, qx, qy, qz, qw]                      and the rod itself in that space (casting, reeling, a fish on)
//     bd   bend            the rod's bend (fishing.js: a fish on)
//     ln   [lure, bobber, sag, end x y z, under x y z]    the line out: the lure's index (fishing.js LURES), the bobber
//                          shown, how much the line sags, its end (world) and the lure under a bobber; [lure, bobber] alone
//                          while it dangles from the tip
//     fl   [species, cm]   a fish landed and held up in both hands (fishing.js 'landed')
//   About 40 bytes in a jump, 90 in a vault, 150 with the rod up and 220 with a line out; nothing at all otherwise.
//   The swim is the pose's own mode (coop.js).
//
//   Not sent (drawn as the stride or the stand): a container in the hand is not drawn (its arm hangs), nor a long thing
//   other than the rod; the axe has no job of its own (a pole cut is the saw's); the stringer's fish in the hull.
//
//   const anim = new CoopAnim(coop, { fishing, photo })   (main.js, after the coop); anim.stats() for the tests
import * as THREE from 'three';
import { buildRod } from './gear.js';
import { modelGeometry, holdMatrix, itemMaterial } from './item-models.js';

const GRAVITY = 9.81;     // player.js's
const EAT_S = 1.7;        // s: eating or drinking is shown this long after it
const r2 = (v) => Math.round(v * 100) / 100, r3 = (v) => Math.round(v * 1000) / 1000;
const c3 = (v) => [r2(v.x), r2(v.y), r2(v.z)];
const r1 = (v) => Math.round(v * 10) / 10;
const fin = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ARMS = new Set(['saw', 'douse', 'pitch', 'hang', 'work', 'eat', 'drink', 'photo']);
// hold.js's job under way, as the arms show it
const jobArms = (id) => {
  const s = String(id || '');
  if (/^(saw|pole-cut|deadfall)/.test(s)) return 'saw';
  if (s === 'fire-out') return 'douse';
  if (/^(tent|strike|tarp)/.test(s)) return 'pitch';
  if (s === 'hang' || s === 'lower') return 'hang';
  if (/^(latrine|pushOff|haul|secchi)/.test(s)) return null; // (sitting, pushing the canoe, hauling it, from the canoe)
  return 'work';
};
const LINE_N = 28; // fishing.js's

export class CoopAnim {
  constructor(coop, { fishing = null, photo = null } = {}) {
    this.coop = coop; this.fishing = fishing; this.photo = photo;
    this.rods = new Map();   // peer id → { root, parts, line, bobber, lures, fish }
    this.hands = new Map();  // peer id → { R, L, cam } meshes
    this.sent = 0;
    this.eatInit = false; this.eatSeen = null; this.drinkSeen = null; this.eatAt = -1e9; this.eatKind = null;
    coop.poseFns.add((m) => this.encode(m));
    coop.drawFns.add((r, s, T) => this.apply(r, s, T));
    coop.onPeers((what, peer) => {
      if (what === 'leave' && peer) this.drop(peer.id);
      if (what === 'gone') for (const id of [...this.rods.keys(), ...this.hands.keys()]) this.drop(id);
      if (what === 'welcome') { const keep = new Set(coop.peers().map((q) => q.id)); for (const id of [...this.rods.keys(), ...this.hands.keys()]) if (!keep.has(id)) this.drop(id); }
    });
  }
  // --- what this body is doing, into the pose ----------------------------------------------------------------------
  encode(m) {
    const g = this.coop.g, p = g.player, c = g.canoe, st = c && c.state;
    if (!p || !st) return;
    const a = {}, now = performance.now();
    if (p.mode === 'walk') {
      if (st.air) a.j = [r2(c.rig.position.y - p.groundAt(p.x, p.z)), r2(st.vy || 0), r2(st.airT || 0)];
      if (st.land > 0.03) a.ld = r2(st.land);
      if (st.crouch > 0.02) a.cr = r2(st.crouch);
      const mv = p.move;
      if (mv && mv.kind === 'wade') a.mk = 'wade';
      if (mv && mv.kind === 'sit') a.sit = r2(Number.isFinite(mv.top) ? mv.top : c.rig.position.y + 0.45);
      // round 2: a vault or a climb under way
      if (mv && (mv.kind === 'vault' || mv.kind === 'climb') && mv.dur > 0 && mv.from && mv.to) {
        a.mv = [mv.kind === 'climb' ? 1 : 0, r3(mv.u || 0), r3(mv.dur), r2(mv.from.x), r2(mv.from.y), r2(mv.from.z), r2(mv.to.x), r2(mv.to.y), r2(mv.to.z),
          r2(Number.isFinite(mv.top) ? mv.top : NaN), r2(Number.isFinite(mv.nearD) ? mv.nearD : -1), r2(Number.isFinite(mv.far) ? mv.far : -1), r3(Number.isFinite(mv.heading) ? mv.heading : p.heading)];
        if (!Number.isFinite(a.mv[9])) a.mv[9] = -999; // (no top: the pose's own guess, below)
      }
    }
    const F = this.fishing, fz = st.fishing;
    if (fz && F && F.rodUp && (p.mode === 'walk' || p.mode === 'paddle') && !a.sit) {
      // (round 2: to the centimetre and the hundredth, to keep a pose with the line out near 300 bytes)
      a.fz = [...c3(fz.R), ...c3(fz.L), ...c3(fz.dir), ...c3(fz.up), ...c3(fz.knobAxis), r2(fz.yaw || 0), r2(fz.lean || 0), r2(fz.look || 0)];
      const rod = F.rod;
      if (rod && rod.visible) a.rod = [...c3(rod.position), r2(rod.quaternion.x), r2(rod.quaternion.y), r2(rod.quaternion.z), r2(rod.quaternion.w)];
      if (F.bend > 0.02) a.bd = r2(F.bend);
      // round 2: the line, as fishing.js placeLine drew it this frame
      if (F.line && F.line.visible && F.linePos) {
        const s = F.state, li = F.lureIndex | 0, b = F.bobber && F.bobber.visible ? 1 : 0;
        if (s === 'ready' || s === 'charging' || s === 'swing') a.ln = [li, b];
        else {
          const P = F.linePos, N = F.LINE_N || LINE_N, e = (N - 1) * 3, u = N * 3, mid = Math.floor((N - 1) / 2), t = mid / (N - 1);
          const tip = F.tipWorld ? F.tipWorld() : null;
          const sag = tip ? (tip.y + (P[e + 1] - tip.y) * t - P[mid * 3 + 1]) / Math.max(1e-3, 4 * t * (1 - t)) : 0;
          a.ln = [li, b, r1(sag), r1(P[e]), r2(P[e + 1]), r1(P[e + 2])]; // (across to 10 cm, the height to 1)
          if (P[u] !== P[e] || P[u + 1] !== P[e + 1] || P[u + 2] !== P[e + 2]) a.ln.push(r1(P[u]), r2(P[u + 1]), r1(P[u + 2]));
        }
      }
      if (F.state === 'landed' && F.landed) a.fl = [String(F.landed.species), r2(F.landed.length || 40)];
    }
    // round 2: the hands, on foot or with the canoe overhead (afloat they lie in the bilge, as ours)
    const inv = g.inventory;
    if (inv && inv.attached && (p.mode === 'walk' || p.mode === 'carry')) {
      const hs = [null, null];
      for (const k of inv.containers) {
        if (k.where !== 'hands' || (k.hand !== 0 && k.hand !== 1)) continue;
        if (k.item === 'inhand') { const e = k.grid && k.grid[0]; if (e) hs[k.hand] = e.data && Number.isFinite(+e.data.length) ? [e.id, r2(+e.data.length)] : e.id; }
        else hs[k.hand] = k.item;
      }
      for (const l of inv.long || []) if (l.where === 'hands' && (l.hand === 0 || l.hand === 1) && !(F && F.rodUp)) hs[l.hand] = l.id;
      if (hs[0] || hs[1]) a.hd = hs;
    }
    // round 2: the arms at work: the camera up, a bite or a drink just taken, a held job
    const E = g.energy, ph = this.photo;
    if (E) {
      if (!this.eatInit) { this.eatInit = true; this.eatSeen = E.lastEaten; this.drinkSeen = E.lastDrink; } // (what was eaten before the room is not shown)
      if (E.lastEaten !== this.eatSeen) { this.eatSeen = E.lastEaten; this.eatAt = now; this.eatKind = 'eat'; }
      if (E.lastDrink !== this.drinkSeen) { this.drinkSeen = E.lastDrink; this.eatAt = now; this.eatKind = 'drink'; }
    }
    if (p.mode === 'walk' && !a.fz && !a.sit && !a.mv) {
      const job = g.hold && g.hold.active, kind = job ? jobArms(job.id) : null;
      if (ph && ph.raised) a.ar = ['photo', 0];
      else if (now - this.eatAt < EAT_S * 1000) a.ar = [this.eatKind, r2((now - this.eatAt) / 1000)];
      else if (kind) a.ar = [kind, r2(job.t || 0)];
    }
    for (const k in a) { m.an = a; this.sent++; return; }
  }
  // --- a friend's, onto their actor (every frame, after coop.js has placed them; s the sample, T their time drawn) ---
  apply(r, s, T) {
    const P = r.person, an = s.an;
    if (!P.onPosed) P.onPosed = () => this.posed(r);
    r.drawnS = s;
    const flyT = Math.max(0, (T - s.ts) / 1000); // (past the newest pose: carried on; between two, the sample's own)
    if (!an || s.m === 'swim') { P.anim = null; this.showRod(r, null); if (Number.isFinite(s.y)) r.footRest = s.y; return; }
    if (s.m === 'carry') { P.anim = an.hd ? { held: heldOf(an.hd) } : null; this.showRod(r, null); return; }
    const A = (r.anim || (r.anim = { fzv: { R: new THREE.Vector3(), L: new THREE.Vector3(), dir: new THREE.Vector3(), up: new THREE.Vector3(), knobAxis: new THREE.Vector3(), yaw: 0, lean: 0, look: 0 }, mvv: { kind: 'vault', u: 0, dur: 1, t: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 }, top: null, nearD: null, far: -1, heading: 0 }, armv: { kind: 'work', t: 0 } }));
    A.air = false; A.y = NaN; A.vy = 0; A.airT = 0; A.land = NaN; A.crouch = 0; A.mk = null; A.sit = NaN; A.fz = null; A.mv = null; A.held = null; A.arms = null;
    if (s.m === 'walk') {
      if (fin(an.j, 3)) {
        // flown on from the pose's time to the time drawn (back before it too, between two poses)
        const dT = (T - s.ts) / 1000;
        A.air = true; A.vy = an.j[1] - GRAVITY * dT; A.airT = Math.max(0, an.j[2] + dT);
        if (Number.isFinite(s.y)) {
          // round 2: from the height they were at (s.y, between two poses already the arc's own), never under where they
          // last stood
          const floor = Number.isFinite(r.footRest) ? Math.min(r.footRest, s.y) : s.y - an.j[0] + 0.1;
          A.y = Math.max(floor, s.y + an.j[1] * flyT - 0.5 * GRAVITY * flyT * flyT);
        } else {
          const ground = Number.isFinite(P.y) ? P.y : 0;
          A.y = ground + Math.max(0, an.j[0] + an.j[1] * dT - 0.5 * GRAVITY * dT * dT);
        }
      } else if (Number.isFinite(s.y) && !fin(an.mv, 13)) r.footRest = s.y;
      if (Number.isFinite(an.ld)) A.land = an.ld;
      if (Number.isFinite(an.cr)) A.crouch = Math.max(0, Math.min(1, an.cr));
      if (an.mk === 'wade') A.mk = 'wade';
      if (Number.isFinite(an.sit)) A.sit = an.sit;
      if (fin(an.mv, 13)) {
        const v = an.mv, M = A.mvv, dur = Math.max(0.05, v[2]);
        M.kind = v[0] === 1 ? 'climb' : 'vault'; M.dur = dur; M.u = clamp(v[1] + (T - s.ts) / 1000 / dur, 0, 1); M.t = M.u * dur;
        M.from.x = v[3]; M.from.y = v[4]; M.from.z = v[5]; M.to.x = v[6]; M.to.y = v[7]; M.to.z = v[8];
        M.top = v[9] > -900 ? v[9] : null; M.nearD = v[10] >= 0 ? v[10] : null; M.far = v[11]; M.heading = v[12];
        A.mv = M;
      }
      if (Array.isArray(an.ar) && ARMS.has(an.ar[0]) && Number.isFinite(an.ar[1])) { A.armv.kind = an.ar[0]; A.armv.t = an.ar[1] + flyT; A.arms = A.armv; }
    } else if (Number.isFinite(s.y)) r.footRest = null;
    if (an.hd) A.held = heldOf(an.hd);
    if (fin(an.fz, 18)) {
      const f = an.fz, z = A.fzv;
      z.R.set(f[0], f[1], f[2]); z.L.set(f[3], f[4], f[5]); z.dir.set(f[6], f[7], f[8]); z.up.set(f[9], f[10], f[11]); z.knobAxis.set(f[12], f[13], f[14]);
      z.yaw = f[15]; z.lean = f[16]; z.look = f[17];
      A.fz = z;
    }
    P.anim = A;
    this.showRod(r, A.fz && fin(an.rod, 7) ? an.rod : null, s.m, Number.isFinite(an.bd) ? an.bd : 0);
  }
  // the friend's rod, in their hands' space: the figure's frame on foot, the hull's afloat
  showRod(r, at, mode, bend = 0) {
    let R = this.rods.get(r.id);
    if (!at) { if (R) R.root.visible = false; return; }
    const parent = mode === 'paddle' ? r.boat.root : r.person.bind && r.person.bind.kind === 'foot' ? r.person.bind.root : null; // (the root: scaled with the figure)
    if (!parent) { if (R) R.root.visible = false; return; }
    if (!R) {
      const mat = this.coop.g.actors && this.coop.g.actors.material;
      if (!mat) return;
      const parts = buildRod(mat);
      R = { root: parts.root, parts, line: null, bobber: null, lures: [], fish: null, fishSp: null };
      R.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.rods.set(r.id, R);
    }
    if (R.root.parent !== parent) parent.add(R.root);
    R.root.position.set(at[0], at[1], at[2]); R.root.quaternion.set(at[3], at[4], at[5], at[6]).normalize(); // (sent to the hundredth)
    const N = R.parts.segs.length;
    for (let i = 0; i < N; i++) R.parts.segs[i].rotation.z = -bend * ((i + 1) / N) * 0.42; // (fishing.js's bend)
    R.root.visible = true;
  }
  // --- after the friend's figure is posed this frame: the things in the hands, the fish held up, the line ------------
  posed(r) {
    const s = r.drawnS, an = s && s.an, P = r.person, B = P.bind;
    const H = this.handsOf(r);
    const foot = !!(B && B.kind === 'foot' && (s.m === 'walk' || s.m === 'carry'));
    // the things in the fists (a loose thing: item-models.js), and the camera up at the face
    const hd = foot && an && Array.isArray(an.hd) ? an.hd : null, photo = foot && an && Array.isArray(an.ar) && an.ar[0] === 'photo';
    for (const [k, i] of [['R', 0], ['L', 1]]) this.inHand(H, k, hd && !photo ? hd[i] : null, B, P);
    this.camUp(H, photo ? B : null, P);
    // the fish held up in both hands (fishing.js land: in the paddler's own frame)
    const R = this.rods.get(r.id), fl = an && Array.isArray(an.fl) && B ? an.fl : null;
    if (R) this.heldFish(R, fl, B);
    // the line from the friend's rod tip to their lure or bobber
    if (R) this.line(R, an && R.root.visible && Array.isArray(an.ln) ? an.ln : null);
  }
  handsOf(r) { let H = this.hands.get(r.id); if (!H) this.hands.set(r.id, H = { R: null, L: null, cam: null, n: 0 }); return H; }
  mesh(scene) { const o = new THREE.Mesh(new THREE.BufferGeometry(), itemMaterial()); o.castShadow = true; o.receiveShadow = true; o.matrixAutoUpdate = true; o.visible = false; scene.add(o); return o; }
  fistOf(B, side, out) {
    const b = B.body.fig.bones, h = b[side > 0 ? 'handR' : 'handL'], t = b[side > 0 ? 'twistR' : 'twistL'];
    h.getWorldPosition(out);
    if (!t) { out.y -= 0.07; return out; }
    t.getWorldPosition(_t);
    const d = _t.subVectors(out, _t), n = d.length();
    if (n > 1e-4) out.addScaledVector(d, 0.075 / n); else out.y -= 0.07; // (containers.js fist: on along the forearm a hand's width)
    return out;
  }
  inHand(H, k, e, B, P) {
    const id = Array.isArray(e) ? e[0] : e, m = id ? modelGeometry(String(id), Array.isArray(e) && Number.isFinite(e[1]) ? { length: e[1] } : null) : null;
    let o = H[k];
    if (!m || !B) { if (o) o.visible = false; return; }
    if (!o) o = H[k] = this.mesh(this.coop.g.scene || B.root.parent);
    if (o.geometry !== m.geo) o.geometry = m.geo;
    const side = k === 'R' ? 1 : -1;
    this.fistOf(B, side, _w);
    _f.set(Math.cos(P.heading), 0, -Math.sin(P.heading)); _r.set(-_f.z, 0, _f.x);
    holdMatrix(m, _w, _f, _r, side, _m);
    _m.decompose(o.position, o.quaternion, o.scale);
    o.visible = true; H.n++;
  }
  camUp(H, B, P) {
    let o = H.cam;
    const m = B ? modelGeometry('camera') : null;
    if (!m) { if (o) o.visible = false; return; }
    if (!o) o = H.cam = this.mesh(this.coop.g.scene || B.root.parent);
    if (o.geometry !== m.geo) o.geometry = m.geo;
    this.fistOf(B, 1, _w); this.fistOf(B, -1, _t2); _w.add(_t2).multiplyScalar(0.5); _w.y -= 0.03;
    _f.set(Math.cos(P.heading), 0, -Math.sin(P.heading)); _r.set(-_f.z, 0, _f.x);
    holdMatrix({ ...m, hold: 'upright' }, _w, _f, _r, 1, _m);
    _m.decompose(o.position, o.quaternion, o.scale);
    o.visible = true; H.camN = (H.camN || 0) + 1;
  }
  heldFish(R, fl, B) {
    const F = this.fishing, src = fl && F && F.fishMeshes ? F.fishMeshes[fl[0]] : null;
    if (!src) { if (R.fish) R.fish.visible = false; return; }
    if (!R.fish || R.fishSp !== fl[0]) { if (R.fish) R.fish.removeFromParent(); R.fish = src.clone(); R.fishSp = fl[0]; }
    const fig = B.body.group, foot = B.kind === 'foot', up = foot ? 0.62 : 0, fwd = foot ? -0.08 : 0, t = performance.now() / 1000;
    if (R.fish.parent !== fig) fig.add(R.fish);
    R.fish.scale.setScalar((Number.isFinite(fl[1]) ? fl[1] : 40) / 100);
    R.fish.position.set(0.52 + fwd, 0.5 + up + 0.04 * Math.sin(t * 2), 0); R.fish.rotation.set(0.25, Math.PI / 2, 0.08 * Math.sin(t * 3)); // (fishing.js land)
    R.fish.visible = true; R.fishN = (R.fishN || 0) + 1;
  }
  line(R, ln) {
    const F = this.fishing;
    if (!ln || !F) { if (R.line) R.line.visible = false; if (R.bobber) R.bobber.visible = false; for (const m of R.lures) if (m) m.visible = false; return; }
    const scene = this.coop.g.scene || R.root.parent;
    if (!R.line) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((LINE_N + 2) * 3), 3));
      R.line = new THREE.Line(g, F.line ? F.line.material : new THREE.LineBasicMaterial({ color: 0xf4f1e8, transparent: true, opacity: 0.75 }));
      R.line.frustumCulled = false; R.line.renderOrder = 13; scene.add(R.line);
      R.bobber = F.bobber ? F.bobber.clone() : null; if (R.bobber) scene.add(R.bobber);
    }
    R.root.updateMatrixWorld(true);
    const t = R.parts.tip.getWorldPosition(_tip), li = ln[0] | 0, bob = ln[1] === 1, now = performance.now() / 1000;
    if (!R.lures[li] && F.lureMeshes && F.lureMeshes[li]) { R.lures[li] = F.lureMeshes[li].clone(); scene.add(R.lures[li]); }
    for (let i = 0; i < R.lures.length; i++) if (R.lures[i]) R.lures[i].visible = i === li;
    const lm = R.lures[li];
    let sag = 0, under = null;
    const end = _e;
    if (ln.length >= 6 && fin(ln.slice(2, 6), 4)) {
      sag = Math.max(0, ln[2]); end.set(ln[3], ln[4], ln[5]);
      if (ln.length >= 9 && fin(ln.slice(6, 9), 3)) under = _u.set(ln[6], ln[7], ln[8]);
    } else {
      end.set(t.x + Math.sin(now * 2.1) * 0.06, t.y - 0.6, t.z); // (dangling from the tip)
    }
    const pos = R.line.geometry.attributes.position.array, N = LINE_N;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), o = i * 3;
      pos[o] = t.x + (end.x - t.x) * u; pos[o + 1] = t.y + (end.y - t.y) * u - sag * 4 * u * (1 - u); pos[o + 2] = t.z + (end.z - t.z) * u;
    }
    const o = N * 3, w = under || end;
    pos[o] = w.x; pos[o + 1] = w.y; pos[o + 2] = w.z; pos[o + 3] = w.x; pos[o + 4] = w.y; pos[o + 5] = w.z;
    R.line.geometry.attributes.position.needsUpdate = true;
    R.line.visible = true; R.lineN = (R.lineN || 0) + 1;
    R.lineEnd = [end.x, end.y, end.z];
    if (R.bobber) {
      R.bobber.visible = bob;
      if (bob) { if (ln.length >= 6) R.bobber.position.copy(end); else R.bobber.position.set(end.x, end.y + 0.35, end.z); }
    }
    if (lm) { lm.visible = true; lm.position.copy(under || end); }
  }
  drop(id) {
    const R = this.rods.get(id);
    if (R) { R.root.removeFromParent(); if (R.line) { R.line.removeFromParent(); R.line.geometry.dispose(); } if (R.bobber) R.bobber.removeFromParent(); for (const m of R.lures) if (m) m.removeFromParent(); if (R.fish) R.fish.removeFromParent(); this.rods.delete(id); }
    const H = this.hands.get(id);
    if (H) { for (const k of ['R', 'L', 'cam']) if (H[k]) H[k].removeFromParent(); this.hands.delete(id); }
  }
  dropRod(id) { this.drop(id); } // (the old name)
  stats() {
    return {
      sent: this.sent,
      rods: [...this.rods.values()].map((R) => ({ visible: R.root.visible, inScene: !!R.root.parent, line: !!(R.line && R.line.visible), lineEnd: R.lineEnd || null, lineN: R.lineN || 0, bobber: !!(R.bobber && R.bobber.visible), fish: !!(R.fish && R.fish.visible), fishN: R.fishN || 0 })),
      hands: [...this.hands.values()].map((H) => ({ R: !!(H.R && H.R.visible), L: !!(H.L && H.L.visible), cam: !!(H.cam && H.cam.visible), n: H.n, camN: H.camN || 0, at: H.R && H.R.visible ? [H.R.position.x, H.R.position.y, H.R.position.z] : null })),
    };
  }
}
const heldOf = (hd) => ({ R: hd[0] ? 1 : null, L: hd[1] ? 1 : null });
const _t = new THREE.Vector3(), _t2 = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Matrix4();
const _tip = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3();
