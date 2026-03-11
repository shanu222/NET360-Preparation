import sharp from 'sharp';
import fs from 'node:fs';

const src = 'NET360 logo.png';

const webTargets = [
  ['public/net360-logo.png', 256, 'cover'],
  ['public/favicon-32.png', 32, 'cover'],
  ['public/favicon-192.png', 192, 'cover'],
  ['public/apple-touch-icon.png', 180, 'cover'],
  ['public/android-chrome-512x512.png', 512, 'cover'],
  ['public/splash-icon.png', 512, 'cover'],
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

async function build() {
  for (const [out, size, fit] of webTargets) {
    await sharp(src)
      .resize(size, size, { fit, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }

  for (const [out, size, fit] of androidTargets) {
    await sharp(src)
      .resize(size, size, { fit, background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }

  for (const out of androidSplashTargets) {
    const metadata = await sharp(out).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read splash size for ${out}`);
    }

    await sharp(src)
      .resize(metadata.width, metadata.height, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(out);
  }

  fs.writeFileSync(
    'public/logo.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><image href="/net360-logo.png" width="512" height="512"/></svg>',
    'utf8',
  );

  console.log('Brand assets generated successfully (web + Android launcher + Android splash).');
}

build().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
