// A new season's first visit to the home counter (the game-loop round, stream C: docs/build/game-loop-brief.md; the
// canon in docs/story/00-owner-decisions.md "How the player gets the notebook"). Busy season, and the rentals are out.
// A regular staffer, the summer help (not the owner), digs out old gear from the back that never gets rented because
// it's old: a canvas Duluth pack, an old canvas tent, a dented stove, the pot. "If you're not going to need it." It goes
// into your canoe at the dock with one line, your own things packed into the old pack and three days of food in the
// barrel. Then the keeper: the first permit's on them (stream A's permits.grant, when the build has it: it also teaches
// the desk once), and the counter opens. Nobody says whose the gear was.
//
// The only nudge is the staffer's one line as you come in at the door ("Got a minute? Come to the counter."). Walk past
// the counter and paddle off, and nothing breaks: you own less (the old pack and tent never came; your own things wait
// in the outfitters' crate, at any counter). E at the home counter later still opens the talk.
//
// The staffer stands in the store through stream E's npcs.extraAt(ep, { key, name, look, spot, lines }) when the build
// has it; without it the staffer is a voice at the counter's end, "the summer help", in the same conversation panel.
//
//   onboarding.attach({ outfitter, profile, inventory, talk, hud, day, story, npcs, sheets, permits: () => permits })
//   onboarding.state { v, step, done, legacy?, season, nudged }     onboarding.pending(ep?) → bool
//   onboarding.start(ep) → bool (the talk opened)                  onboarding.update(dt) (the door's line, the staffer)
//   onboarding.isWaltItem(id) → bool                              onboarding.give() → [item ids] (the gear, once)
//   onboarding.showCounter(landing): set by main.js (the counter's own show, unwrapped), opened as the talk ends
//
// Saved per season (save.js `bwca-canoe:onboard`): { v: 1, step: 'door' | 'met' | 'gear' | 'done', done, season, nudged,
// permit? }. A season from before this round (its profile started, no document) is { done: true, legacy: true }: it
// keeps its kit and never sees the counter scene.
import { save } from './save.js';
import { OWN_KIT, WALT_IDS } from './items.js';
import { PRI } from './dialogue.js';
import { absDay } from './trip.js';

const NS = 'onboard';
const FOOD_DAYS = 3;                      // the food that comes with the gear: a breakfast and a supper a day
const GIFT = ['walttent', 'pot', 'waltstove', 'fuel']; // into the old pack, with your own things (items.js OWN_KIT)
const STAFF = ['Jess', 'Tanner', 'Marcy', 'Kyle', 'Brooke', 'Dani', 'Cody', 'Shelby', 'Megan', 'Logan', 'Paige', 'Trent']; // (never a story name: the brief's reserved names)
const ROLE = 'the summer help';
const DOOR_LINE = 'Got a minute? Come to the counter.';
const STAFF_LOOK = { age: 'young', shirt: 0x5f7f45, hat: null }; // (E's figure look, as it takes it; ignored without E)

export const blankOnboard = (season = null) => ({ v: 1, step: 'door', done: false, season, nudged: false });

export class Onboarding {
  constructor() {
    this.t = {};
    this.state = null;
    this.extra = null;       // E's staffer handle while one stands in the store
    this.extraEp = null;
    this.showCounter = null; // main.js: the counter's own show(landing, 'counter')
  }
  attach(t = {}) {
    Object.assign(this.t, t);
    const pr = this.t.profile, s = save.read(NS);
    if (s && s.v === 1) this.state = { ...blankOnboard(), ...s };
    else if (pr && pr.started) { this.state = { ...blankOnboard(pr.seasonId), step: 'done', done: true, legacy: true }; this.write(); } // an old season
    else this.state = null; // no season yet: one begins on the title
    if (pr && typeof pr.onChange === 'function') pr.onChange((what) => { if (what === 'season') this.newSeason(pr.seasonId); });
    return this;
  }
  newSeason(id = null) { this.dismiss(); this.state = blankOnboard(id); this.write(); }
  write() { if (this.state) save.write(NS, this.state); }
  get done() { return !this.state || !!this.state.done; }
  get home() { const pr = this.t.profile; return pr && pr.started ? pr.home : null; }
  // the scene still to come at this entry point (home, the season's, not done)
  pending(ep = this.home) { return !!(this.state && !this.state.done && this.home != null && Number(ep) === this.home); }
  isWaltItem(id) { return WALT_IDS.includes(String(id)); }
  permits() { const p = this.t.permits; try { return typeof p === 'function' ? p() : p || null; } catch { return null; } }
  get abs() { const d = this.t.day; return d ? absDay(d.year, d.doy) : 0; }
  staffName(ep) { return STAFF[((Number(ep) || 0) * 7 + 3) % STAFF.length]; }

  // --- the staffer: E's figure, or a voice at the counter's end --------------------------------------------------------
  // where the staffer stands: a step along the counter from the keeper (the layout's keeper spot), else the landing
  spot(ep) {
    const o = this.t.outfitter, L = o && typeof o.layout === 'function' ? o.layout(ep) : null;
    const k = L && (L.keeper || (L.counter && L.counter.at) || L.counter);
    if (k && Number.isFinite(k.x)) {
      const h = Number.isFinite(k.heading) ? k.heading : 0, side = 1.1;
      return { x: k.x + Math.sin(h) * side, z: k.z + Math.cos(h) * side, heading: h, y: Number.isFinite(L.floorY) ? L.floorY : null };
    }
    const l = o && typeof o.landing === 'function' ? o.landing(ep) : null;
    return l ? { x: l.x, z: l.z, heading: 0, y: null } : null;
  }
  stand(ep) {
    if (this.extra && this.extraEp === ep) return this.extra;
    this.dismiss();
    const n = this.t.npcs, sp = this.spot(ep);
    if (!n || typeof n.extraAt !== 'function' || !sp) return null;
    try {
      this.extra = n.extraAt(ep, { key: `staffer:${ep}`, name: this.staffName(ep), role: ROLE, look: STAFF_LOOK, spot: sp, lines: [DOOR_LINE], talk: () => (this.start(ep) ? true : null) }) || null; // (E on them opens the talk, as the counter does)
      this.extraEp = this.extra ? ep : null;
    } catch (e) { console.warn('onboarding: npcs.extraAt', e); this.extra = null; }
    return this.extra;
  }
  dismiss() {
    const h = this.extra; this.extra = null; this.extraEp = null;
    if (h) { try { if (typeof h.remove === 'function') h.remove(); else if (typeof h.dismiss === 'function') h.dismiss(); } catch { /* E's to clear */ } }
  }
  speaker(ep) {
    const h = this.extra && this.extraEp === ep ? this.extra : null;
    if (h && h.speaker && typeof h.speaker.pos === 'function') return h.speaker;
    const sp = this.spot(ep), p = this.t.player;
    const name = h ? this.staffName(ep) : 'The summer help';
    return {
      key: `staffer:${ep}`, person: `staffer:${ep}`, name, role: h ? ROLE : '',
      pos(out) {
        if (!sp) return null;
        const y = Number.isFinite(sp.y) ? sp.y : p && typeof p.groundAt === 'function' ? p.groundAt(sp.x, sp.z) : 0;
        return out.set(sp.x, y + 1.62, sp.z);
      },
    };
  }

  // --- each frame: the line at the door, and the staffer standing while the scene is to come ---------------------------
  update() {
    const o = this.t.outfitter, v = o && o.visit;
    if (!v || !this.pending(v.ep)) { if (this.extra) this.dismiss(); return; }
    this.stand(v.ep);
    const talk = this.t.talk;
    if (v.inside && !this.state.nudged && talk && !talk.talking) {
      this.state.nudged = true; this.write();
      talk.bark(this.speaker(v.ep), DOOR_LINE, { room: v.ep, pri: PRI.hook, secs: 4.5 });
    }
  }

  // --- the talk at the counter -------------------------------------------------------------------------------------------
  // E at the home counter while the scene is to come: the staffer's conversation (its end opens the counter)
  start(ep = this.home) {
    const talk = this.t.talk;
    if (!this.pending(ep) || !talk || typeof talk.open !== 'function') return false;
    const o = this.t.outfitter, landing = o && typeof o.landing === 'function' ? o.landing(ep) : null;
    if (this.state.step === 'door') { this.state.step = 'met'; this.write(); }
    this.stand(ep);
    const sp = this.speaker(ep);
    return talk.open({ speaker: sp, name: sp.name, role: sp.role, room: ep, afloat: true, start: () => (this.state.step === 'gear' ? this.after(ep, landing) : this.hello(ep, landing)), bye: () => (this.state.step === 'gear' ? null : 'Shelf in the back, whenever you want it.') });
  }
  hello(ep, landing) {
    const take = { text: 'I’ll take it.', go: () => { this.give(); return this.after(ep, landing); } };
    const offer = () => ({ say: 'There’s old gear in the back nobody takes. A canvas pack, a canvas tent, a stove with a dent in it. Heavy, but it all works. If you’re not going to need it, it’s yours.',
      choices: [take, { text: 'Why does nobody take it?', go: () => ({ say: 'It’s old. People want the light stuff. It’s been on that shelf since before I started here.', choices: [take, { text: 'Maybe later.', kind: 'bye', go: () => null }] }) }, { text: 'Maybe later.', kind: 'bye', go: () => null }] });
    return { say: 'Starting the season? Bad week for it. Every pack and tent we rent is out on the water till Sunday.',
      choices: [{ text: 'Nothing left at all?', go: offer }, { text: 'I’ll manage.', go: () => ({ say: 'With what? Hang on.', choices: [{ text: '…', go: offer }] }) }] };
  }
  // the gear given: where it is, then the keeper (the first permit's on them) and the counter
  after(ep, landing) {
    const shop = this.t.outfitter && this.t.outfitter.shop;
    const keeper = shop && typeof shop.keeperName === 'function' ? shop.keeperName(ep) : null;
    const P = this.permits(), grant = !!(P && typeof P.grant === 'function');
    const close = () => { this.finish(ep, grant); return { end: true, after: () => this.openCounter(landing) }; };
    const keeperNode = { say: grant ? 'And your first permit’s on me: today, from right here. The map of these lakes too.' : 'And the map of these lakes is on the house.', by: keeper || 'The keeper',
      choices: [{ text: 'Thank you.', go: close }] };
    return { say: 'It’s in your canoe at the dock. I put your own things in the pack, and three days of food in the barrel.', choices: [{ text: 'Thanks.', go: () => keeperNode }] };
  }
  openCounter(landing) { if (landing && typeof this.showCounter === 'function') this.showCounter(landing); }
  // the scene over: the first permit (A), the home sheet (already given with a new season: sheets.giveHome), done
  finish(ep, grant) {
    if (this.state.done) return;
    const P = this.permits(), sh = this.t.sheets, pr = this.t.profile;
    if (grant && P && !this.state.permit) {
      try { const pm = P.grant({ ep, abs: this.abs, kind: 'overnight', from: ep, why: 'first' }); this.state.permit = pm && pm.id != null ? pm.id : true; } catch (e) { console.warn('onboarding: permits.grant', e); }
    }
    try { if (sh && pr && typeof pr.sheets === 'function' && !pr.sheets().length && typeof sh.giveHome === 'function') sh.giveHome(); } catch { /* the sheets are D's */ }
    this.state.step = 'done'; this.state.done = true; this.write();
    this.dismiss();
  }

  // --- the gear ----------------------------------------------------------------------------------------------------------
  // The old pack into the canoe (tied at the dock), the tent, the pot, the stove and a canister in it, your own things
  // out of the crate into it, three days of food in the barrel. Once a season. → the item ids given
  give() {
    const inv = this.t.inventory, st = this.state;
    if (!inv || !st || st.step === 'gear' || st.done) return [];
    const q = { quiet: true }, given = ['waltpack'];
    const pack = inv.addContainer('waltpack', 'canoe', null, q);
    const away = (id) => { try { inv.place(id, 1, { crate: true, all: true, quiet: true }); } catch { /* kept nowhere */ } };
    // biggest first, so the pack takes it all: the tent, your bag and pad, the tackle box, the pot, the rest
    const order = ['walttent', 'sleepingbag', 'pad', 'tacklebox', 'pot', 'clothes', 'tarp', 'waltstove', 'fuel', 'tablets'];
    const crate = inv.crate;
    for (const id of order) {
      if (GIFT.includes(id)) { if (inv.put(pack, id, q)) given.push(id); else { away(id); given.push(id); } continue; }
      if (!OWN_KIT.includes(id) || !crate) continue;
      if (id === 'tacklebox') { const tb = inv.containers.find((c) => c.item === 'tacklebox' && c.where === 'in' && c.in === crate.id); if (tb) inv.nest(tb, pack); continue; }
      const e = crate.grid.find((k) => k.id === id && !k.box);
      const spot = e ? inv.firstFit(pack, id) : null;
      if (spot) inv.move(crate.id, e.uid, pack.id, spot.x, spot.y, spot.rot);
    }
    // the food: a breakfast and a supper a day, in the barrel (else the pack, else kept for you)
    const barrel = inv.containers.find((c) => /^barrel/.test(c.item) && c.where === 'canoe') || inv.containers.find((c) => /^barrel/.test(c.item));
    for (let i = 0; i < FOOD_DAYS; i++) for (const m of ['meal:breakfast', 'meal:supper']) { if (!((barrel && inv.put(barrel, m, q)) || inv.put(pack, m, q))) away(m); }
    given.push(`meal:breakfast×${FOOD_DAYS}`, `meal:supper×${FOOD_DAYS}`);
    inv.emit('containers');
    if (typeof inv.write === 'function') inv.write();
    st.step = 'gear'; this.write();
    const hud = this.t.hud;
    if (hud && typeof hud.note === 'function') hud.note('The old gear is in your canoe at the dock.', 5);
    const s = this.t.story;
    if (s && typeof s.emit === 'function') s.emit('gear:given', { items: given, ep: this.home, abs: this.abs });
    return given;
  }
}

export const onboarding = new Onboarding();
