# Publishing Air Guitar Hero on Google Play

Everything Play asks for is either already in this repo or answered below. Work through the
checklist when you're ready to publish.

## What's already set up

| Requirement | Status |
| --- | --- |
| App bundle (`.aab`) | Built by the **Build Android app** workflow once your upload key is added (step 2) |
| Target API level | Android 16 (API 36), which meets Play's current requirement |
| Increasing version code | Automatic: each build uses the workflow run number |
| App icon, 512 × 512 | `store/icon-512.png` |
| Feature graphic, 1024 × 500 | `store/feature-graphic.png` |
| Phone screenshots, 1080 × 1920 | `store/screenshot-*.png` |
| Privacy policy URL | `https://jppotgieter.github.io/AirGuitar/privacy.html` (once GitHub Pages is on) |
| Works offline, no external servers | The body-tracking engine and model ship inside the app |

App ID: **`com.jppotgieter.airguitar`**. Once you upload to Play this can never change. If you
want a different one, change it **before** the first upload, in `capacitor.config.json`,
`android/app/build.gradle` (`namespace` and `applicationId`) and the Java package folder.

## 1. Create a Google Play developer account

- Sign up at https://play.google.com/console (one-time US$25 fee and ID verification).
- **New personal accounts have to run a closed test first:** at least **12 testers** opted in
  for **14 days in a row** before you can publish to everyone. Line up friends with Android
  phones early. (Organisation accounts skip this step.)

## 2. Create your upload key (once) and add it to GitHub

Play signs the final app for you ("Play App Signing"). You sign uploads with your own
**upload key**. If you lose it, Play support can reset it, but keep a backup anyway.

On a computer with Java installed (Android Studio includes it), run:

```sh
keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 upload.jks > upload.jks.base64      # macOS: base64 -i upload.jks -o upload.jks.base64
```

Then in GitHub, go to **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | contents of `upload.jks.base64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password you chose |
| `ANDROID_KEY_ALIAS` | `upload` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password if you pressed Enter) |

Never commit `upload.jks` to the repo. `.gitignore` already blocks it. (The committed
`android/app/debug.keystore` is only for test APKs, so they install as updates over each other.
It is not secret and must never be used for Play.)

From the next build, the workflow produces a signed `AirGuitarHero.aab` (upload this to Play)
and a signed `AirGuitarHero.apk`, both on the **android-latest** release.

## 3. Create the app in Play Console

**Create app:** name *Air Guitar Hero*, type *App*, *Free*.

### Store listing (copy and paste)

**App name** (30 characters max):
> Air Guitar Hero

**Short description** (80 characters max):
> Play air guitar, drums & trombone with your camera. Make real music by moving!

**Full description:**
> Grab your imaginary guitar, drumsticks or trombone and become a rock star!
>
> Air Guitar Hero uses your phone's camera to follow your body. A cartoon rock star copies
> every move you make, and the guitar in your hands makes real music.
>
> 🎸 AIR GUITAR, 🥁 AIR DRUMS AND 🎺 AIR TROMBONE: three instruments, all played with your body.
>
> 🎸 SLIDE TO CHANGE CHORDS: move your fretting hand up and down the neck to switch chords.
> 🎶 STRUM TO PLAY: sweep your other hand across the guitar. Strum harder to play louder,
> and strum up or down for a different sound.
> 🥁 DRUM ALONG: hit anywhere around you to play snare, toms, hi-hat and cymbals. Stomp for the kick.
> 🎺 SLIDE THE TROMBONE: push the slide out and in to play notes that glide like the real thing.
> 🎨 CREATE YOUR ROCK STAR: pick your skin, hair, shades, hat and outfit.
> 🤘 CHOOSE YOUR GUITAR: Acoustic, Classic Red, Gold Top, Flying V or Neon Star, each with
> its own look and sound.
> 🎵 CHORD SETS: Campfire, Rock power chords, Blues and Moody.
> ✋ LEFT-HANDED MODE: swap your hands.
> 🔒 PRIVATE: the camera is processed on your phone and never recorded or uploaded.
> 📴 WORKS OFFLINE: no account, no ads, no internet needed.
>
> Prop your phone up, step back so it can see you, and start playing. No guitar or lessons
> needed, just your imagination.

**Category:** Music & Audio. **Tags:** Music, Simulation.
**Graphics:** upload the files in `store/`.

### App content questionnaires

- **Privacy policy:** `https://jppotgieter.github.io/AirGuitar/privacy.html`
- **Ads:** No, the app does not contain ads.
- **App access:** All functionality is available without special access.
- **Content rating (IARC):** Category *Entertainment*. Answer "No" to violence, sexuality,
  language, controlled substances, gambling, user interaction/sharing and location sharing.
  The result is usually *Everyone / PEGI 3*.
- **Target audience:** 13+ is simplest. If you choose ages under 13, the app also has to meet
  the Families policy requirements.
- **Data safety:**
  - Does your app collect or share any of the required user data types? **No**
  - (The camera is used on the device only. Data processed only on the device doesn't count
    as "collected".)
- **Government app / financial features / health:** No.

## 4. Upload and test

1. **Testing → Closed testing → Create track**, add your testers' emails, and upload
   `AirGuitarHero.aab` from the android-latest release.
2. Share the opt-in link with your testers and keep at least 12 opted in for 14 days.
3. Then apply for **Production** access in the Console and roll out.

For each update, push your changes, wait for the workflow, and upload the new `.aab`. The
version code goes up automatically.

## Regenerating the graphics

If you change the icon (`web/icons/icon.svg`) or the look of the app:

```sh
npm install && npm install --no-save playwright && npx playwright install chromium
npm run build
npx http-server www -p 8080 &
node scripts/make-assets.mjs
```
