import { drumHit } from '../sounds.js';

// Pads are placed around the player in shoulder-widths (S) from the middle of the shoulders:
// x > 0 is the player's right, x < 0 their left (hi-hat and crash, as on a real kit), y downwards.
const PADS = [
  { id: 'kick', name: 'Kick', short: 'Kick', x: 0, y: 2.25, r: 0.62, kind: 'bass', color: '#dc2626' },
  { id: 'snare', name: 'Snare', short: 'Snare', x: -0.72, y: 1.55, r: 0.42, kind: 'drum', color: '#e5e7eb' },
  { id: 'hihat', name: 'Hi-hat', short: 'Hat', x: -1.42, y: 0.9, r: 0.44, kind: 'cymbal' },
  { id: 'tom1', name: 'Tom 1', short: 'Tom1', x: -0.38, y: 0.98, r: 0.34, kind: 'drum', color: '#dc2626' },
  { id: 'tom2', name: 'Tom 2', short: 'Tom2', x: 0.38, y: 0.98, r: 0.34, kind: 'drum', color: '#dc2626' },
  { id: 'floor', name: 'Floor tom', short: 'Floor', x: 1.18, y: 1.62, r: 0.5, kind: 'drum', color: '#dc2626' },
  { id: 'crash', name: 'Crash', short: 'Crash', x: -1.5, y: -0.1, r: 0.56, kind: 'cymbal' },
  { id: 'ride', name: 'Ride', short: 'Ride', x: 1.55, y: 0.25, r: 0.6, kind: 'cymbal' },
];

// A hit is a fast downward swing that suddenly stops, like a stick bouncing off a drum.
class HitDetector {
  constructor(armSpeed, fireSpeed) {
    this.armSpeed = armSpeed;
    this.fireSpeed = fireSpeed;
    this.reset();
  }
  reset() {
    this.y = null;
    this.t = 0;
    this.peak = 0;
    this.last = 0;
  }
  // y in shoulder-widths, t in seconds. Returns hit strength (speed) or 0.
  push(y, t) {
    if (!Number.isFinite(y)) return 0;
    // Samples closer than ~1/90 s apart are too close to measure speed reliably.
    if (this.y !== null && t - this.t < 0.011) return 0;
    const prev = this.y;
    const dt = t - this.t;
    this.y = y;
    this.t = t;
    if (prev === null) return 0;
    const vy = (y - prev) / dt;
    if (vy > this.armSpeed) this.peak = Math.max(this.peak, vy);
    if (this.peak && vy < this.fireSpeed) {
      const peak = this.peak;
      this.peak = 0;
      if (t - this.last < 0.07) return 0;
      this.last = t;
      return peak;
    }
    return 0;
  }
}

export class DrumsInstrument {
  constructor(app) {
    this.app = app;
    this.id = 'drums';
    this.hands = { L: new HitDetector(3, 0.8), R: new HitDetector(3, 0.8) };
    this.knees = { L: new HitDetector(1.4, 0.3), R: new HitDetector(1.4, 0.3) };
    this.flash = {};
    this.lastHit = -1;
    this.pads = null;
  }

  reset() {
    for (const d of [...Object.values(this.hands), ...Object.values(this.knees)]) d.reset();
  }

  lost() {
    this.reset();
  }

  stripItems() {
    return { items: PADS.map((p) => p.short), index: this.lastHit, label: '🥁' };
  }

  layout(b) {
    // Screen direction of the player's right (the mirrored view puts it on screen-right);
    // left-handed players get the kit flipped.
    const right = (Math.sign(b.shoulder.R.x - b.shoulder.L.x) || 1) * (this.app.settings.lefty ? -1 : 1);
    return PADS.map((p) => ({
      ...p,
      cx: b.mid.x + p.x * right * b.S,
      cy: b.mid.y + p.y * b.S,
      rr: p.r * b.S,
    }));
  }

  update(body, raw, dt, now) {
    this.pads = this.layout(body);
    for (const k of Object.keys(this.flash)) this.flash[k] = Math.max(0, this.flash[k] - dt * 4);
    const t = now / 1000;
    const active = raw.handActive || { L: true, R: true };
    for (const side of ['L', 'R']) {
      const h = raw.hand[side];
      if (!active[side]) {
        this.hands[side].reset(); // hand not really seen: no hits from guessed positions
      } else {
        const speed = this.hands[side].push(h.y / raw.S, t);
        if (speed) this.hitNearest(h, speed / 14);
      }
      if (raw.legsSeen[side]) {
        const k = this.knees[side].push(raw.knee[side].y / raw.S, t);
        if (k) this.hit(this.pads[0], Math.min(1, k / 6));
      } else {
        this.knees[side].reset();
      }
    }
  }

  hitNearest(p, velocity) {
    let best = null;
    let bestD = Infinity;
    for (const pad of this.pads) {
      // Cymbals and drums are hit on their top surface, so aim slightly above the centre.
      const d = Math.hypot(p.x - pad.cx, p.y - (pad.cy - pad.rr * 0.15)) / pad.rr;
      if (d < bestD) {
        bestD = d;
        best = pad;
      }
    }
    if (best) this.hit(best, Math.min(1, velocity));
  }

  hit(pad, velocity) {
    drumHit(this.app.audio, pad.id, velocity);
    this.flash[pad.id] = 1;
    this.lastHit = PADS.findIndex((p) => p.id === pad.id);
    const color = pad.kind === 'cymbal' ? '#facc15' : '#ff5d73';
    this.app.onNote({ x: pad.cx, y: pad.cy - pad.rr * 0.3 }, velocity, color);
    this.app.setLabel(pad.name, this.lastHit, true);
  }

  tap() {
    if (this.pads) this.hit(this.pads[1], 0.7);
  }

  viewPoints() {
    if (!this.pads) return [];
    return this.pads.flatMap((p) => [
      { x: p.cx - p.rr, y: p.cy - p.rr * 0.6 },
      { x: p.cx + p.rr, y: p.cy + p.rr },
    ]);
  }

  // The kit stands in front of the player, behind the arms and sticks.
  draw(r, scene) {
    if (!this.pads) return;
    const { ctx } = r;
    const S = scene.body.S;
    const floorY = this.pads[0].cy + this.pads[0].rr * 1.05;
    // Stands first
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = S * 0.035;
    for (const p of this.pads) {
      if (p.kind === 'bass') continue;
      ctx.beginPath();
      ctx.moveTo(p.cx, p.cy);
      ctx.lineTo(p.cx, floorY);
      ctx.stroke();
    }
    // Draw from the back (top of screen) to the front.
    const order = [...this.pads].sort((a, b) => a.cy - b.cy);
    for (const p of order) {
      const f = this.flash[p.id] || 0;
      if (p.kind === 'cymbal') drawCymbal(ctx, p, f, scene.time);
      else if (p.kind === 'bass') drawBass(ctx, p, f);
      else drawDrum(ctx, p, f);
    }
  }

  // Drumsticks follow the forearms.
  drawOver(r, scene) {
    const { ctx } = r;
    const b = scene.body;
    const S = b.S;
    for (const side of ['L', 'R']) {
      const h = b.hand[side];
      const e = b.elbow[side];
      const len = Math.hypot(h.x - e.x, h.y - e.y) || 1;
      const dx = (h.x - e.x) / len;
      const dy = (h.y - e.y) / len;
      const tip = { x: h.x + dx * S * 0.85, y: h.y + dy * S * 0.85 };
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#d4a373';
      ctx.lineWidth = S * 0.07;
      ctx.beginPath();
      ctx.moveTo(h.x - dx * S * 0.15, h.y - dy * S * 0.15);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
      ctx.fillStyle = '#f5deb3';
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, S * 0.05, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawDrum(ctx, p, f) {
  const r = p.rr * (1 + f * 0.06);
  const h = r * 0.55;
  // Shell
  const g = ctx.createLinearGradient(p.cx - r, 0, p.cx + r, 0);
  g.addColorStop(0, shade(p.color, -0.4));
  g.addColorStop(0.5, p.color);
  g.addColorStop(1, shade(p.color, -0.4));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p.cx, p.cy + h, r, r * 0.35, 0, 0, Math.PI);
  ctx.lineTo(p.cx - r, p.cy);
  ctx.ellipse(p.cx, p.cy, r, r * 0.35, 0, Math.PI, 0, true);
  ctx.closePath();
  ctx.fill();
  // Head
  ctx.fillStyle = f > 0 ? `rgb(${255},${245 - f * 30},${200 - f * 120})` : '#f3f4f6';
  ctx.strokeStyle = '#9ca3af';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.ellipse(p.cx, p.cy, r, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function drawBass(ctx, p, f) {
  const r = p.rr * (1 + f * 0.05);
  ctx.fillStyle = shade(p.color, -0.3);
  ctx.beginPath();
  ctx.arc(p.cx, p.cy, r * 1.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = f > 0 ? '#fff7ed' : '#f3f4f6';
  ctx.beginPath();
  ctx.arc(p.cx, p.cy, r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111827';
  ctx.font = `900 ${r * 0.42}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('AIR', p.cx, p.cy);
}

function drawCymbal(ctx, p, f, time) {
  const r = p.rr;
  const tilt = Math.sin(time * 30) * f * 0.12;
  const g = ctx.createRadialGradient(p.cx, p.cy, r * 0.05, p.cx, p.cy, r);
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.5, f > 0 ? '#fde047' : '#eab308');
  g.addColorStop(1, '#a16207');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p.cx, p.cy, r, r * 0.22, tilt, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.ellipse(p.cx, p.cy - r * 0.03, r * 0.12, r * 0.05, tilt, 0, Math.PI * 2);
  ctx.fill();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
