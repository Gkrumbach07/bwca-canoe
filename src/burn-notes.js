// The burn's name, once (the burns pass, 2026-10-26): the first time in a season you come into a named burn, the blowdown
// or a prescribed burn, one quiet line among the notes ("The Pagami Creek burn, 2011."), never again that season. The
// world shows what the burn is; the line only names it. Burns.js says where they are and how old (by the season's date).
//
// You are in it when the point you stand on, or the water you paddle within SHORE m of its shores, lies well inside its
// perimeter (the edge's weight over IN): a burn is seen from the water as much as walked. An old burn grown back to
// ordinary forest (SEEN by kind) is not named: there is nothing left to see. Remembered in the season (the profile's
// `burns`: the lines said), so a reload repeats nothing and a new season names them again.
//
//   const notes = new BurnNotes({ world, player, hud, profile }); notes.update(dt, shell) each frame (main.js)
import { burnLook, burnLine, KIND } from './burns.js';

const EVERY = 1;     // seconds between two looks
const IN = 0.6;      // the edge's weight that counts as in it
const SHORE = 300;   // metres out from the shore a paddler still sees a burn
const HOLD = 7;      // seconds the line is up
const SEEN = { [KIND.wildfire]: 80, [KIND.prescribed]: 15, [KIND.blowdown]: 60 }; // years an event still shows

export class BurnNotes {
  constructor({ world, player, hud, profile }) {
    this.world = world; this.player = player; this.hud = hud; this.profile = profile;
    this.t = 0; this.look = {}; this.mem = new Set(); this.last = null;
  }
  // the lines said this season
  said() {
    const pr = this.profile, s = pr && pr.s;
    if (!s) return this.mem;
    if (!Array.isArray(s.burns)) s.burns = [];
    return s.burns;
  }
  remember(line) {
    const pr = this.profile, list = this.said();
    if (Array.isArray(list)) { list.push(line); if (pr && pr.write) pr.write(); } else list.add(line);
  }
  // the event the player is in now, or null
  here() {
    const p = this.player, w = this.world;
    if (!p || !w || !Number.isFinite(p.x)) return null;
    const sd = w.shoreAt(p.x, p.z);
    if (!(sd > -SHORE)) return null;
    const L = burnLook(p.x, p.z, this.look, 1);
    if (!L.kind || L.w < IN || L.age > (SEEN[L.kind] || 0)) return null;
    return L.rec;
  }
  update(dt, shell = false) {
    if (shell || (this.t += dt) < EVERY) return;
    this.t = 0;
    const rec = this.here(), line = burnLine(rec);
    this.last = line;
    if (!line) return;
    const said = this.said();
    if (Array.isArray(said) ? said.includes(line) : said.has(line)) return;
    this.remember(line);
    if (this.hud && this.hud.note) this.hud.note(line, HOLD);
  }
  stats() { return { here: this.last, said: [...this.said()] }; }
}
