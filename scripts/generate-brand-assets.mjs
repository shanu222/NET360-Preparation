import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PWA / manifest theme_color (#5f4ee6) — maskable icons use this as padding so the mark
 * sits inside the safe zone (fit: contain).
 */
const MASKABLE_BG = { r: 95, g: 78, b: 230, alpha: 1 };
const STANDARD_ICON_BG = { r: 255, g: 255, b: 255, alpha: 1 };

const svgCandidates = ['public/logo.svg'];
const rasterCandidates = ['public/net360-logo.png', 'New NET360 logo.png', 'NET360 logo.png', 'NET logo.png'];

function resolveSourcePath() {
  const svg = svgCandidates.find((c) => fs.existsSync(c));
  if (svg) return svg;
  const raster = rasterCandidates.find((c) => fs.existsSync(c));
  if (raster) return raster;
  throw new Error(
    `Logo source not found. Expected SVG one of: ${svgCandidates.join(', ')} or raster: ${rasterCandidates.join(', ')}`,
  );
}

const src = resolveSourcePath();

/**
 * [outPath, edgePx, fit, background|null]
 * - cover: fills square (favicon / launcher)
 * - contain + MASKABLE_BG: PWA maskable safe zone (padding around mark)
 */
const webTargets = [
  ['public/favicon-32.png', 32, 'cover', STANDARD_ICON_BG],
  ['public/favicon-192.png', 192, 'cover', STANDARD_ICON_BG],
  ['public/favicon-192-maskable.png', 192, 'contain', MASKABLE_BG],
  ['public/apple-touch-icon.png', 180, 'cover', STANDARD_ICON_BG],
  ['public/android-chrome-512x512.png', 512, 'cover', STANDARD_ICON_BG],
  ['public/android-chrome-512-maskable.png', 512, 'contain', MASKABLE_BG],
  ['public/splash-icon.png', 512, 'cover', STANDARD_ICON_BG],
];

const androidTargets = [
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher.png', 48, 'cover'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher.png', 72, 'cover'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96, 'cover'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144, 'cover'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, 'cover'],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png', 48, 'cover'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png', 72, 'cover'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png', 96, 'cover'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png', 144, 'cover'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', 192, 'cover'],
  ['android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png', 108, 'contain'],
  ['android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png', 162, 'contain'],
  ['android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png', 216, 'contain'],
  ['android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png', 324, 'contain'],
  ['android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', 432, 'contain'],
];

const androidSplashTargets = [
  'android/app/src/main/res/drawable-port-mdpi/splash.png',
  'android/app/src/main/res/drawable-port-hdpi/splash.png',
  'android/app/src/main/res/drawable-port-xhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-port-xxxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-mdpi/splash.png',
  'android/app/src/main/res/drawable-land-hdpi/splash.png',
  'android/app/src/main/res/drawable-land-xhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxhdpi/splash.png',
  'android/app/src/main/res/drawable-land-xxxhdpi/splash.png',
];

async function writeSquarePng(out, size, fit, background) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
  await sharp(src)
    .resize(size, size, { fit, background: background || STANDARD_ICON_BG })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(out);
}

async function build() {
  console.log('[brand:assets] source:', src);

  for (const [out, size, fit, background] of webTargets) {
    await writeSquarePng(out, size, fit, background);
  }

  for (const [out, size, fit] of androidTargets) {
    const bg = fit === 'contain' ? STANDARD_ICON_BG : STANDARD_ICON_BG;
    await writeSquarePng(out, size, fit, bg);
  }

  for (const out of androidSplashTargets) {
    const metadata = await sharp(out).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read splash size for ${out}`);
    }

    await sharp(src)
      .resize(metadata.width, metadata.height, { fit: 'contain', background: STANDARD_ICON_BG })
      .png({ compressionLevel: 9, effort: 10 })
      .toFile(out);
  }

  console.log('Brand assets generated successfully (web + Android launcher + Android splash).');
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
