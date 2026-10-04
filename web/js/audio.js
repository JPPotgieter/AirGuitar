import { chordFrequencies } from './chords.js';

// Plucked-string synth (Karplus-Strong) with an acoustic and a distorted "rock" voice.
export class GuitarAudio {
  constructor() {
    this.ctx = null;
    this.cache = new Map();
    this.voices = new Array(6).fill(null);
    this.tone = 'acoustic';
  }

  // Must be called from a user gesture (iOS/Safari audio unlock).
  async start() {
    if (this.ctx) {
      await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new Ctx({ latencyHint: 'interactive' }));

    this.input = ctx.createGain();

    // Acoustic path: a little body warmth and sparkle.
    this.acoustic = ctx.createGain();
    const body = ctx.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = 180;
    body.Q.value = 1.2;
    body.gain.value = 5;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 3500;
    air.gain.value = 3;
    this.input.connect(body).connect(air).connect(this.acoustic);

    // Rock path: overdrive -> cab-ish low-pass.
    this.rock = ctx.createGain();
    const drive = ctx.createGain();
    drive.gain.value = 6;
    const shaper = ctx.createWaveShaper();
    shaper.curve = makeDriveCurve(40);
    shaper.oversample = '4x';
    const cab = ctx.createBiquadFilter();
    cab.type = 'lowpass';
    cab.frequency.value = 4200;
    cab.Q.value = 0.8;
    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 900;
    mid.gain.value = 4;
    const post = ctx.createGain();
    post.gain.value = 0.35;
    this.input.connect(drive).connect(shaper).connect(cab).connect(mid).connect(post).connect(this.rock);

    const mix = (this.mix = ctx.createGain()); // shared bus for every instrument
    this.acoustic.connect(mix);
    this.rock.connect(mix);

    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 2.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    mix.connect(reverb).connect(wet);

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    const master = (this.master = ctx.createGain());
    master.gain.value = 0.9;
    mix.connect(comp);
    wet.connect(comp);
    comp.connect(master).connect(ctx.destination);

    this.setTone(this.tone);
    await ctx.resume();
  }

  setTone(tone) {
    this.tone = tone;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.acoustic.gain.setTargetAtTime(tone === 'acoustic' ? 1 : 0, t, 0.02);
    this.rock.gain.setTargetAtTime(tone === 'rock' ? 1 : 0, t, 0.02);
  }

  pluckBuffer(freq) {
    const key = freq.toFixed(2);
    let buf = this.cache.get(key);
    if (buf) return buf;
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * 3.5);
    buf = this.ctx.createBuffer(1, len, sr);
    const out = buf.getChannelData(0);
    // The averaging filter adds half a sample of delay, so shorten the loop to stay in tune.
    const n = Math.max(2, Math.round(sr / freq - 0.5));
    // Initial excitation: slightly smoothed noise, so it sounds like a pick, not a hiss.
    const line = new Float32Array(n);
    let prev = 0;
    for (let i = 0; i < n; i++) {
      prev = prev * 0.35 + (Math.random() * 2 - 1) * 0.65;
      line[i] = prev;
    }
    // Decay tuned so low and high strings ring for a similar time.
    const decay = Math.pow(0.001, 1 / (freq * 3.2));
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = idx + 1 === n ? 0 : idx + 1;
      out[i] = line[idx];
      line[idx] = decay * 0.5 * (line[idx] + line[next]);
      idx = next;
    }
    // Remove DC offset and add a quick fade-in to avoid clicks.
    let mean = 0;
    for (let i = 0; i < 2048; i++) mean += out[i];
    mean /= 2048;
    for (let i = 0; i < len; i++) out[i] -= mean;
    for (let i = 0; i < 64; i++) out[i] *= i / 64;
    this.cache.set(key, buf);
    return buf;
  }

  // Warm the cache so the first strum of each chord does not stutter.
  prepare(chordNames) {
    if (!this.ctx) return;
    for (const name of chordNames) {
      for (const f of chordFrequencies(name)) if (f) this.pluckBuffer(f);
    }
  }

  // direction: 'down' (low -> high strings) or 'up'. velocity: 0..1
  strum(chordName, direction, velocity) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const freqs = chordFrequencies(chordName);
    const order = direction === 'down' ? [0, 1, 2, 3, 4, 5] : [5, 4, 3, 2, 1, 0];
    const spread = 0.028 - velocity * 0.02; // faster strum = tighter
    const now = ctx.currentTime + 0.005;
    let k = 0;
    for (const s of order) {
      const when = now + k * spread;
      this.damp(s, when);
      const f = freqs[s];
      if (!f) continue;
      // Up-strums usually catch fewer bass strings.
      if (direction === 'up' && s < 2 && velocity < 0.6) continue;
      const src = ctx.createBufferSource();
      src.buffer = this.pluckBuffer(f);
      const g = ctx.createGain();
      g.gain.value = (0.25 + velocity * 0.45) * (0.85 + Math.random() * 0.15);
      src.connect(g).connect(this.input);
      src.start(when);
      this.voices[s] = { src, g };
      k++;
    }
  }

  damp(s, when) {
    const v = this.voices[s];
    if (!v) return;
    v.g.gain.setTargetAtTime(0, when, 0.015);
    v.src.stop(when + 0.1);
    this.voices[s] = null;
  }

  muteAll() {
    if (!this.ctx) return;
    for (let s = 0; s < 6; s++) this.damp(s, this.ctx.currentTime);
  }
}

function makeDriveCurve(k) {
  const n = 2048;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return curve;
}

function makeImpulse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  return buf;
}
