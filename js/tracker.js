// Body tracking via MediaPipe Pose Landmarker (33 landmarks, normalised 0..1 image coords).
const MP_VERSION = '0.10.14';
const MP_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export class PoseTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.lastTime = -1;
  }

  async init(onStatus) {
    onStatus('Loading body tracker…');
    const { PoseLandmarker, FilesetResolver } = await import(`${MP_URL}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${MP_URL}/wasm`);
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
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

    onStatus('Starting camera…');
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    this.video.srcObject = stream;
    await this.video.play();
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

// A fake performer used for the demo mode (and for testing without a camera).
// Coordinates are in the same mirrored-camera space MediaPipe would give us.
export class DemoTracker {
  constructor() {
    this.t0 = performance.now();
    this.video = null;
  }
  async init() {}
  get aspect() {
    return 3 / 4;
  }
  detect(now) {
    const t = (now - this.t0) / 1000;
    const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const set = (i, x, y) => (pts[i] = { x, y, z: 0, visibility: 1 });
    const bob = Math.sin(t * Math.PI * 2) * 0.008; // nod along to the beat
    const sway = Math.sin(t * 0.7) * 0.02;
    // Raw camera space: the person's right side is on the image's left.
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
    // Fretting (left) hand slides along the neck every two bars.
    const zone = Math.floor(t / 2) % 4;
    const reach = 0.24 + zone * 0.04;
    set(13, 0.7, 0.45);
    set(15, 0.5 + reach * 0.95, 0.5 - reach * 0.35);
    set(17, pts[15].x + 0.02, pts[15].y - 0.01);
    set(19, pts[15].x + 0.03, pts[15].y);
    set(21, pts[15].x + 0.01, pts[15].y - 0.02);
    // Strumming (right) hand: down-up on the beat.
    const strum = Math.sin(t * Math.PI * 4);
    set(14, 0.33, 0.45);
    set(16, 0.42 - strum * 0.01, 0.53 + strum * 0.07);
    set(18, pts[16].x - 0.02, pts[16].y + 0.01);
    set(20, pts[16].x - 0.03, pts[16].y);
    set(22, pts[16].x - 0.01, pts[16].y - 0.02);
    return pts;
  }
}
