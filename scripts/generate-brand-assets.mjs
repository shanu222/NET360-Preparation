import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Prefer the original Play Store / brand mark (dark NET360 orbital logo).
 * Do not invent a new logo — restore from public/net360-logo.png.
 */
const BRAND_NAVY = { r: 10, g: 22, b: 48, alpha: 1 };
const MASKABLE_BG = BRAND_NAVY;
const STANDARD_ICON_BG = BRAND_NAVY;
const SPLASH_BG = BRAND_NAVY;

const rasterCandidates = ['public/net360-logo.png', 'New NET360 logo.png', 'NET360 logo.png', 'NET logo.png'];
const svgCandidates = ['public/logo.svg'];

function resolveSourcePath() {
  const raster = rasterCandidates.find((c) => fs.existsSync(c));
  if (raster) return raster;
  const svg = svgCandidates.find((c) => fs.existsSync(c));
  if (svg) return svg;
  throw new Error(
    `Logo source not found. Expected raster one of: ${rasterCandidates.join(', ')} or SVG: ${svgCandidates.join(', ')}`,
  );
}

const src = resolveSourcePath();

/**
 * [outPath, edgePx, fit, background|null]
 */
const webTargets = [
  ['public/favicon-32.png', 32, 'cover', STANDARD_ICON_BG],
  ['public/favicon-192.png', 192, 'cover', STANDARD_ICON_BG],
  ['public/favicon-192-maskable.png', 192, 'contain', MASKABLE_BG],
  ['public/apple-touch-icon.png', 180, 'cover', STANDARD_ICON_BG],
  ['public/android-chrome-512x512.png', 512, 'cover', STANDARD_ICON_BG],
  ['public/android-chrome-512-maskable.png', 512, 'contain', MASKABLE_BG],
  ['public/splash-icon.png', 512, 'contain', SPLASH_BG],
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
  // Adaptive foreground: contain with padding so the full mark stays in the safe zone
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

const notificationTargets = [
  ['android/app/src/main/res/drawable-mdpi/ic_stat_net360.png', 24],
  ['android/app/src/main/res/drawable-hdpi/ic_stat_net360.png', 36],
  ['android/app/src/main/res/drawable-xhdpi/ic_stat_net360.png', 48],
  ['android/app/src/main/res/drawable-xxhdpi/ic_stat_net360.png', 72],
  ['android/app/src/main/res/drawable-xxxhdpi/ic_stat_net360.png', 96],
];

async function writeSquarePng(out, size, fit, background) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
  await sharp(src)
    .resize(size, size, { fit, background: background || STANDARD_ICON_BG })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(out);
}

/** White silhouette notification icon (Android status bar requires alpha silhouette). */
async function writeNotificationIcon(out, size) {
  await fs.promises.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
  const resized = await sharp(src)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 16) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
    } else {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      // Keep some alpha for anti-aliasing
      data[i + 3] = a;
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(out);
}

async function build() {
  console.log('[brand:assets] source:', src);

  for (const [out, size, fit, background] of webTargets) {
    await writeSquarePng(out, size, fit, background);
    console.log('  wrote', out);
  }

  for (const [out, size, fit] of androidTargets) {
    await writeSquarePng(out, size, fit, STANDARD_ICON_BG);
    console.log('  wrote', out);
  }

  for (const out of androidSplashTargets) {
    let width = 480;
    let height = 800;
    try {
      if (fs.existsSync(out)) {
        const metadata = await sharp(out).metadata();
        if (metadata.width && metadata.height) {
          width = metadata.width;
          height = metadata.height;
        }
      }
    } catch {
      // use defaults
    }

    // Portrait/landscape defaults by path if file missing sizes
    if (out.includes('land-')) {
      width = Math.max(width, height);
      height = Math.min(width, height) || height;
    }

    await fs.promises.mkdir(path.dirname(out), { recursive: true }).catch(() => {});
    await sharp(src)
      .resize(width, height, { fit: 'contain', background: SPLASH_BG })
      .png({ compressionLevel: 9, effort: 10 })
      .toFile(out);
    console.log('  wrote', out);
  }

  // Also write default drawable/splash.png used by Cap theme
  const defaultSplash = 'android/app/src/main/res/drawable/splash.png';
  await sharp(src)
    .resize(512, 512, { fit: 'contain', background: SPLASH_BG })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(defaultSplash);
  console.log('  wrote', defaultSplash);

  for (const [out, size] of notificationTargets) {
    await writeNotificationIcon(out, size);
    console.log('  wrote', out);
  }

  console.log('Brand assets generated successfully from original NET360 logo.');
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
