// Player lock: with several people in view (say, a little sister joining in), keep following
// the one who is actually playing. Before the game starts we pick whoever is front and centre;
// once playing we follow that person from frame to frame and ignore everyone else. If the
// player disappears we report nobody (so the game pauses) rather than switching to someone else.
import { LM } from './body.js';

const SEEN = 0.5;
const vis = (p) => (p.visibility ?? 1) > SEEN;

// MediaPipe's left/right point pairs (eyes, ears, mouth, arms, hands, legs, feet).
const PAIRS = [[1, 4], [2, 5], [3, 6], [7, 8], [9, 10]];
for (let i = 11; i < 33; i += 2) PAIRS.push([i, i + 1]);
// Points that show where someone's upper body and arms are, for frame-to-frame matching.
const UPPER = [0, 11, 12, 13, 14, 15, 16];

function swapSides(lm) {
  const out = lm.slice();
  for (const [a, b] of PAIRS) {
    out[a] = lm[b];
    out[b] = lm[a];
  }
  return out;
}

// How different two poses of the same person look, in shoulder widths (points seen in both).
function poseGap(a, b, aspect, s) {
  let sum = 0;
  let n = 0;
  for (const i of UPPER) {
    if (!vis(a[i]) || !vis(b[i])) continue;
    sum += Math.hypot((a[i].x - b[i].x) * aspect, a[i].y - b[i].y);
    n++;
  }
  return n ? sum / n / s : 0;
}

// Where a person is and how big they look (shoulder width), in frame-height units.
function feature(lm, aspect) {
  const sl = lm[LM.shoulderL];
  const sr = lm[LM.shoulderR];
  const nose = lm[LM.nose];
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
    this.prev = null; // the player's pose last frame, sides sorted out
  }

  // The tracker sometimes reports one person twice (same body, arms in different places).
  // Hopping between the copies makes the avatar jump about, so keep one copy per person: the
  // one that carries on smoothly from last frame.
  merge(poses, feats, aspect) {
    const keep = [];
    poses.forEach((lm, k) => {
      const f = feats[k];
      const twin = keep.find((j) => {
        const g = feats[j];
        const s = Math.max(f.s, g.s);
        return Math.hypot(f.x - g.x, f.y - g.y) / s < 0.5 && Math.abs(Math.log(f.s / g.s)) < 0.4;
      });
      if (twin === undefined) return keep.push(k);
      if (this.prev && this.mismatch(lm, aspect) < this.mismatch(poses[twin], aspect)) keep[keep.indexOf(twin)] = k;
    });
    return keep;
  }

  mismatch(lm, aspect) {
    const s = this.locked ? this.locked.s : 0.2;
    return Math.min(poseGap(lm, this.prev, aspect, s), poseGap(swapSides(lm), this.prev, aspect, s));
  }

  // Now and then the tracker mixes up someone's left and right for a frame, which would flip the
  // guitar to the other side. People face the phone and can't swap sides between two frames, so
  // put the sides back. (With nothing to compare against, facing the camera means the left
  // shoulder is on the image's right.)
  sortSides(lm, aspect) {
    const sl = lm[LM.shoulderL];
    const sr = lm[LM.shoulderR];
    if (!this.prev) return vis(sl) && vis(sr) && sl.x < sr.x ? swapSides(lm) : lm;
    const s = this.locked ? this.locked.s : 0.2;
    const keep = poseGap(lm, this.prev, aspect, s);
    const swapped = swapSides(lm);
    const swap = poseGap(swapped, this.prev, aspect, s);
    return swap < keep * 0.5 && keep - swap > 0.3 ? swapped : lm;
  }

  done(lm, aspect) {
    if (!lm) {
      if (this.missing > 10) this.prev = null; // been gone a while: start afresh
      return null;
    }
    return (this.prev = this.sortSides(lm, aspect));
  }

  // poses: array of landmark arrays from the tracker. playing: the game has started.
  // Returns the player's landmarks, or null if the player isn't in view.
  pick(poses, aspect, playing) {
    return this.done(this.choose(poses, aspect, playing), aspect);
  }

  choose(poses, aspect, playing) {
    this.confident = false;
    if (!poses || !poses.length) {
      this.missing++;
      return null;
    }
    let feats = poses.map((lm) => feature(lm, aspect));
    const keep = this.merge(poses, feats, aspect);
    poses = keep.map((k) => poses[k]);
    feats = keep.map((k) => feats[k]);
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
