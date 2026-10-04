import { PRESETS } from './chords.js';
import { GuitarAudio } from './audio.js';
import { PoseTracker, DemoTracker } from './tracker.js';
import { Renderer, drawGuitarThumb } from './render.js';
import { AVATAR_OPTIONS, DEFAULT_LOOK, GUITARS, randomLook } from './looks.js';
import { buildBody, LandmarkSmoother, handVisible } from './body.js';
import { GuitarInstrument } from './instruments/guitar.js';
import { DrumsInstrument } from './instruments/drums.js';
import { TromboneInstrument } from './instruments/trombone.js';
import { PianoInstrument } from './instruments/piano.js';
import { SaxInstrument } from './instruments/sax.js';
import { VERSION, BUILD } from './version.js';
import { Entitlements, PLAY_URL, TRIAL_DAYS } from './purchases.js';

const $ = (id) => document.getElementById(id);
const settings = loadSettings();
const audio = new GuitarAudio();
const renderer = new Renderer($('stage'));
const video = $('camera');

let tracker = null;
let camTracker = null; // kept between sessions so the body tracker only loads once
let previewTracker = null; // demo performer shown while customising from the start screen
let customFromIntro = false;
const smoother = new LandmarkSmoother();
let lastSeen = 0;
let body = null;
let mouth = 0;
// Hands only count once they've been clearly visible for a moment (no playing on guesses).
const HAND_STEADY_MS = 200;
// Fast moves (like a drum hit) blur the hand and the tracker briefly loses confidence; keep the
// hand active through short dropouts so those hits still count.
const HAND_GRACE_MS = 300;
const hands = {
  L: { since: null, lostAt: null, active: false, weight: 0 },
  R: { since: null, lostAt: null, active: false, weight: 0 },
};
let handsMissingSince = null;
let view = null; // auto-zoom so the avatar + instrument always fit on screen
let lastFrame = performance.now();
const stats = { frames: 0, poses: 0 };

// What each instrument needs from the app.
const app = {
  audio,
  renderer,
  settings,
  onNote(at, velocity, color) {
    renderer.onNote(velocity, at, color);
    mouth = Math.min(1.2, mouth + 0.5 + velocity * 0.5);
  },
  setLabel,
};
const INSTRUMENTS = {
  guitar: { name: 'Guitar', emoji: '🎸', make: () => new GuitarInstrument(app) },
  drums: { name: 'Drums', emoji: '🥁', make: () => new DrumsInstrument(app) },
  trombone: { name: 'Trombone', emoji: '🎺', make: () => new TromboneInstrument(app) },
  piano: { name: 'Piano', emoji: '🎹', make: () => new PianoInstrument(app) },
  sax: { name: 'Sax', emoji: '🎷', make: () => new SaxInstrument(app) },
};
const store = new Entitlements(() => {
  // Purchase state changed (bought, restored, refunded): refresh locks everywhere.
  if (store.isLocked(settings.instrument) && !(tracker instanceof DemoTracker)) settings.instrument = 'guitar';
  if (instrument && instrument.id !== settings.instrument) instrument = INSTRUMENTS[settings.instrument].make();
  if (instrument) applySettings();
  renderPaywall();
});
if (store.isLocked(settings.instrument)) settings.instrument = 'guitar';
let instrument = INSTRUMENTS[settings.instrument].make();

const HOW = {
  guitar: [
    '<b>Slide your fretting hand</b> along the neck to change chords.',
    '<b>Strum</b> across the guitar body with your other hand.',
  ],
  drums: [
    '<b>Hit downwards</b> with either hand. Where your hand stops picks the drum or cymbal.',
    '<b>Lift and stomp a knee</b> for the kick drum (or hit low in the middle).',
  ],
  trombone: [
    'Hold the trombone to your mouth and <b>push or pull the slide</b> with your other hand.',
    'Slide <b>in for high notes</b>, <b>out for low notes</b>. Each push or pull plays a note.',
  ],
  piano: [
    'A keyboard appears at your waist: <b>low notes on your left</b>, high notes on your right.',
    '<b>Tap down</b> with either hand to press the key under it. Use both hands for chords.',
  ],
  sax: [
    'The sax hangs from your mouth down past your hip. <b>Slide your hand up and down it.</b>',
    'Near your mouth plays <b>high notes</b>, down by the bell plays <b>low</b>. Each stop plays a note.',
  ],
};

function loadSettings() {
  const d = { instrument: 'guitar', drumSensitivity: 'normal', tvMode: false, preset: 'campfire', tone: 'acoustic', lefty: false, showCam: true, guitar: 'acoustic' };
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem('airguitar') || '{}');
  } catch {}
  const s = { ...d, ...saved };
  s.look = { ...DEFAULT_LOOK, ...(saved.look || {}) };
  if (!GUITARS[s.guitar]) s.guitar = d.guitar;
  if (!['guitar', 'drums', 'trombone', 'piano', 'sax'].includes(s.instrument)) s.instrument = d.instrument;
  return s;
}
function saveSettings() {
  try {
    localStorage.setItem('airguitar', JSON.stringify(settings));
  } catch {}
}

// preview: allow a locked instrument for the demo, so people can see what they'd get.
function setInstrument(id, { preview = false } = {}) {
  if (store.isLocked(id) && !preview) {
    openPaywall(id);
    applySettings(); // put the pickers back on the current instrument
    return;
  }
  if (instrument.id === id) return;
  settings.instrument = id;
  instrument = INSTRUMENTS[id].make();
  if (previewTracker) previewTracker.mode = id;
  if (tracker instanceof DemoTracker) tracker.mode = id;
  view = null;
  applySettings();
}

function updateView(b, dt) {
  const S = b.S;
  const pts = [
    { x: b.head.c.x, y: b.head.c.y - b.head.r * 1.6 },
    b.ankle.L, b.ankle.R, b.hand.L, b.hand.R, b.elbow.L, b.elbow.R, b.shoulder.L, b.shoulder.R,
    ...instrument.viewPoints(b),
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y + S * 0.1);
  }
  // Leave room for the thickness of arms, body and hands.
  x0 -= S * 0.3;
  x1 += S * 0.3;
  const W = renderer.w, H = renderer.h;
  const custom = $('custom');
  const customising = !custom.classList.contains('hidden');
  // Sideways (TV mode): a slimmer header and strip leave more room for the avatar.
  const wide = W > H * 1.3;
  const top = customising ? 16 : wide ? 52 : 84;
  const bottom = customising ? custom.offsetHeight + 8 : wide ? 46 : 76;
  const side = 10;
  const k = Math.min(2.5, (W - side * 2) / (x1 - x0), (H - top - bottom) / (y1 - y0));
  // Centre horizontally, rest the feet just above the bottom strip.
  const tx = W / 2 - ((x0 + x1) / 2) * k;
  const ty = H - bottom - y1 * k;
  if (!view) view = { k, x: tx, y: ty };
  const a = Math.min(1, dt * 2.5);
  view.k += (k - view.k) * a;
  view.x += (tx - view.x) * a;
  view.y += (ty - view.y) * a;
}

// ---------- HUD ----------

function setLabel(text, index, pulse) {
  const el = $('chord');
  el.textContent = text;
  el.style.fontSize = text.length > 5 ? '38px' : ''; // keep long names like "Floor tom" clear of the buttons
  if (pulse) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }
  [...$('strip').children].forEach((c, i) => c.classList.toggle('on', i === index));
}

function buildStrip() {
  const { items, index, label } = instrument.stripItems();
  const strip = $('strip');
  strip.innerHTML = '';
  strip.classList.toggle('small', items.length > 6);
  strip.classList.toggle('tiny', items.length > 10);
  for (const name of items) {
    const d = document.createElement('div');
    d.textContent = name;
    strip.appendChild(d);
  }
  setLabel(label, index, false);
}

function applySettings() {
  $('preset').value = settings.preset;
  $('tone').value = settings.tone;
  $('lefty').checked = settings.lefty;
  $('showcam').checked = settings.showCam;
  $('instrument').value = settings.instrument;
  $('drum-sens').value = settings.drumSensitivity;
  for (const el of document.querySelectorAll('.drums-only')) el.classList.toggle('hidden', settings.instrument !== 'drums');
  for (const el of document.querySelectorAll('.guitar-only')) el.classList.toggle('hidden', settings.instrument !== 'guitar');
  for (const b of document.querySelectorAll('#pick-instrument button')) {
    b.classList.toggle('on', b.dataset.id === settings.instrument);
    b.classList.toggle('locked', store.isLocked(b.dataset.id));
  }
  for (const o of $('instrument').options) {
    const ins = INSTRUMENTS[o.value];
    o.textContent = `${ins.emoji} ${ins.name}${store.isLocked(o.value) ? ' 🔒' : ''}`;
  }
  $('how').innerHTML = ['Prop your phone up and step back so your upper body is in view.', ...HOW[settings.instrument]]
    .map((t) => `<li>${t}</li>`)
    .join('');
  video.classList.toggle('hidden', !settings.showCam || !(tracker instanceof PoseTracker));
  audio.setTone(settings.tone);
  audio.prepare(PRESETS[settings.preset].chords);
  renderer.look = settings.look;
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

  const active = tracker || previewTracker;
  if (active) {
    let raw;
    try {
      raw = active.detect(now);
    } catch (e) {
      console.error(e);
    }
    if (raw !== undefined) stats.frames++;
    if (raw) {
      stats.poses++;
      lastSeen = now;
      const W = renderer.w, H = renderer.h;
      for (const side of ['L', 'R']) {
        const h = hands[side];
        if (handVisible(raw, side)) {
          h.since ??= now;
          h.lostAt = null;
          if (now - h.since >= HAND_STEADY_MS) h.active = true;
        } else {
          h.lostAt ??= now;
          if (now - h.lostAt > HAND_GRACE_MS) {
            h.active = false;
            h.since = null;
          } else if (!h.active) {
            h.since = null; // not established yet: a dropout restarts the wait
          }
        }
        // Fade the avatar's arm between resting and tracked.
        h.weight += ((h.active ? 1 : 0) - h.weight) * Math.min(1, dt * 8);
      }
      body = buildBody(smoother.push(raw), active.aspect, W, H, { L: hands.L.weight, R: hands.R.weight });
      // Unsmoothed body for hit/strum detection: no added lag.
      const rawBody = buildBody(raw, active.aspect, W, H);
      rawBody.handActive = { L: hands.L.active, R: hands.R.active };
      instrument.update(body, rawBody, dt, now);
      updateView(body, dt);
      // Nudge the player when we can see them but not their hands.
      if (hands.L.active || hands.R.active) handsMissingSince = null;
      else handsMissingSince ??= now;
      status(active === tracker && handsMissingSince !== null && now - handsMissingSince > 1200 ? 'Show your hands to play 🙌' : '');
    } else if (raw === null && now - lastSeen > 800) {
      status(`Step back so the camera can see your upper body ${INSTRUMENTS[settings.instrument].emoji}`);
      instrument.lost();
    }
  }

  const alpha = body ? Math.max(0, Math.min(1, 1 - (now - lastSeen - 800) / 600)) : 0;
  renderer.frame(dt, {
    time: now / 1000,
    body: alpha > 0 ? body : null,
    instrument,
    alpha,
    tone: settings.tone,
    guitarStyle: GUITARS[settings.guitar],
    mouth,
    view: view || { k: 1, x: 0, y: 0 },
  });
  requestAnimationFrame(loop);
}

async function start(demo) {
  // Only the demo may show a locked instrument.
  if (!demo && store.isLocked(settings.instrument)) {
    openPaywall(settings.instrument);
    return;
  }
  $('intro').classList.add('hidden');
  try {
    await audio.start();
    audio.prepare(PRESETS[settings.preset].chords);
  } catch (e) {
    console.error('Audio failed', e);
  }
  if (navigator.wakeLock) navigator.wakeLock.request('screen').catch(() => {});
  try {
    if (demo) {
      tracker = new DemoTracker();
      tracker.mode = settings.instrument;
    } else {
      camTracker ||= new PoseTracker(video);
      await camTracker.init(status);
      tracker = camTracker;
    }
    previewTracker = null;
    instrument.reset();
    status(demo ? '' : `Step back so the camera can see your upper body ${INSTRUMENTS[settings.instrument].emoji}`);
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
  // A history entry for the session, so the browser's back button returns to the menu.
  if (!history.state?.playing) history.pushState({ playing: true }, '');
}

// ---------- Back to the menu ----------

const isOpen = (id) => !$(id).classList.contains('hidden');

function goToMenu() {
  if (tracker instanceof PoseTracker) tracker.stop(); // camera off
  tracker = null;
  previewTracker = null;
  body = null;
  view = null;
  smoother.reset();
  instrument.reset();
  instrument.lost?.();
  audio.muteAll();
  instrument.voice?.release(audio.ctx ? audio.ctx.currentTime : 0);
  for (const id of ['hud', 'panel', 'custom', 'paywall']) $(id).classList.add('hidden');
  status('');
  // Coming back from a demo of a locked instrument: return to the free one.
  if (store.isLocked(settings.instrument)) setInstrument('guitar');
  applySettings();
  $('intro').classList.remove('hidden');
}

// One step back: close whatever is on top, else leave the session. Returns false on the menu.
function handleBack() {
  if (isOpen('tv')) $('tv').classList.add('hidden');
  else if (isOpen('paywall')) closePaywall();
  else if (isOpen('panel')) $('panel').classList.add('hidden');
  else if (isOpen('custom')) closeCustomizer();
  else if (!isOpen('intro')) goToMenu();
  else return false;
  return true;
}

// ---------- Customise avatar & guitar ----------

let customTab = 'avatar';

function openCustomizer() {
  customFromIntro = !$('intro').classList.contains('hidden');
  $('intro').classList.add('hidden');
  $('panel').classList.add('hidden');
  $('hud').classList.add('hidden');
  if (!tracker) {
    previewTracker = new DemoTracker();
    previewTracker.mode = settings.instrument;
    instrument.reset();
  }
  $('custom').classList.remove('hidden');
  renderCustomizer();
}

function closeCustomizer() {
  $('custom').classList.add('hidden');
  if (customFromIntro) {
    previewTracker = null;
    body = null;
    $('intro').classList.remove('hidden');
  } else {
    $('hud').classList.remove('hidden');
  }
}

function renderCustomizer() {
  for (const t of document.querySelectorAll('#custom .tabs button')) {
    t.classList.toggle('on', t.dataset.tab === customTab);
  }
  const box = $('custom-body');
  box.innerHTML = '';
  if (customTab === 'avatar') {
    for (const [key, opt] of Object.entries(AVATAR_OPTIONS)) {
      const row = document.createElement('div');
      row.className = 'opt';
      const label = document.createElement('div');
      label.className = 'opt-label';
      label.textContent = opt.label;
      const vals = document.createElement('div');
      vals.className = 'opt-values';
      for (const v of opt.values) {
        const b = document.createElement('button');
        b.className = opt.type === 'color' ? 'swatch' : 'chip';
        if (opt.type === 'color') {
          b.style.background = v;
          b.setAttribute('aria-label', `${opt.label} ${v}`);
        } else {
          b.textContent = opt.names[v];
        }
        b.classList.toggle('on', settings.look[key] === v);
        b.addEventListener('click', () => {
          settings.look[key] = v;
          applySettings();
          renderCustomizer();
        });
        vals.appendChild(b);
      }
      row.append(label, vals);
      box.appendChild(row);
    }
  } else {
    const grid = document.createElement('div');
    grid.className = 'guitars';
    for (const [key, gs] of Object.entries(GUITARS)) {
      const b = document.createElement('button');
      b.className = 'guitar-card';
      b.classList.toggle('on', settings.guitar === key);
      const c = document.createElement('canvas');
      c.width = 240;
      c.height = 110;
      drawGuitarThumb(c, gs);
      const name = document.createElement('div');
      name.textContent = `${gs.emoji} ${gs.name}`;
      const tone = document.createElement('small');
      tone.textContent = gs.tone === 'rock' ? 'Electric · distortion' : 'Acoustic sound';
      b.append(c, name, tone);
      b.addEventListener('click', () => {
        settings.guitar = key;
        settings.tone = gs.tone;
        applySettings();
        renderCustomizer();
        // Let them hear it straight away if sound is already on.
        if (instrument.id === 'guitar') instrument.tap();
      });
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
}

for (const t of document.querySelectorAll('#custom .tabs button')) {
  t.addEventListener('click', () => {
    customTab = t.dataset.tab;
    renderCustomizer();
  });
}
$('shuffle').addEventListener('click', () => {
  if (customTab === 'avatar') {
    settings.look = randomLook();
  } else {
    const keys = Object.keys(GUITARS);
    settings.guitar = keys[Math.floor(Math.random() * keys.length)];
    settings.tone = GUITARS[settings.guitar].tone;
  }
  applySettings();
  renderCustomizer();
});
$('custom-done').addEventListener('click', closeCustomizer);
$('customize').addEventListener('click', openCustomizer);
$('customize2').addEventListener('click', openCustomizer);

// ---------- Wire up UI ----------

for (const [key, p] of Object.entries(PRESETS)) {
  const o = document.createElement('option');
  o.value = key;
  o.textContent = `${p.name} (${p.chords.join(' ')})`;
  $('preset').appendChild(o);
}
for (const [id, ins] of Object.entries(INSTRUMENTS)) {
  const o = document.createElement('option');
  o.value = id;
  o.textContent = `${ins.emoji} ${ins.name}`;
  $('instrument').appendChild(o);
  const b = document.createElement('button');
  b.dataset.id = id;
  b.innerHTML = `<span>${ins.emoji}</span>${ins.name}<i class="lock">🔒</i>`;
  b.addEventListener('click', () => setInstrument(id));
  $('pick-instrument').appendChild(b);
}
$('instrument').addEventListener('change', (e) => setInstrument(e.target.value));
$('drum-sens').addEventListener('change', (e) => {
  settings.drumSensitivity = e.target.value;
  if (instrument.id === 'drums') instrument.setSensitivity(e.target.value);
  applySettings();
});
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
  instrument.reset();
  applySettings();
});
$('showcam').addEventListener('change', (e) => {
  settings.showCam = e.target.checked;
  applySettings();
});
$('gear').addEventListener('click', () => $('panel').classList.toggle('hidden'));
$('home').addEventListener('click', () => {
  goToMenu();
  if (history.state?.playing) history.back();
});
// Browser back button (website).
window.addEventListener('popstate', () => {
  handleBack();
  // Still in a session (we only closed a popup): keep a history entry for the next back press.
  if (!isOpen('intro')) history.pushState({ playing: true }, '');
});
// Android back button / gesture (app).
const nativeApp = window.Capacitor?.isNativePlatform?.() ? window.Capacitor.registerPlugin?.('App') : null;
try {
  Promise.resolve(
    nativeApp?.addListener('backButton', () => {
      if (!handleBack()) nativeApp.exitApp();
    })
  ).catch((e) => console.warn('Back button unavailable', e));
} catch (e) {
  console.warn('Back button unavailable', e); // never let this stop the app from starting
}
$('close').addEventListener('click', () => $('panel').classList.add('hidden'));
$('play').addEventListener('click', () => start(false));
$('demo').addEventListener('click', () => start(true));
// Tap anywhere on the stage to play too — handy for checking the sound.
$('stage').addEventListener('pointerdown', () => {
  if ((tracker || previewTracker) && body) instrument.tap();
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
// ---------- Unlock all instruments ----------

let paywallFor = 'drums';

function openPaywall(id) {
  paywallFor = id;
  $('paywall-msg').textContent = '';
  renderPaywall();
  $('paywall').classList.remove('hidden');
}

function closePaywall() {
  $('paywall').classList.add('hidden');
}

function renderPaywall() {
  const ins = INSTRUMENTS[paywallFor] || INSTRUMENTS.drums;
  $('paywall-title').textContent = `${ins.emoji} ${ins.name} is in the full version`;
  const buy = $('paywall-buy');
  if (store.unlocked) {
    buy.textContent = '✅ Unlocked. Rock on!';
    buy.disabled = true;
  } else if (store.canBuy && store.trial) {
    buy.textContent = `Start ${TRIAL_DAYS}-day free trial`;
    buy.disabled = false;
  } else if (store.canBuy) {
    buy.textContent = `Unlock everything for ${store.price || '€2'}/month`;
    buy.disabled = false;
  } else if (BUILD.channel === 'web') {
    buy.textContent = 'Get the app on Google Play';
    buy.disabled = false;
  } else {
    buy.textContent = 'Purchases unavailable right now';
    buy.disabled = true;
  }
  $('paywall-restore').classList.toggle('hidden', !store.plugin || store.unlocked);
  $('restore').classList.toggle('hidden', !store.plugin || store.unlocked);
  $('manage-sub').classList.toggle('hidden', !store.plugin || !store.unlocked);
  // Subscription terms, as Google Play requires them to be clear before buying.
  $('paywall-lead').textContent =
    store.canBuy && store.trial
      ? `Try every instrument free for ${TRIAL_DAYS} days, now and in the future:`
      : 'Subscribe to unlock every instrument, now and in the future:';
  const price = store.price || '€2';
  $('paywall-terms').textContent = !store.canBuy
    ? ''
    : store.trial
      ? `Free for ${TRIAL_DAYS} days, then ${price} per month. Renews automatically until you cancel. ` +
        `Cancel in Google Play before the trial ends and you won't be charged.`
      : `${price} per month. Renews automatically until you cancel. Cancel anytime in Google Play.`;
}

$('paywall-buy').addEventListener('click', async () => {
  if (BUILD.channel === 'web' && !store.unlocked) {
    window.open(PLAY_URL, '_blank');
    return;
  }
  const msg = $('paywall-msg');
  msg.textContent = '';
  $('paywall-buy').disabled = true;
  try {
    const result = await store.buy();
    if (result === 'unlocked' || result === 'trial') {
      msg.textContent =
        result === 'trial'
          ? `🎉 Your ${TRIAL_DAYS}-day free trial has started! All instruments are unlocked.`
          : '🎉 Thanks for subscribing! All instruments are unlocked.';
      setInstrument(paywallFor);
      setTimeout(closePaywall, 1200);
    } else if (result === 'pending') {
      msg.textContent = 'Payment pending. Your instruments unlock as soon as it goes through.';
    }
  } catch (e) {
    msg.textContent = `Couldn't complete the purchase (${e?.message || e}). Please try again.`;
  }
  renderPaywall();
});
async function restore() {
  const msg = $('paywall-msg');
  try {
    const ok = await store.restore();
    msg.textContent = ok ? '✅ Subscription found. All instruments unlocked.' : 'No active subscription found on this Google account.';
  } catch (e) {
    msg.textContent = `Couldn't check your purchases (${e?.message || e}).`;
  }
  renderPaywall();
}
$('paywall-restore').addEventListener('click', restore);
$('restore').addEventListener('click', () => {
  $('panel').classList.add('hidden');
  openPaywall('drums');
  restore();
});
$('paywall-demo').addEventListener('click', () => {
  closePaywall();
  setInstrument(paywallFor, { preview: true });
  if (tracker instanceof PoseTracker) {
    // Mid-session: switch to the demo performer for the preview.
    tracker = new DemoTracker();
    tracker.mode = paywallFor;
  } else if (!tracker) {
    start(true);
  }
});
$('paywall-close').addEventListener('click', closePaywall);
$('manage-sub').addEventListener('click', () => store.manage().catch(() => {}));
document.addEventListener('visibilitychange', () => {
  // A pending payment may have completed while the app was in the background.
  if (document.visibilityState === 'visible' && store.ready) store.refresh().then(() => renderPaywall()).catch(() => {});
});
store.init();

// ---------- Play on TV (Android screen casting) ----------

const isNative = !!window.Capacitor?.isNativePlatform?.();
const tvCast = isNative ? window.Capacitor.registerPlugin?.('TvCast') : null;
const orientation = isNative ? window.Capacitor.registerPlugin?.('ScreenOrientation') : null;

// TV mode: lock the app sideways so the mirrored picture fills the TV.
async function setTvMode(on) {
  settings.tvMode = on;
  saveSettings();
  $('tv-mode').textContent = on ? '✅ TV mode is on (tap to turn off)' : 'Turn on TV mode';
  $('tv-mode').classList.toggle('on', on);
  try {
    if (on) await orientation?.lock({ orientation: 'landscape' });
    else await orientation?.unlock();
  } catch (e) {
    console.warn('Orientation lock failed', e);
  }
  view = null; // re-fit the stage to the new shape
}

function openTv() {
  $('panel').classList.add('hidden');
  $('tv-msg').textContent = '';
  $('tv').classList.remove('hidden');
}

for (const el of document.querySelectorAll('.native-only')) el.classList.toggle('hidden', !isNative);
$('tv-open').addEventListener('click', openTv);
$('tv-open2').addEventListener('click', openTv);
$('tv-close').addEventListener('click', () => $('tv').classList.add('hidden'));
$('tv-mode').addEventListener('click', () => setTvMode(!settings.tvMode));
$('tv-connect').addEventListener('click', async () => {
  // Casting looks best sideways, so switch TV mode on as we connect.
  if (!settings.tvMode) await setTvMode(true);
  try {
    await tvCast.openCastSettings();
    $('tv-msg').textContent = 'Pick your TV, then come back to Air Guitar Hero.';
  } catch {
    $('tv-msg').textContent = "Your phone didn't open its cast screen. Use the tip below instead.";
  }
});
if (isNative && settings.tvMode) setTvMode(true);

// ---------- Updates (sideloaded test builds only) ----------

const RELEASE_API = 'https://api.github.com/repos/JPPotgieter/AirGuitar/releases/tags/android-latest';
const APK_URL = 'https://github.com/JPPotgieter/AirGuitar/releases/download/android-latest/AirGuitarHero.apk';

// The Android app checks GitHub for a newer test build and offers a one-tap update.
async function checkForUpdate() {
  // Play Store builds must only update through Google Play.
  if (BUILD.channel !== 'test' || !window.Capacitor?.isNativePlatform?.() || !VERSION.code) return;
  try {
    const res = await fetch(RELEASE_API, { cache: 'no-store' });
    if (!res.ok) return;
    const release = await res.json();
    // Release titles look like "Air Guitar Hero 1.0.12 (Android)"; the last number is the build.
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(release.name || '');
    if (!m || Number(m[3]) <= VERSION.code) return;
    $('update-text').textContent = `🎉 Version ${m[0]} is ready!`;
    $('update').classList.remove('hidden');
  } catch {
    // Offline or GitHub unreachable: try again next launch.
  }
}
$('update-go').addEventListener('click', () => {
  // Opens in the phone's browser, which downloads the APK; tap it to install the update.
  window.open(APK_URL, '_system');
  $('update').classList.add('hidden');
});
$('update-close').addEventListener('click', () => $('update').classList.add('hidden'));
$('version').textContent = VERSION.code ? `v${VERSION.name}` : '';
checkForUpdate();

const params = new URLSearchParams(location.search);
if (params.get('instrument') && INSTRUMENTS[params.get('instrument')]) setInstrument(params.get('instrument'));
if (params.has('demo')) start(true);

// Exposed for debugging in the browser console.
window.airguitar = { audio, renderer, settings, stats, hands, get instrument() { return instrument; } };
