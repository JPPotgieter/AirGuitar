# 🎸 Air Guitar Hero

Play air guitar, air drums or air trombone on your phone. The front camera tracks your body, a
rock-star avatar copies every move you make, and your imaginary instrument makes real music.

### 🎸 Guitar

- **Fretting hand:** slide it along the neck to change chords. The neck follows your hand, and
  each section of the neck is labelled with its chord.
- **Strumming hand:** sweep it across the guitar body. Down-strums and up-strums sound
  different, and harder strums play louder.
- **Tap the screen** to strum too, which is handy for checking your sound is on.

### 🥁 Drums

- **Hit downwards** with either hand. The drum or cymbal nearest to where your hand stops is
  played: snare, two toms, floor tom, hi-hat, crash and ride. Harder hits are louder.
- **Lift and stomp a knee** for the kick drum, or hit low in the middle.

### 🎺 Trombone

- Hold the trombone to your mouth with one hand and **push or pull the slide** with the other.
- **Slide in for high notes, out for low notes.** Each push or pull plays the note where your
  hand stops (B♭ major pentatonic, so everything sounds good together), gliding from the last
  note like a real trombone.

### Free and full versions

Guitar is free. A **€2/month** Google Play subscription unlocks drums, trombone and every
instrument added later. Locked instruments show 🔒 and can still be previewed with **Watch a demo first**.
Test APKs from GitHub have everything unlocked. See [`store/PLAY_STORE.md`](store/PLAY_STORE.md)
for setting up the subscription in Play Console.

### Everything else

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

**Updating:** test builds are all signed with the same test key (`android/app/debug.keystore`),
so a new APK installs straight over the old one and keeps your settings. When a new build is
out, the app shows **"Version … is ready! Update"** on the start screen. Tap it, then open the
download and tap **Update**.

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
- Pick your instrument on the start screen or in ⚙︎ Settings.
- **Watch demo** shows the avatar playing on its own. You can also open the app with `?demo`
  on the end of the URL.

## How it works

| Piece | File |
| --- | --- |
| Body tracking with [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) (33 body points, runs on-device) | `web/js/tracker.js` |
| Pose landmarks to an on-screen skeleton | `web/js/body.js` |
| App flow, settings, auto-zoom and the customise screen | `web/js/main.js` |
| Guitar: placement, chord zones and strum detection | `web/js/instruments/guitar.js` |
| Drums: kit layout and hit detection | `web/js/instruments/drums.js` |
| Trombone: slide position and stroke detection | `web/js/instruments/trombone.js` |
| Drum and trombone sound synthesis | `web/js/sounds.js` |
| Free/full version: Google Play subscription ([@capgo/native-purchases](https://github.com/Cap-go/capacitor-native-purchases)) | `web/js/purchases.js` |
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
