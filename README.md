# 🎸 Air Guitar Hero

Play air guitar on your phone. The front camera tracks your body, a rock-star avatar copies
every move you make, and your imaginary guitar makes real music:

- **Fretting hand:** slide it along the neck to change chords. The neck follows your hand, and
  each section of the neck is labelled with its chord.
- **Strumming hand:** sweep it across the guitar body. Down-strums and up-strums sound
  different, and harder strums play louder.
- **Tap the screen** to strum too, which is handy for checking your sound is on.
- **Create your rock star:** choose skin, hair style and colour, glasses, hat and outfit, then
  pick from five guitars (Acoustic, Classic Red, Gold Top, Flying V, Neon Star). Each guitar has
  its own shape and sound.

Everything runs in the browser on your phone. The video is never uploaded.

## Get it on your phone

### Android app (APK)

Every push to GitHub builds the Android app automatically.

1. On your Android phone, open
   **https://github.com/JPPotgieter/AirGuitar/releases/tag/android-latest**
2. Tap **AirGuitarHero.apk** to download it, then open it. If the download stalls, get
   **AirGuitarHero.zip** instead, open it in the Files app, extract it, and tap the APK.
3. If Android asks, allow your browser to **install unknown apps**, then tap **Install**.
4. Open **Air Guitar Hero** and allow camera access.

Publishing to Google Play is covered step by step in [`store/PLAY_STORE.md`](store/PLAY_STORE.md).

### Website (any phone, including iPhone)

The camera only works over HTTPS, so the site is hosted on GitHub Pages (free):

1. In this repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push, or re-run the *Deploy to GitHub Pages* workflow. The site is published at
   `https://jppotgieter.github.io/AirGuitar/`.
3. Open that link on your phone and allow camera access. You can add it to your home screen
   (iPhone: Share → *Add to Home Screen*; Android: ⋮ → *Install app*).

## Tips for playing

- Prop the phone up (against a book, or on a tripod) about 1.5–2 m away so your upper body
  and both hands are in view. Good lighting helps the tracking a lot.
- Hold your arms like you're playing a real guitar: fretting hand out to the side,
  strumming hand in front of your belly.
- ⚙︎ **Settings:**
  - **Chords:** pick a chord set (Campfire, Rock power chords, Blues in A, Moody).
  - **Sound:** Acoustic or Rock (distortion).
  - **Left-handed:** swap which hand strums and which hand frets.
  - **Show camera preview:** show or hide the small camera window.
- **Watch demo** shows the avatar playing on its own. You can also open the app with `?demo`
  on the end of the URL.

## How it works

| Piece | File |
| --- | --- |
| Body tracking with [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) (33 body points, runs on-device) | `web/js/tracker.js` |
| Mapping the pose to the avatar, guitar placement, chord zones and strum detection | `web/js/main.js` |
| Drawing the stage, avatar, guitar and music notes on a canvas | `web/js/render.js` |
| Guitar sound, synthesised with the Karplus–Strong plucked-string algorithm (Web Audio) | `web/js/audio.js` |
| Chord shapes and chord sets | `web/js/chords.js` |
| Avatar options and the guitar collection | `web/js/looks.js` |
| Build step: copies `web/` to `www/` and bundles the MediaPipe runtime and model so the app works offline | `scripts/build-web.mjs` |
| Android app ([Capacitor](https://capacitorjs.com) wrapper around `www/`) | `android/` |
| CI: Android APK/AAB build, and GitHub Pages deploy | `.github/workflows/` |
| Play Store graphics, listing text and checklist | `store/` |

**Strum detection:** the strumming hand's position is measured across the strings (at right
angles to the neck). A strum fires when the hand crosses the strings fast enough. The direction
of the crossing picks a down-strum or an up-strum, and the speed sets the volume.

**Chord selection:** the fretting hand's distance along the neck is split into one zone per
chord. A little hysteresis stops the chord from flickering when your hand sits on a boundary.

To add your own chords, add a shape to `SHAPES` and a chord set to `PRESETS` in
`web/js/chords.js`.

## Develop

```sh
npm install
npm run serve            # builds www/ and serves it at http://localhost:8080
npm run android:sync     # rebuild www/ and copy it into the Android project
npm run android:open     # open in Android Studio to run on a device or emulator
```

`localhost` counts as a secure origin, so the camera works there on a computer.
