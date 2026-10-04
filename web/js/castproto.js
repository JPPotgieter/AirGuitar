// The messages the phone sends the TV (Chromecast) app, over a custom Cast channel.
//   { t: 's', s: {...} }              settings: instrument, avatar look, guitar, lefty, chords, sound
//   { t: 'f', a, lm, hw }             a frame: camera aspect, 33 landmarks, hand weights [L, R]
//   { t: 'n', i, p }                  a note the phone played (instrument id + its payload)
//   { t: 'idle' }                     back on the menu
export const CAST_NAMESPACE = 'urn:x-cast:com.jppotgieter.airguitar';
export const PROTOCOL = 1;

// Landmarks as a flat, rounded array to keep each frame small (about 600 bytes).
export function packLandmarks(lms) {
  const out = new Array(lms.length * 3);
  for (let i = 0; i < lms.length; i++) {
    const p = lms[i];
    out[i * 3] = Math.round(p.x * 10000) / 10000;
    out[i * 3 + 1] = Math.round(p.y * 10000) / 10000;
    out[i * 3 + 2] = Math.round((p.visibility ?? 1) * 100) / 100;
  }
  return out;
}

export function unpackLandmarks(flat) {
  const lms = [];
  for (let i = 0; i + 2 < flat.length; i += 3) lms.push({ x: flat[i], y: flat[i + 1], visibility: flat[i + 2] });
  return lms;
}

// The settings the TV needs to draw and sound like the phone.
export function castSettings(settings) {
  const { instrument, look, guitar, lefty, preset, tone } = settings;
  return { instrument, look, guitar, lefty, preset, tone, v: PROTOCOL };
}
