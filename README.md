# 🎸 Air Guitar Hero

Play air guitar on your phone. The front camera tracks your body, a rock-star avatar copies
every move you make, and your imaginary guitar makes real music:

- **Fretting hand:** slide it along the neck to change chords. The neck follows your hand, and
  each section of the neck is labelled with its chord.
- **Strumming hand:** sweep it across the guitar body. Down-strums and up-strums sound
  different, and harder strums play louder.
- **Tap the screen** to strum too, which is handy for checking your sound is on.

Everything runs in the browser on your phone. The video is never uploaded.

## Get it on your phone

The camera only works over HTTPS, so host the app on GitHub Pages (free):

1. In this repo on GitHub, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or re-run the *Deploy to GitHub Pages* workflow). The site is published at
   `https://<your-username>.github.io/AirGuitar/`.
3. Open that link on your phone and allow camera access.
4. Install it like an app:
   - **iPhone (Safari):** Share → *Add to Home Screen*
   - **Android (Chrome):** ⋮ menu → *Install app* / *Add to Home screen*

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
| Body tracking with [MediaPipe Pose Landmarker](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker) (33 body points, runs on-device) | `js/tracker.js` |
| Mapping the pose to the avatar, guitar placement, chord zones and strum detection | `js/main.js` |
| Drawing the stage, avatar, guitar and music notes on a canvas | `js/render.js` |
| Guitar sound, synthesised with the Karplus–Strong plucked-string algorithm (Web Audio) | `js/audio.js` |
| Chord shapes and chord sets | `js/chords.js` |
| Offline caching / installable app | `sw.js`, `manifest.webmanifest` |

**Strum detection:** the strumming hand's position is measured across the strings (at right
angles to the neck). A strum fires when the hand crosses the strings fast enough. The direction
of the crossing picks a down-strum or an up-strum, and the speed sets the volume.

**Chord selection:** the fretting hand's distance along the neck is split into one zone per
chord. A little hysteresis stops the chord from flickering when your hand sits on a boundary.

To add your own chords, add a shape to `SHAPES` and a chord set to `PRESETS` in
`js/chords.js`.

## Run locally

```sh
npx http-server .   # then open http://localhost:8080
```

`localhost` counts as a secure origin, so the camera works there on a computer. To test on a
phone you need HTTPS, so use GitHub Pages.
