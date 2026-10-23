// The trailer's shots, in order (capture.js records them, encode.mjs cuts them together). Positions are world metres
// (x east, z south; a heading h faces (cos h, -sin h)), found from the look board's spots (src/lookboard.js) and
// scouted around Lake One. `fade` is the crossfade into the next shot, in seconds. The title cards are drawn here
// over the frames in the game's own type and layout: the title card's left band (src/shell.css) and the loading
// card (index.html).

// ---- the cards ------------------------------------------------------------------------------------------------
const DEEP = '#0e1b22', CREAM = '#f3ecdd', GOLD = '#dcb469';
const SERIF = 'Alegreya, Georgia, serif', SANS = '"Alegreya Sans", system-ui, sans-serif', SC = '"Alegreya Sans SC", "Alegreya Sans", sans-serif';
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const ease = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
// 0 before `a`, up over `d` seconds, held, down over `d` seconds to 0 at `b`
const window_ = (s, a, b, d = 0.7) => ease((s - a) / d) * ease((b - s) / d);
const shadow = (c, on) => {
  c.shadowColor = on ? 'rgba(0, 0, 0, 0.45)' : 'transparent'; c.shadowBlur = on ? 6 : 0; c.shadowOffsetY = on ? 2 : 0;
};
// the title card's band: flat deep at half strength down the left (src/shell.css #shell::before)
function band(c, a, width = 860) {
  c.globalAlpha = 0.5 * a; c.fillStyle = DEEP; c.fillRect(0, 0, width, 1080); c.globalAlpha = 1;
}
// kicker (small caps, wide tracking), serif lines, the gold rule, a sans line: the title card's head
function head(c, a, x, y, { kicker, lines, size = 132, sub, rise = 0 }) {
  c.save();
  c.globalAlpha = a; c.textBaseline = 'alphabetic'; shadow(c, true);
  let yy = y + (1 - rise) * 10;
  if (kicker) {
    c.font = `700 21px ${SC}`; c.letterSpacing = '0.22em'; c.fillStyle = 'rgba(243, 236, 221, 0.82)';
    c.fillText(kicker, x, yy + 18); yy += 18 + 26;
  }
  c.letterSpacing = '-0.01em'; c.fillStyle = CREAM; c.font = `500 ${size}px ${SERIF}`;
  for (const l of lines) { yy += size * 0.98; c.fillText(l, x, yy - size * 0.2); }
  yy += 4;
  shadow(c, false); c.fillStyle = GOLD; c.fillRect(x, yy, 64, 3); yy += 3;
  if (sub) {
    shadow(c, true); c.letterSpacing = '0px'; c.font = `400 24px ${SANS}`; c.fillStyle = 'rgba(243, 236, 221, 0.86)';
    yy += 26; for (const l of [].concat(sub)) { yy += 34; c.fillText(l, x, yy - 8); }
  }
  c.restore();
}

// ---- small helpers on the world (T is the capture harness) ---------------------------------------------------
const toward = (from, to) => { const dx = to[0] - from[0], dz = to[1] - from[1], d = Math.hypot(dx, dz) || 1; return [dx / d, dz / d, d]; };
const headingOf = (dx, dz) => Math.atan2(-dz, dx);
// smoothed follow: eases a mark toward a value each frame (k per second)
const follow = (T, key, v, dt, k = 3) => {
  const m = T.marks[key];
  if (!m || !dt) { T.marks[key] = v.slice(); return T.marks[key]; }
  const a = 1 - Math.exp(-k * dt);
  for (let i = 0; i < v.length; i++) m[i] += (v[i] - m[i]) * a;
  return m;
};
const mulberry32 = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

export const SHOTS = [
  // 1. Dawn fog lifting off a calm lake, with the title. Lily bay on Lake One, 10 September: the clock runs from
  // first light to a little after sunrise across the shot, so the fog thins and the sun's rays come through.
  {
    name: 'dawn', seconds: 7.5, fade: 0.7,
    clock: { doy: 253, hours: 6.72, to: 7.62 }, weather: 'fog', wind: 0.2,
    body: { mode: 'paddle', x: -20978.7, z: 17952.0, heading: 0.2 },
    warm: 40,
    camera(t, T) {
      const p = T.game.player, w = T.levelAt(p.x, p.z), h = 0.2, s = T.glide(t);
      // off to the south side behind the canoe, so the canoe sits right of the title's band
      const [bx, bz] = T.along(-20978.7, 17952.0, h + Math.PI - 0.42, 12.5 - 4.5 * s);
      const [lx, lz] = T.along(-20978.7, 17952.0, h + 0.12, 70);
      return { pos: [bx, w + 1.7 - 0.35 * s, bz], look: [lx, w + 2.6 - 0.4 * s, lz], fov: 52 };
    },
    overlay(c, t) {
      const s = t * 7.5, a = window_(s, 0.5, 5.2, 0.9);
      if (a <= 0) return;
      band(c, a);
      head(c, a, 136, 150, { kicker: 'Boundary Waters Canoe Area Wilderness', lines: ['Boundary', 'Waters'], size: 150, rise: ease((s - 0.5) / 1.2) });
    },
  },

  // 2. A moose in the shallows at dawn, 15 September: a bull feeding at a point of a narrow bay, lifting his head
  // out of the water partway through, the bay misty behind him. The camera is a boat-height long lens drifting in.
  {
    name: 'moose', seconds: 4.5, fade: 0.6,
    clock: { doy: 258, hours: 7.38, to: 7.46 }, weather: 'clear', wind: 0.3,
    body: { mode: 'paddle', x: -20604, z: 18632, heading: Math.PI },
    hideCanoe: true, warm: 45,
    scout(T) { const w = T.levelAt(-20684, 18632); return { pos: [-20604, w + 2, 18632], look: [-20684, w + 1, 18632], fov: 50 }; },
    setup(T) {
      const g = T.game, f = g.fauna;
      for (const m of f.moose.list) m.alive = false;
      const r = f.force('moose');
      if (typeof r === 'string') return false;
      const [a, b] = f.moose.list;
      // knee-deep (by the lake bed the moose stands on: levelAt - heightAt ~0.5 m) at the point, the misty bay behind
      const mx = -20689, mz = 18637, cam = [-20660, 18612];
      const [dx, dz] = toward([mx, mz], cam);
      // broadside to the camera, facing out along the bay; head down, coming up 1.6 s into the shot
      Object.assign(a, { alive: true, x: mx, z: mz, heading: headingOf(dx, dz) - Math.PI / 2 - 0.6, state: 'feed', t: 0, hold: 45 / 30 + 1.6, calm: 600, bull: true, scale: 1.04, speed: 0, head: -1.05 });
      b.alive = false;
      T.marks.moose = [mx, mz]; T.marks.cam = cam;
    },
    camera(t, T) {
      const [mx, mz] = T.marks.moose || [-20689, 18637], cam = T.marks.cam || [-20660, 18612];
      const [dx, dz] = toward(cam, [mx, mz]), s = T.glide(t), w = T.levelAt(mx, mz);
      const px = cam[0] + dx * 3 * s - dz * 1.5 * s, pz = cam[1] + dz * 3 * s + dx * 1.5 * s;
      return { pos: [px, w + 1.15, pz], look: [mx - dx * 0.5, w + 1.5, mz - dz * 0.5], fov: 19 - 2 * s };
    },
  },

  // 3. A loon pair with a chick riding on a parent's back, a July evening on Lake One: from low on the water, on the
  // sun's side, so the birds are lit against the misty far shore.
  {
    name: 'loons', seconds: 4.5, fade: 0.6,
    clock: { doy: 196, hours: 19.6 }, weather: 'clear', wind: 0.6,
    body: { mode: 'paddle', x: -19665, z: 18089, heading: 3.84 },
    hideCanoe: true, warm: 30,
    scout(T) { const w = T.levelAt(-19665, 18089); const [lx, lz] = T.along(-19665, 18089, 3.84, 30); return { pos: [-19665, w + 1.0, 18089], look: [lx, w + 0.3, lz], fov: 35 }; },
    setup(T) { T.game.fauna.force('loon-chick'); T.game.step(1 / 30, 2); },
    camera(t, T, dt) {
      const g = T.game, L = g.loons.loons;
      // the pair the forced chick rides with (loons.js force: loon 0 leads, loon 1 follows 4 m off): framed side-on
      // to the line between them, from the sun's side, weighted to the parent carrying the chick
      const ride = g.loons.chicks.find((c) => c.ride && c.parent >= 0 && c.parent < 2);
      const carrier = ride ? L[ride.parent] : L[1], mate = carrier === L[0] ? L[1] : L[0];
      const m = follow(T, 'loonC', [carrier.x * 0.6 + mate.x * 0.4, carrier.z * 0.6 + mate.z * 0.4], dt, 2.5);
      if (T.marks.camA === undefined) {
        const sd = g.day.sunDir, sunA = Math.atan2(sd.z, sd.x) - 0.62, pairA = Math.atan2(mate.z - carrier.z, mate.x - carrier.x);
        const d = (a) => Math.abs(Math.atan2(Math.sin(a - sunA), Math.cos(a - sunA)));
        const a1 = pairA + Math.PI / 2, a2 = pairA - Math.PI / 2;
        const side = d(a1) < d(a2) ? a1 : a2;
        T.marks.camA = side + 0.3 * Math.atan2(Math.sin(sunA - side), Math.cos(sunA - side)); // mostly side-on, leaning sunward
      }
      const s = T.glide(t), a = T.marks.camA - 0.12 + 0.24 * s, w = T.levelAt(m[0], m[1]);
      return { pos: [m[0] + Math.cos(a) * 11.5, w + 0.6, m[1] + Math.sin(a) * 11.5], look: [m[0], w + 0.3, m[1]], fov: 19 };
    },
  },

  // 4. The second card over a low glide down Lake One toward its islands, late August evening.
  {
    name: 'aerial', seconds: 5.5, fade: 0.7,
    clock: { doy: 230, hours: 18.9 }, weather: 'clear', wind: 1.5,
    body: { mode: 'paddle', x: -20200, z: 18300, heading: 0.4 },
    hideCanoe: true, warm: 30,
    camera(t, T) {
      const w = T.levelAt(-20200, 18300), s = T.glide(t), h = 0.4;
      const [px, pz] = T.along(-20200, 18300, h, -20 + 32 * s);
      const [lx, lz] = T.along(-20200, 18300, h, 520);
      return { pos: [px, w + 34 - 4 * s, pz], look: [lx, w - 4 * s, lz], fov: 50 };
    },
    overlay(c, t) {
      const s = t * 5.5, a = window_(s, 0.35, 5.15, 0.8);
      if (a <= 0) return;
      band(c, a, 900);
      head(c, a, 136, 210, { kicker: 'Lake One · Entry point 30', lines: ['The real Boundary', 'Waters, lake by lake'], size: 92, sub: ['Terrain from USGS, lakes and portages from', 'OpenStreetMap, depths from the Minnesota DNR.'], rise: ease((s - 0.35) / 1.2) });
    },
  },

  // 5. The Lake One bluff from the water, late August, the evening sun on its face: the canoe paddles in toward it.
  {
    name: 'bluff', seconds: 4.5, fade: 0.6,
    clock: { doy: 240, hours: 19.55 }, weather: 'clear', wind: 0.8,
    body: { mode: 'paddle', x: -19475, z: 18036, heading: -1.071 },
    hold: 'KeyW', warm: 45,
    camera(t, T, dt) {
      const p = T.game.player, h = -1.071, s = T.glide(t);
      const m = follow(T, 'canoe', [p.x, p.z], dt, 4);
      const w = T.levelAt(m[0], m[1]);
      const [bx, bz] = T.along(m[0], m[1], h + Math.PI - 0.35 + 0.25 * s, 10.5);
      const [lx, lz] = T.along(m[0], m[1], h + 0.1, 70);
      return { pos: [bx, w + 1.5, bz], look: [lx, w + 9, lz], fov: 50 };
    },
  },

  // 6. Paddling along a shore at golden hour with the sun's rays through the pines, July, 20:15.
  {
    name: 'golden', seconds: 5, fade: 0.6,
    clock: { doy: 196, hours: 20.22 }, weather: 'clear', wind: 0.5,
    body: { mode: 'paddle', x: -18940, z: 18128, heading: 1.571 },
    hold: 'KeyW', warm: 45,
    camera(t, T, dt) {
      const g = T.game, p = g.player, sd = g.day.sunDir, sl = Math.hypot(sd.x, sd.z), ux = sd.x / sl, uz = sd.z / sl;
      const m = follow(T, 'canoe', [p.x, p.z], dt, 4);
      const w = T.levelAt(m[0], m[1]), s = T.glide(t);
      return { pos: [m[0] - ux * 8.5 + uz * (3 - 1.5 * s), w + 1.3, m[1] - uz * 8.5 - ux * (3 - 1.5 * s)], look: [m[0] + ux * 40, w + 3.6, m[1] + uz * 40], fov: 54 };
    },
  },

  // 7. A bald eagle on a shore white pine, July evening: a long lens from the water, easing in.
  {
    name: 'eagle', seconds: 4, fade: 0.6,
    clock: { doy: 196, hours: 19.1 }, weather: 'clear', wind: 1.2,
    body: { mode: 'paddle', x: -20978.7, z: 17952, heading: 2.35 },
    hideCanoe: true, warm: 30,
    scout(T) { const w = T.levelAt(-20978.7, 17952); const [lx, lz] = T.along(-20978.7, 17952, 2.35, 60); return { pos: [-20978.7, w + 1.5, 17952], look: [lx, w + 5, lz], fov: 50 }; },
    setup(T) {
      const g = T.game, f = g.fauna, B = f.birds;
      // the same shore pine every time: the perch search with a fixed seed from this spot
      const keep = f.rng; f.rng = mulberry32(5);
      const p = B.findPerch(f.cx, f.cz, 40, 260, f.view);
      f.rng = keep;
      if (!p) return false;
      const cam = [-20540, 17685], b = B.eagles[0];
      B.perches[0] = p;
      Object.assign(b, { alive: true, x: p.x, y: p.y + b.k.perchUp, z: p.z, tx: p.x, tz: p.z, perchY: p.y + b.k.perchUp, state: 'perch', holdT: 600, fold: 1, pitch: b.k.perchPitch, roll: 0, t: 0 });
      b.heading = Math.atan2(-(cam[1] - p.z), cam[0] - p.x) + 0.9;
      T.marks.perch = [p.x, p.y, p.z]; T.marks.cam = cam;
    },
    camera(t, T) {
      const [ex, ey, ez] = T.marks.perch || [-20511, 470, 17732], cam = T.marks.cam || [-20540, 17685];
      const w = T.levelAt(cam[0], cam[1]), s = T.glide(t);
      return { pos: [cam[0], w + 1.4, cam[1]], look: [ex, ey - 1.9 + 1.1 * s, ez], fov: 7.6 - 1.8 * s };
    },
  },

  // 8. Portaging: the canoe on the shoulders along the Lake One - Kawishiwi River trail, July evening, walking away
  // from Lake One. The camera backs along the trail ahead (the trail is the one open line through the trees).
  {
    name: 'portage', seconds: 4.5, fade: 0.6,
    clock: { doy: 200, hours: 19.0 }, weather: 'clear', wind: 1.5,
    // a few metres back toward Lake One: the warm-up is long enough for the hull to come up onto the shoulders
    body: { mode: 'walk', canoe: 'carry', x: -20243, z: 17606.5, heading: Math.atan2(-(17623 - 17607), -20271 + 20244) },
    hold: 'KeyW', warm: 80,
    prewarm(T) { steerTrail(T); },
    frame(T) { steerTrail(T); },
    camera(t, T, dt) {
      const p = T.game.player, tr = trailOf(T), s = T.glide(t);
      const m = follow(T, 'walker', [p.x, p.altitude, p.z], dt, 5);
      const along = follow(T, 'along', [alongTrail(tr, m[0], m[2])], dt, 4)[0];
      const [cx, cz, ux, uz] = pointOnTrail(tr, along + 8.5 - 1.8 * s);
      const px = cx - uz * 1.1, pz = cz + ux * 1.1; // a step to the side of the path
      return { pos: [px, T.groundAt(px, pz) + 1.25, pz], look: [m[0], m[1] + 1.65, m[2]], fov: 50, forwardYaw: T.marks.yaw ?? p.heading };
    },
  },

  // 9. Walking through the forest of birch and spruce near the portage, July evening light.
  {
    name: 'forest', seconds: 4.5, fade: 0.6,
    clock: { doy: 200, hours: 19.25 }, weather: 'clear', wind: 2.5,
    body: { mode: 'walk', canoe: [0, -40], x: -20254.4, z: 17561.6, heading: 0.12 },
    hold: 'KeyW', warm: 30,
    camera(t, T, dt) {
      const p = T.game.player, h = 0.12, s = T.glide(t);
      const m = follow(T, 'walker', [p.x, p.altitude, p.z], dt, 5);
      const [bx, bz] = T.along(m[0], m[2], h + Math.PI - 0.7 + 0.25 * s, 4.4);
      const [lx, lz] = T.along(m[0], m[2], h + 0.15, 9);
      return { pos: [bx, m[1] + 1.35, bz], look: [lx, m[1] + 1.55, lz], fov: 58, forwardYaw: h };
    },
  },

  // 10. A storm rolling in over open water: thunderheads in July, the cloud deck coming over, the wind rising, rain,
  // and two strikes of lightning.
  {
    name: 'storm', seconds: 6, fade: 0.6,
    clock: { doy: 196, hours: 15 }, weather: 'building', wind: 5, from: 290,
    body: { mode: 'paddle', x: -19665, z: 18089, heading: 1.9 },
    hold: 'KeyW', warm: 30,
    frame(T, i, t) {
      const g = T.game;
      if (i === 0) T.setWeather('storm', 5.2);
      const wind = 5 + 9 * T.smooth(Math.min(1, t * 1.2));
      g.wind.override = wind; g.wind.speed = wind; g.wind.from = 290;
      if (i === Math.round(0.56 * 179)) g.weather.strike(2600);
      if (i === Math.round(0.74 * 179)) g.weather.strike(1300);
      if (i === Math.round(0.93 * 179)) g.weather.strike(800);
    },
    camera(t, T, dt) {
      const p = T.game.player, s = T.glide(t);
      const brg = 290 * Math.PI / 180, fx = Math.sin(brg), fz = -Math.cos(brg);
      const m = follow(T, 'canoe', [p.x, p.z], dt, 4);
      const w = T.levelAt(m[0], m[1]);
      return { pos: [m[0] - fx * (13 - 2 * s) + fz * 3, w + 2.1, m[1] - fz * (13 - 2 * s) - fx * 3], look: [m[0] + fx * 100, w + 14 - 3 * s, m[1] + fz * 100], fov: 56 };
    },
  },

  // 11. Fall colour along a shore, 12 October, the late sun on the aspen and birch: the canoe paddles along it.
  {
    name: 'fall', seconds: 4.5, fade: 0.6,
    clock: { doy: 285, hours: 17.0 }, weather: 'clear', wind: 1,
    body: { mode: 'paddle', x: -20862, z: 17389, heading: 2.38 },
    hold: 'KeyW', warm: 40,
    camera(t, T, dt) {
      const p = T.game.player, s = T.glide(t);
      const m = follow(T, 'canoe', [p.x, p.z], dt, 4);
      const w = T.levelAt(m[0], m[1]);
      // out on the lake side (the land is to the north-east), a little behind the canoe, looking at the shore ahead
      // of it so it paddles into the frame
      const nx = 0.69, nz = -0.72, fx = Math.cos(2.38), fz = -Math.sin(2.38);
      const px = m[0] - nx * 8.5 - fx * (4 - 1.5 * s), pz = m[1] - nz * 8.5 - fz * (4 - 1.5 * s);
      return { pos: [px, w + 1.5, pz], look: [m[0] + nx * 22 + fx * 9, w + 2.6, m[1] + nz * 22 + fz * 9], fov: 46 };
    },
  },

  // 12. Snow in November on the Lake One bluff, the lake still open, the canoe crossing.
  {
    name: 'snow', seconds: 4.5, fade: 0.6,
    clock: { doy: 318, hours: 13.5 }, weather: 'snow-heavy', wind: 3,
    body: { mode: 'paddle', x: -19452, z: 18044, heading: -1.071 + 1.35 },
    hold: 'KeyW', warm: 60,
    camera(t, T, dt) {
      const p = T.game.player, s = T.glide(t);
      const m = follow(T, 'canoe', [p.x, p.z], dt, 3);
      const w = T.levelAt(m[0], m[1]), h = -1.071;
      const [bx, bz] = T.along(m[0], m[1], h + Math.PI - 0.15, 13 - 1.5 * s);
      const [lx, lz] = T.along(m[0], m[1], h + 0.09, 70); // a little ahead of the canoe, which crosses to the left
      return { pos: [bx, w + 1.6, bz], look: [lx, w + 9, lz], fov: 50 };
    },
  },

  // 13. A campsite at dusk: the canoe pulled up on the granite ledge, someone at the water's edge, the sky going
  // pink over the lake and its island. July, 20:50.
  {
    name: 'camp', seconds: 5, fade: 0.7,
    clock: { doy: 200, hours: 20.82, to: 20.95 }, weather: 'clear', wind: 0.4,
    body: { mode: 'walk', x: -20752.48, z: 19454.64, heading: 2.47, canoe: [3, 1.5] },
    warm: 30,
    camera(t, T) {
      const s = T.glide(t), dx = -0.7827, dz = -0.6224, wx = -20752.48, wz = 19454.64;
      const back = 13 - 3 * s, side = -5 + 2 * s;
      const cx = wx - dx * back - dz * side, cz = wz - dz * back + dx * side;
      const w = T.levelAt(wx + dx * 30, wz + dz * 30);
      return { pos: [cx, T.groundAt(cx, cz) + 1.9, cz], look: [wx + dx * 60, w + 3.6, wz + dz * 60], fov: 46 };
    },
  },

  // 14. The night sky with the full moon over the lake, late August, then the closing card.
  {
    name: 'night', seconds: 10.5, fade: 0,
    clock: { doy: 239, hours: 21.6 }, weather: 'clear', wind: 0.5,
    body: { mode: 'paddle', x: -21000, z: 18750, heading: Math.atan2(-(-Math.cos(126 * Math.PI / 180)), Math.sin(126 * Math.PI / 180)) + 0.6 },
    warm: 40,
    camera(t, T) {
      const g = T.game, mdir = g.day.moonDir, s = T.glide(Math.min(1, t * 1.6));
      const az = 126 * Math.PI / 180, fx = Math.sin(az), fz = -Math.cos(az);
      const x0 = -21000, z0 = 18750, w = T.levelAt(x0, z0);
      const px = x0 - fx * (12 - 3 * s) + fz * 4, pz = z0 - fz * (12 - 3 * s) - fx * 4;
      return { pos: [px, w + 1.25 + 0.4 * s, pz], look: [px + mdir.x * 100, w + 1.25 + mdir.y * 100 * 0.62, pz + mdir.z * 100], fov: 48 };
    },
    overlay(c, t) {
      const s = t * 10.5;
      const deep = ease((s - 5.4) / 1.1);
      if (deep <= 0) return;
      c.globalAlpha = deep; c.fillStyle = DEEP; c.fillRect(0, 0, 1920, 1080); c.globalAlpha = 1;
      // the loading card: the name, a line, a gold bar filling
      const a = ease((s - 6.3) / 0.9);
      if (a <= 0) return;
      c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = CREAM; c.font = `500 112px ${SERIF}`; c.letterSpacing = '-0.005em';
      c.fillText('Boundary Waters', 960, 520);
      c.font = `400 30px ${SANS}`; c.letterSpacing = '0px'; c.fillStyle = 'rgba(243, 236, 221, 0.72)';
      c.fillText('A quiet canoe trip across the real Boundary Waters', 960, 580);
      const bw = 520, bx = 960 - bw / 2, by = 640;
      c.fillStyle = 'rgba(243, 236, 221, 0.18)'; c.fillRect(bx, by, bw, 5);
      c.fillStyle = GOLD; c.fillRect(bx, by, bw * ease((s - 6.6) / 3.4), 5);
      c.restore();
    },
  },
];

// ---- the portage trail ----------------------------------------------------------------------------------------
// the Lake One - Kawishiwi River portage as a polyline with its running length (pts run from Lake One westward)
function trailOf(T) {
  if (T.marks.trail) return T.marks.trail;
  const q = T.game.world.portages.find((p) => p.name === 'Lake One – Kawishiwi River');
  const pts = q.pts, cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return (T.marks.trail = { pts, cum, len: cum[cum.length - 1] });
}
// how far along the trail the point nearest (x, z) lies
function alongTrail(tr, x, z) {
  let best = 0, bd = Infinity;
  for (let i = 1; i < tr.pts.length; i++) {
    const [ax, az] = tr.pts[i - 1], [bx, bz] = tr.pts[i], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-6;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), d = Math.hypot(x - ax - dx * k, z - az - dz * k);
    if (d < bd) { bd = d; best = tr.cum[i - 1] + k * Math.sqrt(L2); }
  }
  return best;
}
// the point `s` metres along the trail and the trail's direction there: [x, z, ux, uz]
function pointOnTrail(tr, s) {
  s = Math.max(0, Math.min(tr.len - 0.01, s));
  let i = 1; while (i < tr.pts.length - 1 && tr.cum[i] < s) i++;
  const [ax, az] = tr.pts[i - 1], [bx, bz] = tr.pts[i], L = tr.cum[i] - tr.cum[i - 1] || 1, k = (s - tr.cum[i - 1]) / L;
  return [ax + (bx - ax) * k, az + (bz - az) * k, (bx - ax) / L, (bz - az) / L];
}
// steer the walker along the trail toward the point 6 m further along (forwardYaw is what W reads), turning gently
function steerTrail(T) {
  const p = T.game.player, tr = trailOf(T);
  const [ax, az] = pointOnTrail(tr, alongTrail(tr, p.x, p.z) + 6);
  const want = Math.atan2(-(az - p.z), ax - p.x);
  const y = T.marks.yaw ?? want, d = Math.atan2(Math.sin(want - y), Math.cos(want - y));
  T.marks.yaw = y + d * 0.08;
}
