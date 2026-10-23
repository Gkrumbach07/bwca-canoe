// The trailer's capture harness (docs/roadmap.md, phase 4): runs in the game's page, renders each shot of shots.js
// frame by frame at a fixed size and a fixed step, and sends every frame to frame-server.mjs (over a WebSocket),
// which writes numbered PNGs that encode.mjs turns into the video. Nothing here is part of the game: it drives the game
// through the debug handle (window.__game) the way the look board does (src/lookboard.js), with a camera of its own.
//
// The whole run, from a checkout with public/data and node_modules in place:
//
//   npx vite --port 5210                                                  # the game (the browser pane opens it)
//   node scripts/trailer/frame-server.mjs --out /tmp/trailer/frames --port 5290
//   ... in the page, as below: T.start(null), about three minutes for the 2 250 frames on an M4 Pro ...
//   node scripts/trailer/encode.mjs --frames /tmp/trailer/frames --out /tmp/trailer/trailer.mp4 --web /tmp/trailer/trailer-720p.mp4
//
// In the page (the frame server serves this folder, so editing a shot never makes Vite reload the game):
//
//   const S = 'http://127.0.0.1:5290';
//   const { install } = await import(`${S}/js/capture.js?v=${Date.now()}`);
//   const { SHOTS } = await import(`${S}/js/shots.js?v=${Date.now()}`);
//   const T = window.__trailer = install(window.__game, { server: S, shots: SHOTS });
//   await T.open();                       // title away, outfitter shut, loop held, 1920 x 1080, HUD hidden, camera ours
//   T.start('moose');                     // records one shot in the background; T.status says how far it got
//   T.start('moose', { only: [0, .5, 1] }); // a preview: those moments only, on one small contact sheet
//   T.start(null);                        // every shot in order
//   T.close();                            // everything put back
//
// Determinism: the hidden browser pane runs no animation frames, so the harness holds the game's own loop and
// steps the simulation itself, 1/30 s a frame, drawing once per frame and reading the drawing buffer right after the
// draw (gl.readPixels, before the task ends and the buffer is swapped); the raw pixels go to the frame server, which
// makes the PNGs while the next frames render. (canvas.toBlob's PNG took seven seconds a frame in the hidden tab.)
// The game's sound is not captured: it is Web Audio synthesized against the audio clock in real time, which a stepped
// capture running at a third of real time cannot follow.
//
// A shot (shots.js) is a plain object:
//   name, seconds                         its id (a folder name) and its length
//   clock: { doy, hours, to }             the date and the hour (and the hour at the end: a time-lapse); 2026
//   weather, wind, from                   a weather.js state held for the shot ('clear', 'fog', 'storm', 'snow', ...),
//                                         the wind (m/s, held) and the bearing it comes from
//   body: { mode, x, z, heading, canoe }  where the paddler or the walker is (as the look board's spots)
//   hold: 'KeyW'                          a key held through the warm-up and the shot (paddle or walk on)
//   warm                                  frames stepped before the first recorded one (streaming, animals settling)
//   scout(T)                              the camera pose while setting up (animals come in front of the camera)
//   setup(T)                              after the body is placed and the tiles are in: summon animals, find marks
//   camera(t, T, dt)                      t 0..1 across the shot: { pos: [x, y, z], look: [x, y, z], fov, clear }
//   frame(T, i, t)                        before each recorded frame (lightning, a turn of the bow, the clock)
//   overlay(c, t, T)                      draws on a 2D canvas over the frame (the title cards)
//   hideCanoe                             the canoe and the paddler out of the picture
export const FPS = 30;
export const STEP = 1 / FPS;
const nextTask = () => new Promise((r) => setTimeout(r, 0));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
// mostly constant speed, eased a little at the ends so a move neither starts nor stops with a jerk
export const glide = (t) => 0.75 * t + 0.25 * smooth(t);
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function install(game, opts = {}) {
  const o = { width: 1920, height: 1080, server: 'http://127.0.0.1:5290', inflight: 4, shots: [], ...opts };
  const { renderer, camera, post, player, chase, day, wind, weather, canoe, world, tiles, THREE } = game;
  const T = { game, o, THREE, status: { state: 'idle' }, camFn: null, marks: {}, lerp, smooth, glide, mix3 };
  let saved = null, comp = null;

  // ---- reading the world --------------------------------------------------------------------------------------
  T.groundAt = (x, z) => (tiles ? tiles.groundAt(x, z) : world.heightAt(x, z));
  T.levelAt = (x, z) => world.levelAt(x, z);
  T.under = (x, z) => Math.max(T.groundAt(x, z), world.shoreAt(x, z) < 0.5 ? world.levelAt(x, z) : -Infinity);
  T.shoreAt = (x, z) => world.shoreAt(x, z);
  // a point `d` metres from (x, z) along bearing h (x east, z south; forward = (cos h, -sin h), as the player's)
  T.along = (x, z, h, d) => [x + Math.cos(h) * d, z - Math.sin(h) * d];
  T.log = (msg) => { console.log(`trailer: ${msg}`); fetch(`${o.server}/log`, { method: 'POST', body: String(msg) }).catch(() => {}); };

  // ---- the camera ---------------------------------------------------------------------------------------------
  // The chase camera's update is swapped for ours while a shot runs: camFn gives the pose each frame, after the
  // body has moved (the update runs inside the game's frame, after the player and the canoe).
  const ourUpdate = (dt, p) => {
    const c = T.camFn(dt);
    let [x, y, z] = c.pos;
    const clear = c.clear ?? 0.6; // never inside the ground or under the water
    y = Math.max(y, T.under(x, z) + clear);
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(c.look[0], c.look[1], c.look[2]);
    if (c.fov && Math.abs(camera.fov - c.fov) > 1e-4) { camera.fov = c.fov; camera.updateProjectionMatrix(); }
    if (c.near && camera.near !== c.near) { camera.near = c.near; camera.updateProjectionMatrix(); }
    chase.pos.copy(camera.position); chase.look.set(c.look[0], c.look[1], c.look[2]);
    chase.lastHeading = p.heading;
    // on foot the body faces chase.forwardYaw and W walks along it (player.js steerOnFoot, with mouse look)
    chase.footLook = p.mode === 'walk' || p.mode === 'carry';
    chase.forwardYaw = c.forwardYaw ?? p.heading;
  };

  // ---- opening and closing --------------------------------------------------------------------------------------
  T.open = async () => {
    if (saved) return 'open already';
    saved = {
      pixelRatio: renderer.getPixelRatio(), fov: camera.fov, near: camera.near, aspect: camera.aspect,
      clock: [day.year, day.doy, day.hours], running: day.running, windOverride: wind.override, windSpeed: wind.speed, windFrom: wind.from,
      weather: weather.forced, strikeIn: weather._strikeIn, saver: game.saver ? game.saver.enabled : null, timeScale: player.timeScale,
      quality: game.settings.get('quality'),
    };
    renderer.setAnimationLoop(null); // the game's own loop held: every frame is ours
    const { title, outfitter } = game;
    if (title.state !== 'game') title.close();
    for (let i = 0; i < 900 && (title.state !== 'game' || player.teleporting); i++) { game.step(STEP, 1); await nextTask(); }
    for (let pass = 0; pass < 2; pass++) {
      game.step(STEP, 3);
      if (outfitter.close) outfitter.close();
      for (let i = 0; i < 900 && player.teleporting; i++) { game.step(STEP, 1); await nextTask(); }
    }
    if (game.saver) game.saver.enabled = false; // the shots are not the trip
    if (game.settings.get('quality') !== 'ultra') game.settings.set('quality', 'ultra');
    // the HUD and every card hidden: only the scene in the picture (the frames are read from the WebGL canvas,
    // which holds no HUD anyway, but the live view should match)
    const css = document.createElement('style');
    css.id = 'trailer-css';
    css.textContent = '#air, #scrim, #map, #journal, #outfitter, #evac, #shell, #loading { display: none !important; }';
    document.head.appendChild(css);
    T.resize(o.width, o.height);
    chase.setMode('third');
    chase.update = ourUpdate;
    T.camFn = () => ({ pos: [player.x - Math.cos(player.heading) * 8, player.altitude + 3, player.z + Math.sin(player.heading) * 8], look: [player.x, player.altitude + 1, player.z] });
    day.running = false; player.timeScale = 1;
    return 'open';
  };

  T.resize = (w, h) => {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    post.resize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  };

  T.close = () => {
    if (!saved) return 'not open';
    delete chase.update; // back to ChaseCamera.prototype.update
    T.disconnect();
    T.camFn = null;
    const css = document.getElementById('trailer-css'); if (css) css.remove();
    canoe.rig.visible = true;
    player.input.down.clear();
    camera.fov = saved.fov; camera.near = saved.near; camera.updateProjectionMatrix();
    day.setClock(...saved.clock); day.running = saved.running;
    wind.override = saved.windOverride; wind.speed = saved.windSpeed; wind.from = saved.windFrom;
    weather.release(); if (saved.weather) weather.forced = saved.weather; weather._strikeIn = saved.strikeIn;
    player.timeScale = saved.timeScale;
    if (saved.quality !== 'ultra') game.settings.set('quality', saved.quality);
    renderer.setPixelRatio(saved.pixelRatio);
    if (game.saver && saved.saver !== null) game.saver.enabled = saved.saver;
    chase.setMode('third'); chase.snap();
    window.dispatchEvent(new Event('resize')); // main.js puts the canvas, the post chain and the camera back
    saved = null;
    renderer.setAnimationLoop(null);
    return 'closed (reload the page for the game loop)';
  };

  // ---- placing the body (as the look board does: src/lookboard.js place and streamIn) ---------------------------
  T.place = (s) => {
    const p = player, st = canoe.state;
    p.landing = null; p.ashore = null; p.swim = null; p.balance = 0; p.extraRoll = 0; p.bob = null;
    p.speed = 0; p.yawRate = 0; st.stroke = 0; st.power = 0;
    if (s.mode === 'paddle') {
      if (p.carry && p.carry.drop) canoe.pickUpHull();
      p.mode = 'paddle'; p.carry = null;
      p.x = s.x; p.z = s.z; p.heading = s.heading;
      st.mode = 'paddle';
      p.placeOnWater();
      return;
    }
    const f = { x: Math.cos(s.heading), z: -Math.sin(s.heading) }, r = { x: -f.z, z: f.x };
    const carry = s.canoe === 'carry';
    if (carry && p.carry && p.carry.drop) canoe.pickUpHull();
    p.mode = carry ? 'carry' : 'walk';
    p.x = s.x; p.z = s.z; p.heading = s.heading;
    const [cr, cf] = Array.isArray(s.canoe) ? s.canoe : [1.6, 0];
    const drop = carry ? null : { x: s.x + r.x * cr + f.x * cf, z: s.z + r.z * cr + f.z * cf, heading: s.canoeHeading ?? s.heading };
    p.carry = { trail: null, drop, hitCooldown: 0, from: carry ? { x: s.x, z: s.z } : null, choice: false };
    if (drop) p.restHull(drop.x, drop.z, drop.heading);
    p.placeOnGround();
  };

  // step (the simulation only) until the fine tiles round (x, z) and the far tiles are in and installed
  T.streamIn = async (x, z) => {
    let asked = false;
    tiles.ensure(x, z, 200).then(() => { asked = true; });
    const settled = () => {
      if (!asked || tiles.pending.length || tiles.queue.length) return false;
      const [tx, ty] = world.tileOf(x, z);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const X = tx + dx, Y = ty + dy;
        if (X < 0 || Y < 0 || X >= world.ntx || Y >= world.nty) continue;
        const e = tiles.tiles.get(tiles.key(X, Y));
        if (!e || e.state !== 'ready') return false;
      }
      for (const e of tiles.farTiles.values()) if (e.state !== 'ready') return false;
      return true;
    };
    let i = 0;
    for (; i < 4000 && !settled(); i++) { game.advance(STEP, 1); if (i % 4 === 0) await nextTask(); }
    game.advance(STEP, 4);
    return i;
  };

  // the date, the hour, the weather and the wind of a shot, held
  T.conditions = (s) => {
    const c = s.clock || { doy: 196, hours: 12 };
    day.running = false;
    day.setClock(c.year || 2026, c.doy, c.hours);
    if (s.weather) T.setWeather(s.weather); else weather.release();
    weather._strikeIn = 1e9; weather._strikes.length = 0; // lightning only where a shot asks for it
    wind.override = s.wind ?? 1.5; wind.speed = wind.override;
    if (Number.isFinite(s.from)) wind.from = s.from;
  };
  T.setWeather = (w, blend = 0) => {
    if (w === 'snow-heavy') { weather.set('rain', { blend }); weather.forced.snow = true; return; }
    weather.set(w, { blend });
  };
  T.hours = (t, s) => { const c = s.clock; if (c && Number.isFinite(c.to)) day.setClock(c.year || 2026, c.doy, lerp(c.hours, c.to, t)); };

  // ---- the frames ---------------------------------------------------------------------------------------------
  const pending = new Set();
  let failures = 0;
  const track = async (p) => {
    pending.add(p); p.finally(() => pending.delete(p));
    while (pending.size >= o.inflight) await Promise.race(pending);
  };
  const fail = (e) => { failures++; T.status.error = String(e.message || e); };
  // The frames go over a WebSocket (frame-server.mjs says why not fetch): a text message describing the frame, then
  // its raw pixels; the server answers each with an ack once the PNG is on disk, which is what `inflight` counts.
  let ws = null, wsReady = null, wsSeq = 0;
  const acks = new Map();
  const connect = () => {
    if (wsReady) return wsReady;
    wsReady = new Promise((ok, no) => {
      ws = new WebSocket(`${o.server.replace(/^http/, 'ws')}/ws`);
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => ok(ws);
      ws.onerror = () => no(new Error('frame server: the WebSocket failed'));
      ws.onclose = () => { wsReady = null; for (const a of acks.values()) a.reject(new Error('frame server: the WebSocket closed')); acks.clear(); };
      ws.onmessage = (e) => { let m = null; try { m = JSON.parse(e.data); } catch { return; } const a = acks.get(m.seq); if (a) { acks.delete(m.seq); a.resolve(m); } };
    });
    return wsReady;
  };
  T.disconnect = () => { if (ws) ws.close(); ws = null; wsReady = null; };
  // a frame: the drawing buffer read straight after the draw (bottom row first) or the composed 2D canvas, sent raw;
  // the frame server makes the PNG (toBlob's PNG takes seconds a frame in a hidden tab)
  const send = async (src, shot, i) => {
    await connect();
    const w = o.width, h = o.height, buf = new Uint8Array(w * h * 4);
    let flip = 1;
    if (src === renderer.domElement) { const gl = renderer.getContext(); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); } else { buf.set(src.getContext('2d').getImageData(0, 0, w, h).data); flip = 0; }
    const seq = ++wsSeq;
    const acked = new Promise((resolve, reject) => acks.set(seq, { resolve, reject }));
    ws.send(JSON.stringify({ shot, i, w, h, flip, seq }));
    ws.send(buf);
    await track(acked.then((m) => { if (m.error) throw new Error(`frame ${shot}/${i}: ${m.error}`); }).catch(fail));
  };
  const sendImage = async (src, shot, i, type, q) => {
    await track(new Promise((res) => src.toBlob(res, type, q)).then((blob) => fetch(`${o.server}/frame?shot=${shot}&i=${i}`, { method: 'POST', body: blob })).catch(fail));
  };
  const compose = (shot, t) => {
    if (!comp) { comp = document.createElement('canvas'); comp.width = o.width; comp.height = o.height; }
    const c = comp.getContext('2d', { willReadFrequently: true });
    c.save(); c.drawImage(renderer.domElement, 0, 0, o.width, o.height); c.restore();
    c.save(); shot.overlay(c, t, T); c.restore();
    return comp;
  };

  T.find = (name) => o.shots.find((s) => s.name === name);

  // Scouting: render poses ({ pos, look, fov, label }) as they stand now onto one contact sheet, 960 x 540 each,
  // written as stills-<name>/00000.jpg. steps: frames stepped at each pose first (the vegetation LOD catches up).
  T.stills = async (name, poses, { steps = 3 } = {}) => {
    const sheet = document.createElement('canvas'), cols = poses.length > 1 ? 2 : 1;
    sheet.width = 960 * cols; sheet.height = 540 * Math.ceil(poses.length / cols);
    const c = sheet.getContext('2d');
    for (let k = 0; k < poses.length; k++) {
      T.camFn = () => poses[k];
      game.step(STEP, steps);
      c.drawImage(renderer.domElement, (k % cols) * 960, Math.floor(k / cols) * 540, 960, 540);
      c.fillStyle = '#fff'; c.font = '600 18px system-ui';
      c.fillText(poses[k].label || `${k}`, (k % cols) * 960 + 10, Math.floor(k / cols) * 540 + 26);
    }
    await sendImage(sheet, `stills-${name}`, 0, 'image/jpeg', 0.85);
    while (pending.size) await Promise.race(pending);
    return `${o.server} stills-${name}/00000.jpg`;
  };

  // Record one shot. only: a list of moments (0..1) for a preview sheet instead of the full shot.
  T.run = async (shotOrName, { only = null } = {}) => {
    const shot = typeof shotOrName === 'string' ? T.find(shotOrName) : shotOrName;
    if (!shot) throw new Error(`no shot ${shotOrName}`);
    const t0 = performance.now(), f0 = failures;
    const n = Math.round(shot.seconds * FPS);
    T.status = { state: 'placing', shot: shot.name, frame: 0, frames: n };
    T.marks = {};
    const still = { pos: camera.position.toArray(), look: chase.look.toArray() };
    T.camFn = () => still; // the last shot's camera function must not run on this shot's marks
    player.input.down.clear();
    canoe.rig.visible = !shot.hideCanoe;
    T.conditions(shot);
    T.shot = shot;
    if (shot.body) T.place(shot.body);
    const streamed = await T.streamIn(player.x, player.z);
    T.status.state = 'setup';
    // before setup the camera stands where scout() says (animals are summoned in front of the camera), or at t 0
    T.camFn = (dt) => (shot.scout ? shot.scout(T) : shot.camera(0, T, dt));
    if (shot.body) T.place(shot.body); // again: the canoe drifted while the tiles came in
    if (shot.hold) player.input.down.add(shot.hold);
    game.step(STEP, 2);
    if (shot.setup) { const r = await shot.setup(T); if (r === false) throw new Error(`${shot.name}: setup failed`); }
    // the warm-up from the first pose itself, so the vegetation's LOD and the culling settle round it
    T.camFn = (dt) => shot.camera(0, T, dt);
    T.status.state = 'warming';
    const warm = shot.warm ?? 45;
    for (let i = 0; i < warm; i++) { if (shot.prewarm) shot.prewarm(T, i, warm); game.advance(STEP, 1); if (i % 10 === 0) await nextTask(); }
    game.step(STEP, 1);
    T.status.state = 'recording';
    const want = only ? new Set(only.map((t) => Math.min(n - 1, Math.max(0, Math.round(t * (n - 1)))))) : null;
    let sheet = null;
    if (want) {
      sheet = document.createElement('canvas');
      const cols = want.size > 1 ? 2 : 1, rows = Math.ceil(want.size / cols);
      sheet.width = 960 * cols; sheet.height = 540 * rows;
    }
    let k = 0;
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) : 0;
      T.t = t;
      T.camFn = (dt) => shot.camera(t, T, dt);
      T.hours(t, shot);
      if (shot.frame) shot.frame(T, i, t);
      if (want && !want.has(i)) { game.advance(STEP, 1); if (i % 10 === 0) await nextTask(); continue; }
      game.step(STEP, 1);
      const src = shot.overlay ? compose(shot, t) : renderer.domElement;
      if (want) {
        const c = sheet.getContext('2d'), cols = sheet.width / 960;
        c.drawImage(src, (k % cols) * 960, Math.floor(k / cols) * 540, 960, 540);
        c.fillStyle = '#fff'; c.font = '600 18px system-ui'; c.fillText(`${shot.name} t=${t.toFixed(2)}`, (k % cols) * 960 + 10, Math.floor(k / cols) * 540 + 26);
        k++;
      } else await send(src, shot.name, i);
      T.status.frame = i + 1;
      if (i % 15 === 14) await nextTask();
    }
    if (want) await sendImage(sheet, `preview-${shot.name}`, 0, 'image/jpeg', 0.85);
    while (pending.size) await Promise.race(pending);
    player.input.down.clear();
    T.status = { state: 'done', shot: shot.name, frames: want ? want.size : n, streamed, seconds: Math.round((performance.now() - t0) / 100) / 10, failures: failures - f0, marks: T.marks };
    return T.status;
  };

  // run in the background (a JS call from the tools has a time limit); poll T.status
  T.start = (name, opts2 = {}) => {
    const list = name === null ? o.shots.filter((s) => !s.skip) : (Array.isArray(name) ? name : [name]).map((x) => (typeof x === 'string' ? T.find(x) : x));
    T.results = [];
    T.busy = (async () => {
      for (const s of list) {
        try { T.results.push(await T.run(s, opts2)); } catch (e) { T.status = { state: 'error', shot: s && s.name, error: String(e && e.stack || e) }; T.results.push(T.status); }
      }
      T.status = { ...T.status, all: 'finished', results: T.results };
    })();
    return `started ${list.map((s) => s && s.name).join(', ')}`;
  };

  return T;
}
