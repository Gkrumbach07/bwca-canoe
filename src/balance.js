// The canoe's balance on your shoulders (the owner, 2026-10-31: "there's not much of a risk of the canoe falling over.
// Wind should definitely play a factor ... wind coming at it from the side, and you're not stabilizing it with a hand
// ... if you're jogging or sprinting ... the longer you sprint, more likely it's going to fall ... slope ... off trail
// ... if it's going to fall, it looks like it's going to fall. There's always a way to correct it, which is to stop
// moving"). player.js runs it each frame under the canoe and poses.js draws it (canoe.state.carryLean, radians).
//
// The hull's roll on the yoke is a spring: `lean` (1 is past saving: it comes down) pulled back to level by the hands on
// the gunwales and the shoulders under the yoke, and shoved by
//   - the wind across the hull (a canoe overhead is a sail): its side share, more in a gust (wind.js PUFF), less under
//     the trees, and much less with a hand on a gunwale to hold it;
//   - the walk's own jolts: more at a jog (Shift) and more the longer you keep it up (HUSTLE), off the trail, on a slope
//     across the way and up or down it, with things lashed in it (the dilly bobs: a higher, heavier load);
//   - a tree caught, a stagger (Space): a knock.
// Hands: two on the gunwales hold it nearly whatever comes; one holds it well; none (the contoured yoke, a thing in each
// hand) leaves it to the shoulders. Once it has swung past WARN it is wobbling: walking on, the spring goes soft (with no
// hand on it, it tips on its own), and only standing still (STILL) settles it again; it stops wobbling under CALM.
// Constants: k the spring (1/s²), c its damping (1/s), both by hands on the gunwales (0, 1, 2).

export const BALANCE = {
  k: [5, 9, 16], c: [2.2, 3.6, 5.5],
  still: { k: 20, c: 8 },               // standing still: the canoe settled on the shoulders
  soft: 7, softS: 2,                    // walking on while it wobbles: taken off k, over softS seconds
  warn: 0.5, calm: 0.16,                // |lean| past which it wobbles, and back under which (and slow) it has settled
  jolt: { walk: 0.55, jog: 1.2, long: 1.5, longS: 40, offTrail: 1.5, slope: 2.2, lashed: 0.14 }, // the walk's shoves (1/s²)
  wind: { steady: 0.04, gust: 0.36, hands: [1, 0.45, 0.15], open: 0.45 }, // per m/s of side wind; by hands; the least exposure
  cross: 1.4,                           // the shove from a slope across the way, per unit of grade
  hustleDecay: 2,                       // HUSTLE's clock runs down this many times faster than it builds
  roll: 0.3,                            // radians of roll the hull shows at lean 1
};

export class CarryBalance {
  constructor() { this.reset(); }
  reset() { this.lean = 0; this.v = 0; this.n = 0; this.hustleT = 0; this.wobbly = false; this.softT = 0; }
  // a knock (a tree, a stagger): a shove of `amt` (1/s) one way or the other
  bump(amt) { this.v += amt * (Math.random() < 0.5 ? -1 : 1); }
  // o: { hands 0..2, moving, hustle, onTrail, side (the wind toward your right, m/s), gust (the puff's share, 0..1),
  //      exposure 0..1, cross (the ground's fall to the right over a metre), grade (along the way, signed), lashed (count) }
  // → { lean, wobbly, fall }
  update(dt, o) {
    const B = BALANCE, h = Math.max(0, Math.min(2, o.hands | 0));
    if (!(dt > 0)) return { lean: this.lean, wobbly: this.wobbly, fall: false };
    dt = Math.min(dt, 0.05);
    if (o.moving && o.hustle) this.hustleT += dt; else this.hustleT = Math.max(0, this.hustleT - dt * B.hustleDecay);
    let k, c;
    this.softT = this.wobbly && o.moving ? Math.min(B.softS, this.softT + dt) : 0;
    if (!o.moving) { k = B.still.k; c = B.still.c; } else { k = B.k[h] - B.soft * (this.softT / B.softS); c = B.c[h]; }
    const lashed = 1 + B.jolt.lashed * (o.lashed || 0);
    k /= lashed; // a heavier, higher load swings slower and is harder to hold
    // the walk's jolts: a random push that wanders (an Ornstein-Uhlenbeck noise of unit size, about 0.4 s long)
    const J = B.jolt;
    let amp = 0;
    if (o.moving) {
      amp = o.hustle ? J.jog + J.long * Math.min(1, this.hustleT / J.longS) : J.walk;
      if (!o.onTrail) amp *= J.offTrail;
      amp *= 1 + J.slope * (Math.abs(o.cross || 0) + 0.5 * Math.abs(o.grade || 0));
      amp *= lashed;
    }
    const tau = 0.4;
    this.n += (-this.n / tau) * dt + Math.sqrt((2 * dt) / tau) * gauss();
    // the wind across it: a steady lean and the gust's shove, held off by the hands
    const W = B.wind, ex = W.open + (1 - W.open) * Math.max(0, Math.min(1, o.exposure ?? 1));
    const wind = (o.side || 0) * ex * W.hands[h] * (W.steady + W.gust * (o.gust || 0));
    const slope = (o.moving ? 1 : 0.3) * B.cross * (o.cross || 0);
    const a = -k * this.lean - c * this.v + amp * this.n + wind + slope;
    this.v += a * dt; this.lean += this.v * dt;
    const L = Math.abs(this.lean);
    if (L > B.warn) this.wobbly = true;
    else if (this.wobbly && L < B.calm && Math.abs(this.v) < 0.25) this.wobbly = false;
    const fall = L >= 1, side = Math.sign(this.lean);
    if (fall) this.reset();
    return { lean: this.lean, wobbly: this.wobbly, fall, side };
  }
}

function gauss() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
