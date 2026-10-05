// "Get in position" gate: nothing plays until the player is in view, both hands are visible,
// they're a sensible distance from the phone and they've held still for a moment (3-2-1).
// While playing, walking up to the phone or leaving the picture pauses it again, so setting the
// phone down or picking it up never makes noise.
import { LM } from './body.js';

export const READY = {
  HOLD_MS: 2400, // in position and still this long → go (shown as 3, 2, 1)
  CLOSE: 0.38, // shoulder width as a fraction of frame height: closer than about 1 m
  FAR: 0.07, // ...or further than about 5 m
  STILL: 0.8, // average movement of shoulders and wrists, shoulder-widths per second
  PAUSE_MS: 800, // too close or out of view this long while playing → pause
};

const SEEN = 0.6;

export class ReadyGate {
  constructor() {
    this.reset();
  }

  reset() {
    this.ready = false;
    this.paused = false;
    this.okSince = null;
    this.badSince = null;
    this.prev = null;
    this.prevT = 0;
    this.motion = 1;
    this.progress = 0;
    this.justStarted = false;
    this.justPaused = false;
    this.checks = { seen: false, hands: false, dist: 'unknown', still: false };
  }

  // raw: this frame's landmarks, or null when nobody is detected. aspect: camera width/height.
  // handsActive: { L, R } (steadily visible). now: ms.
  update(raw, aspect, handsActive, now) {
    const c = { seen: false, hands: !!(handsActive.L && handsActive.R), dist: 'unknown', still: false };
    if (raw) {
      const vis = (i) => (raw[i].visibility ?? 1) > SEEN;
      c.seen = vis(LM.nose) && vis(LM.shoulderL) && vis(LM.shoulderR);
      if (c.seen) {
        // Shoulder width relative to the frame height works the same upright or sideways.
        const sw = Math.abs(raw[LM.shoulderL].x - raw[LM.shoulderR].x) * aspect;
        c.dist = sw > READY.CLOSE ? 'close' : sw < READY.FAR ? 'far' : 'ok';
        const pts = [LM.shoulderL, LM.shoulderR, LM.wristL, LM.wristR].map((i) => raw[i]);
        if (this.prev && now > this.prevT) {
          const dt = (now - this.prevT) / 1000;
          let d = 0;
          pts.forEach((p, k) => (d += Math.hypot((p.x - this.prev[k].x) * aspect, p.y - this.prev[k].y)));
          const speed = d / pts.length / dt / Math.max(sw, 0.05);
          this.motion += (speed - this.motion) * Math.min(1, dt * 3);
        }
        this.prev = pts.map((p) => ({ x: p.x, y: p.y }));
        this.prevT = now;
        c.still = this.motion < READY.STILL;
      }
    } else {
      this.prev = null;
      this.motion = 1;
    }
    this.checks = c;
    this.justStarted = false;
    this.justPaused = false;

    if (!this.ready) {
      const ok = c.seen && c.hands && c.dist === 'ok' && c.still;
      if (ok) this.okSince ??= now;
      else this.okSince = null;
      this.progress = this.okSince === null ? 0 : Math.min(1, (now - this.okSince) / READY.HOLD_MS);
      if (this.progress >= 1) {
        this.ready = true;
        this.paused = false;
        this.badSince = null;
        this.justStarted = true;
      }
    } else {
      // Hidden hands alone don't pause (the player may just be resting them).
      const bad = !c.seen || c.dist === 'close';
      if (bad) this.badSince ??= now;
      else this.badSince = null;
      if (this.badSince !== null && now - this.badSince > READY.PAUSE_MS) {
        this.ready = false;
        this.paused = true;
        this.okSince = null;
        this.progress = 0;
        this.justPaused = true;
      }
    }
    return this;
  }
}
