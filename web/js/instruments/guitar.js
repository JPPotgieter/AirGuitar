import { PRESETS, } from '../chords.js';
import { neckGeo } from '../render.js';
import { lerp } from '../body.js';

// Air guitar: the neck points at the fretting hand, whose position along it picks the chord;
// the other hand strums across the strings.
export class GuitarInstrument {
  constructor(app) {
    this.app = app;
    this.id = 'guitar';
    this.reset();
  }

  reset() {
    this.zone = this.zone || 0;
    this.neckAngle = null;
    this.geo = null;
    this.strum = { armed: 0, v: null, t: 0 };
  }

  // Neck geometry for the player's Guitar reach setting (Short / Normal / Long).
  get neck() {
    return neckGeo(this.app.settings.guitarReach);
  }

  get chords() {
    return PRESETS[this.app.settings.preset].chords;
  }

  stripItems() {
    this.zone = Math.min(this.zone, this.chords.length - 1);
    return { items: this.chords, index: this.zone, label: this.chords[this.zone] };
  }

  update(body, raw, dt, now) {
    const active = raw.handActive || { L: true, R: true };
    this.resting = !active[this.app.settings.lefty ? 'R' : 'L'];
    this.geo = this.place(body, dt);
    if (active[this.geo.fretSide]) this.updateZone(body);
    // On the TV (passive) the phone decides when notes play; we only draw.
    if (active[this.geo.strumSide] && !this.app.passive) this.detectStrum(raw, now);
    else this.lost(); // forget the last position so the hand reappearing doesn't strum
  }

  lost() {
    this.strum.v = null;
  }

  place(b, dt) {
    const lefty = this.app.settings.lefty;
    const strumSide = lefty ? 'L' : 'R';
    const fretSide = lefty ? 'R' : 'L';
    const S = b.S;
    // Sound hole sits over the belly, a little towards the strumming side.
    const origin = lerp(b.mid, b.hipMid, 0.66);
    origin.x += (b.shoulder[strumSide].x - b.mid.x) * 0.35;

    // Neck points at the fretting hand, within a guitar-ish range of angles.
    const side = Math.sign(b.shoulder[fretSide].x - b.shoulder[strumSide].x) || 1;
    // Fretting hand out of view: hold the neck at a classic playing angle instead.
    const to = this.resting ? { x: origin.x + side * b.S * 2, y: origin.y - b.S * 0.8 } : b.hand[fretSide];
    let ang = Math.atan2(to.y - origin.y, (to.x - origin.x) * side);
    ang = Math.max(-1.25, Math.min(0.45, ang));
    if (!Number.isFinite(ang)) ang = this.neckAngle ?? 0;
    this.neckAngle = this.neckAngle === null ? ang : this.neckAngle + (ang - this.neckAngle) * Math.min(1, dt * 18);
    const dir = { x: Math.cos(this.neckAngle) * side, y: Math.sin(this.neckAngle) };
    let n = { x: -dir.y, y: dir.x };
    if (n.y < 0) n = { x: -n.x, y: -n.y }; // normal always points floor-wards
    const flip = dir.x * n.y - dir.y * n.x > 0 ? 1 : -1;
    const at = (u, v) => ({ x: origin.x + (dir.x * u + n.x * v) * S, y: origin.y + (dir.y * u + n.y * v) * S });
    const local = (p) => ({
      u: ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / S,
      v: ((p.x - origin.x) * n.x + (p.y - origin.y) * n.y) / S,
    });
    return { origin, dir, n, flip, S, at, local, strumSide, fretSide };
  }

  updateZone(b) {
    const list = this.chords;
    const u = this.geo.local(b.hand[this.geo.fretSide]).u;
    const N = this.neck;
    const zl = (N.nut - N.zoneEnd) / list.length;
    const f = (N.nut - u) / zl; // 0 at the nut, grows towards the body
    const clamped = Math.max(0, Math.min(list.length - 0.001, f));
    // Hysteresis so the chord doesn't flicker on a zone boundary.
    if (clamped < this.zone - 0.15 || clamped > this.zone + 1.15) {
      this.zone = Math.floor(clamped);
      this.app.setLabel(list[this.zone], this.zone, false);
    }
  }

  // Strum = strumming hand crossing the strings (perpendicular to the neck).
  detectStrum(raw, now) {
    const s = this.strum;
    const { u, v } = this.geo.local(raw.hand[this.geo.strumSide]);
    const t = now / 1000;
    const prev = s.v;
    const dt = Math.max(1 / 120, t - s.t);
    s.v = v;
    s.t = t;
    if (prev === null) return;
    const near = u > -1.5 && u < 1.3 && Math.abs(v) < 1.4;
    if (!near) {
      s.armed = 0;
      return;
    }
    if (Math.abs(v) > 0.12 && s.armed === 0) s.armed = Math.sign(v);
    if (s.armed !== 0 && Math.sign(v) === -s.armed && Math.sign(prev) !== Math.sign(v)) {
      const speed = Math.abs(v - prev) / dt; // shoulder-widths per second
      s.armed = 0;
      if (speed < 0.8) return;
      this.play(v > prev ? 'down' : 'up', Math.min(1, speed / 7));
    }
  }

  play(direction, velocity) {
    if (!this.geo) return;
    this.app.broadcast?.({ zone: this.zone, direction, velocity }); // tell the TV, if casting
    const name = this.chords[this.zone];
    this.app.audio.strum(name, direction, velocity);
    this.app.renderer.stringEnergy.fill(0.6 + velocity * 0.6);
    const color = this.app.settings.tone === 'rock' ? '#ff5d73' : '#ffd65a';
    this.app.onNote(this.geo.at(0, 0), velocity, color);
    this.app.setLabel(name, this.zone, true);
  }

  // A note played on the phone, replayed on the TV.
  remote({ zone, direction, velocity }) {
    this.zone = zone;
    this.play(direction, velocity);
  }

  tap() {
    this.play('down', 0.6);
  }

  viewPoints() {
    const g = this.geo;
    if (!g) return [];
    const N = this.neck;
    return [g.at(N.head + 0.1, -0.45), g.at(N.head + 0.1, 0.3), g.at(-1, 0.65), g.at(-1, -0.65)];
  }

  // Strap and guitar sit behind the arms.
  draw(r, scene) {
    const g = this.geo;
    if (!g) return;
    const { ctx } = r;
    const b = scene.body;
    const S = b.S;
    const N = this.neck;
    const strapEnd = g.at(N.neckStart, -0.15);
    const strapStart = g.at(N.bridge - 0.05, 0);
    ctx.strokeStyle = scene.guitarStyle.strap;
    ctx.lineWidth = S * 0.09;
    ctx.beginPath();
    ctx.moveTo(strapStart.x, strapStart.y);
    ctx.quadraticCurveTo(b.shoulder[g.fretSide].x, b.shoulder[g.fretSide].y - S * 0.1, strapEnd.x, strapEnd.y);
    ctx.stroke();
    r.drawGuitar({ ...scene, guitar: g, zone: this.zone, chords: this.chords, neck: N });
  }

  // Pick in the strumming hand.
  drawOver(r, scene) {
    const g = this.geo;
    if (!g) return;
    const { ctx } = r;
    const S = scene.body.S;
    const h = scene.body.hand[g.strumSide];
    ctx.fillStyle = r.look.accent;
    ctx.beginPath();
    ctx.moveTo(h.x, h.y + S * 0.16);
    ctx.lineTo(h.x - S * 0.06, h.y + S * 0.04);
    ctx.lineTo(h.x + S * 0.06, h.y + S * 0.04);
    ctx.closePath();
    ctx.fill();
  }
}
