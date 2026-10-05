// Player lock: with several people in view (say, a little sister joining in), keep following
// the one who is actually playing. Before the game starts we pick whoever is front and centre;
// once playing we follow that person from frame to frame and ignore everyone else. If the
// player disappears we report nobody (so the game pauses) rather than switching to someone else.
import { LM } from './body.js';

const SEEN = 0.5;

// Where a person is and how big they look (shoulder width), in frame-height units.
function feature(lm, aspect) {
  const sl = lm[LM.shoulderL];
  const sr = lm[LM.shoulderR];
  const nose = lm[LM.nose];
  const vis = (p) => (p.visibility ?? 1) > SEEN;
  if (vis(sl) && vis(sr)) {
    return {
      x: ((sl.x + sr.x) / 2) * aspect,
      y: (sl.y + sr.y) / 2,
      s: Math.max(0.02, Math.abs(sl.x - sr.x) * aspect),
    };
  }
  // Only the head is clear: estimate from the nose and ears.
  const ear = Math.abs(lm[LM.earL].x - lm[LM.earR].x) * aspect;
  return { x: nose.x * aspect, y: nose.y + ear * 1.2, s: Math.max(0.02, ear * 2) };
}

export class PlayerLock {
  constructor() {
    this.reset();
  }

  reset() {
    this.locked = null; // { x, y, s } of the player
    this.challenger = 0; // frames someone else has looked like the better player
    this.missing = 0; // frames the player hasn't been found
    this.confident = false; // is this frame's match surely the player? (only then play notes)
  }

  // poses: array of landmark arrays from the tracker. playing: the game has started.
  // Returns the player's landmarks, or null if the player isn't in view.
  pick(poses, aspect, playing) {
    this.confident = false;
    if (!poses || !poses.length) {
      this.missing++;
      return null;
    }
    const feats = poses.map((lm) => feature(lm, aspect));
    this.lastFeats = feats; // for debugging
    // Front (bigger) and centre makes the best player.
    const score = (f) => f.s * 2 - Math.abs(f.x - aspect / 2) * 0.6;
    let best = 0;
    for (let k = 1; k < feats.length; k++) if (score(feats[k]) > score(feats[best])) best = k;

    if (!this.locked) return this.lockOn(feats, poses, best);

    // Where's the player now? Between two frames (~1/30 s) a person moves well under one
    // shoulder width; with nobody else around a quick lean can't be confused, so allow more.
    const { i, d } = this.nearest(feats);
    const found = i >= 0 && d < (feats.length === 1 ? 1.2 : 0.8);

    if (playing) {
      if (!found) {
        this.missing++;
        return null; // player gone or hidden: never jump to someone else mid-game
      }
      return this.follow(feats, poses, i);
    }

    // Getting ready: stay with the chosen person. Only hand over if someone else is clearly the
    // better player for half a second, or the chosen one has been gone for a while.
    if (found) {
      const clearlyBetter = best !== i && score(feats[best]) > score(feats[i]) + 0.04;
      this.challenger = clearlyBetter ? this.challenger + 1 : 0;
      if (this.challenger >= 15) return this.lockOn(feats, poses, best);
      return this.follow(feats, poses, i);
    }
    this.missing++;
    if (this.missing >= 10) return this.lockOn(feats, poses, best);
    return null;
  }

  lockOn(feats, poses, k) {
    this.locked = { ...feats[k] };
    this.confident = true;
    this.challenger = 0;
    this.missing = 0;
    return poses[k];
  }

  follow(feats, poses, k) {
    const f = feats[k];
    const L = this.locked;
    // A confident match moves the lock with the player; a doubtful one (someone crossing the
    // player's spot while they're hidden) barely moves it, so it can't be dragged away.
    const d = Math.hypot(f.x - L.x, f.y - L.y) / L.s + Math.abs(Math.log(f.s / L.s));
    this.confident = d < 0.35;
    const a = this.confident ? 0.7 : 0.1;
    L.x += (f.x - L.x) * a;
    L.y += (f.y - L.y) * a;
    L.s += (f.s - L.s) * a * 0.4;
    this.missing = 0;
    return poses[k];
  }

  // The person closest to the locked player, distance measured in the player's shoulder widths.
  nearest(feats) {
    const L = this.locked;
    let i = -1;
    let d = Infinity;
    feats.forEach((f, k) => {
      const dk = Math.hypot(f.x - L.x, f.y - L.y) / L.s + Math.abs(Math.log(f.s / L.s));
      if (dk < d) {
        d = dk;
        i = k;
      }
    });
    return { i, d };
  }
}
