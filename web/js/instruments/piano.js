import { PianoVoice } from '../sounds.js';
import { HitDetector } from './drums.js';

// Two octaves of white keys, C3..C5. Only white keys (C major), so any keys sound good together.
const KEYS = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const freqOf = (name) => 440 * Math.pow(2, ((Number(name[1]) + 1) * 12 + SEMI[name[0]] - 69) / 12);
// Black keys sit after these white keys (drawn for looks; you play the white keys).
const HAS_BLACK = new Set(['C', 'D', 'F', 'G', 'A']);

// Keyboard size and position, in shoulder-widths (S) from the middle of the shoulders.
const KB = { width: 3.6, y: 1.25, keyH: 0.62 };

// Air piano: a keyboard at waist height. Tap down with either hand; the key under it plays.
export class PianoInstrument {
  constructor(app) {
    this.app = app;
    this.id = 'piano';
    this.voice = new PianoVoice(app.audio);
    this.hands = { L: new HitDetector(1.5, 0.1), R: new HitDetector(1.5, 0.1) };
    this.flash = new Array(KEYS.length).fill(0);
    this.lastKey = -1;
    this.kb = null;
  }

  reset() {
    this.hands.L.reset();
    this.hands.R.reset();
  }

  lost() {
    this.reset();
  }

  stripItems() {
    // Octave numbers only on the Cs to keep the strip short.
    return { items: KEYS.map((k) => (k[0] === 'C' ? k : k[0])), index: this.lastKey, label: '🎹' };
  }

  layout(b) {
    const S = b.S;
    // Low notes on the screen side of the player's left hand, like sitting at a real piano.
    const leftX = Math.sign(b.shoulder.L.x - b.shoulder.R.x) || -1;
    const x0 = b.mid.x + leftX * (KB.width / 2) * S;
    const keyW = (KB.width * S) / KEYS.length;
    return { x0, dir: -leftX, keyW, top: b.mid.y + KB.y * S, h: KB.keyH * S, S };
  }

  keyAt(x) {
    const kb = this.kb;
    const i = Math.floor(((x - kb.x0) * kb.dir) / kb.keyW);
    return i >= -1 && i <= KEYS.length ? Math.max(0, Math.min(KEYS.length - 1, i)) : -1;
  }

  update(body, raw, dt, now) {
    this.kb = this.layout(body);
    for (let i = 0; i < this.flash.length; i++) this.flash[i] = Math.max(0, this.flash[i] - dt * 5);
    const t = now / 1000;
    const active = raw.handActive || { L: true, R: true };
    for (const side of ['L', 'R']) {
      if (!active[side]) {
        this.hands[side].reset();
        continue;
      }
      const h = raw.hand[side];
      const speed = this.hands[side].push(h.y / raw.S, t);
      if (!speed) continue;
      // Only taps near the keyboard count.
      const kb = this.kb;
      if (h.y < kb.top - kb.S * 1.1 || h.y > kb.top + kb.h + kb.S * 0.6) continue;
      const key = this.keyAt(h.x);
      if (key >= 0) this.play(key, Math.min(1, 0.25 + speed / 10));
    }
  }

  play(key, velocity) {
    this.voice.play(freqOf(KEYS[key]), velocity);
    this.flash[key] = 1;
    this.lastKey = key;
    const kb = this.kb;
    const x = kb.x0 + kb.dir * (key + 0.5) * kb.keyW;
    this.app.onNote({ x, y: kb.top - kb.S * 0.2 }, velocity, '#a5f3fc');
    this.app.setLabel(KEYS[key], key, true);
  }

  tap() {
    if (this.kb) this.play(7, 0.7); // middle C
  }

  viewPoints() {
    const kb = this.kb;
    if (!kb) return [];
    const x1 = kb.x0 + kb.dir * KEYS.length * kb.keyW;
    return [
      { x: kb.x0, y: kb.top },
      { x: x1, y: kb.top + kb.h + kb.S * 1.1 },
    ];
  }

  // Keyboard on a stand, in front of the body and behind the hands.
  draw(r) {
    const kb = this.kb;
    if (!kb) return;
    const { ctx } = r;
    const S = kb.S;
    const xL = Math.min(kb.x0, kb.x0 + kb.dir * KEYS.length * kb.keyW);
    const w = KEYS.length * kb.keyW;
    // Stand
    ctx.strokeStyle = '#4b5563';
    ctx.lineWidth = S * 0.06;
    ctx.beginPath();
    ctx.moveTo(xL + w * 0.2, kb.top + kb.h);
    ctx.lineTo(xL + w * 0.32, kb.top + kb.h + S * 1.05);
    ctx.moveTo(xL + w * 0.8, kb.top + kb.h);
    ctx.lineTo(xL + w * 0.68, kb.top + kb.h + S * 1.05);
    ctx.moveTo(xL + w * 0.26, kb.top + kb.h + S * 0.5);
    ctx.lineTo(xL + w * 0.74, kb.top + kb.h + S * 0.5);
    ctx.stroke();
    // Case
    ctx.fillStyle = '#111827';
    roundRect(ctx, xL - S * 0.12, kb.top - S * 0.22, w + S * 0.24, kb.h + S * 0.3, S * 0.08);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(xL + w * 0.42, kb.top - S * 0.15, w * 0.16, S * 0.05);
    // White keys
    for (let i = 0; i < KEYS.length; i++) {
      const x = kb.x0 + kb.dir * i * kb.keyW - (kb.dir < 0 ? kb.keyW : 0);
      const f = this.flash[i];
      ctx.fillStyle = f > 0 ? `rgb(${255 - f * 90},${255 - f * 20},255)` : '#f9fafb';
      ctx.fillRect(x + 1, kb.top + f * S * 0.03, kb.keyW - 2, kb.h);
      if (KEYS[i][0] === 'C') {
        ctx.fillStyle = '#6b7280';
        ctx.font = `700 ${Math.max(9, S * 0.11)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(KEYS[i], x + kb.keyW / 2, kb.top + kb.h - S * 0.05);
      }
    }
    // Black keys (between white keys)
    ctx.fillStyle = '#111';
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (!HAS_BLACK.has(KEYS[i][0])) continue;
      const edge = kb.x0 + kb.dir * (i + 1) * kb.keyW;
      ctx.fillRect(edge - kb.keyW * 0.3, kb.top, kb.keyW * 0.6, kb.h * 0.6);
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
