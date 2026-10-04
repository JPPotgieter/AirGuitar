// Builds the self-contained web app into www/ (used by GitHub Pages and the Android app).
// Copies web/ and bundles the MediaPipe runtime + pose model so nothing loads from a CDN.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'www');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const modelCache = path.join(root, '.vendor-cache', 'pose_landmarker_lite.task');

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(root, 'web'), out, { recursive: true });

const mp = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision');
if (!fs.existsSync(mp)) throw new Error('Run "npm install" first.');
const vendor = path.join(out, 'vendor', 'mediapipe');
fs.mkdirSync(path.join(vendor, 'wasm'), { recursive: true });
fs.copyFileSync(path.join(mp, 'vision_bundle.mjs'), path.join(vendor, 'vision_bundle.mjs'));
for (const f of fs.readdirSync(path.join(mp, 'wasm'))) {
  fs.copyFileSync(path.join(mp, 'wasm', f), path.join(vendor, 'wasm', f));
}

if (!fs.existsSync(modelCache)) {
  console.log('Downloading pose model…');
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`Model download failed: ${res.status}`);
  fs.mkdirSync(path.dirname(modelCache), { recursive: true });
  fs.writeFileSync(modelCache, Buffer.from(await res.arrayBuffer()));
}
fs.copyFileSync(modelCache, path.join(vendor, 'pose_landmarker_lite.task'));

// Version and build channel, baked into the app:
//   test: sideloaded APK from GitHub. Everything unlocked, self-update prompt.
//   play: Google Play build. Guitar free, other instruments via in-app purchase.
//   web:  the website. Guitar only, with a link to the Play Store.
const code = Number(process.env.VERSION_CODE || 0);
const name = process.env.VERSION_NAME || 'dev';
const channel = process.env.CHANNEL || 'web';
if (!['test', 'play', 'web'].includes(channel)) throw new Error(`Unknown CHANNEL "${channel}"`);
fs.writeFileSync(
  path.join(out, 'js', 'version.js'),
  `export const VERSION = ${JSON.stringify({ code, name })};\nexport const BUILD = ${JSON.stringify({ channel })};\n`
);

console.log(`Built www/ (version ${name}, ${channel} build)`);
