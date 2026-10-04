import { PRESETS } from './chords.js';
import { GuitarAudio } from './audio.js';
import { PoseTracker, DemoTracker } from './tracker.js';
import { Renderer, GEO } from './render.js';

// MediaPipe pose landmark indices.
const LM = {
  nose: 0, eyeL: 2, eyeR: 5, earL: 7, earR: 8,
  shoulderL: 11, shoulderR: 12, elbowL: 13, elbowR: 14, wristL: 15, wristR: 16,
  indexL: 19, indexR: 20, hipL: 23, hipR: 24, kneeL: 25, kneeR: 26, ankleL: 27, ankleR: 28,
};
// Note: MediaPipe's "left" (odd indices) is the person's left. We label sides as the
// person's own L/R throughout, so "R" is a right-handed player's strumming hand.

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
const audio = new GuitarAudio();
const renderer = new Renderer($('stage'));
const video = $('camera');

let tracker = null;
let smooth = null; // smoothed landmarks for drawing
let lastSeen = 0;
let body = null;
let guitar = null;
let zone = 0;
let neckAngle = null;
let strum = { armed: 0, v: null, t: 0 };
let mouth = 0;
let view = null; // auto-zoom so the avatar + guitar always fit on screen
let lastFrame = performance.now();
const stats = { frames: 0, poses: 0 };

function loadSettings() {
  const d = { preset: 'campfire', tone: 'acoustic', lefty: false, showCam: true };
  try {
    return { ...d, ...JSON.parse(localStorage.getItem('airguitar') || '{}') };
  } catch {
    return d;
  }
}
function saveSettings() {
  try {
    localStorage.setItem('airguitar', JSON.stringify(settings));
  } catch {}
}
const chords = () => PRESETS[settings.preset].chords;

// ---------- Pose -> screen-space body ----------

function toScreen(lm, aspect) {
  // Fit the (mirrored) camera image inside the screen, anchored to the floor line.
  const W = renderer.w;
  const H = renderer.h;
  const scale = Math.min(W / aspect, H * 0.95);
  const iw = aspect * scale;
  const ox = (W - iw) / 2;
  const oy = H * 0.9 - scale;
  return { x: ox + (1 - lm.x) * iw, y: oy + lm.y * scale, v: lm.visibility ?? 1 };
}

function smoothLandmarks(raw) {
  if (!smooth) return (smooth = raw.map((p) => ({ ...p })));
  for (let i = 0; i < raw.length; i++) {
    const s = smooth[i];
    const r = raw[i];
    const d = Math.hypot(r.x - s.x, r.y - s.y);
    const a = Math.min(0.9, 0.35 + d * 12); // move fast when the joint moves fast
    s.x += (r.x - s.x) * a;
    s.y += (r.y - s.y) * a;
    s.visibility = r.visibility;
  }
  return smooth;
}

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function buildBody(lms, aspect) {
  const P = (i) => toScreen(lms[i], aspect);
  const shoulder = { L: P(LM.shoulderL), R: P(LM.shoulderR) };
  const S = Math.max(40, dist(shoulder.L, shoulder.R));
  const mid = lerp(shoulder.L, shoulder.R, 0.5);

  // Phones often can't see your hips/legs, so make up a sensible stance when hidden.
  const guess = (side, down, spread) => ({
    x: mid.x + (shoulder[side].x - mid.x) * spread,
    y: mid.y + S * down,
  });
  const pick = (i, side, down, spread) => {
    const p = P(i);
    return p.v > 0.5 && p.y < renderer.h * 1.2 ? p : guess(side, down, spread);
  };
  const hip = { L: pick(LM.hipL, 'L', 1.55, 0.7), R: pick(LM.hipR, 'R', 1.55, 0.7) };
  const hipMid = lerp(hip.L, hip.R, 0.5);
  const legGuess = (side, k) => ({ x: hip[side].x + (hip[side].x - hipMid.x) * 0.3 * k, y: hip[side].y + S * 1.0 * k });
  const knee = {}, ankle = {};
  for (const side of ['L', 'R']) {
    const k = P(LM['knee' + side]);
    const a = P(LM['ankle' + side]);
    knee[side] = k.v > 0.5 ? k : legGuess(side, 1);
    ankle[side] = a.v > 0.5 && k.v > 0.5 ? a : legGuess(side, 2);
  }
  const elbow = { L: P(LM.elbowL), R: P(LM.elbowR) };
  const wrist = { L: P(LM.wristL), R: P(LM.wristR) };
  const hand = {
    L: lerp(wrist.L, P(LM.indexL), 0.6),
    R: lerp(wrist.R, P(LM.indexR), 0.6),
  };

  const nose = P(LM.nose);
  const eyeL = P(LM.eyeL);
  const eyeR = P(LM.eyeR);
  const earDist = dist(P(LM.earL), P(LM.earR));
  const r = Math.max(S * 0.32, earDist * 0.62);
  // Tilt from the eye line, measured left-to-right on screen so the head never flips over.
  const [ea, eb] = eyeL.x < eyeR.x ? [eyeL, eyeR] : [eyeR, eyeL];
  const angle = Math.max(-0.6, Math.min(0.6, Math.atan2(eb.y - ea.y, eb.x - ea.x)));
  const head = { c: { x: nose.x, y: nose.y - r * 0.15 }, r, angle };
  const neckBase = { x: mid.x, y: mid.y - S * 0.05 };

  return { S, shoulder, hip, knee, ankle, elbow, wrist, hand, head, neckBase, mid, hipMid };
}

// ---------- Guitar placement ----------

function buildGuitar(b, dt) {
  const strumSide = settings.lefty ? 'L' : 'R';
  const fretSide = settings.lefty ? 'R' : 'L';
  const S = b.S;
  // Sound hole sits over the belly, a little towards the strumming side.
  const origin = lerp(b.mid, b.hipMid, 0.66);
  origin.x += (b.shoulder[strumSide].x - b.mid.x) * 0.35;

  // Neck points at the fretting hand, within a guitar-ish range of angles.
  const side = Math.sign(b.shoulder[fretSide].x - b.shoulder[strumSide].x) || 1;
  const to = b.hand[fretSide];
  let ang = Math.atan2(to.y - origin.y, (to.x - origin.x) * side);
  ang = Math.max(-1.25, Math.min(0.45, ang));
  neckAngle = neckAngle === null ? ang : neckAngle + (ang - neckAngle) * Math.min(1, dt * 18);
  const dir = { x: Math.cos(neckAngle) * side, y: Math.sin(neckAngle) };
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

function updateZone(g, b) {
  const list = chords();
  const u = g.local(b.hand[g.fretSide]).u;
  const zl = (GEO.nut - GEO.zoneEnd) / list.length;
  const f = (GEO.nut - u) / zl; // 0 at the nut, grows towards the body
  const clamped = Math.max(0, Math.min(list.length - 0.001, f));
  // Hysteresis so the chord doesn't flicker on a zone boundary.
  if (clamped < zone - 0.15 || clamped > zone + 1.15) {
    zone = Math.floor(clamped);
    showChord(false);
  }
}

// Strum = strumming hand crossing the strings (perpendicular to the neck).
function detectStrum(rawLms, aspect, g, now) {
  const p = toScreen(rawLms[settings.lefty ? LM.wristL : LM.wristR], aspect);
  const idx = toScreen(rawLms[settings.lefty ? LM.indexL : LM.indexR], aspect);
  const hand = lerp(p, idx, 0.6);
  const { u, v } = g.local(hand);
  const t = now / 1000;
  const prev = strum.v;
  const dt = Math.max(1 / 120, t - strum.t);
  strum.v = v;
  strum.t = t;
  if (prev === null) return;
  const near = u > -1.5 && u < 1.3 && Math.abs(v) < 1.4;
  if (!near) {
    strum.armed = 0;
    return;
  }
  const H = 0.12;
  if (Math.abs(v) > H) {
    const sideNow = Math.sign(v);
    if (strum.armed === 0) strum.armed = sideNow;
  }
  if (strum.armed !== 0 && Math.sign(v) === -strum.armed && Math.sign(prev) !== Math.sign(v)) {
    const speed = Math.abs(v - prev) / dt; // shoulder-widths per second
    strum.armed = 0;
    if (speed < 0.8) return;
    const velocity = Math.min(1, speed / 7);
    const direction = v > prev ? 'down' : 'up';
    playStrum(direction, velocity, g.at(0, 0));
  }
}

function playStrum(direction, velocity, at) {
  const name = chords()[zone];
  audio.strum(name, direction, velocity);
  renderer.onStrum(direction, velocity, at, settings.tone === 'rock' ? '#ff5d73' : '#ffd65a');
  mouth = Math.min(1.2, mouth + 0.5 + velocity * 0.5);
  showChord(true);
}

function updateView(b, g, dt) {
  const S = b.S;
  const pts = [
    { x: b.head.c.x, y: b.head.c.y - b.head.r * 1.6 },
    b.ankle.L, b.ankle.R, b.hand.L, b.hand.R, b.elbow.L, b.elbow.R, b.shoulder.L, b.shoulder.R,
    g.at(GEO.head + 0.1, -0.45), g.at(GEO.head + 0.1, 0.3), g.at(-1, 0.65), g.at(-1, -0.65),
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + S * 0.1);
  }
  const W = renderer.w, H = renderer.h;
  const top = 84, bottom = 76, side = 10;
  const k = Math.min(2.5, (W - side * 2) / (x1 - x0), (H - top - bottom) / (y1 - y0));
  // Centre horizontally, rest the feet just above the chord strip.
  const tx = W / 2 - ((x0 + x1) / 2) * k;
  const ty = H - bottom - y1 * k;
  if (!view) view = { k, x: tx, y: ty };
  const a = Math.min(1, dt * 2.5);
  view.k += (k - view.k) * a;
  view.x += (tx - view.x) * a;
  view.y += (ty - view.y) * a;
}

// ---------- HUD ----------

function showChord(pulse) {
  const el = $('chord');
  el.textContent = chords()[zone];
  if (pulse) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }
  [...$('strip').children].forEach((c, i) => c.classList.toggle('on', i === zone));
}

function buildStrip() {
  const strip = $('strip');
  strip.innerHTML = '';
  for (const name of chords()) {
    const d = document.createElement('div');
    d.textContent = name;
    strip.appendChild(d);
  }
  zone = Math.min(zone, chords().length - 1);
  showChord(false);
}

function applySettings() {
  $('preset').value = settings.preset;
  $('tone').value = settings.tone;
  $('lefty').checked = settings.lefty;
  $('showcam').checked = settings.showCam;
  video.classList.toggle('hidden', !settings.showCam || !(tracker instanceof PoseTracker));
  audio.setTone(settings.tone);
  audio.prepare(chords());
  buildStrip();
  saveSettings();
}

function status(msg) {
  $('status').textContent = msg || '';
  $('status').classList.toggle('hidden', !msg);
}

// ---------- Main loop ----------

function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  mouth *= Math.exp(-dt * 4);

  if (tracker) {
    let raw;
    try {
      raw = tracker.detect(now);
    } catch (e) {
      console.error(e);
    }
    if (raw !== undefined) stats.frames++;
    if (raw) {
      stats.poses++;
      lastSeen = now;
      const aspect = tracker.aspect;
      body = buildBody(smoothLandmarks(raw), aspect);
      guitar = buildGuitar(body, dt);
      updateZone(guitar, body);
      detectStrum(raw, aspect, guitar, now);
      updateView(body, guitar, dt);
      status('');
    } else if (raw === null && now - lastSeen > 800) {
      status('Step back so the camera can see your upper body 🎸');
      strum.v = null;
    }
  }

  const alpha = body ? Math.max(0, Math.min(1, 1 - (now - lastSeen - 800) / 600)) : 0;
  renderer.frame(dt, {
    time: now / 1000,
    body: alpha > 0 ? body : null,
    guitar,
    alpha,
    zone,
    chords: chords(),
    tone: settings.tone,
    mouth,
    view: view || { k: 1, x: 0, y: 0 },
  });
  requestAnimationFrame(loop);
}

async function start(demo) {
  $('intro').classList.add('hidden');
  try {
    await audio.start();
    audio.prepare(chords());
  } catch (e) {
    console.error('Audio failed', e);
  }
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  try {
    if (demo) {
      tracker = new DemoTracker();
    } else {
      const t = new PoseTracker(video);
      await t.init(status);
      tracker = t;
    }
    status(demo ? '' : 'Step back so the camera can see your upper body 🎸');
  } catch (e) {
    console.error(e);
    status('');
    $('intro').classList.remove('hidden');
    $('error').textContent =
      e && e.name === 'NotAllowedError'
        ? 'Camera permission was blocked. Allow camera access for this site in your browser settings, then try again.'
        : `Couldn't start the camera or body tracker (${e && e.message ? e.message : e}). Try the demo, or reload.`;
    return;
  }
  $('hud').classList.remove('hidden');
  applySettings();
}

// ---------- Wire up UI ----------

for (const [key, p] of Object.entries(PRESETS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = `${p.name} (${p.chords.join(' ')})`;
  $('preset').appendChild(o);
}
$('preset').addEventListener('change', (e) => {
  settings.preset = e.target.value;
  settings.tone = PRESETS[settings.preset].tone;
  applySettings();
});
$('tone').addEventListener('change', (e) => {
  settings.tone = e.target.value;
  applySettings();
});
$('lefty').addEventListener('change', (e) => {
  settings.lefty = e.target.checked;
  neckAngle = null;
  applySettings();
});
$('showcam').addEventListener('change', (e) => {
  settings.showCam = e.target.checked;
  applySettings();
});
$('gear').addEventListener('click', () => $('panel').classList.toggle('hidden'));
$('close').addEventListener('click', () => $('panel').classList.add('hidden'));
$('play').addEventListener('click', () => start(false));
$('demo').addEventListener('click', () => start(true));
// Tap anywhere on the stage to strum too — handy for checking the sound.
$('stage').addEventListener('pointerdown', () => {
  if (tracker && guitar) playStrum('down', 0.6, guitar.at(0, 0));
});
window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && tracker && navigator.wakeLock) {
    navigator.wakeLock.request('screen').catch(() => {});
  }
});

renderer.resize();
applySettings();
requestAnimationFrame(loop);

// Service worker only for the website; the Android app already has its files on the device.
if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.Capacitor) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
if (new URLSearchParams(location.search).has('demo')) start(true);

// Exposed for debugging in the browser console.
window.airguitar = { audio, settings, stats, get zone() { return zone; } };
