// Simulated air-drumming (lift, accelerating strike, stop with a small bounce, tracker jitter),
// sampled like a phone camera at 15/24/30 fps and fed to the drum hit detector.
// Usage: npm test          (or LEVEL=high npm test to try another sensitivity)
const mod = await import(new URL('../web/js/instruments/drums.js', import.meta.url));
const Detector = mod.HitDetector;
const make = mod.makeHandDetector ? () => mod.makeHandDetector(process.env.LEVEL || 'normal') : () => new Detector(3, 0.8);

function rng(seed) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296); }
// One stroke: lift up `lift` S over `up` s, strike down over `down` s (ease-in = accelerating), small rebound.
function strokes(rand, n, soft) {
  const hits = []; let t = 0.5; const segs = [];
  for (let i = 0; i < n; i++) {
    const lift = soft ? 0.18 + rand() * 0.15 : 0.35 + rand() * 0.5;
    const up = 0.12 + rand() * 0.1, down = soft ? 0.12 + rand() * 0.08 : 0.06 + rand() * 0.07, hold = 0.05 + rand() * 0.25;
    segs.push({ t0: t, lift, up, down }); t += up + down; hits.push(t); t += hold;
  }
  const y = (time) => {
    for (const s of segs) {
      const a = time - s.t0;
      if (a < 0) break;
      if (a < s.up) return -s.lift * Math.sin((a / s.up) * Math.PI / 2);
      if (a < s.up + s.down) { const f = (a - s.up) / s.down; return -s.lift * (1 - f * f); }
      const r = a - s.up - s.down; if (r < 0.08) return -0.05 * Math.sin((r / 0.08) * Math.PI);
    }
    return 0;
  };
  return { hits, y, end: t + 0.5 };
}
function run(fps, soft, seed) {
  const rand = rng(seed);
  const { hits, y, end } = strokes(rand, 60, soft);
  const d = make();
  const found = [];
  for (let t = 0; t < end; t += 1 / fps + (rand() - 0.5) * 0.012) {
    const noise = (rand() + rand() + rand() - 1.5) * 0.03;
    if (d.push(1.2 + y(t) + noise, t)) found.push(t);
  }
  let caught = 0, falseHits = 0; const used = new Set();
  for (const f of found) {
    const k = hits.findIndex((h, i) => !used.has(i) && f >= h - 0.03 && f <= h + 0.15);
    if (k >= 0) { used.add(k); caught++; } else falseHits++;
  }
  return { caught, total: hits.length, falseHits };
}
for (const soft of [false, true]) for (const fps of [15, 24, 30]) {
  let c = 0, tot = 0, fh = 0;
  for (let s = 1; s <= 5; s++) { const r = run(fps, soft, s * 97); c += r.caught; tot += r.total; fh += r.falseHits; }
  console.log(`${soft ? 'soft taps ' : 'normal    '} ${String(fps).padStart(2)}fps: caught ${String(Math.round(100 * c / tot)).padStart(3)}%  false hits ${fh}`);
}

// Guard rails for "normal" sensitivity: real hits caught, few false hits.
if ((process.env.LEVEL || 'normal') === 'normal') {
  let ok = true;
  for (const fps of [15, 24, 30]) {
    let c = 0, tot = 0, fh = 0;
    for (let s = 1; s <= 5; s++) { const r = run(fps, false, s * 97); c += r.caught; tot += r.total; fh += r.falseHits; }
    if (c / tot < 0.95 || fh > 10) { ok = false; console.error(); }
  }
  if (!ok) process.exit(1);
  console.log('OK: normal hits are reliably detected at 15-30 fps.');
}
