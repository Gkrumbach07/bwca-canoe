// Stream L's section of the Round 1 --slice rig (docs/build/campaign-design.md Part 4, "The first playable slice,
// exactly"): the steps whose assertion the layer owns, for the join to assemble with B's, P's and T's.
//
//   import { section, HELPERS } from './slice/c1-layer.mjs'
//   await page.evaluate(HELPERS)                      once per page (window.__L: step, settle, standAt, face, aim, target)
//   for (const s of section.steps) await s.run({ page, result, shots })   (result(name, pass, more); shots: a dir or null)
//
//   step 3 (L part)   NB01 at C837: the place and its trigger. The stone reads "Stump" before night one and has no verb;
//                     after it, "A white stone on a stump" and E Look (real key); NB01 open there (B's reader calls
//                     layer.readHere; here the rig calls it as B will) marks it read here, once
//   step 5 (L part)   the crews' landing: the last 200 m paddled (W and A/D held, real keys), E steps ashore; the dot on
//                     the crib, the tree, the grade: E Look each (real key); landing.crib/blaze/pink/grade, crews.seen,
//                     the Walt lines 20:11.2.w2–w5; the grade's clearing holds no tree (World.load's exclusions)
//   step 8 (L part)   a co-op guest's layer: the props stand, the stones read "Stump", no verb (needs a guest page)
//
// The join's own steps (the ring before the landing, the lead closing, "64" on the back cover) are B's, P's and T's.

export const HELPERS = () => {
  const g = window.__game, L = window.__L = {};
  L.step = (frames = 30, dt = 1 / 30) => { for (let left = frames; left > 0; left -= 200) g.step(dt, Math.min(200, left)); };
  L.wait = (ms) => new Promise((r) => setTimeout(r, ms));
  L.settle = async (ms = 60000) => { const t0 = performance.now(); while (g.player.teleporting && performance.now() - t0 < ms) { L.step(10); await L.wait(30); } L.step(20); };
  L.look = (yaw, pitch = 0.05) => { const ch = g.chase; if (g.player.mode === 'paddle') { g.player.heading = yaw; g.player.yawRate = 0; } if (ch) { ch.viewYaw = yaw; ch.forwardYaw = yaw; ch.viewPitch = pitch; if (ch.snap) ch.snap(); } };
  L.standAt = (x, z, heading = 0) => {
    const p = g.player;
    if (!p.carry || !p.carry.drop) p.carry = { trail: null, drop: { x: p.x, z: p.z, heading: p.heading }, hitCooldown: 0, from: null, choice: false };
    p.landing = null; p.ashore = null; p.swim = null; p.speed = 0; p.yawRate = 0; p.mode = 'walk';
    p.x = x; p.z = z; p.heading = heading;
    p.foot = { y: p.groundAt(x, z), vy: 0, air: false, t: 0, land: 0, near: null };
    p.placeOnGround(); L.look(heading);
  };
  L.yawTo = (q) => { const p = g.player; return Math.atan2(-(q.z - p.z), q.x - p.x); };
  // stand d m from q on the line from where the player is, facing it, the view pitched at height y
  L.face = (q, d, y) => {
    const p = g.player, a = Math.atan2(p.z - q.z, p.x - q.x), x = q.x + Math.cos(a) * d, z = q.z + Math.sin(a) * d;
    const yaw = Math.atan2(-(q.z - z), q.x - x); L.standAt(x, z, yaw); L.step(4); L.aim(q, y);
  };
  L.aim = (q, y) => { const p = g.player, cam = g.camera; for (let k = 0; k < 4; k++) { const d = Math.hypot(q.x - cam.position.x, q.z - cam.position.z), yaw = L.yawTo(q); g.chase.viewYaw = yaw; g.chase.forwardYaw = yaw; p.heading = yaw; if (y != null) g.chase.viewPitch = Math.atan2(y - cam.position.y, d); L.step(2); } };
  L.target = () => { const t = g.pointer && g.pointer.target; return t ? { kind: t.kind, label: t.label || '', verb: t.e ? t.e.verb : null, ref: t.ref || null } : null; };
  L.layer = () => g.storyLayer;
  L.prop = (id) => { const q = g.storyLayer.prop(id); const b = g.storyLayer.builtList().find((r) => r.prop === id); return q ? { x: q.prop.x, z: q.prop.z, y: b ? b.y : g.tiles.groundAt(q.prop.x, q.prop.z) } : null; };
  L.near = async (x, z) => { await g.player.teleport(x, z); await L.settle(); for (let k = 0; k < 40 && !g.tiles.readyAt(x, z); k++) { L.step(5); await L.wait(50); } g.storyLayer.poll(); L.step(5); g.storyLayer.poll(); };
};

// press a key in the page, then let the game read it (the frame loop is stepped by hand in the rigs)
async function press(page, key) { await page.keyboard.press(key); await page.evaluate(() => window.__L.step(3)); }
async function shot(page, shots, name) { if (shots) { try { await page.screenshot({ path: `${shots}/${name}.png` }); } catch { /* the shot is a nicety */ } } }

export const section = {
  stream: 'L',
  steps: [
    {
      step: 3, name: 'NB01 at C837: the stone on the stump, and "he was here"',
      async run({ page, result, shots }) {
        const W = await page.evaluate(() => { const q = window.__game.storyLayer.place('ws.c837'); return q && { x: q.x, z: q.z, lake: q.lake }; });
        if (!W) { result('slice 3 (L): C837 is a place', false, {}); return; }
        await page.evaluate(async (W) => { await window.__L.near(W.x, W.z); }, W);
        const before = await page.evaluate(async () => {
          const L = window.__L, g = window.__game, q = L.prop('ws.c837.stump');
          L.face(q, 1.7, q.y + 0.35); L.step(6);
          return { t: L.target(), found: g.story.has('nb.found'), built: g.storyLayer.builtList().filter((b) => b.place === 'ws.c837').map((b) => b.prop) };
        });
        await shot(page, shots, 'L3-stump');
        await press(page, 'e'); // (E on a thing with no verb does nothing)
        const noLook = await page.evaluate(() => window.__game.story.has('stone.c837'));
        result('slice 3 (L): before night one the stone on C837\'s stump reads "Stump", no verb, E does nothing', before.t && before.t.label === 'Stump' && !before.t.verb && !before.found && !noLook && before.built.includes('ws.c837.stone'), before);
        // night one (B's cutscene finds it; the rig stands in for it through walt.find, as chk-coop does)
        await page.evaluate(async () => { const g = window.__game; g.walt.find({ key: 2, lake: 'Lake One' }); await window.__L.wait(200); window.__L.step(6); });
        const after = await page.evaluate(() => { const L = window.__L, q = L.prop('ws.c837.stump'); L.face(q, 1.7, q.y + 0.35); L.step(6); return L.target(); });
        await press(page, 'e');
        const looked = await page.evaluate(() => { const s = window.__game.story; return { stone: s.has('stone.c837'), walt: s.walt().includes('20:2.4.w2') }; });
        await shot(page, shots, 'L3-stone');
        result('slice 3 (L): after night one "A white stone on a stump", E Look (real key): stone.c837 and 20 §2.4\'s Walt line', after && after.label === 'A white stone on a stump' && after.verb === 'Look' && looked.stone && looked.walt, { after, looked });
        const here = await page.evaluate(() => { const g = window.__game, pl = g.storyLayer.readHere('NB01'); return { at: pl && pl.id, here: g.story.nbHas('here', 'NB01'), again: !!g.storyLayer.readHere('NB01') }; });
        result('slice 3 (L): NB01 open at C837 is read where he wrote it (story.readHere: he was here)', here.at === 'ws.c837' && here.here, here);
      },
    },
    {
      step: 5, name: 'The crews\' landing: the last 200 m paddled, the crib, the tree, the grade',
      async run({ page, result, shots }) {
        const C = await page.evaluate(() => { const q = window.__game.storyLayer.place('crews.landing'); return q && { x: q.x, z: q.z, n: q.n }; });
        if (!C) { result('slice 5 (L): the crews\' landing is a place', false, {}); return; }
        // out on the water ~200 m off, then paddle in by the keys
        const start = await page.evaluate(async (C) => {
          const g = window.__game, L = window.__L;
          await g.player.teleport(C.x - C.n[0] * 230, C.z - C.n[1] * 230); await L.settle();
          return { mode: g.player.mode, d: Math.round(Math.hypot(g.player.x - C.x, g.player.z - C.z)) };
        }, C);
        const aimAt = { x: C.x - C.n[0] * 3, z: C.z - C.n[1] * 3 };
        await page.keyboard.down('w');
        let held = null, d = start.d, turned = 0;
        for (let k = 0; k < 400 && d > 7; k++) {
          const s = await page.evaluate((q) => { const g = window.__game, p = g.player, want = Math.atan2(-(q.z - p.z), q.x - p.x); let e = want - p.heading; while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return { e, d: Math.hypot(q.x - p.x, q.z - p.z), mode: p.mode }; }, aimAt);
          d = s.d;
          const want = Math.abs(s.e) < 0.08 ? null : s.e > 0 ? 'a' : 'd'; // (a turns the heading up: player.js forward = (cos h, -sin h))
          if (want !== held) { if (held) await page.keyboard.up(held); if (want) { await page.keyboard.down(want); turned++; } held = want; }
          await page.evaluate(() => window.__L.step(8));
        }
        if (held) await page.keyboard.up(held);
        await page.keyboard.up('w');
        await page.evaluate(() => window.__L.step(30));
        await press(page, 'e');
        await page.evaluate(() => window.__L.step(120));
        const landed = await page.evaluate((C) => { const p = window.__game.player; return { mode: p.mode, onFoot: p.onFoot, d: Math.round(Math.hypot(p.x - C.x, p.z - C.z)) }; }, C);
        result('slice 5 (L): the last 200 m paddled (W, A/D held) and E steps ashore at the crews\' landing', start.mode === 'paddle' && start.d > 150 && landed.onFoot && landed.d < 30, { start, landed, turned, left: Math.round(d) });
        if (!landed.onFoot) await page.evaluate((C) => window.__L.standAt(C.x + C.n[0] * 2, C.z + C.n[1] * 2), C); // (so the rest is still tried)
        await page.evaluate(() => { window.__game.storyLayer.poll(); window.__L.step(4); });
        const stood = await page.evaluate(() => window.__game.story.has('crews.stood'));
        // the three by the dot
        const looks = {};
        for (const [id, dy, dist] of [['crews.crib', 0.45, 3.2], ['crews.pine', 1.35, 1.6], ['crews.grade', 0.35, 1.8]]) {
          const t = await page.evaluate(([id, dy, dist]) => { const L = window.__L, q = L.prop(id); L.face(q, dist, q.y + dy); L.step(6); return L.target(); }, [id, dy, dist]);
          await shot(page, shots, `L5-${id}`);
          await press(page, 'e');
          looks[id] = t;
        }
        const got = await page.evaluate(() => { const s = window.__game.story; return { f: ['landing.crib', 'landing.blaze', 'landing.pink', 'landing.grade', 'crews.seen', 'key.L1C'].filter((k) => s.has(k)), w: ['20:11.2.w2', '20:11.2.w3', '20:11.2.w4', '20:11.2.w5'].filter((k) => s.walt().includes(k)) }; });
        result('slice 5 (L): standing there sets crews.stood; the dot names Crib / Blaze · Pink flagging / Grade, E Look each (real key)', stood && looks['crews.crib'] && looks['crews.crib'].label === 'Crib' && looks['crews.pine'] && /^Blaze · Pink flagging$|^Old blaze/.test(looks['crews.pine'].label) && looks['crews.grade'] && looks['crews.grade'].label === 'Grade', { stood, looks });
        result('slice 5 (L): the crib, the tree, the grade give their facts (landing.*, crews.seen, lock 1 key C) and 20 §11.2\'s Walt lines', got.f.length === 6 && got.w.length === 4, got);
        // World.load's exclusions: no tree on the pine's pad or the grade's first 140 m
        const trees = await page.evaluate(() => {
          const g = window.__game, pl = g.storyLayer.place('crews.landing'), ln = pl.lanes[0], pine = g.storyLayer.prop('crews.pine').prop, out = { pine: 0, lane: 0, samples: 0 };
          const trunks = (x, z, r) => (g.tiles.treesNear(x, z, r) || []).filter((t) => Math.hypot((t.x ?? t[0]) - x, (t.z ?? t[1]) - z) < r).length;
          out.pine = trunks(pine.x, pine.z, 2.0);
          for (let s = 10; s <= 140; s += 10) { const x = ln.a[0] + ln.dir[0] * s, z = ln.a[1] + ln.dir[1] * s; if (!g.tiles.readyAt(x, z)) continue; out.samples++; out.lane += trunks(x, z, 1.2); }
          return out;
        });
        result('slice 5 (L): the clearings hold: no trunk on the pine\'s pad, none on the grade\'s line', trees.pine === 0 && trees.lane === 0 && trees.samples >= 3, trees);
      },
    },
    {
      step: 8, name: 'A co-op guest: the stones read "Stump", no verb',
      guest: true,
      async run({ page, result }) {
        const r = await page.evaluate(async () => {
          const g = window.__game, l = g.storyLayer; if (!l) return { none: true };
          const q = l.place('ws.c837'); await window.__L.near(q.x, q.z);
          return { mode: g.story.mode, guest: l.state().guest, name: l.dotName('ws.c837.stump'), verbs: l.verbs('ws.c837.stump').length, built: l.builtList().filter((b) => b.place === 'ws.c837').length, here: !!l.readHere('NB01') };
        });
        result('slice 8 (L): a guest\'s layer: the stone stands and reads "Stump", no verb, no read-here', r.mode === 'mirror' && r.guest && r.name === 'Stump' && r.verbs === 0 && r.built >= 1 && !r.here, r);
      },
    },
  ],
};
