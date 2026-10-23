// The trip's tally for the journal: kilometres paddled (today and in all), portages walked and their rods,
// the times the canoe came down, the lakes in the order they were first paddled, the nights and where they
// were spent, and the days with any paddling in them. Read off the player each frame; saved every few
// seconds under `bwca-canoe:stats` (save.js); reset when a trip starts or is forgotten.
import { save } from './save.js';

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const compass = (dx, dz) => COMPASS[Math.round((((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360) / 45) % 8];

export class TripStats {
  constructor(world, player, day) {
    this.world = world; this.player = player; this.day = day;
    this.reset(false);
    this.lastDoy = day.doy; // the day the tally last saw (restored with it: the page opens on today's date, not the trip's)
    this.restore(save.read('stats'));
    this.lastMode = player.mode; this.lastDrops = player.dropCount || 0;
    this.carried = null;   // the portage under the hull while it is on your shoulders: { name, rods }
    this.t = 0; this.saveT = 0; this.dirty = false;
    window.addEventListener('pagehide', () => this.write());
  }
  reset(write = true) {
    this.km = 0; this.rods = 0; this.portages = 0; this.drops = 0;
    this.lakes = [];       // [{ id, name, doy }]
    this.nights = [];      // [{ doy, where }]
    this.days = {};        // doy -> { km, portages }
    if (write) { this.dirty = true; this.write(); }
  }
  get dayKey() { return `${this.day.year}-${this.day.doy}`; }
  get today() { return this.days[this.dayKey] || { km: 0, portages: 0 }; }
  get daysOnWater() { return Object.values(this.days).filter((d) => d.km > 0.1).length; }
  touch(fn) { const k = this.dayKey; const d = this.days[k] || (this.days[k] = { km: 0, portages: 0 }); fn(d); this.dirty = true; }

  // dt in game seconds; tripActive gates the nights (a night at the landing before a trip is not one)
  update(dt, tripActive = true) {
    const p = this.player, w = this.world;
    if (p.teleporting) { this.lastMode = p.mode; return; }
    if (p.mode === 'paddle') {
      const m = (p.groundSpeed ?? Math.abs(p.speed)) * dt; // the ground made good, not the paddle's intent
      if (m > 0) { this.km += m / 1000; this.touch((d) => { d.km += m / 1000; }); }
    }
    if (p.mode === 'carry') {
      if ((this.t -= dt) <= 0) { this.t = 0.5; const tr = p.nearestTrail(p.x, p.z, 12); if (tr && tr.dist < 6) this.carried = { name: tr.def.name, rods: tr.def.rods }; }
    }
    // a portage walked end to end: launched off your shoulders, or (a double portage) from the far end's ground
    if ((this.lastMode === 'carry' || this.lastMode === 'walk') && p.mode === 'paddle' && this.carried) {
      this.portages++; this.rods += this.carried.rods; this.touch((d) => { d.portages++; }); this.carried = null;
    }
    if (p.mode !== 'carry' && p.mode !== 'walk') this.carried = null;
    const drops = p.dropCount || 0;
    if (drops !== this.lastDrops) { this.drops += Math.max(0, drops - this.lastDrops); this.lastDrops = drops; this.dirty = true; }
    // the lakes, in the order they were first paddled
    if (p.mode === 'paddle' && (this.t -= dt) <= 0) {
      this.t = 0.5;
      const id = p.lakeId, name = id > 0 ? w.lakeName(id) : null;
      if (name && !this.lakes.some((l) => l.id === id)) { this.lakes.push({ id, name, doy: this.day.doy }); this.dirty = true; }
    }
    // midnight: a night, and where it was spent
    if (this.day.doy !== this.lastDoy) {
      if (tripActive && (this.day.doy > this.lastDoy || this.day.doy < this.lastDoy - 300)) this.nights.push({ doy: this.lastDoy, where: this.whereabouts() });
      this.lastDoy = this.day.doy; this.dirty = true;
    }
    this.lastMode = p.mode;
    if ((this.saveT += dt) > 10) { this.saveT = 0; if (this.dirty) this.write(); }
  }
  // "the east campsite on Hudson", "afloat on Lake Insula", "on the Insula–Alice portage"
  whereabouts() {
    const p = this.player, w = this.world;
    const camp = p.nearCampsite ? p.nearCampsite(p.x, p.z, 40) : null;
    if (camp) {
      const id = p.nearWater ? p.nearWater(camp.x, camp.z, 8) : 0, l = id > 0 ? w.lakes[id - 1] : null, name = w.lakeName(id);
      const side = l && l.cells >= 1500 ? `${compass(camp.x - l.cx, camp.z - l.cz)} ` : '';
      return name ? `the ${side}campsite on ${name}` : 'a campsite';
    }
    if (p.mode === 'paddle') { const name = w.lakeName(p.lakeId); return name ? `afloat on ${name}` : 'afloat'; }
    return p.placeName ? `on ${p.placeName}` : 'in the woods';
  }

  serialize() { return { v: 1, km: this.km, rods: this.rods, portages: this.portages, drops: this.drops, lakes: this.lakes, nights: this.nights, days: this.days, lastDoy: this.lastDoy }; }
  restore(d) {
    if (!d) return;
    this.km = d.km || 0; this.rods = d.rods || 0; this.portages = d.portages || 0; this.drops = d.drops || 0;
    this.lakes = Array.isArray(d.lakes) ? d.lakes : []; this.nights = Array.isArray(d.nights) ? d.nights : []; this.days = d.days && typeof d.days === 'object' ? d.days : {};
    if (Number.isFinite(d.lastDoy)) this.lastDoy = d.lastDoy; // a reload's Continue sets the clock back to the trip's day: no night in that
  }
  write() { this.dirty = false; save.write('stats', this.serialize()); }
}
