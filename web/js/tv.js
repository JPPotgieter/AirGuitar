// The TV (Google Cast receiver) app. The phone tracks the player and decides when notes play;
// it streams the player's landmarks and each note here, and the TV draws the stage and plays
// the sound. Open tv.html?demo (or ?demo=drums etc.) in a browser to see it with a simulated phone.
import { Renderer } from './render.js';
import { GuitarAudio } from './audio.js';
import { PRESETS } from './chords.js';
import { DEFAULT_LOOK, GUITARS } from './looks.js';
import { buildBody, LandmarkSmoother } from './body.js';
import { fitView } from './view.js';
import { CAST_NAMESPACE, unpackLandmarks, packLandmarks, castSettings } from './castproto.js';
import { DemoTracker } from './tracker.js';
import { GuitarInstrument } from './instruments/guitar.js';
import { DrumsInstrument } from './instruments/drums.js';
import { TromboneInstrument } from './instruments/trombone.js';
import { PianoInstrument } from './instruments/piano.js';
import { SaxInstrument } from './instruments/sax.js';

const MAKERS = {
  guitar: (app) => new GuitarInstrument(app),
  drums: (app) => new DrumsInstrument(app),
  trombone: (app) => new TromboneInstrument(app),
  piano: (app) => new PianoInstrument(app),
  sax: (app) => new SaxInstrument(app),
};

const $ = (id) => document.getElementById(id);
const audio = new GuitarAudio();
const renderer = new Renderer($('stage'));
const settings = { instrument: 'guitar', look: { ...DEFAULT_LOOK }, guitar: 'acoustic', lefty: false, preset: 'campfire', tone: 'acoustic' };
const smoother = new LandmarkSmoother();
let mouth = 0;
let body = null;
let view = null;
let frame = null; // latest frame from the phone
let usedFrame = null;
let frameAt = 0;
let lastFrameTime = 0;
let idle = true;

const app = {
  audio,
  renderer,
  settings,
  passive: true, // notes come from the phone
  onNote(at, velocity, color) {
    renderer.onNote(velocity, at, color);
    mouth = Math.min(1.2, mouth + 0.5 + velocity * 0.5);
  },
  setLabel,
};
let instrument = MAKERS.guitar(app);

function setLabel(text, index, pulse) {
  const el = $('chord');
  el.textContent = text;
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

function applySettings(s) {
  const before = `${settings.instrument}|${settings.lefty}`;
  Object.assign(settings, s);
  settings.look = { ...DEFAULT_LOOK, ...(s.look || {}) };
  if (!MAKERS[settings.instrument]) settings.instrument = 'guitar';
  if (!GUITARS[settings.guitar]) settings.guitar = 'acoustic';
  if (!PRESETS[settings.preset]) settings.preset = 'campfire';
  renderer.look = settings.look;
  if (`${settings.instrument}|${settings.lefty}` !== before) {
    instrument = MAKERS[settings.instrument](app);
    view = null;
  }
  audio.setTone(settings.tone);
  audio.prepare(PRESETS[settings.preset].chords);
  buildStrip();
}

function setIdle(on) {
  idle = on;
  $('splash').classList.toggle('hidden', !on);
  if (on) {
    frame = null;
    body = null;
    smoother.reset();
    instrument.reset?.();
  }
}

// Everything the phone sends arrives here.
export function handle(msg) {
  if (!msg || typeof msg !== 'object') return;
  switch (msg.t) {
    case 's':
      applySettings(msg.s || {});
      break;
    case 'f':
      if (!Array.isArray(msg.lm)) return;
      frame = msg;
      frameAt = performance.now();
      if (idle) setIdle(false);
      break;
    case 'n':
      if (msg.i === instrument.id) instrument.remote?.(msg.p || {});
      break;
    case 'idle':
      setIdle(true);
      break;
  }
}

let lastTick = performance.now();
function loop(now) {
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  mouth *= Math.exp(-dt * 4);
  if (frame && frame !== usedFrame) {
    const fdt = Math.min(0.1, (now - (lastFrameTime || now)) / 1000) || 1 / 30;
    lastFrameTime = now;
    usedFrame = frame;
    const W = renderer.w, H = renderer.h;
    const hw = Array.isArray(frame.hw) ? frame.hw : [1, 1];
    body = buildBody(smoother.push(unpackLandmarks(frame.lm)), frame.a || 0.75, W, H, { L: hw[0], R: hw[1] });
    body.handActive = { L: hw[0] > 0.5, R: hw[1] > 0.5 };
    instrument.update(body, body, fdt, now);
    view = fitView(view, body, instrument.viewPoints(body), W, H, { top: 110, bottom: 90, side: 40 }, fdt);
  }
  // Fade the avatar out if the phone stops sending.
  const alpha = body && !idle ? Math.max(0, Math.min(1, 1 - (now - frameAt - 1000) / 800)) : 0;
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

// ---------- Start ----------

renderer.resize();
window.addEventListener('resize', () => {
  renderer.resize();
  view = null;
});
audio.start().catch(() => {}); // a Chromecast can play sound without a tap
applySettings({});
setIdle(true);
requestAnimationFrame(loop);

window.airguitarTV = { handle, settings, get instrument() { return instrument; } }; // for debugging

const params = new URLSearchParams(location.search);
if (params.has('demo')) {
  startDemo(params.get('demo') || 'guitar');
} else if (window.cast?.framework) {
  const context = cast.framework.CastReceiverContext.getInstance();
  context.addCustomMessageListener(CAST_NAMESPACE, (event) => handle(event.data));
  const options = new cast.framework.CastReceiverOptions();
  options.customNamespaces = { [CAST_NAMESPACE]: cast.framework.system.MessageType.JSON };
  options.skipPlayersLoad = true; // no video/audio player needed
  options.disableIdleTimeout = true; // stay up while the player is between songs
  options.maxInactivity = 3600;
  context.start(options);
}

// A simulated phone, for trying the TV app in a browser: a demo performer whose notes and
// movements go through exactly the same messages a real phone sends.
function startDemo(id) {
  const performer = new DemoTracker();
  performer.mode = MAKERS[id] ? id : 'guitar';
  const phoneSettings = { ...settings, instrument: performer.mode, drumSensitivity: 'normal' };
  const silent = { ctx: null, strum() {}, prepare() {}, setTone() {} };
  const phoneApp = {
    audio: silent,
    renderer: { stringEnergy: [0, 0, 0, 0, 0, 0], look: DEFAULT_LOOK },
    settings: phoneSettings,
    onNote() {},
    setLabel() {},
    broadcast: (p) => handle(JSON.parse(JSON.stringify({ t: 'n', i: phoneSettings.instrument, p }))),
  };
  const phoneInstrument = MAKERS[phoneSettings.instrument](phoneApp);
  handle({ t: 's', s: castSettings(phoneSettings) });
  let last = performance.now();
  const tick = (now) => {
    const raw = performer.detect(now);
    if (raw) {
      const b = buildBody(raw, performer.aspect, 390, 844);
      b.handActive = { L: true, R: true };
      phoneInstrument.update(b, b, Math.min(0.1, (now - last) / 1000), now);
      handle(JSON.parse(JSON.stringify({ t: 'f', a: performer.aspect, lm: packLandmarks(raw), hw: [1, 1] })));
    }
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
