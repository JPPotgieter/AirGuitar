# Setting up the Chromecast button (Google Cast)

The app has a YouTube-style cast button. When you tap it and pick a Chromecast, the Chromecast
runs the **Air Guitar Hero TV app** (`web/tv.html`), which draws the stage in full HD and plays
the sound. Your phone does the camera tracking and sends your moves and notes to the TV.

Google only lets a Chromecast run a registered app, so there are a few one-time steps.

## 1. Put the TV app online (GitHub Pages)

The Chromecast loads the TV app from your GitHub Pages site.

1. Open https://github.com/JPPotgieter/AirGuitar/settings/pages
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open https://github.com/JPPotgieter/AirGuitar/actions, pick **Deploy to GitHub Pages**,
   and tap **Run workflow**.
4. After a minute, check that this page opens and shows "Air Guitar Hero":
   **https://jppotgieter.github.io/AirGuitar/tv.html**
   You can also try **https://jppotgieter.github.io/AirGuitar/tv.html?demo=drums**: the TV app
   with a pretend player, in any browser.

## 2. Register the TV app with Google ($5, one time)

1. Go to the **Google Cast SDK Developer Console**: https://cast.google.com/publish
   Sign in with your Google account and pay the one-time **US$5** registration fee.
2. **Add New Application → Custom Receiver**
   - **Name:** Air Guitar Hero
   - **Receiver Application URL:** `https://jppotgieter.github.io/AirGuitar/tv.html`
3. Save. You get an **Application ID**: 8 characters, like `A1B2C3D4`.
4. **Send me that Application ID** and I'll put it into the app. (Or put it in
   `android/app/src/main/res/values/strings.xml`, in `<string name="cast_app_id">`.)

The cast button stays hidden until the app has an Application ID.

## 3. Register your Chromecast for testing

Until the TV app is published, Google only lets it run on Chromecasts you've registered.

1. Find your Chromecast's **serial number**. It's printed on the device and its box. For Google
   TV, look under Settings → System → About → Status → Serial number.
2. In the Cast Developer Console: **Add New Device**, enter the serial number and a
   description.
3. Wait about **15 minutes**, then **restart the Chromecast** (unplug it and plug it back in).

## 4. Play

1. Install the new app version. Phone and Chromecast must be on the **same Wi-Fi**.
2. The **cast icon** appears at the top right when a Chromecast is found. Tap it and pick
   your TV.
3. The TV shows "Air Guitar Hero: pick an instrument on your phone". The phone shows
   "📺 Playing on (your TV)" and goes quiet, because the sound comes from the TV.
4. Pick an instrument and tap **Start playing**. Stand your phone below the TV, facing you.
5. To stop, tap the cast icon again and choose **Stop casting**.

## 5. Before launching on Google Play

In the Cast Developer Console, open the application and click **Publish**, so it works on
everyone's Chromecast, not just registered ones. Publishing takes about 15 minutes.

## Troubleshooting

- **No cast icon:** check the phone and Chromecast are on the same Wi-Fi, and that the app has
  the Application ID (step 2).
- **The TV shows an error or stays on the Chromecast screen:** check the
  `tv.html` link from step 1 opens in a browser, and that your Chromecast is registered
  (step 3) and was restarted.
- **The picture is a little behind your moves:** that's the Wi-Fi round trip, usually around
  0.1 seconds. It's smoother than screen mirroring because only your moves are sent, not video.
