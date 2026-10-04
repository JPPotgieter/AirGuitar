import { TromboneVoice } from '../sounds.js';

// Slide positions from fully in (highest) to fully out (lowest): B♭ major pentatonic.
const NOTES = [
  ['F4', 349.23], ['D4', 293.66], ['C4', 261.63], ['B♭3', 233.08],
  ['G3', 196.0], ['F3', 174.61], ['D3', 146.83], ['C3', 130.81],
];
// Slide extension (mouth to slide hand, in shoulder-widths) mapped onto the note zones.
const SLIDE_IN = 0.9;
const SLIDE_OUT = 2.5;

// Air trombone: the slide hand's distance from your mouth picks the note. Each push or pull
// of the slide plays the note where your hand comes to rest, gliding from the last one.
export class TromboneInstrument {
  constructor(app) {
    this.app = app;
    this.id = 'trombone';
    this.voice = new TromboneVoice(app.audio);
    this.zone = 3;
    this.reset();
  }

  reset() {
    this.angle = null;
    this.geo = null;
    this.stroke = { e: null, t: 0, peak: 0, dir: 0 };
  }

  lost() {
    this.stroke.e = null;
  }

  stripItems() {
    return { items: NOTES.map((n) => n[0]), index: this.zone, label: NOTES[this.zone][0] };
  }

  update(body, raw, dt, now) {
    this.geo = this.place(body, dt);
    // Pick the note from the live (unsmoothed) hand so it's right the moment the slide stops.
    const e = this.extension(raw.hand[this.geo.slideSide]);
    const f = ((e - SLIDE_IN) / (SLIDE_OUT - SLIDE_IN)) * NOTES.length;
    const z = Math.max(0, Math.min(NOTES.length - 0.001, f));
    if (z < this.zone - 0.15 || z > this.zone + 1.15) {
      this.zone = Math.floor(z);
      this.app.setLabel(NOTES[this.zone][0], this.zone, false);
    }
    this.detectStroke(e, now / 1000);
  }

  place(b, dt) {
    const lefty = this.app.settings.lefty;
    const slideSide = lefty ? 'L' : 'R';
    const holdSide = lefty ? 'R' : 'L';
    const side = Math.sign(b.shoulder[slideSide].x - b.shoulder[holdSide].x) || 1;
    const origin = b.mouth;
    const to = b.hand[slideSide];
    let ang = Math.atan2(to.y - origin.y, (to.x - origin.x) * side);
    ang = Math.max(-0.6, Math.min(0.7, ang));
    if (!Number.isFinite(ang)) ang = this.angle ?? 0;
    this.angle = this.angle === null ? ang : this.angle + (ang - this.angle) * Math.min(1, dt * 15);
    const dir = { x: Math.cos(this.angle) * side, y: Math.sin(this.angle) };
    let n = { x: -dir.y, y: dir.x };
    if (n.y < 0) n = { x: -n.x, y: -n.y };
    const flip = dir.x * n.y - dir.y * n.x > 0 ? 1 : -1;
    const S = b.S;
    const at = (u, v) => ({ x: origin.x + (dir.x * u + n.x * v) * S, y: origin.y + (dir.y * u + n.y * v) * S });
    return { origin, dir, n, flip, S, at, slideSide, holdSide };
  }

  extension(p) {
    const g = this.geo;
    const e = ((p.x - g.origin.x) * g.dir.x + (p.y - g.origin.y) * g.dir.y) / g.S;
    return Math.max(0.6, Math.min(3.0, e));
  }

  // A stroke ends when the slide stops or changes direction; that's when the note sounds.
  detectStroke(e, t) {
    const s = this.stroke;
    if (!Number.isFinite(e) || (s.e !== null && t - s.t < 0.011)) return;
    const prev = s.e;
    const dt = t - s.t;
    s.e = e;
    s.t = t;
    if (prev === null) return;
    const v = (e - prev) / dt;
    const speed = Math.abs(v);
    if (speed > 1.2) {
      if (s.dir && Math.sign(v) !== s.dir && s.peak) this.fire(s.peak);
      s.dir = Math.sign(v);
      s.peak = Math.max(s.peak, speed);
    } else if (s.peak && speed < 0.45) {
      this.fire(s.peak);
      s.dir = 0;
    }
  }

  fire(peak) {
    this.stroke.peak = 0;
    this.play(Math.min(1, 0.3 + peak / 6));
  }

  play(velocity) {
    if (!this.geo) return;
    const [name, freq] = NOTES[this.zone];
    this.voice.play(freq, velocity);
    this.app.onNote(this.geo.at(1.8, -0.15), velocity, '#fde047');
    this.app.setLabel(name, this.zone, true);
  }

  tap() {
    this.play(0.7);
  }

  viewPoints() {
    const g = this.geo;
    if (!g) return [];
    return [g.at(-0.4, 0.85), g.at(SLIDE_OUT + 0.3, 0.85), g.at(2.1, -0.6)];
  }

  // Bell section and slide, drawn in front of the face and behind the hands.
  draw(r, scene) {
    const g = this.geo;
    if (!g) return;
    const { ctx } = r;
    const e = this.extension(scene.body.hand[g.slideSide]);
    ctx.save();
    ctx.translate(g.origin.x, g.origin.y);
    ctx.rotate(Math.atan2(g.dir.y, g.dir.x));
    ctx.scale(g.S, g.S * g.flip);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const brass = (w, path) => {
      ctx.strokeStyle = '#a16207';
      ctx.lineWidth = w;
      ctx.beginPath();
      path();
      ctx.stroke();
      ctx.strokeStyle = '#f5c542';
      ctx.lineWidth = w * 0.6;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,250,210,0.8)';
      ctx.lineWidth = w * 0.18;
      ctx.stroke();
    };

    // Bell section: tube from the mouthpiece, looping back by the head, out to the bell.
    brass(0.07, () => {
      ctx.moveTo(0.05, 0);
      ctx.lineTo(-0.18, 0);
      ctx.quadraticCurveTo(-0.32, -0.12, -0.18, -0.22);
      ctx.lineTo(1.2, -0.22);
    });
    // Bell flare
    const bell = ctx.createLinearGradient(1.2, 0, 1.95, 0);
    bell.addColorStop(0, '#f5c542');
    bell.addColorStop(1, '#fff1a8');
    ctx.fillStyle = bell;
    ctx.strokeStyle = '#a16207';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(1.2, -0.25);
    ctx.quadraticCurveTo(1.75, -0.27, 1.95, -0.62);
    ctx.lineTo(1.95, 0.18);
    ctx.quadraticCurveTo(1.75, -0.17, 1.2, -0.19);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7c4a03';
    ctx.beginPath();
    ctx.ellipse(1.95, -0.22, 0.07, 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Inner slide (fixed) and outer slide (moves with your hand), ending in the U-bend.
    const end = Math.max(1.0, e);
    brass(0.05, () => {
      ctx.moveTo(0.05, 0.02);
      ctx.lineTo(end, 0.02);
      ctx.moveTo(0.05, 0.2);
      ctx.lineTo(end, 0.2);
    });
    brass(0.075, () => {
      ctx.moveTo(Math.max(0.25, end - 1.4), 0.02);
      ctx.lineTo(end, 0.02);
      ctx.arc(end, 0.11, 0.09, -Math.PI / 2, Math.PI / 2);
      ctx.lineTo(Math.max(0.25, end - 1.4), 0.2);
    });
    // Braces and mouthpiece
    brass(0.04, () => {
      ctx.moveTo(0.35, -0.22);
      ctx.lineTo(0.35, 0.2);
      ctx.moveTo(end - 0.15, 0.02);
      ctx.lineTo(end - 0.15, 0.2);
    });
    ctx.fillStyle = '#d1d5db';
    ctx.beginPath();
    ctx.ellipse(0.02, 0, 0.05, 0.08, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // A marker for each note position along the slide; the current one is named.
    const zl = (SLIDE_OUT - SLIDE_IN) / NOTES.length;
    const fs = Math.max(12, g.S * 0.17);
    ctx.font = `800 ${fs}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    NOTES.forEach(([name], i) => {
      const p = g.at(SLIDE_IN + (i + 0.5) * zl + 0.1, 0.42);
      const active = i === this.zone;
      ctx.fillStyle = active ? '#ffd65a' : 'rgba(255,255,255,0.45)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, g.S * (active ? 0.05 : 0.03), 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        const q = g.at(SLIDE_IN + (i + 0.5) * zl + 0.1, 0.68);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(name, q.x, q.y);
        ctx.fillText(name, q.x, q.y);
      }
    });
  }
}
