import * as THREE from 'three';
import { makeLookMaterial } from './shading.js';
import { buildHullGeometry, buildLidGeometry, buildPackGeometry, PACK_AT, PACK2_AT, PACKS, HULL, SEATS, sheerY, floorAt, outerAt } from './hull.js';
import { buildFigure, LT, LS } from './figure.js';
import { paddleMesher } from './gear.js';
import { buildHullWater, buildBilge } from './hullwater.js';
import { FLOAT_OFFSET, ROOT_UP, V, smooth, lerp, damp, ease, bodyQ, frameQ, spine, updateIdle as idleStep, resetIdle, fromRig as fromRigOf, placeFigure, placePaddle as placePaddleOf, makeStroke, makeGait, makeBody, makeMoves, swimPose } from './poses.js'; // p2 A: the poses, lifted

// The canoe rig: the hull (hull.js), its water line (hullwater.js), the paddler (figure.js, one skinned
// figure), the paddle (gear.js) and the Duluth packs. player.js writes `state` (the mode, the stroke, the walk) and
// the rig poses everything from it each frame:
//   paddling  kneeling at the stern seat, a J-stroke with torso rotation whose catch, power and exit follow
//             the stroke phase the thrust is pulsed from; sweeps when turning, a back stroke in reverse, a
//             clean switch across the bow when the side changes; the paddle across the gunwales at rest
//   walking   feet planted on the ground under each foot and lifted in turn (contact, down, passing, up),
//             heel to toe, the stride tied to the ground speed so nothing slides; strafes turn the hips
//             toward the step, back-steps run the roll the other way; hip sway, shoulder counter-rotation,
//             arms swinging against the legs
//   jogging   blended in from the walk by speed (Shift): a longer stride and a shorter stance, so both feet
//             are off the ground between steps; the body lowest at mid-stance and highest in the flight, the
//             heel kicking up behind and the knee lifting through the swing, a forward lean, the arms bent at
//             about a right angle and swinging higher
//   hopping   Space on foot (player.js): the legs push off, tuck in the air and reach for the ground again,
//             the arms lift, and the landing sinks into the knees; with the canoe overhead a stagger instead
//   carrying  the same feet under a heavier, shorter gait, the yoke on the shoulders, hands on the gunwales
//   packs     in the hull, on the back or the chest, or standing on the ground (seatPacks, after the pose: packs.js
//             says where each one is)
//   swimming  treading water beside the overturned hull, a breaststroke when moving
//   fishing   the hands where fishing.js holds the rod (state.fishing), the paddle across the gunwales; standing on foot
//             the same hands on the rod (wc C: rodArms, from poseWalk), the body turned to where it points
//   sitting   player.move 'sit' (poseSit): on a bench, a log or the latrine, the feet planted ahead, the forearms on the thighs
//   idle      breathing and the odd glance
// Canoe frame: +x bow, +y up, +z starboard; the origin sits FLOAT_OFFSET above the water at rest.

// p2 A: the stroke (with the paddle at rest and the switch across), the kneel, the gait (walk, jog, a hop, a crouch,
// wading, the hill), the carry and the rod's hands are poses.js's now, so any figure can take them (actors.js: the people
// on the water and the trails); this rig places the player's figure, hull, paddle and packs and runs them on its state.
// What stays here is the player's own: the swim, the climb back in, sitting, the blend between poses, the packs, the
// hat and the first-person eye (the vault and the climb went to poses.js makeMoves in co-op round 2, so a friend's are drawn the same).
export { FLOAT_OFFSET };
export const LENGTH = HULL.L;

const _mm = new THREE.Matrix4();
const SEAT_X = SEATS.stern.x;

export function buildCanoeRig({ water = null } = {}) {
  const mat = makeLookMaterial({}, { wrap: 0, name: 'look-solid' }); // the same smooth light as the rocks and props
  const rig = new THREE.Group();
  const hullPivot = new THREE.Group();
  const hull = new THREE.Mesh(buildHullGeometry(), mat);
  hull.castShadow = true; hull.receiveShadow = true;
  hullPivot.add(hull);
  // an invisible lid at the gunwales: writes depth only, so the water surface never shows inside the hull
  const lid = new THREE.Mesh(buildLidGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
  lid.renderOrder = 5;
  hullPivot.add(lid);
  // the water line round the hull (replaces the old flat foam band)
  const contact = buildHullWater(water, FLOAT_OFFSET);
  hullPivot.add(contact);
  rig.userData.foam = contact;
  // cons B: the water in the hull (hullwater.js buildBilge), as deep as player.js's bilge says (state.bilge)
  const bilge = buildBilge(water);
  hullPivot.add(bilge);
  rig.userData.bilge = bilge;
  rig.add(hullPivot);
  // the packs (hull.js): the gear pack (0) and the food pack (1), each with its own place in the hull, flap up
  const KINDS = ['gear', 'food'], SEAT_AT = [PACK_AT, PACK2_AT];
  const packs = KINDS.map((k) => { const m = new THREE.Mesh(buildPackGeometry(k), mat); m.castShadow = true; m.receiveShadow = true; m.userData.kind = k; hullPivot.add(m); return m; });
  const pack = packs[0];

  const fig = buildFigure(mat);
  const paddler = fig.group;
  rig.add(paddler);
  const P = fig.poser, J = fig.joints;
  const hat = fig.hat;
  const hatOnHead = () => { fig.bones.head.add(hat); hat.position.set(0, 0, 0); hat.rotation.set(0, 0, 0); };
  const paddle = new THREE.Mesh(paddleMesher().geometry(), mat);
  paddle.castShadow = true;
  rig.add(paddle);

  const state = {
    mode: 'paddle',      // 'paddle' | 'carry' | 'walk' (on foot, the canoe left somewhere) | 'swim' (capsized)
    stroke: 0,           // 0..1 phase: catch at 0, power to ~0.38, the J to 0.5, recovery to 1
    side: 1,             // +1 starboard, -1 port
    power: 0,            // 0..1 how hard we are paddling (blends toward rest pose)
    drive: 0,            // -1..1: back-paddling .. forward (player.js)
    turn: 0,             // -1..1: the steering sweep, + to the left
    hustle: false,
    speed: 0,            // m/s over the ground (on foot: for the stride; afloat: for the water line)
    cadence: 0,          // on foot: gait cycles a second (two steps each), as the legs run them (audio.js times the footfalls by it)
    air: false,          // on foot, in a hop or a fall (player.js): airT seconds since it began, vy the upward speed
    airT: 0, vy: 0,
    land: 0,             // 0..1: a landing sinking into the knees, fading
    stagger: 0,          // 0..1: Space with the canoe overhead, fading
    carryLean: 0,        // radians: the canoe's roll on the yoke, + toward the right (player.js balanceCarry, balance.js)
    carryWobble: 0,      // 1 while it wobbles (stop to steady it)
    walk: 0,             // walk / swim cycle phase written by player.js (the swim uses it)
    walkSpeed: 0,        // 0..1: moving or not, eased
    moveFwd: 0,          // -1..1: the legs go ahead (1) or back (-1), in the body's frame (player.js, on foot)
    moveLat: 0,          // -1..1: the legs go to the right (1) or the left (-1); a side-step
    gripT: V(0, 0, 0), bladeT: V(0, 0, 0), grip: V(0, 0.8, 0), blade: V(0, -0.2, 0.8), // rig space: the T-grip and the blade's middle
    fishing: null,       // { L, R, ... }: hands in rig space while the rod is up (fishing.js); the paddle rests
    swimHeading: 0,
    swimSide: 1,         // which side of the hull you went over on (player.js, at the capsize)
    climb: 0,            // seconds left of righting the hull and climbing back in after a capsize (player.js sets it)
    bilge: 0,            // cons B: the water in the hull, 0 dry .. 1 swamped (player.js; hullwater.js draws it)
    climbSide: 1,        // which gunwale you come in over
    packOnBack: undefined, // which pack rides on the back (0 the gear pack, 1 the food pack) or null (packs.js sets it);
                         // left unset, the hull's first pack goes on the back with the canoe overhead
    packOnChest: null,   // and on the chest: the second pack of a single heavy trip
    crouch: 0,           // 0..1 on foot: down on the heels for a low chore (camp.js: gathering wood, picking berries, the fire)
  };
  const swimmer = new THREE.Vector3();

  // ---------------------------------------------------------------------------------------------------------
  // shared bits
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _v = V();
  // p2 A: the figure as poses.js poses it: the rig is its frame, this state its input, the walker's ground under its feet
  // (player.js sets api.ground and api.terrain)
  const ground = (x, z) => (api.ground ? api.ground(x, z) : rig.position.y - 0.1);
  const me = makeBody(fig, rig, state, { ground });
  Object.defineProperty(me, 'terrain', { get: () => api.terrain });
  const idle = me.idle;
  const updateIdle = (dt, still) => idleStep(idle, dt, still);
  const stroke = makeStroke(me, { seatX: SEAT_X });
  const gait = makeGait(me);
  const { loco, fq, ankles, toWorld, toLocal, ankleAt, footFrameQ } = gait;
  const body = (rootP, pelvis, chest, head, o) => spine(P, rootP, pelvis, chest, head, o);
  const fromRig = (p, out = V()) => fromRigOf(me, p, out);
  const _inv = new THREE.Matrix4();
  const placePaddler = (x, y, z, yaw = 0) => placeFigure(me, x, y, z, yaw);

  // where the paddle lives: in the hands, stowed in the hull, or floating by the capsized hull
  let paddleHome = 'hand';
  function stowPaddle() {
    if (paddleHome === 'hull') return;
    paddleHome = 'hull'; hullPivot.add(paddle);
    // along the starboard bilge, blade forward, face down: the mirror of the spare
    _mm.makeBasis(V(0, 0, -1), V(-1, 0, 0), V(0, 1, 0));
    paddle.quaternion.setFromRotationMatrix(_mm);
    paddle.position.set(-1.08, floorAt(0) + 0.055, 0.22);
  }
  function paddleInHand() { if (paddleHome !== 'hand') { paddleHome = 'hand'; rig.add(paddle); } }
  const placePaddle = (gripRig, dir, n) => placePaddleOf(paddle, gripRig, dir, n);

  // ---------------------------------------------------------------------------------------------------------
  // Kneeling at the stern seat with the paddle (poses.js makeStroke): a J-stroke with torso rotation whose catch, power
  // and exit follow the stroke phase the thrust is pulsed from; sweeps when turning, a back stroke in reverse, a clean
  // switch across the bow when the side changes; the paddle across the gunwales at rest; the rod's hands while it is up
  function poseSeated(dt) {
    placePaddler(SEAT_X, 0, 0);
    hullPivot.position.set(0, 0, 0); hullPivot.rotation.set(0, 0, 0);
    if (hat.parent !== fig.bones.head) hatOnHead();
    paddleInHand(); paddle.visible = true;
    contact.visible = true;
    stroke.pose(dt, paddle);
  }

  // ---------------------------------------------------------------------------------------------------------
  // On foot (poses.js makeGait): the walk, the jog, a hop, a crouch, wading, the hill; the rod up (wc C: the hands on it,
  // the body turned to where it points)
  function poseWalk(dt, mk = null) {
    placePaddler(0, 0, 0);
    if (hat.parent !== fig.bones.head) hatOnHead();
    contact.visible = false;
    stowPaddle();
    const fz = state.mode === 'walk' ? state.fishing : null; // wc C: the rod up on foot (fishing.js): the hands on it
    gait.walk(dt, mk, fz);
  }

  // the canoe overhead (poses.js: the yoke on the shoulders, the hands on the gunwales)
  function poseCarry(dt) {
    placePaddler(0, 0, 0);
    contact.visible = false;
    stowPaddle();
    gait.carry(dt, hullPivot);
  }

  // ---------------------------------------------------------------------------------------------------------
  // In the water beside the overturned hull: treading water when still, a breaststroke when moving.
  function poseSwim(dt) {
    contact.visible = false;
    if (hat.parent !== fig.bones.head) hatOnHead();
    if (state.swimHull !== false && hullPivot.parent === rig) {
      // capsized: the hull overturned beside you, the paddle floating off its far side
      hullPivot.position.set(0, -0.3, 0);
      hullPivot.rotation.set(Math.PI, 0, 0.06 * Math.sin(state.walk * 0.7));
      paddleInHand(); paddle.visible = true;
      const away = -(state.swimSide || 1);
      placePaddle(V(-0.2, -0.04, away * 1.05), V(1, 0.0, away * 0.08).normalize(), V(0, 1, 0));
    } else stowPaddle(); // a swim from the shore: the canoe lies where it was left, the paddle in it
    const loc = rig.worldToLocal(swimmer.clone());
    placePaddler(loc.x, loc.y, loc.z, state.swimHeading - rig.rotation.y);
    updateIdle(dt, state.walkSpeed < 0.3);
    swimPose(me, state.walkSpeed, state.walk); // (poses.js: the body, shared with a friend swimming in actors.js)
  }

  // ---------------------------------------------------------------------------------------------------------
  // Back in after a capsize: the hull rights itself while you tread water beside it, you haul up over the
  // gunwale with both hands, then swing round into the kneel. Built as a blend, bone by bone, from a hauling
  // pose (placed beside the hull, facing it) into the seated pose.
  const CLIMB_T = 1.4;
  const bones = fig.mesh.skeleton.bones;
  const snap = () => ({ pos: paddler.position.clone(), quat: paddler.quaternion.clone(), root: fig.bones.root.position.clone(), q: bones.map((b) => b.quaternion.clone()) });
  function haulPose(u) {
    const side = state.climbSide || 1;
    const up = smooth(0.25, 0.75, u);          // rising out of the water onto the gunwale
    const x = SEAT_X + 0.3, sh = sheerY(x);
    // facing the hull's middle, out beside it, low in the water and then up over the gunwale
    // treading with the shoulders at the surface, then the hips up on the gunwale and the chest over it
    placePaddler(x, lerp(-1.55, sh - 0.9, up), side * lerp(0.95, 0.6, smooth(0, 0.5, u)), side > 0 ? Math.PI / 2 : -Math.PI / 2);
    const lean = lerp(0.25, 1.05, up);
    const pelvis = bodyQ(0, lean * 0.6, 0), chest = bodyQ(0, lean, 0), head = bodyQ(0, lean - 0.7, 0);
    body(V(0, 0.975, 0), pelvis, chest, head, { shrugL: 0.08 * up, shrugR: 0.08 * up });
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      // hands on the near gunwale either side of the chest
      const g = fromRig(V(x - side * sg * 0.24, sh + 0.01, side * (outerAt(x, sh - 0.002).z - 0.004)));
      const shp = J['arm' + k].p;
      P.arm(k, g, V(0, 0, sg), V(shp.x - 0.3, shp.y - 0.3, shp.z + sg * 0.4), V(0, -1, 0));
      // the legs hang in the water, a slow kick
      const hip = J['thigh' + k].p;
      const kick = 0.12 * Math.sin(u * 14 + (k === 'L' ? 0 : Math.PI));
      const ankle = hip.clone().add(V(-0.15 - 0.25 * up + kick, -0.78 + 0.1 * up, sg * 0.05));
      P.leg(k, ankle, hip.clone().add(V(0.6, -0.3, 0)), frameQ(V(0.2, -1, 0), V(1, 0, 0)));
    }
  }
  function poseClimb(dt) {
    const u = 1 - state.climb / CLIMB_T;
    poseSeated(dt);
    const S = snap();
    if (hat.parent !== fig.bones.head) hatOnHead();
    haulPose(u);
    const H = snap();
    const w = smooth(0.55, 0.97, u);
    paddler.position.lerpVectors(H.pos, S.pos, w);
    paddler.quaternion.slerpQuaternions(H.quat, S.quat, w);
    paddler.updateMatrix();
    fig.bones.root.position.lerpVectors(H.root, S.root, w);
    for (let i = 0; i < bones.length; i++) bones[i].quaternion.slerpQuaternions(H.q[i], S.q[i], w);
    // the hull rolls back upright first
    const r = smooth(0, 0.32, u);
    hullPivot.position.set(0, -0.3 * (1 - r), 0);
    hullPivot.rotation.set(Math.PI * (1 - r) * (state.climbSide || 1), 0, 0);
    contact.visible = r > 0.9;
    // the eye follows the blended head
    paddler.updateMatrixWorld(true);
    fig.bones.head.getWorldPosition(_v); paddler.worldToLocal(_v); J.head.p.copy(_v);
  }

  // ---------------------------------------------------------------------------------------------------------
  // The walker's moves (player.js player.move, read through api.moveOf): a vault over a log and a climb onto a rock or a
  // ledge are poses.js's (makeMoves, lifted so a friend's are drawn the same: co-op phase 3 round 2); sitting is below.
  // Only the player's own parts are here: the hat on the head, the paddle stowed, the water line hidden.
  const moves = makeMoves(me, gait);
  function poseVault(dt, m) { if (hat.parent !== fig.bones.head) hatOnHead(); contact.visible = false; stowPaddle(); moves.vault(dt, m); }
  function poseClimbUp(dt, m) { if (hat.parent !== fig.bones.head) hatOnHead(); contact.visible = false; stowPaddle(); moves.climb(dt, m); }
  // limbs to world places (sitting): a foot, its ankle over the sole's point p, yawed `yaw`, pitched
  const _wa = V(), _wb = V();
  function footTo(k, p, yawW, pitch, kneeOut = 0.05) {
    ankleAt(p, yawW, pitch, ankles[k]);
    const a = toLocal(ankles[k], _wa), sg = k === 'L' ? -1 : 1, yl = yawW - rig.rotation.y;
    footFrameQ(yawW, pitch, fq[k]);
    const hip = J['thigh' + k].p;
    const pole = _wb.set((hip.x + a.x) / 2 + Math.cos(yl) * 0.6, (hip.y + a.y) / 2, (hip.z + a.z) / 2 - Math.sin(yl) * 0.6 + sg * kneeOut);
    P.leg(k, a.clone(), pole, fq[k]);
  }
  const _h0 = V();

  // Sitting (the latrine, a bench, a log by the fire; wc C: player.sitAt): the seat at player.move.top (world), or knee
  // height off the ground; the feet planted ahead, as far as the legs reach from a high seat, the forearms on the thighs.
  // (The eating variant went with the sit to eat: the owner, 2026-10-24, "i dont want to have to sit to eat food".)
  function poseSit(dt, m) {
    placePaddler(0, 0, 0);
    if (hat.parent !== fig.bones.head) hatOnHead();
    contact.visible = false; stowPaddle(); updateIdle(dt, true);
    const gy = ground(rig.position.x, rig.position.z), seat = Number.isFinite(m.top) ? m.top : gy + 0.45;
    const br = Math.sin(idle.breath), hipY = seat + 0.1 - rig.position.y;
    const pelvis = bodyQ(0, -0.05, 0), chest = bodyQ(idle.yaw * 0.15, 0.22 + 0.012 * br, 0), head = bodyQ(idle.yaw * 0.85, 0.02 - idle.pitch, 0);
    body(V(-0.06, hipY + ROOT_UP, 0), pelvis, chest, head, { shrugL: 0.012 * br, shrugR: 0.012 * br });
    const h = rig.rotation.y;
    // the feet ahead of the seat: a knee's reach on a low seat, nearer in under a high one, so the legs are never straight
    const above = hipY + rig.position.y - gy, reach = (LT + LS) * 0.93;
    const ahead = Math.min(0.45, Math.max(0.22, Math.sqrt(Math.max(0.04, reach * reach - above * above))));
    for (const [k, sg] of [['L', -1], ['R', 1]]) {
      const p = toWorld(V(ahead, 0, sg * 0.16), _h0); p.y = ground(p.x, p.z);
      footTo(k, p, h + sg * -0.12, 0, 0.1);
      const knee = V(ahead - 0.06, hipY + 0.02 + 0.1 * (0.45 - ahead), sg * 0.16);
      const sh = J['arm' + k].p;
      P.arm(k, knee.add(V(-0.05, 0.06, -sg * 0.02)), V(0, 0, -sg), V(sh.x - 0.25, sh.y - 0.3, sh.z + sg * 0.3), V(0, -1, 0));
    }
    loco.init = false;
  }

  // ---------------------------------------------------------------------------------------------------------
  // A change of pose (stepping out of the water, a vault begun or done, sitting down) blends from the last frame's
  // pose over a short while, bone by bone, the figure's place too; not across a jump of more than a metre (a teleport,
  // a launch) or into and out of the climb into the canoe, which blends itself.
  // seconds: into a vault or a climb quickly (its first keys stand where the walk left off), out of one a little longer
  const blendTime = (from, to) => (to === 'vault' || to === 'climbUp' ? 0.08 : from === 'vault' || from === 'climbUp' ? 0.16 : 0.28);
  const pb = { t: 1, dur: 0.28, kind: null, has: false, pos: V(), quat: new THREE.Quaternion(), root: V(), q: bones.map(() => new THREE.Quaternion()), lastPos: V(), lastQuat: new THREE.Quaternion(), lastRoot: V(), lastQ: bones.map(() => new THREE.Quaternion()) };
  const _bp = V(), _bqq = new THREE.Quaternion(), _bmw = new THREE.Matrix4();
  function blendPose(kind, dt) {
    if (kind !== pb.kind) {
      const ok = pb.kind && pb.has && kind !== 'climbIn' && pb.kind !== 'climbIn';
      pb.dur = blendTime(pb.kind, kind);
      pb.kind = kind;
      if (ok) { pb.t = 0; pb.pos.copy(pb.lastPos); pb.quat.copy(pb.lastQuat); pb.root.copy(pb.lastRoot); for (let i = 0; i < bones.length; i++) pb.q[i].copy(pb.lastQ[i]); }
    }
    // the figure's place in the world now
    rig.updateMatrixWorld(true);
    paddler.getWorldPosition(_bp); paddler.getWorldQuaternion(_bqq);
    if (pb.t < 1) {
      if (_bp.distanceTo(pb.pos) > 1.2) pb.t = 1;
      else {
        pb.t = Math.min(1, pb.t + dt / pb.dur);
        const w = ease(pb.t);
        // the place: from where it was (world) to where the pose puts it, back into the rig's space
        _bp.lerpVectors(pb.pos, _bp, w); _bqq.slerpQuaternions(pb.quat, _bqq, w);
        _bmw.compose(_bp, _bqq, V(1, 1, 1)).premultiply(_inv.copy(paddler.parent.matrixWorld).invert());
        _bmw.decompose(paddler.position, paddler.quaternion, _wa); paddler.updateMatrix();
        fig.bones.root.position.lerpVectors(pb.root, fig.bones.root.position, w);
        for (let i = 0; i < bones.length; i++) bones[i].quaternion.slerpQuaternions(pb.q[i], bones[i].quaternion, w);
        // the eye and the packs read the head and the chest from the joints: put the head where it is drawn
        paddler.updateMatrixWorld(true);
        fig.bones.head.getWorldPosition(_wb); paddler.worldToLocal(_wb); J.head.p.copy(_wb);
        paddler.getWorldPosition(_bp); paddler.getWorldQuaternion(_bqq);
      }
    }
    pb.has = true;
    pb.lastPos.copy(_bp); pb.lastQuat.copy(_bqq); pb.lastRoot.copy(fig.bones.root.position);
    for (let i = 0; i < bones.length; i++) pb.lastQ[i].copy(bones[i].quaternion);
  }

  // ---------------------------------------------------------------------------------------------------------
  // The packs, after the pose: in the hull at their places, on the back (state.packOnBack: which one) or the chest
  // (state.packOnChest) on the chest bone, so they ride a walk, a jog or a carry alike, or standing on the ground
  // where packs.js set them down. With the hull overhead the hat rides strapped to the pack on the back (or hangs
  // down the back on its cord); otherwise it is on the head (the poses put it back).
  const packSeats = { hull: [0, 1], ground: [null, null] };
  const _bq = new THREE.Quaternion(), _bm = new THREE.Matrix4();
  const BACK_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(1, 0, 0), V(0, 0, -1)));  // pack +x up the spine, its back panel (+y) against the back
  const CHEST_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 1, 0), V(-1, 0, 0), V(0, 0, 1))); // and against the chest
  const FLAT_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)); // lying in the hull, flap up
  const packDims = (i) => PACKS[KINDS[i]];
  function seatPacks(mode) {
    // nothing rides in a hull that is overhead: left to itself (no packs.js) the first pack in it goes on the back
    const onBack = state.packOnBack !== undefined ? state.packOnBack : mode === 'carry' ? packSeats.hull[0] ?? null : null, onChest = state.packOnChest ?? null;
    for (let i = 0; i < packs.length; i++) {
      const m = packs[i], P = packDims(i);
      const g = packSeats.ground[i];
      let where = i === onBack ? 'back' : i === onChest ? 'chest' : packSeats.hull.includes(i) ? 'hull' : g ? 'ground' : 'none';
      if (where === 'hull' && mode === 'carry') where = 'none';
      m.visible = where !== 'none';
      if (where === 'back' || where === 'chest') {
        if (m.parent !== fig.bones.chest) fig.bones.chest.add(m);
        // the back panel against the back (or the chest), the pack riding low: its top at the shoulder blades
        if (where === 'back') { m.quaternion.copy(BACK_Q); m.position.set(-0.135 - P.D * 0.36, 0.1 - P.H / 2, 0); }
        else { m.quaternion.copy(CHEST_Q); m.position.set(0.13 + P.D * 0.36, 0.16 - P.H / 2, 0); }
      } else if (where === 'hull') {
        if (m.parent !== hullPivot) hullPivot.add(m);
        const at = SEAT_AT[i] || PACK_AT;
        m.quaternion.copy(FLAT_Q); m.position.set(at.x, floorAt(at.x) + at.lift, 0);
      } else if (where === 'ground') {
        const parent = rig.parent;
        if (parent && m.parent !== parent) parent.add(m);
        // standing on its bottom, the front toward `heading`, slumped back a little
        const fx = Math.cos(g.heading), fz = -Math.sin(g.heading);
        _bm.makeBasis(V(0, 1, 0), V(-fx, 0, -fz), V(-fz, 0, fx));
        _bq.setFromRotationMatrix(_bm);
        const tilt = 0.09;
        m.quaternion.copy(_bq).multiply(_q.setFromAxisAngle(V(0, 0, 1), tilt));
        // the bottom on the ground, sunk a little into it as a soft full bag settles: the middle half the height up
        m.position.set(g.x - fx * Math.sin(tilt) * P.H / 2, g.y + Math.cos(tilt) * P.H / 2 - 0.035, g.z - fz * Math.sin(tilt) * P.H / 2);
      }
      m.updateMatrix();
    }
    // the hat: with the canoe overhead it is strapped to the pack on the back, or hangs on its cord down the back
    if (mode === 'carry') {
      const bi = onBack;
      if (bi != null && packs[bi] && packs[bi].visible) {
        const P = packDims(bi);
        if (hat.parent !== packs[bi]) packs[bi].add(hat);
        // on the flap's face, crown out: head-bone y (the crown) along the pack's -y (its front); the brim sits 0.163
        // below the head bone's origin
        hat.position.set(P.H * 0.12, 0.163 - (P.D * 0.64 + 0.03), 0); hat.rotation.set(Math.PI, 0, 0);
      } else {
        if (hat.parent !== fig.bones.chest) fig.bones.chest.add(hat);
        hat.position.set(0.163 - 0.15, -0.06, 0); hat.rotation.set(0, 0, Math.PI / 2); // crown back, the brim on the back
      }
    }
  }

  let firstPerson = false;
  const eyeLocal = V(), eyeT = V(), eyeAt = V();
  let eyeInit = false, eyeSeen = false;
  const EYE_NEAR = 0.6; // m: a camera this near the eye is at it (the first-person camera is the eye exactly)
  const atEye = () => { const c = api.viewer; if (!c || !c.position) return true; return eyeSeen && c.position.distanceToSquared(eyeAt) < EYE_NEAR * EYE_NEAR; };
  const EYE_SPRING = 16, eyeY = { on: false, y: 0, v: 0 }; // rad/s: the first-person eye's height on foot (eye, below)
  // fb3 join: the pose eases from frame to frame (the gait's slope and tilt, the hips, the feet, the idle sway, the blend,
  // the first-person eye), so one non-finite input poisoned it for good: the join's test once aimed at an undefined point
  // and the walker's heading was NaN for a few frames, loco.grade took the NaN, and the figure, the hull on its shoulders
  // and the eye stayed NaN after the heading came back. heal() starts all of it afresh; update() heals and poses once more
  // whenever the pose it made is not finite, so a bad frame is only ever that frame.
  const heal = () => {
    gait.heal(); // (the feet, the hips, the crouch and the wading)
    resetIdle(idle);
    for (const k of ['speed', 'walkSpeed', 'moveFwd', 'moveLat', 'walk', 'stagger', 'land', 'airT', 'vy', 'crouch', 'cadence', 'carryLean']) if (!Number.isFinite(state[k])) state[k] = 0;
    eyeInit = false; eyeY.on = false; eyeY.v = 0;
    pb.t = 1; pb.has = false;
    hullPivot.scale.set(1, 1, 1);
  };
  // the pose of the frame, by the mode and the walker's move (update, below)
  function pose(dt) {
    const mode = state.mode;
    if (mode !== 'paddle') state.climb = 0;
    // the walker's move (player.js player.move): a vault, a climb, sitting; the rest are the gait's
    const mv = api.moveOf ? api.moveOf() : null, mk = mv && mode === 'walk' ? mv.kind : null;
    let kind;
    if (mode === 'carry') { kind = 'carry'; poseCarry(dt); }
    else if (mode === 'walk') {
      if (mk === 'vault' && mv.dur > 0) { kind = 'vault'; poseVault(dt, mv); }
      else if (mk === 'climb' && mv.dur > 0) { kind = 'climbUp'; poseClimbUp(dt, mv); }
      else if (mk === 'sit') { kind = 'sit'; poseSit(dt, mv); }
      else {
        kind = 'walk';
        if (pb.kind === 'vault' || pb.kind === 'climbUp') loco.init = false; // the feet planted afresh where the move left him
        poseWalk(dt, mk);
      }
    } else if (mode === 'swim') { kind = 'swim'; poseSwim(dt); }
    else if (state.climb > 0) { kind = 'climbIn'; poseClimb(dt); state.climb = Math.max(0, state.climb - dt); }
    else { kind = 'seated'; poseSeated(dt); }
    if (mode !== 'walk' && mode !== 'carry') loco.init = false;
    if (kind !== 'vault' && kind !== 'climbUp') moves.done();
    blendPose(kind, dt);
    seatPacks(mode);
    contact.userData.update(dt, mode === 'paddle' ? state.speed : 0);
    bilge.userData.update(dt, state.climb > 0 || hullPivot.parent !== rig ? 0 : state.bilge); // cons B (none while it is righted, or set down)
    // the head, neck and hat collapse out of the way from the paddler's eyes, and only while the camera is at them
    // (fb4 A, the owner, 2026-10-25: "if I'm in first person mode and I pause, the person has no head"): the pause card's
    // drifting view, the title's, a close-up, any view pulled back from the eye (api.viewer, the camera, set by main.js:
    // within EYE_NEAR of where eye() last put the eye) draws the head
    const s = firstPerson && atEye() ? 1e-3 : 1;
    fig.bones.neck.scale.setScalar(s);
  }
  const posed = () => { const r = J.root.p, n = J.neck.p, h = J.head.p; return Number.isFinite(r.x + r.y + r.z + n.x + n.y + h.x + h.y + h.z); };
  const api = {
    rig, hull: hullPivot, paddler, paddle, pack, packs, state, swimmer, figure: fig, loco, heal,
    // p2 A: the shared look-solid material (the hull, the figure, the paddle and the packs draw with it: actors.js's
    // hulls and figures too, so no program is added), the depth-only lid at the gunwales, and the poses' own parts
    material: mat, lid, gait, stroke,
    ground: null, // set by player.js: the ground height at a world (x, z), for the feet
    terrain: null, // fb2 E: set by player.js: the drawn terrain alone (no rock, step or deck), for the hill's steepness
    moveOf: null, // set by main.js: () => player.move, the move the walker is making (vault, climb, sit, wade ...)
    viewer: null, // fb4 A, set by main.js: the camera; first person hides the head only while it is at the eye (pose)
    update(dt) {
      if (!(dt > 0)) dt = 1e-4; // (a NaN dt too)
      pose(dt);
      if (!posed()) { heal(); pose(1e-4); } // fb3 join: never left poisoned (above)
    },
    setFirstPerson(on) { if (on && !firstPerson) { eyeInit = false; eyeY.on = false; } firstPerson = on; }, // entering the view starts the eye afresh
    // Where the first-person camera goes (world): ahead of the face in the direction of the look, a little
    // above the head's pivot, so no look angle sees the inside of the body. The offset is eased in the
    // paddler's own space (the body's bob comes through softly) and then carried with the body exactly.
    // yawRel: the look's bearing relative to the body's heading (player.heading)
    eye(out, yawRel, pitch, dt = 1 / 60, reset = false) {
      if (reset) { eyeInit = false; eyeY.on = false; }
      const hp = J.head.p;
      const yl = yawRel;
      const down = Math.max(0, -Math.sin(pitch));
      const f = 0.11 + 0.035 * down, u = 0.085 - 0.03 * down;
      eyeT.set(hp.x + Math.cos(yl) * f, hp.y + u, hp.z - Math.sin(yl) * f);
      if (!eyeInit) { eyeLocal.copy(eyeT); eyeInit = true; }
      eyeLocal.lerp(eyeT, damp(25, dt));
      rig.updateMatrixWorld(true);
      out.copy(eyeLocal).applyMatrix4(paddler.matrixWorld);
      // On foot (and swimming) the eye's height is eased in the world by a critically damped spring: the step's bob comes
      // through softly, and a stone stepped onto or off, a facet of the ground or a foot planting does not jolt the view
      // (the owner, 2026-10-24: "the character sorta jitters, very noticeable in first person view"). Only the height:
      // across, the eye stays carried with the body exactly, so it never trails into the head.
      if (state.mode === 'paddle' && state.climb <= 0) { eyeY.on = false; eyeAt.copy(out); eyeSeen = true; return out; }
      const dtc = Math.min(Math.max(dt, 0), 0.1);
      if (!eyeY.on || Math.abs(out.y - eyeY.y) > 1.2) { eyeY.on = true; eyeY.y = out.y; eyeY.v = 0; eyeAt.copy(out); eyeSeen = true; return out; }
      const w = EYE_SPRING, e0 = eyeY.y - out.y, v0 = eyeY.v, ex = Math.exp(-w * dtc), b = v0 + w * e0;
      eyeY.y = out.y + (e0 + b * dtc) * ex;
      eyeY.v = (v0 - w * b * dtc) * ex;
      out.y = eyeY.y;
      eyeAt.copy(out); eyeSeen = true; // (where the eye is: pose() hides the head only while the camera is here)
      return out;
    },
    // the hull comes off the shoulders and lies on the ground where it was put; it stays put while the paddler
    // walks on. pitch (about the beam) follows the ground under it, or noses a beached hull up the bank.
    dropHull(x, y, z, heading, pitch = 0.2) {
      if (hat.parent !== fig.bones.head) hatOnHead();
      rig.parent.attach(hullPivot);
      hullPivot.position.set(x, y + 0.3, z);
      hullPivot.rotation.set(0, heading, pitch);
      hullPivot.updateMatrixWorld();
    },
    pickUpHull() { rig.attach(hullPivot); },
    // Which packs lie in the hull: a count (the first n) or a list of indices (0 the gear pack, 1 the food pack).
    setHullPacks(n) { packSeats.hull = Array.isArray(n) ? n.slice() : KINDS.map((_, i) => i).slice(0, Math.max(0, n)); },
    // A pack standing on the ground at a world spot, its front toward `heading` (y the ground under it), or
    // null to take it off the ground.
    setPackGround(i, at) { packSeats.ground[i] = at ? { x: at.x, y: at.y, z: at.z, heading: at.heading || 0 } : null; },
    // the hands' reach over a stroke cycle (debugging): the worst shortfall of either wrist, metres
    reachReport(n = 40) {
      const save = { stroke: state.stroke, power: state.power };
      let worst = { L: 0, R: 0 };
      state.power = 1;
      for (let i = 0; i < n; i++) { state.stroke = i / n; poseSeated(1); for (const h of ['L', 'R']) worst[h] = Math.max(worst[h], P.short[h]); }
      Object.assign(state, save);
      return worst;
    },
  };
  return api;
}
