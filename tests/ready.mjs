// Scenarios for the "get in position" gate (web/js/ready.js), with simulated camera landmarks.
import { ReadyGate, READY } from '../web/js/ready.js';

const ASPECT = 0.75; // phone held upright
let seed = 7;
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5);

// A person: shoulder width `sw` (fraction of frame height), with jitter/shake `shake`.
function person({ sw = 0.18, shake = 0.003, handsVis = 1, shouldersVis = 1, dx = 0, dy = 0 } = {}) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
  const half = sw / ASPECT / 2;
  const j = () => rand() * shake;
  const set = (i, x, y, v = 1) => (lm[i] = { x: x + dx + j(), y: y + dy + j(), visibility: v });
  set(0, 0.5, 0.25);
  set(11, 0.5 + half, 0.38, shouldersVis);
  set(12, 0.5 - half, 0.38, shouldersVis);
  set(15, 0.5 + half * 1.6, 0.55, handsVis);
  set(16, 0.5 - half * 1.6, 0.55, handsVis);
  return lm;
}

function run(steps) {
  const g = new ReadyGate();
  let t = 0;
  const log = [];
  for (const [secs, opts, hands = { L: true, R: true }] of steps) {
    for (let k = 0; k < secs * 30; k++) {
      t += 1000 / 30;
      const shakeMove = opts?.moving ? { dx: Math.sin(t / 90) * 0.08, dy: Math.cos(t / 70) * 0.06 } : {};
      g.update(opts === null ? null : person({ ...opts, ...shakeMove }), ASPECT, hands, t);
      if (g.justStarted) log.push(`GO@${(t / 1000).toFixed(1)}s`);
      if (g.justPaused) log.push(`PAUSE@${(t / 1000).toFixed(1)}s`);
    }
  }
  return { g, log };
}

const results = [];
const check = (name, cond, detail) => {
  results.push(cond);
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

{
  const { g, log } = run([[4, { moving: true, sw: 0.3 }]]);
  check('putting the phone down (camera shaking) never starts', !g.ready && !log.length, log.join(' '));
}
{
  const { g, log } = run([[1, { moving: true }], [4, {}]]);
  const go = log.find((l) => l.startsWith('GO'));
  check('standing still at a good distance starts after the countdown', g.ready && !!go, go);
}
{
  const { g } = run([[5, { sw: 0.5 }]]);
  check('too close: waits and says "step back"', !g.ready && g.checks.dist === 'close');
}
{
  const { g } = run([[5, { sw: 0.05 }]]);
  check('too far: waits and says "come closer"', !g.ready && g.checks.dist === 'far');
}
{
  const { g } = run([[5, { shouldersVis: 0.2 }]]);
  check('only a face in view: waits', !g.ready && !g.checks.seen);
}
{
  const { g } = run([[5, {}, { L: true, R: false }]]);
  check('one hand out of view: waits', !g.ready && !g.checks.hands);
}
{
  const { g, log } = run([[4, {}], [2, { sw: 0.5 }]]);
  check('walking up to the phone while playing pauses', !g.ready && g.paused && log.some((l) => l.startsWith('PAUSE')), log.join(' '));
}
{
  const { g, log } = run([[4, {}], [2, null]]);
  check('leaving the picture while playing pauses', !g.ready && g.paused, log.join(' '));
}
{
  const { g, log } = run([[4, {}], [2, {}, { L: false, R: false }]]);
  check('resting hands out of view while playing does not pause', g.ready, log.join(' '));
}
{
  const { g, log } = run([[4, {}], [2, { sw: 0.5 }], [4, {}]]);
  check('stepping back after a pause counts in again', g.ready && log.filter((l) => l.startsWith('GO')).length === 2, log.join(' '));
}
if (results.includes(false)) process.exit(1);
console.log(`OK: all ${results.length} ready-gate scenarios pass (hold ${READY.HOLD_MS} ms).`);
