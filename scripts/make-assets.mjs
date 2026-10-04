// Renders Android launcher icons, splash screens and Play Store graphics from web/icons/icon.svg.
// Needs Playwright (npx playwright) and a local server running the built app for screenshots:
//   npm run build && npx http-server www -p 8080 &  node scripts/make-assets.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = path.join(root, 'android/app/src/main/res');
const store = path.join(root, 'store');
const svg = fs.readFileSync(path.join(root, 'web/icons/icon.svg'), 'utf8');
const BG = '#0b0820';

// The icon art without its rounded background, for the adaptive-icon foreground layer.
const art = svg.replace(/<rect width="512" height="512" rx="112" fill="url\(#bg\)"\/>/, '');
const fullBleed = svg.replace('rx="112"', 'rx="0"');
const inline = (s, size, extra = '') => s.replace('<svg ', `<svg width="${size}" height="${size}" style="display:block;${extra}" `);

const browser = await chromium.launch();
async function shot(html, w, h, file, opts = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true, ...opts });
  await page.close();
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(densities)) {
  const legacy = Math.round(48 * k);
  const fg = Math.round(108 * k);
  // Adaptive foreground: art inside the central 66dp safe zone of the 108dp canvas.
  const inner = Math.round(fg * 0.62);
  await shot(
    `<div style="width:${fg}px;height:${fg}px;display:flex;align-items:center;justify-content:center">${inline(art, inner)}</div>`,
    fg, fg, `${res}/mipmap-${d}/ic_launcher_foreground.png`
  );
  await shot(inline(svg, legacy), legacy, legacy, `${res}/mipmap-${d}/ic_launcher.png`);
  await shot(inline(fullBleed, legacy, 'border-radius:50%'), legacy, legacy, `${res}/mipmap-${d}/ic_launcher_round.png`);
}

// Splash screens (Android 11 and older; newer versions show the launcher icon on the theme colour).
const splash = (w, h) => {
  const s = Math.round(Math.min(w, h) * 0.32);
  return `<div style="width:${w}px;height:${h}px;background:radial-gradient(circle at 50% 40%,#3b1a6b,${BG} 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;color:#fff">
    ${inline(svg, s, 'border-radius:22%')}
    <div style="margin-top:${s * 0.15}px;font-weight:900;font-size:${s * 0.22}px">Air Guitar Hero</div></div>`;
};
const splashes = [
  ['drawable', 480, 320],
  ...Object.entries({ mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] })
    .flatMap(([d, [w, h]]) => [[`drawable-port-${d}`, w, h], [`drawable-land-${d}`, h, w]]),
];
for (const [dir, w, h] of splashes) await shot(splash(w, h), w, h, `${res}/${dir}/splash.png`, { omitBackground: false });

// Play Store graphics.
await shot(inline(fullBleed, 512), 512, 512, `${store}/icon-512.png`, { omitBackground: false });
await shot(
  `<div style="width:1024px;height:500px;background:radial-gradient(circle at 30% 40%,#5b2a9e,${BG} 70%);display:flex;align-items:center;gap:48px;padding-left:80px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff">
    ${inline(svg, 300, 'border-radius:22%;box-shadow:0 20px 60px rgba(0,0,0,.5)')}
    <div><div style="font-size:72px;font-weight:900;line-height:1">Air Guitar<br><span style="color:#ffd65a">Hero</span></div>
    <div style="font-size:28px;margin-top:20px;color:#ddd">Play air guitar.<br>Make real music. 🎸</div></div></div>`,
  1024, 500, `${store}/feature-graphic.png`, { omitBackground: false }
);

// Phone screenshots (1080x1920) from the running app's demo mode.
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 3 });
const url = process.env.APP_URL || 'http://localhost:8080/';
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.screenshot({ path: `${store}/screenshot-1-intro.png` });
await page.click('#customize');
await page.locator('.opt', { hasText: 'Hair' }).locator('.opt-values button').nth(2).click();
await page.locator('.opt', { hasText: 'Hair colour' }).locator('.opt-values button').nth(5).click();
await page.locator('.opt', { hasText: 'Shirt' }).locator('.opt-values button').nth(4).click();
await page.click('#custom .tabs button[data-tab=guitar]');
await page.locator('.guitar-card').nth(4).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${store}/screenshot-5-customise.png` });
await page.click('#custom-done');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.click('#demo');
await page.waitForTimeout(4200);
await page.screenshot({ path: `${store}/screenshot-2-acoustic.png` });
await page.click('#gear');
await page.selectOption('#preset', 'rock');
await page.click('#close');
await page.waitForTimeout(2300);
await page.screenshot({ path: `${store}/screenshot-3-rock.png` });
await page.click('#gear');
await page.screenshot({ path: `${store}/screenshot-4-settings.png` });
for (const [n, inst] of [[6, 'drums'], [7, 'trombone']]) {
  await page.goto(`${url}?instrument=${inst}&demo`);
  await page.waitForTimeout(4200);
  await page.screenshot({ path: `${store}/screenshot-${n}-${inst}.png` });
}
await page.evaluate(() => localStorage.clear());
await browser.close();
console.log('Assets written.');
