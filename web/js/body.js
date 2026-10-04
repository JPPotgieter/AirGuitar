// Turns MediaPipe pose landmarks into a screen-space skeleton for the avatar and instruments.

// MediaPipe pose landmark indices. MediaPipe's "left" (odd indices) is the person's own left;
// we label sides the same way, so "R" is a right-handed player's strumming / stick hand.
export const LM = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  indexL: 19, indexR: 20, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28,
};

export const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

// MediaPipe always returns all 33 points, guessing the ones it can't see (e.g. hands below
// the frame when only your face is visible). Its visibility score tells real from guessed.
const SEEN = 0.6;
const seen = (lm) => (lm.visibility ?? 1) > SEEN;

// Is this hand (wrist and index finger) really visible right now? side: 'L' | 'R'
export function handVisible(lms, side) {
  return side === 'L' ? seen(lms[LM.wristL]) && seen(lms[LM.indexL]) : seen(lms[LM.wristR]) && seen(lms[LM.indexR]);
}
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Fit the (mirrored) camera image inside the screen, anchored to the floor line.
function toScreen(lm, aspect, W, H) {
  const scale = Math.min(W / aspect, H * 0.95);
  const iw = aspect * scale;
  const ox = (W - iw) / 2;
  const oy = H * 0.9 - scale;
  return { x: ox + (1 - lm.x) * iw, y: oy + lm.y * scale, v: lm.visibility ?? 1 };
}

// Light smoothing for drawing: joints follow quickly when they move fast, steadily when still.
export class LandmarkSmoother {
  constructor() {
    this.s = null;
  }
  reset() {
    this.s = null;
  }
  push(raw) {
    if (!this.s) return (this.s = raw.map((p) => ({ ...p })));
    for (let i = 0; i < raw.length; i++) {
      const s = this.s[i];
      const r = raw[i];
      if (!Number.isFinite(r.x) || !Number.isFinite(r.y)) continue;
      const d = Math.hypot(r.x - s.x, r.y - s.y);
      const a = Math.min(0.9, 0.35 + d * 12);
      s.x += (r.x - s.x) * a;
      s.y += (r.y - s.y) * a;
      s.visibility = r.visibility;
    }
    return this.s;
  }
}

// handWeight: 0..1 per hand, how much to trust the tracked hand (0 = rest it at the side).
export function buildBody(lms, aspect, W, H, handWeight = { L: 1, R: 1 }) {
  const P = (i) => toScreen(lms[i], aspect, W, H);
  let shoulder = { L: P(LM.shoulderL), R: P(LM.shoulderR) };
  const earL = P(LM.earL);
  const earR = P(LM.earR);
  const earDist = dist(earL, earR);
  if (!seen(lms[LM.shoulderL]) || !seen(lms[LM.shoulderR])) {
    // Only the face is in view: place the shoulders from the head rather than from guesses.
    const nose = P(LM.nose);
    const half = Math.max(20, earDist * 1.3);
    const dir = Math.sign(earL.x - earR.x) || -1; // screen side of the person's left
    const y = nose.y + earDist * 1.9;
    shoulder = { L: { x: nose.x + dir * half, y, v: 1 }, R: { x: nose.x - dir * half, y, v: 1 } };
  }
  const S = Math.max(40, dist(shoulder.L, shoulder.R));
  const mid = lerp(shoulder.L, shoulder.R, 0.5);

  // Phones often can't see your hips/legs, so make up a sensible stance when hidden.
  const guess = (side, down, spread) => ({
    x: mid.x + (shoulder[side].x - mid.x) * spread,
    y: mid.y + S * down,
  });
  const pick = (i, side, down, spread) => {
    const p = P(i);
    return p.v > 0.5 && p.y < H * 1.2 ? p : guess(side, down, spread);
  };
  const hip = { L: pick(LM.hipL, 'L', 1.55, 0.7), R: pick(LM.hipR, 'R', 1.55, 0.7) };
  const hipMid = lerp(hip.L, hip.R, 0.5);
  const legGuess = (side, k) => ({ x: hip[side].x + (hip[side].x - hipMid.x) * 0.3 * k, y: hip[side].y + S * 1.0 * k });
  const knee = {}, ankle = {}, legsSeen = {};
  for (const side of ['L', 'R']) {
    const k = P(LM['knee' + side]);
    const a = P(LM['ankle' + side]);
    legsSeen[side] = k.v > SEEN;
    knee[side] = k.v > SEEN ? k : legGuess(side, 1);
    ankle[side] = a.v > SEEN && k.v > SEEN ? a : legGuess(side, 2);
  }
  const elbow = {}, wrist = {}, hand = {};
  for (const side of ['L', 'R']) {
    const w = Math.max(0, Math.min(1, handWeight[side]));
    const out = Math.sign(shoulder[side].x - mid.x) || (side === 'L' ? -1 : 1);
    // Resting pose: arm hanging relaxed at the side.
    const restElbow = { x: shoulder[side].x + out * S * 0.12, y: shoulder[side].y + S * 0.95 };
    const restWrist = { x: restElbow.x + out * S * 0.03, y: restElbow.y + S * 0.85 };
    const restHand = { x: restWrist.x, y: restWrist.y + S * 0.12 };
    const tw = P(LM['wrist' + side]);
    elbow[side] = lerp(restElbow, P(LM['elbow' + side]), w);
    wrist[side] = lerp(restWrist, tw, w);
    hand[side] = lerp(restHand, lerp(tw, P(LM['index' + side]), 0.6), w);
  }

  const nose = P(LM.nose);
  const eyeL = P(LM.eyeL);
  const eyeR = P(LM.eyeR);
  const r = Math.max(S * 0.32, earDist * 0.62);
  // Tilt from the eye line, measured left-to-right on screen so the head never flips over.
  const [ea, eb] = eyeL.x < eyeR.x ? [eyeL, eyeR] : [eyeR, eyeL];
  const angle = Math.max(-0.6, Math.min(0.6, Math.atan2(eb.y - ea.y, eb.x - ea.x)));
  const head = { c: { x: nose.x, y: nose.y - r * 0.15 }, r, angle };
  const neckBase = { x: mid.x, y: mid.y - S * 0.05 };
  const mouth = { x: head.c.x - Math.sin(angle) * r * 0.48, y: head.c.y + Math.cos(angle) * r * 0.48 };

  return { S, shoulder, hip, knee, ankle, legsSeen, elbow, wrist, hand, head, mouth, neckBase, mid, hipMid };
}
