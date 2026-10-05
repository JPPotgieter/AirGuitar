// Two people in view: the player (front and centre) and a little sister bouncing around.
import { PlayerLock } from '../web/js/playerlock.js';

const ASPECT = 0.75;
function person(cx, cy, sw) {
  const lm = Array.from({ length: 33 }, () => ({ x: cx, y: cy, visibility: 1 }));
  const half = sw / ASPECT / 2;
  lm[0] = { x: cx, y: cy - sw * 0.7, visibility: 1 };
  lm[7] = { x: cx + half * 0.4, y: cy - sw * 0.7, visibility: 1 };
  lm[8] = { x: cx - half * 0.4, y: cy - sw * 0.7, visibility: 1 };
  lm[11] = { x: cx + half, y: cy, visibility: 1 };
  lm[12] = { x: cx - half, y: cy, visibility: 1 };
  return lm;
}
const isPlayer = (lm) => lm && Math.abs(lm[11].x - lm[12].x) > 0.3; // the player is the bigger one

let pass = true;
const check = (name, ok, detail = '') => {
  pass &&= ok;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);
};

{
  const lock = new PlayerLock();
  let wrong = 0, missing = 0;
  for (let f = 0; f < 300; f++) {
    const player = person(0.5 + Math.sin(f / 40) * 0.03, 0.4, 0.26); // swaying a little while playing
    // Sister: smaller, darting and jumping all over, sometimes listed first by the tracker.
    const sister = person(0.5 + Math.sin(f / 7) * 0.4, 0.5 + Math.abs(Math.sin(f / 5)) * -0.15, 0.15);
    const poses = f % 3 ? [player, sister] : [sister, player];
    const picked = lock.pick(f < 60 ? [player] : poses, ASPECT, f >= 30);
    if (!picked) missing++;
    else if (!isPlayer(picked)) wrong++;
  }
  check('sister bouncing around: the avatar stays on the player', wrong === 0 && missing === 0, `wrong ${wrong}, missing ${missing}`);
}
{
  const lock = new PlayerLock();
  const player = person(0.5, 0.4, 0.26);
  const sister = person(0.2, 0.45, 0.15);
  lock.pick([player], ASPECT, true);
  let r;
  for (let f = 0; f < 10; f++) r = lock.pick([sister], ASPECT, true); // player walked out, sister remains
  check('player walks out: nobody is followed (game pauses) instead of the sister', r === null);
}
{
  const lock = new PlayerLock();
  const big = person(0.55, 0.4, 0.26);
  const small = person(0.15, 0.45, 0.15);
  const r = lock.pick([small, big], ASPECT, false);
  check('before starting: the person front and centre is chosen', isPlayer(r));
}
for (const playing of [false, true]) {
  // The sister keeps covering the player (so the tracker sometimes sees only her, right where
  // the player stands). A brief mix-up while she's in front is unavoidable; getting stuck on her
  // is not.
  const lock = new PlayerLock();
  lock.pick([person(0.5, 0.4, 0.26)], ASPECT, false); // the player is locked first
  let wrong = 0, total = 0, stuck = 0, sounding = 0;
  for (let f = 0; f < 400; f++) {
    const covered = f % 20 < 6;
    const player = person(0.5, 0.4, covered ? 0.18 : 0.26);
    const sister = person(0.5 + Math.sin(f / 6) * 0.35, 0.45, 0.16);
    const poses = covered && f % 2 ? [sister] : [sister, player];
    const picked = lock.pick(poses, ASPECT, playing);
    total++;
    if (picked === sister) {
      wrong++;
      if (!covered) stuck++; // the player is plainly visible, yet we follow the sister
      if (lock.confident) sounding++; // her hands would be allowed to play
    }
  }
  const pct = Math.round((100 * wrong) / total);
  check(
    `sister keeps covering the player (${playing ? 'playing' : 'getting ready'}): never stuck, never plays`,
    stuck === 0 && sounding === 0,
    `${pct}% of frames show her while the player is hidden, ${stuck} while the player was in view, ${sounding} able to play`
  );
}
if (!pass) process.exit(1);
console.log('OK: player lock keeps following the player.');
