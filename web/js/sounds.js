// Synthesised drum kit and trombone, sharing the guitar engine's mixer, reverb and compressor.

function noiseBuffer(audio) {
  if (!audio.noise) {
    const ctx = audio.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio.noise = buf;
  }
  return audio.noise;
}

function envGain(ctx, t, peak, decay, attack = 0.002) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}

function noiseVoice(audio, t, dur, filters, peak, decay) {
  const ctx = audio.ctx;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(audio);
  let node = src;
  for (const [type, freq, q] of filters) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    node = node.connect(f);
  }
  node.connect(envGain(ctx, t, peak, decay)).connect(audio.mix);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur);
}

function toneVoice(audio, t, type, f0, f1, sweep, peak, decay) {
  const ctx = audio.ctx;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + sweep);
  osc.connect(envGain(ctx, t, peak, decay)).connect(audio.mix);
  osc.start(t);
  osc.stop(t + decay + 0.05);
}

// velocity: 0..1
export function drumHit(audio, type, velocity) {
  if (!audio.ctx) return;
  const t = audio.ctx.currentTime + 0.003;
  const v = 0.35 + velocity * 0.65;
  switch (type) {
    case 'kick':
      toneVoice(audio, t, 'sine', 150, 42, 0.14, 1.1 * v, 0.45);
      noiseVoice(audio, t, 0.03, [['highpass', 1800]], 0.25 * v, 0.02);
      break;
    case 'snare':
      toneVoice(audio, t, 'triangle', 220, 160, 0.08, 0.45 * v, 0.12);
      noiseVoice(audio, t, 0.3, [['highpass', 1300], ['peaking', 3500, 1]], 0.7 * v, 0.2);
      break;
    case 'hihat':
      noiseVoice(audio, t, 0.1, [['highpass', 7500], ['bandpass', 10000, 0.8]], 0.55 * v, 0.06);
      break;
    case 'crash':
      noiseVoice(audio, t, 2.2, [['highpass', 4200]], 0.5 * v, 1.8);
      noiseVoice(audio, t, 0.6, [['bandpass', 2500, 1.5]], 0.25 * v, 0.4);
      break;
    case 'ride':
      noiseVoice(audio, t, 1.3, [['bandpass', 6500, 1.2]], 0.3 * v, 1.0);
      toneVoice(audio, t, 'sine', 3200, 3100, 0.5, 0.08 * v, 0.9);
      break;
    case 'tom1':
    case 'tom2':
    case 'floor': {
      const f = { tom1: 210, tom2: 155, floor: 100 }[type];
      toneVoice(audio, t, 'sine', f * 1.6, f, 0.2, 0.9 * v, 0.55);
      noiseVoice(audio, t, 0.08, [['lowpass', 1500]], 0.25 * v, 0.06);
      break;
    }
  }
}

// Monophonic brass voice that glides between notes like a trombone slide.
export class TromboneVoice {
  constructor(audio) {
    this.audio = audio;
    this.voice = null;
    this.lastFreq = null;
  }

  play(freq, velocity, duration = 0.75) {
    const audio = this.audio;
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.release(t);

    const from = this.lastFreq || freq;
    this.lastFreq = freq;
    const out = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 2;
    const bright = 900 + velocity * 2400;
    filter.frequency.setValueAtTime(250, t);
    filter.frequency.exponentialRampToValueAtTime(bright, t + 0.06);
    filter.frequency.exponentialRampToValueAtTime(bright * 0.6, t + 0.3);

    const level = 0.12 + velocity * 0.2;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level, t + 0.045);
    out.gain.exponentialRampToValueAtTime(level * 0.75, t + 0.25);
    out.gain.setTargetAtTime(0.0001, t + duration, 0.09);

    // Gentle vibrato that fades in, like a held brass note.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.2;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.006, t + 0.4);
    lfo.connect(depth);

    const oscs = [-5, 5].map((cents) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = cents;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + (from === freq ? 0.001 : 0.08));
      depth.connect(o.frequency);
      o.connect(filter);
      o.start(t);
      o.stop(t + duration + 0.6);
      return o;
    });
    lfo.start(t);
    lfo.stop(t + duration + 0.6);
    filter.connect(out).connect(audio.mix);
    this.voice = { out, oscs, lfo };
  }

  release(t) {
    const v = this.voice;
    if (!v) return;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0.0001, t, 0.03);
    for (const o of [...v.oscs, v.lfo]) o.stop(t + 0.2);
    this.voice = null;
  }
}
