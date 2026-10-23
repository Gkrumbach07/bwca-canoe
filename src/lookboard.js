import { bakesPending } from './loft.js';

// The look board: one contact sheet of fixed frames, so every change to the look is judged on the same pictures
// (docs/look.md). `window.__game.lookboard(opts)` drives the game through SPOTS x SETS: for each spot it puts the
// canoe or the walker there and waits for the tiles, then for each set (a date and an hour) it settles the day
// cycle and renders one frame at a fixed size. The frames are composed into one labelled sheet, returned as a PNG
// data URL and downloaded when the page is visible. It works in the hidden browser pane too (no animation
// frames, a 0 x 0 canvas): it forces the size and steps the game itself, then puts everything back.
//
// To add a spot, add an entry. Positions are world metres (x east, z south); heading is the bearing the body
// faces (forward = (cos h, -sin h)); mode is how the frame is taken:
//   paddle  in the canoe, the chase camera behind it
//   first   in the canoe, from the paddler's eyes
//   walk    on foot, the chase camera behind the walker
// Optional: hold (a key held for the last `frames` frames before the shot: 'KeyW' paddles or walks), view (a
// fixed camera on the body instead of the chase: { yaw, dist, height, ahead, fov }: yaw from straight ahead in
// radians, dist out, height above the ground or water under it, looking at the body or `ahead` metres in front
// of it), canoe (on foot: where the canoe lies, [right, forward] metres from the walker, or 'carry' for the
// shoulders; a step to the right by default), distance (the chase camera's), pitch (first person: the look's
// tilt, + up), note (the second line of the label). The spots stay put across builds: plain coordinates, found once.
export const SPOTS = [
  { name: 'Lodge point', note: 'Kawishiwi Lodge, entry point 30 (the trip start): the walker on the point, inland',
    mode: 'walk', x: -19597.3, z: 16777.0, heading: Math.PI / 2 },
  { name: 'Dock from the water', note: 'the outfitter\'s dock and shack from 12 m off the dock\'s end, over the canoe',
    mode: 'paddle', x: -19608, z: 16811, heading: 1.78, view: { yaw: Math.PI - 0.35, dist: 5.5, height: 1.4, ahead: 10, fov: 55 } },
  { name: 'Open lake', note: 'Lake One, 130 m from any shore, the far shore 2.1 km ahead',
    mode: 'paddle', x: -19665, z: 18089, heading: 3.84 },
  { name: 'Lake One bluff', note: 'the steepest long slope facing open water within 3 km: 16 m up in 50 m, 300 m along the shore',
    mode: 'paddle', x: -19461.4, z: 18062.6, heading: -1.071 },
  { name: 'Campsite', note: 'the site 1.1 km north-east of the lodge (-18802, 17562), from its landing',
    mode: 'walk', x: -18799.9, z: 17567.4, heading: 1.928, canoe: [-2.2, -1.5] },
  { name: 'Portage end', note: 'Lake One - Kawishiwi River: its Lake One landing, coming in by canoe',
    mode: 'paddle', x: -20195, z: 17605, heading: 2.946, view: { yaw: Math.PI - 0.3, dist: 5, height: 1.3, ahead: 16, fov: 55 } },
  { name: 'Lily bay', note: 'pads and reeds in a Lake One bay (the pads float June to mid-September)',
    mode: 'paddle', x: -20978.7, z: 17952.0, heading: 1.772, distance: 7 },
  { name: 'Forest interior', note: 'mixed woods 140 m from the shore, east of the lodge',
    mode: 'walk', x: -19015, z: 16129, heading: 0.6, canoe: [0, -14] },
  { name: 'Paddling, first person', note: 'off the lodge, along the shore, at the catch of a stroke',
    mode: 'first', x: -19500, z: 16860, heading: Math.PI, hold: 'KeyW', frames: 12, pitch: -0.22 },
  { name: 'Walker mid-stride', note: 'on the lodge lawn, from the side',
    mode: 'walk', x: -19590, z: 16772, heading: Math.PI, canoe: [6, -9], hold: 'KeyW', frames: 32, view: { yaw: 1.75, dist: 4.2, height: 1.15, fov: 50 } },
];

// The dates and hours, one column each. Dusk on 22 October is 18:24, the sun 3.7 degrees down. A set may carry its own
// weather and wind: weather (a state of weather.js, held for the frame: 'clear', 'fair', 'overcast', 'fog', 'light-rain',
// 'rain', 'storm', 'building', 'snow'; without it the forecast's own for that hour), wind (m/s, 2 when not given: a
// light breeze) and from (the bearing the wind comes from, degrees; the day's own when not given).
export const SETS = [
  { label: '22 Oct 12:00', doy: 295, hours: 12 },
  { label: '22 Oct 17:30', doy: 295, hours: 17.5 },
  { label: '22 Oct dusk 18:24', doy: 295, hours: 18.4 },
  { label: '15 Jul 20:00', doy: 196, hours: 20 },
  { label: '15 Jul 15:00 storm', doy: 196, hours: 15, weather: 'storm', wind: 14, from: 290 },
  { label: '22 Oct 8:00 fog', doy: 295, hours: 8, weather: 'fog', wind: 0.5 },
];

const STEP = 1 / 60;
const nextTask = () => new Promise((r) => setTimeout(r, 0));
// opts.spots / opts.sets: names from the lists above, or entries of their own
const pick = (list, want, key) => (want ? want.map((w) => (typeof w === 'string' ? list.find((e) => e[key] === w) : w)).filter(Boolean) : list);

// game: window.__game (with step, and advance: frames without drawing). loop: { pause, resume } for the animation loop.
// opts: width, height (each frame, px), scale (a frame's size on the sheet), settle (frames stepped before each shot),
// type ('image/png' or 'image/jpeg'), label (for the title line), spots, sets, download, log.
export async function lookboard(game, opts = {}, loop = {}) {
  const o = { width: 960, height: 600, scale: 0.5, settle: 45, type: 'image/png', label: '', spots: null, sets: null, download: document.visibilityState === 'visible', log: true, ...opts };
  const { renderer, camera, post, player, chase, day, wind, weather } = game;
  const list = pick(SPOTS, o.spots, 'name'), sets = pick(SETS, o.sets, 'label');
  const t0 = performance.now();
  const saved = {
    pixelRatio: renderer.getPixelRatio(), camMode: chase.mode, distance: chase.distance, pitch: chase.pitch,
    clock: [day.year, day.doy, day.hours], running: day.running, windOverride: wind.override, windSpeed: wind.speed, windFrom: wind.from,
    weather: weather ? weather.forced : null, strikeIn: weather ? weather._strikeIn : 0,
    timeScale: player.timeScale, saver: game.saver ? game.saver.enabled : null,
    body: { mode: player.mode, x: player.x, z: player.z, heading: player.heading, drop: player.carry && player.carry.drop ? { ...player.carry.drop } : null },
  };
  const advance = (n) => { if (game.advance) game.advance(STEP, n); else game.step(STEP, n); };
  if (loop.pause) loop.pause();
  try {
    if (game.saver) game.saver.enabled = false; // the board's spots are not the trip's
    await openGame(game);
    renderer.setPixelRatio(1);
    renderer.setSize(o.width, o.height, false);
    post.resize(o.width, o.height);
    camera.aspect = o.width / o.height; camera.updateProjectionMatrix();
    day.running = false; player.timeScale = 1;
    const cw = Math.round(o.width * o.scale), ch = Math.round(o.height * o.scale);
    const sheet = makeSheet(list, sets, cw, ch, o);
    const frames = [];
    for (let si = 0; si < list.length; si++) {
      const spot = list[si];
      const ts = performance.now();
      place(game, spot);
      await streamIn(game, spot, advance);
      for (let k = 0; k < sets.length; k++) {
        const set = sets[k];
        day.setClock(set.year || 2026, set.doy, set.hours);
        // the set's weather held (or the forecast's), its wind (a light breeze unless it says), no lightning flashing
        // at random into the frame
        if (weather) { if (set.weather) weather.set(set.weather); else weather.release(); weather._strikeIn = 1e9; weather._strikes.length = 0; }
        wind.override = set.wind ?? 2; wind.speed = wind.override;
        if (Number.isFinite(set.from)) wind.from = set.from;
        place(game, spot); // every frame starts the same way: the canoe drifts and the walker strides between them
        chase.setMode(spot.mode === 'first' ? 'first' : 'third'); // also puts back the field of view a fixed view changed
        chase.distance = spot.distance || saved.distance;
        chase.snap();
        const hold = spot.hold ? Math.min(o.settle, spot.frames || 30) : 0;
        advance(o.settle - hold);
        if (spot.pitch) chase.viewPitch = spot.pitch; // after the snap's first frame, which levels the look
        if (hold) { player.input.down.add(spot.hold); advance(hold - 1); }
        if (spot.view) aim(game, spot.view);
        game.step(STEP, 1);
        sheet.put(si, k, renderer.domElement);
        if (hold) player.input.down.delete(spot.hold);
        chase.focus = null;
        frames.push({ spot: spot.name, set: set.label, sun: +day.elevation.toFixed(1) });
      }
      if (o.log) console.log(`look board: ${spot.name} (${Math.round(performance.now() - ts)} ms)`);
    }
    const url = sheet.finish(frames, Math.round((performance.now() - t0) / 1000));
    if (o.download) {
      const a = document.createElement('a');
      a.href = url; a.download = `lookboard-${stamp()}.${o.type === 'image/jpeg' ? 'jpg' : 'png'}`;
      document.body.appendChild(a); a.click(); a.remove();
    }
    return { url, width: sheet.canvas.width, height: sheet.canvas.height, frames, seconds: Math.round((performance.now() - t0) / 1000) };
  } finally {
    chase.focus = null;
    player.input.down.clear();
    chase.setMode(saved.camMode); chase.distance = saved.distance; chase.pitch = saved.pitch;
    day.setClock(saved.clock[0], saved.clock[1], saved.clock[2]); day.running = saved.running;
    wind.override = saved.windOverride; wind.speed = saved.windSpeed; wind.from = saved.windFrom;
    if (weather) { weather.release(); if (saved.weather) weather.forced = saved.weather; weather._strikeIn = saved.strikeIn; }
    player.timeScale = saved.timeScale;
    const b = saved.body;
    try {
      if (b.mode === 'paddle' || b.mode === 'swim') place(game, { mode: 'paddle', x: b.x, z: b.z, heading: b.heading });
      else place(game, { mode: 'walk', x: b.x, z: b.z, heading: b.heading, canoe: b.mode === 'carry' ? 'carry' : null, drop: b.drop });
      await streamIn(game, { x: b.x, z: b.z }, advance);
      chase.snap();
    } catch (e) { console.warn('look board: could not put the player back', e); }
    renderer.setPixelRatio(saved.pixelRatio);
    if (game.saver && saved.saver !== null) game.saver.enabled = saved.saver;
    window.dispatchEvent(new Event('resize')); // main.js puts the canvas, the post chain and the camera back to the window
    if (loop.resume) loop.resume();
  }
}

// The title card away, the outfitter's panel shut, and no teleport in flight (closing the panel starts a trip,
// which teleports the canoe to the landing; the counter can open again once it lands).
async function openGame(game) {
  const { title, outfitter, player } = game;
  if (title.state !== 'game') title.close();
  for (let i = 0; i < 900 && (title.state !== 'game' || player.teleporting); i++) { game.step(STEP, 1); await nextTask(); }
  for (let pass = 0; pass < 2; pass++) {
    game.step(STEP, 3);
    if (outfitter.close) outfitter.close();
    for (let i = 0; i < 900 && player.teleporting; i++) { game.step(STEP, 1); await nextTask(); }
  }
  for (let i = 0; i < 600 && bakesPending() > 0; i++) await new Promise((r) => setTimeout(r, 20)); // the hull's occlusion (loft.js)
}

// Put the body at the spot, as the game's own moves do (player.js teleport, stepOut): afloat, or on foot with the
// canoe set down beside (restHull seats it on the drawn ground) or on the shoulders.
function place(game, s) {
  const p = game.player, st = game.canoe.state;
  p.landing = null; p.ashore = null; p.swim = null; p.balance = 0; p.extraRoll = 0; p.bob = null;
  p.speed = 0; p.yawRate = 0; st.stroke = 0; st.power = 0;
  if (s.mode === 'paddle' || s.mode === 'first') {
    if (p.carry && p.carry.drop) game.canoe.pickUpHull();
    p.mode = 'paddle'; p.carry = null;
    p.x = s.x; p.z = s.z; p.heading = s.heading;
    st.mode = 'paddle';
    p.placeOnWater();
    return;
  }
  const f = { x: Math.cos(s.heading), z: -Math.sin(s.heading) }, r = { x: -f.z, z: f.x };
  const carry = s.canoe === 'carry';
  if (carry && p.carry && p.carry.drop) game.canoe.pickUpHull();
  p.mode = carry ? 'carry' : 'walk';
  p.x = s.x; p.z = s.z; p.heading = s.heading;
  const [cr, cf] = Array.isArray(s.canoe) ? s.canoe : [1.6, 0];
  const drop = carry ? null : s.drop || { x: s.x + r.x * cr + f.x * cf, z: s.z + r.z * cr + f.z * cf, heading: s.heading };
  p.carry = { trail: null, drop, hitCooldown: 0, from: carry ? { x: s.x, z: s.z } : null, choice: false };
  if (drop) p.restHull(drop.x, drop.z, drop.heading);
  p.placeOnGround();
}

// Step until the fine tiles round the spot (the 5 x 5 the player streams) and the far tiles are in and installed.
async function streamIn(game, s, advance) {
  const t = game.tiles, w = game.world;
  let asked = false;
  t.ensure(s.x, s.z, 200).then(() => { asked = true; });
  const settled = () => {
    if (!asked || t.pending.length || t.queue.length) return false;
    const [tx, ty] = w.tileOf(s.x, s.z);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx, y = ty + dy;
      if (x < 0 || y < 0 || x >= w.ntx || y >= w.nty) continue;
      const e = t.tiles.get(t.key(x, y));
      if (!e || e.state !== 'ready') return false;
    }
    for (const e of t.farTiles.values()) if (e.state !== 'ready') return false;
    return true;
  };
  for (let i = 0; i < 3000 && !settled(); i++) { advance(1); await nextTask(); }
  advance(4); // the vegetation's LOD and the water's atlas catch up
}

// A fixed camera on the body: yaw from straight ahead, dist out, height above the ground (or water) under the
// camera, looking at the body's middle or at the point `ahead` metres in front of it.
function aim(game, v) {
  const { player, chase, camera, world } = game;
  const under = (x, z) => Math.max(player.groundAt(x, z), world.levelAt(x, z));
  const a = player.heading + v.yaw, x = player.x + Math.cos(a) * v.dist, z = player.z - Math.sin(a) * v.dist;
  const f = player.forward, ah = v.ahead || 0, lx = player.x + f.x * ah, lz = player.z + f.z * ah;
  const T = game.THREE;
  chase.focus = { pos: new T.Vector3(x, under(x, z) + v.height, z), look: new T.Vector3(lx, under(lx, lz) + (ah ? 0.5 : 0.9), lz) };
  chase.first = true;
  if (v.fov) { camera.fov = v.fov; camera.updateProjectionMatrix(); }
}

function stamp() {
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// The sheet: a title band, a header with the sets, a label column with the spots, and the frames in a grid.
function makeSheet(spots, sets, cw, ch, o) {
  const pad = 6, labelW = 230, titleH = 58, headH = 34;
  const canvas = document.createElement('canvas');
  canvas.width = labelW + sets.length * (cw + pad) + pad;
  canvas.height = titleH + headH + spots.length * (ch + pad) + pad;
  const c = canvas.getContext('2d');
  c.fillStyle = '#15181b'; c.fillRect(0, 0, canvas.width, canvas.height);
  const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const wrap = (text, x, y, maxW, lh, maxLines) => {
    const words = text.split(' '); let line = '', n = 0;
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (c.measureText(t).width > maxW && line) { c.fillText(line, x, y + n * lh); line = w; if (++n >= maxLines) return; } else line = t;
    }
    if (line) c.fillText(line, x, y + n * lh);
  };
  c.textBaseline = 'top';
  sets.forEach((s, k) => {
    c.fillStyle = '#e8e4da'; c.font = font(600, 16);
    c.fillText(s.label, labelW + k * (cw + pad) + 4, titleH + 8);
  });
  spots.forEach((s, i) => {
    const y = titleH + headH + i * (ch + pad);
    c.fillStyle = '#e8e4da'; c.font = font(650, 17);
    wrap(s.name, 14, y + 10, labelW - 24, 21, 2);
    c.fillStyle = '#9aa0a6'; c.font = font(400, 13);
    if (s.note) wrap(s.note, 14, y + 56, labelW - 24, 17, 8);
    c.fillStyle = '#6c7278'; c.font = font(400, 12);
    c.fillText(`${s.mode} · ${s.x.toFixed(0)}, ${s.z.toFixed(0)}`, 14, y + ch - 18);
  });
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  return {
    canvas,
    put(i, k, src) { c.drawImage(src, labelW + k * (cw + pad), titleH + headH + i * (ch + pad) + pad / 2, cw, ch); },
    finish(frames, seconds) {
      c.fillStyle = '#f2efe6'; c.font = font(700, 22);
      c.fillText('BWCA Canoe · look board', 14, 12);
      c.fillStyle = '#9aa0a6'; c.font = font(400, 14);
      const d = new Date();
      c.fillText(`${d.toLocaleString()} · ${location.host}${o.label ? ` · ${o.label}` : ''} · frames ${o.width}×${o.height} · ${frames.length} frames in ${seconds} s`, 14, 38);
      return canvas.toDataURL(o.type, 0.92);
    },
  };
}
