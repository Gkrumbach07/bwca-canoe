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
//   onboarding.attach({ outfitter, profile, inventory, talk, hud, day, story, npcs, sheets, permits: () => permits, starter })
//   (the start round: the keeper's last word suggests the first night out, starter.js talk, before the counter opens)
//   onboarding.state { v, step, done, legacy?, season, nudged }     onboarding.pending(ep?) → bool
//   onboarding.start(ep) → bool (the talk opened)                  onboarding.update(dt) (the door's line, the staffer)
//   onboarding.isWaltItem(id) → bool                              onboarding.give() → [item ids] (the gear, once)
//   onboarding.showCounter(landing): set by main.js (the counter's own show, unwrapped), opened as the talk ends
//   onboarding.skip() (a co-op guest: never the scene; coop-give.js gives the plain kit instead)
//   packGear(inv, { pack, gift, order }) → [item ids]: a pack into the canoe, the gift and your own things out of the crate
//     into it, three days of food in the barrel (the scene's give, and a co-op guest's starter kit: guestKit(inv))
//
// Saved per season (save.js `bwca-canoe:onboard`): { v: 1, step: 'door' | 'met' | 'gear' | 'done', done, season, nudged,
// permit? }. A season from before this round (its profile started, no document) is { done: true, legacy: true }: it
// keeps its kit and never sees the counter scene.
import { save } from './save.js';
import { OWN_KIT, WALT_IDS, GUEST_KIT, LOAN, FOOD_KINDS, itemDef } from './items.js';
import { PRI } from './dialogue.js';
import { absDay } from './trip.js';
import { STORY_ON } from './story-flag.js';

const NS = 'onboard';
const FOOD_DAYS = 3;                      // the food that comes with the gear: a breakfast and a supper a day
const GIFT = ['walttent', 'pot', 'waltstove', 'fuel']; // into the old pack, with your own things (items.js OWN_KIT)
// r3: the new player's pack also takes the loaner life jacket (items.js LOAN.pack); a guest's kit is as it was
const GIFT_R3 = [...GIFT, ...LOAN.pack];
// biggest first, so the pack takes it all: the tent, your bag and pad, the tackle box, the pot, the rest
const ORDER = ['walttent', 'sleepingbag', 'pad', 'tacklebox', 'pot', 'clothes', 'tarp', 'waltstove', 'fuel', 'tablets'];
const ORDER_R3 = ['walttent', 'sleepingbag', 'pad', 'pfd', 'pot', 'clothes', 'tarp', 'waltstove', 'fuel', 'tablets'];
// A co-op guest's starter kit (the owner's call 2026-11-05: "friends joining get a basic starting pack"): the new
// player's kit after the scene, with the plain things for the story's (Walt's pack, tent and stove stay the host's story)
export const GUEST_PLAIN = { waltpack: 'pack3', walttent: 'aframe', waltstove: 'stove' };
const plain = (id) => GUEST_PLAIN[id] || id;
// The summer help's names (never a story name: the brief's reserved names); npcs.js reserves them so no one else is given
// one. Behind STORY_ON it is Josie at every home (Josie Hautala, docs/story/01-bible.md 4.8: "works at whichever
// outfitter the player picks"); with the flag off, main's per-home names
const STAFF_MAIN = ['Jess', 'Tanner', 'Marcy', 'Kyle', 'Brooke', 'Dani', 'Cody', 'Shelby', 'Megan', 'Logan', 'Paige', 'Trent'];
export const STAFF = STORY_ON ? ['Josie'] : STAFF_MAIN;
const ROLE = 'the summer help';
const DOOR_LINE = 'Got a minute? Come to the counter.';
const STAFF_LOOK = { age: 'young', shirt: 0x5f7f45, hat: null }; // (E's figure look, as it takes it; ignored without E)
// r3 replay: the gear taken and the talk left before the keeper's word, then paddled this far from the landing: the
// keeper's part is done for you (the first permit, the home sheet), so leaving early never costs a ticket
const LEAVE_R = 80;
const AWAY_R = 600;     // m: the canoe and you this far from the home landing (a ride away) and the loaned canoe is taken

// r3 (2026-11-05): path, the main path's steps after the talk (food, leeches, the canoe pushed off), each latched true
// once seen and saved, so a reload brings the same step back; loan, the outfitter's canoe at the dock (none before the
// talk: the hull is hidden and offers nothing). A season from before r3 has neither, and keeps its canoe.
export const blankOnboard = (season = null) => ({ v: 1, step: 'door', done: false, season, nudged: false, path: { food: false, leeches: false, canoe: false }, loan: false });
// the main path's ids (docs/build/r3-contract.md section 3)
export const PATH_IDS = { talk: 'story:onboard:talk', food: 'story:onboard:food', leeches: 'story:onboard:leeches', canoe: 'story:onboard:canoe' };

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
    // (r3: a season saved before the empty-handed start has no path: it keeps its canoe and gets no main-path steps)
    if (s && s.v === 1) this.state = { ...blankOnboard(), ...s, ...(s.path === undefined ? { path: null, loan: true } : {}) };
    else if (pr && pr.started) { this.state = { ...blankOnboard(pr.seasonId), step: 'done', done: true, legacy: true }; this.write(); } // an old season
    else this.state = null; // no season yet: one begins on the title
    if (pr && typeof pr.onChange === 'function') pr.onChange((what) => { if (what === 'season') this.newSeason(pr.seasonId); });
    return this;
  }
  newSeason(id = null) { this.dismiss(); this.state = blankOnboard(id); this.write(); }
  // a co-op guest: the visit is no season of theirs, so no scene and no old gear (kv is frozen: nothing is written)
  skip() { this.dismiss(); this.state = { ...blankOnboard(this.state ? this.state.season : null), step: 'done', done: true, guest: true, path: null, loan: true }; }
  write() { if (this.state) save.write(NS, this.state); }
  get done() { return !this.state || !!this.state.done; }
  // r3: no canoe at the dock yet (a new season before the staff talk gives the loan)
  get noCanoe() { const s = this.state; return !!(s && s.path && !s.loan && !s.guest && !s.legacy); }
  // r3: the main path past the talk is under way (its steps still to do)
  get onPath() { const s = this.state; return !!(s && s.path && !s.guest && !s.legacy && (s.step === 'gear' || s.done) && !(s.path.food && s.path.leeches && s.path.canoe)); }
  get home() { const pr = this.t.profile; return pr && pr.started ? pr.home : null; }
  // the scene still to come at this entry point (home, the season's, not done)
  pending(ep = this.home) { return !!(this.state && !this.state.done && this.home != null && Number(ep) === this.home); }
  isWaltItem(id) { return WALT_IDS.includes(String(id)); }
  permits() { const p = this.t.permits; try { return typeof p === 'function' ? p() : p || null; } catch { return null; } }
  get abs() { const d = this.t.day; return d ? absDay(d.year, d.doy) : 0; }
  staffName(ep) { return STAFF[((Number(ep) || 0) * 7 + 3) % STAFF.length]; } // (Josie at every home under STORY_ON)

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
    this.hull();
    this.tickPath();
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
    return talk.open({ speaker: sp, name: sp.name, role: sp.role, room: ep, afloat: true, start: () => (this.state.step === 'gear' ? this.after(ep, landing) : this.hello(ep, landing)), bye: () => this.bye() });
  }
  // the farewell as you leave the talk (r3 replay: the shelf named only once the offer was heard)
  bye() {
    const s = this.state;
    if (s.step === 'gear') return null;
    return s.heard ? 'Shelf in the back, whenever you want it.' : 'I’m at the counter when you’ve got a minute.';
  }
  hello(ep, landing) {
    // st-t: P1 the counter (docs/story/20-opening.md §1.2) under STORY_ON: the keeper, Josie by the week and the bundle,
    // taken or left on the shelf (cast.js p1, set by main.js's st-t block); with the flag off, as before
    if (STORY_ON && typeof this.p1 === 'function') { let n = null; try { n = this.p1(ep, landing); } catch (e) { console.warn('onboarding: p1', e); } if (n) return n; }
    // /st-t
    const take = { text: 'I’ll take it.', go: () => { this.give(); return this.after(ep, landing); } };
    const offer = () => ({ heard: this.heard(), say: 'There’s old gear in the back nobody takes. A canvas pack, a canvas tent, a stove with a dent in it. Heavy, but it all works. If you’re not going to need it, it’s yours.',
      choices: [take, { text: 'Why does nobody take it?', go: () => ({ say: 'It’s old. People want the light stuff. It’s been on that shelf since before I started here.', choices: [take, { text: 'Maybe later.', kind: 'bye', go: () => null }] }) }, { text: 'Maybe later.', kind: 'bye', go: () => null }] });
    return { say: 'Starting the season? Bad week for it. Every pack and tent we rent is out on the water till Sunday.',
      choices: [{ text: 'Nothing left at all?', go: offer }, { text: 'I’ll manage.', go: () => ({ say: 'With what? Hang on.', choices: [{ text: '…', go: offer }] }) }] };
  }
  heard() { if (!this.state.heard) { this.state.heard = true; this.write(); } return true; }
  // the gear given: where it is, then the keeper (the first permit's on them) and the counter
  after(ep, landing) {
    const shop = this.t.outfitter && this.t.outfitter.shop;
    const keeper = shop && typeof shop.keeperName === 'function' ? shop.keeperName(ep) : null;
    const P = this.permits(), grant = !!(P && typeof P.grant === 'function');
    const close = () => { this.finish(ep, grant); return { end: true, after: () => this.openCounter(landing) }; };
    // (the start round: then the keeper's first night out, the way pencilled on your map and a small job with it: starter.js)
    const st = this.t.starter, by = keeper || 'The keeper';
    const next = st && typeof st.available === 'function' && st.available(ep) ? () => st.talk(ep, close, { by }) : close;
    const keeperNode = { say: grant ? 'And your first permit’s on me: today, from right here. The map of these lakes too.' : 'And the map of these lakes is on the house.', by,
      choices: [{ text: 'Thank you.', go: next }] };
    if (!this.state.path) return { say: 'It’s in your canoe at the dock. I put your own things in the pack, and three days of food in the barrel.', choices: [{ text: 'Thanks.', go: () => keeperNode }] };
    // r3: the loan, then only what is still missing (food, leeches): the shelves, never what it is for
    const pa = this.state.path, miss = [!pa.food ? 'No food in it, though: the provisions shelf is behind you.' : '', !pa.leeches ? 'Leeches are on the tackle shelf.' : ''].filter(Boolean).join(' ');
    if (STORY_ON && this.state.shelf) return { say: `There’s one of our canoes at the dock for you, on loan, with a paddle, a life jacket, a barrel and a rod.${miss ? ` ${miss}` : ''}`, choices: [{ text: 'Thanks.', go: () => keeperNode }] }; // st-t: the bundle left on the shelf
    return { say: `There’s one of our canoes at the dock for you, on loan, with a paddle, a life jacket, a barrel and a rod. The old pack’s in it, your own things packed in.${miss ? ` ${miss}` : ''}`, choices: [{ text: 'Thanks.', go: () => keeperNode }] };
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

  // --- r3: the loan, the hull at the dock, the main path ----------------------------------------------------------------
  // the outfitter's loan into the canoe (items.js LOAN: the barrel, the stringer, the paddle, the rod; the life jacket
  // went in the pack), then anything bought before the talk out of the crate and the stash into the canoe: food to the
  // barrel, bait to a bucket, the rest to the pack; a bucket or barrel bought is put in the canoe. → the item ids lent
  lend(inv) {
    const q = { quiet: true }, out = [];
    for (const id of LOAN.canoe) if (inv.addContainer(id, 'canoe', null, q)) out.push(id);
    for (const id of LOAN.long) if (inv.addLong(id, 'canoe', null, q)) out.push(id);
    for (const c of inv.containers) if (c.where === 'stash' && c.item !== 'crate' && c.item !== 'pockets') { c.where = 'canoe'; c.at = null; }
    const crate = inv.crate, inCanoe = (re) => inv.containers.filter((c) => c.where === 'canoe' && re.test(c.item));
    if (crate) {
      for (const e of [...crate.grid]) {
        const d = !e.box && itemDef(e.id);
        if (!d || OWN_KIT.includes(e.id)) continue;
        const food = FOOD_KINDS.includes(d.kind), bait = d.kind === 'bait';
        if (!food && !bait && d.kind !== 'lure') continue;
        const to = [...(food ? inCanoe(/^barrel/) : []), ...(bait ? inCanoe(/^bucket$/) : []), ...inCanoe(/pack/)];
        for (const c of to) { const sp = inv.firstFit(c, e.id); if (sp) { inv.move(crate.id, e.uid, c.id, sp.x, sp.y, sp.rot); break; } }
      }
    }
    if (typeof inv.refreshUse === 'function') inv.refreshUse();
    inv.emit('containers'); inv.emit('long');
    if (typeof inv.write === 'function') inv.write();
    return out;
  }
  // the hull at the dock is drawn only once there is a canoe (the pointer offers nothing at it: packs.js hullAction)
  hull() {
    const p = this.t.player, h = p && p.canoe && p.canoe.hull;
    if (!h) return;
    const show = !this.noCanoe;
    if (h.visible !== show) h.visible = show;
  }
  // anything to eat anywhere you own it (bought: the step is done), and leeches
  hasFood(inv = this.t.inventory) {
    if (!inv || !inv.containers) return false;
    for (const c of inv.containers) for (const e of c.grid) { const d = !e.box && itemDef(e.id); if (d && FOOD_KINDS.includes(d.kind) && d.kind !== 'fish') return true; }
    return false;
  }
  // r3 replay: meals to cook anywhere you own them (a night out wants a supper and a breakfast: one oatmeal is not the step)
  meals(inv = this.t.inventory) {
    let n = 0;
    if (!inv || !inv.containers) return 0;
    for (const c of inv.containers) for (const e of c.grid) { const d = !e.box && itemDef(e.id); if (d && d.kind === 'meal') n += e.qty || 1; }
    return n;
  }
  // the food step's line: only what is missing (the money when a meal is past it; the second meal when one is bought)
  foodNext(ep, atHome) {
    const where = atHome ? 'at the provisions shelf' : 'at an outfitter’s provisions shelf';
    const pr = this.t.profile, money = Math.floor((pr && pr.money) || 0), shop = this.t.outfitter && this.t.outfitter.shop;
    let cheap = null;
    if (money < 10 && shop && typeof shop.stock === 'function') {
      try { for (const it of shop.stock(ep)) { const d = itemDef(it.id); if (d && d.kind === 'meal' && Number.isFinite(it.price)) cheap = cheap == null ? it.price : Math.min(cheap, it.price); } } catch { cheap = null; }
    }
    if (cheap != null && money < cheap) return `A meal is $${cheap} and you have $${money}: the board has paid work`;
    return this.meals() === 1 ? `One meal so far: buy another ${where}` : `Buy food ${where}`;
  }
  hasLeeches(inv = this.t.inventory) { return !!(inv && typeof inv.count === 'function' && inv.count('leeches', { reachable: false }) > 0); }
  hasBucket(inv = this.t.inventory) { return !!(inv && inv.containers && inv.containers.some((c) => c.item === 'bucket')); }
  // each frame: a step seen done stays done (saved), so eating the food later never brings the step back
  tickPath() {
    const s = this.state, pa = s && s.path;
    if (!pa || s.guest || s.legacy) return;
    let ch = false;
    if (!pa.food && this.meals() >= 2) { pa.food = true; ch = true; }
    if (!pa.leeches && this.hasLeeches()) { pa.leeches = true; ch = true; }
    const p = this.t.player;
    if (!pa.canoe && s.loan && p && p.mode === 'paddle' && !p.teleporting) { pa.canoe = true; ch = true; }
    // (playtest r4-final: a ride from the counter to a trailhead before the canoe was used left "Your canoe is at the
    // dock" up while it lay in the lot: the canoe gone from the home dock by the truck counts as taken)
    const away = s.loan && p && !p.teleporting && this.canoeAway(p);
    if (!pa.canoe && away) { pa.canoe = true; ch = true; }
    if (ch) this.write();
    if (s.step === 'gear' && !s.done && s.loan && p && p.mode === 'paddle' && !p.teleporting) this.leaving(p);
  }
  // the canoe (lying, or with you) far from the home store's landing: taken away by a ride
  canoeAway(p) {
    if ((this.awayT = (this.awayT || 0) + 1) % 20) return false; // (a few times a second is plenty)
    const ep = this.home, o = this.t.outfitter, L = ep != null && o && typeof o.landing === 'function' ? o.landing(ep) : null;
    if (!L) return false;
    const d = p.carry && p.carry.drop ? p.carry.drop : p;
    return Math.hypot(d.x - L.x, d.z - L.z) > AWAY_R && Math.hypot(p.x - L.x, p.z - L.z) > AWAY_R;
  }
  // r3 replay: the talk left after the gear (an Esc at the canoe line) and paddled away: the keeper waves you off with the
  // first permit, as the talk's end would have given it (the starter route can still be asked for at the counter)
  leaving(p) {
    const ep = this.home, o = this.t.outfitter, L = ep != null && o && typeof o.landing === 'function' ? o.landing(ep) : null;
    if (!L || Math.hypot(p.x - L.x, p.z - L.z) < LEAVE_R) return false;
    const P = this.permits(), grant = !!(P && typeof P.grant === 'function');
    const shop = o.shop, keeper = shop && typeof shop.keeperName === 'function' ? shop.keeperName(ep) : null;
    this.finish(ep, grant);
    const hud = this.t.hud;
    if (hud && typeof hud.note === 'function') hud.note(`${keeper || 'The keeper'} waves from the dock: ${grant ? 'your first permit’s on the house' : 'the map’s on the house'}.`, 6);
    return true;
  }
  // The main path for the guide (guide.source('onboarding', …), main.js; docs/build/r3-contract.md section 3): the talk
  // while it is to come, then the food, the leeches and the canoe, each gone once done. From the saved state alone.
  guideSpecs(guide) {
    const s = this.state, ep = this.home;
    if (!s || s.guest || s.legacy || ep == null || !guide) return [];
    const out = [], v = this.t.outfitter && this.t.outfitter.visit, atHome = !!(v && Number(v.ep) === ep);
    if (!s.done) {
      // (r3 replay: the staffer's own name everywhere, in the store or out on the lake: it never turns back into "the summer
      // help" once you step out of the yard)
      const sp = this.speaker(ep), who = this.staffName(ep);
      // (escape-proof: the talk left at any line stays the step; once the gear is given the keeper's word is still to come)
      const gave = s.step === 'gear';
      // (r3 replay: hold, while the talk is under way, other news waits behind its card: the job it gives is said after it)
      out.push({ id: PATH_IDS.talk, kind: 'story', tutorial: true, hold: gave, order: 0, ref: 'onboard', title: `Talk to ${who}`, next: gave ? `Finish talking to ${who} at the counter` : `Talk to ${who} at the counter`,
        target: { kind: 'person', key: sp.key || `staffer:${ep}`, label: who, store: ep, near: 30, pos: guide.speakerPos(sp) } });
    }
    const pa = s.path;
    // (r3 replay: the steps after the talk come once it is over: an Esc after the gear keeps the staffer the step, and no
    // gem or line points at the shelves or the canoe while the keeper's word is still to come)
    if (!pa || !s.done) return out;
    const where = (shelf) => (atHome ? `at the ${shelf}` : `at an outfitter’s ${shelf}`);
    if (!pa.food) out.push({ id: PATH_IDS.food, kind: 'story', tutorial: true, order: 1, ref: 'onboard:food', title: 'Food for the trip', next: this.foodNext(ep, atHome),
      target: { kind: 'place', key: `food:${ep}`, label: 'the provisions shelf', store: ep, near: 30, pos: guide.spot(ep, 'food') } });
    if (!pa.leeches) out.push({ id: PATH_IDS.leeches, kind: 'story', tutorial: true, order: 2, ref: 'onboard:leeches', title: 'Leeches',
      next: `Buy leeches ${where('tackle shelf')}`,
      target: { kind: 'place', key: `tackle:${ep}`, label: 'the tackle shelf', store: ep, near: 30, pos: guide.spot(ep, 'tackle') } });
    if (!pa.canoe) out.push({ id: PATH_IDS.canoe, kind: 'story', tutorial: true, order: 3, ref: 'onboard:canoe', title: 'The loaned canoe', next: 'Your canoe is at the dock',
      target: { kind: 'thing', key: `canoe:${ep}`, label: 'the canoe', store: ep, near: 40, pos: guide.spot(ep, 'canoe') } });
    return out;
  }

  // --- the gear ----------------------------------------------------------------------------------------------------------
  // The old pack into the canoe (tied at the dock), the tent, the pot, the stove and a canister in it, your own things
  // out of the crate into it, three days of food in the barrel. Once a season. → the item ids given
  give() {
    const inv = this.t.inventory, st = this.state;
    if (!inv || !st || st.step === 'gear' || st.done) return [];
    const r3 = !!st.path;
    const given = r3 ? packGear(inv, { pack: 'waltpack', gift: GIFT_R3, order: ORDER_R3, food: 0 }) : packGear(inv, { pack: 'waltpack', gift: GIFT, order: ORDER });
    if (r3) { given.push(...this.lend(inv)); st.loan = true; }
    st.step = 'gear'; this.write();
    this.hull();
    const hud = this.t.hud;
    if (hud && typeof hud.note === 'function') hud.note(r3 ? 'A canoe at the dock now, the old gear in it.' : 'The old gear is in your canoe at the dock.', 5);
    const s = this.t.story;
    if (s && typeof s.emit === 'function') s.emit('gear:given', { items: given, ep: this.home, abs: this.abs });
    return given;
  }
  // st-t (20 §1.2 "I'll wait for a rental."): the loan and the rest of the kit, the bundle (the old pack and tent) left
  // on the shelf; the pot and the life jacket kept for you at the counter, your own things in the crate (no pack to put
  // them in). Walt's dented stove and its canister stay with the bundle (takeLater): a Walt thing carried is night one,
  // and the notebook is in his tent (chk-c1b D1: the shelf path found it through the stove). → the item ids given
  shelf() {
    const inv = this.t.inventory, st = this.state;
    if (!STORY_ON || !inv || !st || st.step === 'gear' || st.done) return [];
    const given = [];
    for (const id of ['pot', ...(st.path ? LOAN.pack : [])]) { try { if (inv.place(id, 1, { crate: true, all: true, quiet: true })) given.push(id); } catch { /* kept nowhere */ } }
    if (st.path) { given.push(...this.lend(inv)); st.loan = true; }
    st.step = 'gear'; st.shelf = true; this.write();
    this.hull();
    if (typeof inv.write === 'function') inv.write();
    return given;
  }
  // st-t (20 §9.2 R1/R1b): the bundle taken off the shelf later: the old pack into the canoe, the tent in it, your own
  // things out of the crate into it. → the item ids given
  takeLater() {
    const inv = this.t.inventory, st = this.state;
    if (!STORY_ON || !inv || !st || !st.shelf) return [];
    const given = packGear(inv, { pack: 'waltpack', gift: ['walttent', 'waltstove', 'fuel'], order: ORDER_R3, food: 0 }); // (the stove and canister left with the bundle: shelf)
    st.shelf = false; this.write();
    const s = this.t.story;
    if (s && typeof s.emit === 'function') s.emit('gear:given', { items: given, ep: this.home, abs: this.abs });
    return given;
  }
  // /st-t
}

// The pack into the canoe, the gift into it (else kept for you at the outfitters), your own things out of the crate into
// it, three days of food in the barrel. → the item ids given
export function packGear(inv, { pack: packId, gift, order, food = FOOD_DAYS }) {
  const q = { quiet: true }, given = [packId];
  const pack = inv.addContainer(packId, 'canoe', null, q);
  const away = (id) => { try { inv.place(id, 1, { crate: true, all: true, quiet: true }); } catch { /* kept nowhere */ } };
  const crate = inv.crate;
  for (const id of order) {
    if (gift.includes(id)) { if (!inv.put(pack, id, q)) away(id); given.push(id); continue; }
    if (!OWN_KIT.includes(id) || !crate) continue;
    if (id === 'tacklebox') { const tb = inv.containers.find((c) => c.item === 'tacklebox' && c.where === 'in' && c.in === crate.id); if (tb) inv.nest(tb, pack); continue; }
    const e = crate.grid.find((k) => k.id === id && !k.box);
    const spot = e ? inv.firstFit(pack, id) : null;
    if (spot) inv.move(crate.id, e.uid, pack.id, spot.x, spot.y, spot.rot);
  }
  // the food: a breakfast and a supper a day, in the barrel (else the pack, else kept for you)
  const barrel = inv.containers.find((c) => /^barrel/.test(c.item) && c.where === 'canoe') || inv.containers.find((c) => /^barrel/.test(c.item));
  for (let i = 0; i < food; i++) for (const m of ['meal:breakfast', 'meal:supper']) { if (!((barrel && inv.put(barrel, m, q)) || inv.put(pack, m, q))) away(m); }
  if (food > 0) given.push(`meal:breakfast×${food}`, `meal:supper×${food}`);
  inv.emit('containers');
  if (typeof inv.write === 'function') inv.write();
  return given;
}
// A co-op guest's first visit: the starting kit (inventory.newSeason) and the scene's gear in its plain form: a Duluth
// pack #3, the A-frame tent, the pot, a canister stove and a canister, three days of food. Nothing of the story. → ids
export function guestKit(inv) {
  inv.newSeason(GUEST_KIT); // (r3: the old kit: a new player's season starts empty-handed, a friend's does not)
  return packGear(inv, { pack: plain('waltpack'), gift: GIFT.map(plain), order: ORDER.map(plain) });
}

export const onboarding = new Onboarding();
