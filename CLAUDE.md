# Air Guitar Hero: notes for Claude

## Sharing builds with the owner
Every time a new Android build is delivered, always include the GitHub links (and attach the zip):
- Release page: https://github.com/JPPotgieter/AirGuitar/releases/tag/android-latest
- Direct APK: https://github.com/JPPotgieter/AirGuitar/releases/download/android-latest/AirGuitarHero.apk
- Direct zip: https://github.com/JPPotgieter/AirGuitar/releases/download/android-latest/AirGuitarHero.zip
- Build history: https://github.com/JPPotgieter/AirGuitar/actions

## Project basics
- Web app source in `web/`; `npm run build` (CHANNEL=test|play|web) builds `www/`.
- Android wrapper (Capacitor 8) in `android/`; CI builds the APK on every push to the branch.
- Native plugins are reached via `window.Capacitor.Plugins` (see `web/js/native.js`); there is
  no bundler, so `Capacitor.registerPlugin` does not exist at runtime.
- `npm test` runs the drum hit-detection simulation.
