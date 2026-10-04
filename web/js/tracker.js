// Body tracking via MediaPipe Pose Landmarker (33 landmarks, normalised 0..1 image coords).
// The build (scripts/build-web.mjs) bundles the runtime and model under vendor/; when running
// the raw web/ folder they come from the CDN instead.
const LOCAL = new URL('vendor/mediapipe/', document.baseURI).href;
const CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

async function loadVision() {
  try {
    const lib = await import(`${LOCAL}vision_bundle.mjs`);
    return { lib, wasm: `${LOCAL}wasm`, model: `${LOCAL}pose_landmarker_lite.task` };
  } catch {
    const lib = await import(`${CDN}/vision_bundle.mjs`);
    return { lib, wasm: `${CDN}/wasm`, model: CDN_MODEL };
  }
}

export class PoseTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.lastTime = -1;
  }

  // Loads the tracker the first time, then (re)starts the camera. Safe to call again after stop().
  async init(onStatus) {
    if (!this.landmarker) await this.loadModel(onStatus);
    await this.startCamera(onStatus);
  }

  async loadModel(onStatus) {
    onStatus('Loading body tracker…');
    const { lib, wasm, model } = await loadVision();
    const { PoseLandmarker, FilesetResolver } = lib;
    const fileset = await FilesetResolver.forVisionTasks(wasm);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('GPU'));
    } catch (e) {
      console.warn('GPU delegate unavailable, falling back to CPU', e);
      this.landmarker = await PoseLandmarker.createFromOptions(fileset, opts('CPU'));
    }
  }

  async startCamera(onStatus) {
    onStatus('Starting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
    });
    this.video.srcObject = stream;
    await this.video.play();
  }

  // Turn the camera off (e.g. when going back to the menu).
  stop() {
    const stream = this.video.srcObject;
    if (stream) for (const t of stream.getTracks()) t.stop();
    this.video.srcObject = null;
    this.lastTime = -1;
  }

  get aspect() {
    return (this.video.videoWidth || 4) / (this.video.videoHeight || 3);
  }

  // Returns the latest landmarks (array of 33) or null. Call once per animation frame.
  detect(now) {
    if (!this.landmarker || this.video.readyState < 2) return undefined;
    if (this.video.currentTime === this.lastTime) return undefined; // no new camera frame
    this.lastTime = this.video.currentTime;
    const res = this.landmarker.detectForVideo(this.video, now);
    return res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
  }
}

// A fake performer used for the demo mode (and for testing without a camera). Coordinates
// are raw camera space, as MediaPipe gives them: the person's right side is on the image's left.
// `mode` picks which instrument the performer plays.
const SHOULDER_X = 0.24; // shoulder width in raw x units
const SHOULDER_Y = 0.18; // the same distance in raw y units (3:4 camera)
// Body-relative position (shoulder widths; +x = performer's right, +y = down) to raw coords.
const rx = (px) => 0.5 - px * SHOULDER_X;
const ry = (py) => 0.33 + py * SHOULDER_Y;
const smoothstep = (f) => f * f * (3 - 2 * f);
const frac = (x) => x - Math.floor(x);

const DRUM_PADS = {
  snare: [-0.72, 1.45], tom1: [-0.38, 0.88], tom2: [0.38, 0.88], floor: [1.18, 1.5], crash: [-1.5, -0.2], hihat: [-1.42, 0.8],
};
const DRUM_PATTERN = ['snare', 'tom2', 'snare', 'floor', 'snare', 'tom1', 'snare', 'crash'];
const TROMBONE_TUNE = [3, 2, 1, 0, 1, 2, 4, 3, 5, 7, 6, 4];

export class DemoTracker {
  constructor() {
    this.t0 = performance.now();
    this.video = null;
    this.mode = 'guitar';
  }
  async init() {}
  get aspect() {
    return 3 / 4;
  }
  detect(now) {
    // requestAnimationFrame's timestamp can be slightly older than our start time.
    const t = Math.max(0, (now - this.t0) / 1000);
    const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const set = (i, x, y) => (pts[i] = { x, y, z: 0, visibility: 1 });
    const bob = Math.sin(t * Math.PI * 2) * 0.008; // nod along to the beat
    const sway = Math.sin(t * 0.7) * 0.02;
    set(0, 0.5 + sway, 0.2 + bob);
    set(2, 0.52 + sway, 0.185 + bob); // left eye
    set(5, 0.48 + sway, 0.185 + bob); // right eye
    set(7, 0.545 + sway, 0.2 + bob); // left ear
    set(8, 0.455 + sway, 0.2 + bob); // right ear
    set(11, 0.62 + sway * 0.5, 0.33); // left shoulder
    set(12, 0.38 + sway * 0.5, 0.33); // right shoulder
    set(23, 0.58, 0.6);
    set(24, 0.42, 0.6);
    set(25, 0.6, 0.78);
    set(26, 0.4, 0.78);
    set(27, 0.61, 0.95);
    set(28, 0.39, 0.95);
    const hand = (side, x, y) => {
      const [w, el, sh, pinky, index, thumb] = side === 'L' ? [15, 13, 11, 17, 19, 21] : [16, 14, 12, 18, 20, 22];
      const out = side === 'L' ? 1 : -1;
      set(w, x, y);
      // Elbow halfway between shoulder and hand, bent outwards and down.
      set(el, (pts[sh].x + x) / 2 + out * 0.05, (pts[sh].y + y) / 2 + 0.06);
      set(pinky, x + out * 0.02, y - 0.01);
      set(index, x + out * 0.03, y);
      set(thumb, x + out * 0.01, y - 0.02);
    };

    if (this.mode === 'drums') {
      // Left hand: hi-hat eighth notes. Right hand: around the kit on the beat.
      const hf = frac(t / 0.25);
      const hh = DRUM_PADS.hihat;
      hand('L', rx(hh[0]), ry(hh[1] - 0.55 * Math.pow(Math.sin(Math.PI * hf), 0.8)));
      const k = Math.floor(t / 0.5);
      const f = frac(t / 0.5);
      const a = DRUM_PADS[DRUM_PATTERN[k % DRUM_PATTERN.length]];
      const b = DRUM_PADS[DRUM_PATTERN[(k + 1) % DRUM_PATTERN.length]];
      const x = a[0] + (b[0] - a[0]) * smoothstep(f);
      // Swing up and come down onto the next target (higher swings for cymbals above).
      const lift = 0.8 + 1.4 * Math.max(0, a[1] - b[1]);
      const y = a[1] + (b[1] - a[1]) * f - lift * Math.pow(Math.sin(Math.PI * f), 0.8);
      hand('R', rx(x), ry(y));
      // Kick drum: stomp the right knee on beats 1 and 3.
      const kf = frac(t / 1.0);
      const kneeLift = 0.08 * Math.pow(Math.sin(Math.PI * Math.min(1, kf / 0.5)), 0.8);
      set(26, 0.4, 0.78 - kneeLift);
      set(28, 0.39, 0.95 - kneeLift);
    } else if (this.mode === 'trombone') {
      const mouth = { x: 0.5 + sway, y: 0.23 + bob };
      const step = Math.floor(t / 0.5);
      const f = Math.min(1, frac(t / 0.5) / 0.35);
      const ext = (z) => 0.8 + (z + 0.5) * (1.6 / 8); // centre of each slide zone, as measured from the mouth
      const e0 = ext(TROMBONE_TUNE[step % TROMBONE_TUNE.length]);
      const e1 = ext(TROMBONE_TUNE[(step + 1) % TROMBONE_TUNE.length]);
      const e = e0 + (e1 - e0) * smoothstep(f);
      hand('R', mouth.x - e * SHOULDER_X, mouth.y + 0.04);
      hand('L', mouth.x - 0.35 * SHOULDER_X, mouth.y + 0.35 * SHOULDER_Y);
    } else {
      // Guitar. Fretting (left) hand slides along the neck every two bars.
      const zone = Math.floor(t / 2) % 4;
      const reach = 0.24 + zone * 0.04;
      hand('L', 0.5 + reach * 0.95, 0.5 - reach * 0.35);
      set(13, 0.7, 0.45);
      // Strumming (right) hand: down-up on the beat.
      const strum = Math.sin(t * Math.PI * 4);
      hand('R', 0.42 - strum * 0.01, 0.53 + strum * 0.07);
      set(14, 0.33, 0.45);
    }
    return pts;
  }
}
