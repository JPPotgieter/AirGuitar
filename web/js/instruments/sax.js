import { SaxVoice } from '../sounds.js';
import { StrokeDetector } from './stroke.js';

// C blues scale, from the top of the sax (hand near the mouth, high) to the bottom (low).
const NOTES = [
  ['E♭5', 622.25], ['C5', 523.25], ['B♭4', 466.16], ['G4', 392.0],
  ['F♯4', 369.99], ['F4', 349.23], ['E♭4', 311.13], ['C4', 261.63],
];
// Along the sax from the mouthpiece, in shoulder-widths.
const NECK = 0.4; // mouthpiece and neck
const BODY_END = 2.0; // bottom bend
const KEYS_FROM = 0.5; // where the playable keys start / end
const KEYS_TO = 1.9;

// Air saxophone: held from the mouth down across the body. Slide your playing hand up and
// down the sax; each time it stops, the note at that spot plays.
export class SaxInstrument {
  constructor(app) {
    this.app = app;
    this.id = 'sax';
    this.voice = new SaxVoice(app.audio);
    this.stroke = new StrokeDetector({ moveSpeed: 1.0, stopSpeed: 0.4 });
    this.zone = 4;
    this.angle = null;
    this.geo = null;
  }

  reset() {
    this.stroke.reset();
    this.angle = null;
  }

  lost() {
    this.stroke.reset();
  }

  stripItems() {
    return { items: NOTES.map((n) => n[0]), index: this.zone, label: NOTES[this.zone][0] };
  }

  place(b, dt) {
    const lefty = this.app.settings.lefty;
    const playSide = lefty ? 'L' : 'R';
    const S = b.S;
    const origin = b.mouth;
    const out = Math.sign(b.shoulder[playSide].x - b.mid.x) || 1;
    // The sax hangs towards the playing-side hip, a little out from the body.
    const target = { x: b.hip[playSide].x + out * S * 0.4, y: b.hip[playSide].y + S * 0.2 };
    let ang = Math.atan2(target.y - origin.y, target.x - origin.x);
    if (!Number.isFinite(ang)) ang = this.angle ?? Math.PI / 2;
    this.angle = this.angle === null ? ang : this.angle + (ang - this.angle) * Math.min(1, dt * 10);
    const dir = { x: Math.cos(this.angle), y: Math.sin(this.angle) };
    // Normal pointing away from the body (the bell side).
    let n = { x: -dir.y, y: dir.x };
    if (n.x * out < 0) n = { x: -n.x, y: -n.y };
    const flip = dir.x * n.y - dir.y * n.x > 0 ? 1 : -1;
    const at = (u, v) => ({ x: origin.x + (dir.x * u + n.x * v) * S, y: origin.y + (dir.y * u + n.y * v) * S });
    const local = (p) => ({
      u: ((p.x - origin.x) * dir.x + (p.y - origin.y) * dir.y) / S,
      v: ((p.x - origin.x) * n.x + (p.y - origin.y) * n.y) / S,
    });
    return { origin, dir, n, flip, S, at, local, playSide };
  }

  update(body, raw, dt, now) {
    this.geo = this.place(body, dt);
    const active = raw.handActive || { L: true, R: true };
    if (!active[this.geo.playSide]) {
      this.lost();
      return;
    }
    const { u, v } = this.geo.local(raw.hand[this.geo.playSide]);
    // Only a hand on (or near) the sax plays it.
    if (Math.abs(v) > 0.9 || u < KEYS_FROM - 0.4 || u > KEYS_TO + 0.5) {
      this.lost();
      return;
    }
    const f = ((u - KEYS_FROM) / (KEYS_TO - KEYS_FROM)) * NOTES.length;
    const z = Math.max(0, Math.min(NOTES.length - 0.001, f));
    if (z < this.zone - 0.15 || z > this.zone + 1.15) {
      this.zone = Math.floor(z);
      this.app.setLabel(NOTES[this.zone][0], this.zone, false);
    }
    const peak = this.stroke.push(u, now / 1000);
    if (peak) this.play(Math.min(1, 0.35 + peak / 6));
  }

  play(velocity) {
    if (!this.geo) return;
    const [name, freq] = NOTES[this.zone];
    this.voice.play(freq, velocity);
    this.app.onNote(this.geo.at(BODY_END - 0.25, 0.75), velocity, '#fbbf24');
    this.app.setLabel(name, this.zone, true);
  }

  tap() {
    this.play(0.7);
  }

  viewPoints() {
    const g = this.geo;
    if (!g) return [];
    return [g.at(BODY_END + 0.3, 0.2), g.at(BODY_END - 0.5, 1.1), g.at(0, -0.3)];
  }

  draw(r) {
    const g = this.geo;
    if (!g) return;
    const { ctx } = r;
    ctx.save();
    ctx.translate(g.origin.x, g.origin.y);
    ctx.rotate(Math.atan2(g.dir.y, g.dir.x));
    ctx.scale(g.S, g.S * g.flip);
    ctx.lineJoin = 'round';
    const brass = ctx.createLinearGradient(0, -0.15, 0, 0.15);
    brass.addColorStop(0, '#fde68a');
    brass.addColorStop(0.5, '#d4a017');
    brass.addColorStop(1, '#8a6200');
    // Mouthpiece and neck
    ctx.fillStyle = '#111';
    ctx.fillRect(-0.02, -0.035, 0.14, 0.07);
    ctx.strokeStyle = '#d4a017';
    ctx.lineWidth = 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.12, 0);
    ctx.quadraticCurveTo(0.28, -0.05, NECK, 0.02);
    ctx.stroke();
    // Body: a cone widening towards the bottom, then the bend and the bell turning up.
    ctx.fillStyle = brass;
    ctx.strokeStyle = '#7a5600';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(NECK, -0.04);
    ctx.lineTo(BODY_END, -0.13);
    ctx.quadraticCurveTo(BODY_END + 0.32, 0.05, BODY_END + 0.05, 0.38);
    ctx.lineTo(BODY_END - 0.45, 0.62); // bell outer edge
    ctx.lineTo(BODY_END - 0.62, 0.42); // bell inner edge
    ctx.lineTo(BODY_END - 0.18, 0.2);
    ctx.quadraticCurveTo(BODY_END - 0.05, 0.12, BODY_END - 0.2, 0.08);
    ctx.lineTo(NECK, 0.04);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Bell opening
    ctx.fillStyle = '#5c3d00';
    ctx.beginPath();
    ctx.ellipse(BODY_END - 0.535, 0.52, 0.06, 0.15, -0.9, 0, Math.PI * 2);
    ctx.fill();
    // Pearl keys, one per note; the current note glows.
    const zl = (KEYS_TO - KEYS_FROM) / NOTES.length;
    for (let i = 0; i < NOTES.length; i++) {
      const u = KEYS_FROM + (i + 0.5) * zl;
      const active = i === this.zone;
      ctx.fillStyle = active ? '#ffd65a' : '#f5f5f4';
      ctx.strokeStyle = '#7a5600';
      ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.arc(u, -0.005, active ? 0.05 : 0.038, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }
}
