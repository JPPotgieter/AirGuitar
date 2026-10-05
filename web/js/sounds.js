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

// Piano: harmonic-rich tone through a closing low-pass (strings lose brightness as they ring),
// a soft hammer knock, and longer sustain for low notes. Polyphonic.
export class PianoVoice {
  constructor(audio) {
    this.audio = audio;
    this.voices = [];
    this.wave = null;
  }

  play(freq, velocity) {
    const audio = this.audio;
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.003;
    if (!this.wave) {
      // Harmonic amplitudes of a struck string (1st..8th).
      const amps = [0, 1, 0.55, 0.32, 0.22, 0.12, 0.08, 0.05, 0.03];
      this.wave = ctx.createPeriodicWave(new Float32Array(amps.length), new Float32Array(amps));
    }
    const ring = 1.0 + Math.min(3, 260 / freq); // low notes ring longer
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(this.wave);
    osc.frequency.value = freq;
    // A second, very slightly detuned string gives the piano's gentle shimmer.
    const osc2 = ctx.createOscillator();
    osc2.setPeriodicWave(this.wave);
    osc2.frequency.value = freq * 1.0015;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const bright = Math.min(12000, freq * (5 + velocity * 9));
    filter.frequency.setValueAtTime(bright, t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 1.5, 200), t + ring);
    const g = ctx.createGain();
    const level = 0.14 + velocity * 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.004);
    g.gain.exponentialRampToValueAtTime(level * 0.35, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ring);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g).connect(audio.mix);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + ring + 0.05);
    osc2.stop(t + ring + 0.05);
    noiseVoice(audio, t, 0.03, [['bandpass', 2500, 1.2]], 0.06 + velocity * 0.08, 0.02);

    this.voices.push({ g, osc, osc2, end: t + ring });
    this.voices = this.voices.filter((v) => v.end > t);
    // Keep polyphony sensible: fade out the oldest notes beyond 10.
    while (this.voices.length > 10) this.fadeOut(this.voices.shift(), t);
  }

  fadeOut(v, t) {
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0.0001, t, 0.05);
    v.osc.stop(t + 0.3);
    v.osc2.stop(t + 0.3);
  }

  // Silence every ringing note (e.g. when leaving the piano).
  release(t) {
    for (const v of this.voices) this.fadeOut(v, t);
    this.voices = [];
  }
}

// Saxophone: a reedy, breathy monophonic voice. Notes scoop up into pitch and glide between
// each other, with vibrato that blooms as the note is held.
export class SaxVoice {
  constructor(audio) {
    this.audio = audio;
    this.voice = null;
    this.lastFreq = null;
  }

  play(freq, velocity, duration = 0.85) {
    const audio = this.audio;
    const ctx = audio.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.005;
    this.release(t);
    const from = this.lastFreq ? this.lastFreq : freq * 0.97; // first note scoops up from below
    this.lastFreq = freq;

    const out = ctx.createGain();
    const level = 0.1 + velocity * 0.17;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(level, t + 0.05);
    out.gain.setTargetAtTime(level * 0.8, t + 0.15, 0.2);
    out.gain.setTargetAtTime(0.0001, t + duration, 0.08);

    // Reed tone: sawtooth + a little square, shaped by two vocal-like formants.
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1200 + velocity * 2500, t);
    lp.Q.value = 0.7;
    const f1 = ctx.createBiquadFilter();
    f1.type = 'peaking';
    f1.frequency.value = 550;
    f1.gain.value = 7;
    f1.Q.value = 1.4;
    const f2 = ctx.createBiquadFilter();
    f2.type = 'peaking';
    f2.frequency.value = 1600;
    f2.gain.value = 5;
    f2.Q.value = 2;

    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.6;
    const depth = ctx.createGain();
    depth.gain.setValueAtTime(0, t);
    depth.gain.linearRampToValueAtTime(freq * 0.012, t + 0.45);
    lfo.connect(depth);

    const oscs = [['sawtooth', 0, 1], ['square', 3, 0.35]].map(([type, cents, gain]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = cents;
      o.frequency.setValueAtTime(from, t);
      o.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
      depth.connect(o.frequency);
      const og = ctx.createGain();
      og.gain.value = gain * 0.6;
      o.connect(og).connect(lp);
      o.start(t);
      o.stop(t + duration + 0.6);
      return o;
    });
    lfo.start(t);
    lfo.stop(t + duration + 0.6);
    lp.connect(f1).connect(f2).connect(out).connect(audio.mix);

    // Breath noise riding along with the note.
    const breath = ctx.createBufferSource();
    breath.buffer = noiseBuffer(audio);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = Math.min(6000, freq * 6);
    bf.Q.value = 0.8;
    const bg = ctx.createGain();
    bg.gain.value = 0.05 + velocity * 0.04;
    breath.connect(bf).connect(bg).connect(out);
    breath.start(t, Math.random());
    breath.stop(t + duration + 0.6);

    this.voice = { out, nodes: [...oscs, lfo, breath] };
  }

  release(t) {
    const v = this.voice;
    if (!v) return;
    v.out.gain.cancelScheduledValues(t);
    v.out.gain.setTargetAtTime(0.0001, t, 0.03);
    for (const n of v.nodes) n.stop(t + 0.2);
    this.voice = null;
  }
}
