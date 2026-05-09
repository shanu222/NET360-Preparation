/**
 * Upload built-in marketing/NUST assets from `public/` to S3 (keys must match `getMediaUrl()` paths).
 *
 * Uploaded:
 *   schools/*.png — NUST Schools & Campuses cards (see NUSTSchoolsCampuses.tsx slugs)
 *   images/login-banner.png, images/app-promo.png — Profile login / featured ad
 *   videos/net360-guide.mp4 — Profile user guide video
 *
 * Not uploaded: brand logo (`/net360-logo.png` same-origin). MCQ/community/avatar media uses DB keys → upload via app API.
 *
 * Env: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME
 * Frontend: VITE_S3_BASE_URL=https://BUCKET.s3.REGION.amazonaws.com (or CloudFront).
 *
 * CORS on bucket: GET/HEAD, expose Content-Length / Accept-Ranges for video.
 */

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });

const region = String(process.env.AWS_REGION || 'ap-south-1').trim();
const bucket = String(process.env.AWS_BUCKET_NAME || '').trim();
if (!bucket) {
  console.error('Set AWS_BUCKET_NAME (and AWS credentials) before uploading.');
  process.exit(1);
}

const client = new S3Client({ region });

const CACHE = 'public, max-age=31536000, immutable';

function contentType(key) {
  const lower = key.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp4')) return 'video/mp4';
  return 'application/octet-stream';
}

async function uploadFile(absPath, key) {
  const body = fs.readFileSync(absPath);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key.replace(/^\/+/, ''),
      Body: body,
      ContentType: contentType(key),
      CacheControl: CACHE,
    }),
  );
  console.log('OK', key, `(${(body.length / 1024).toFixed(1)} KiB)`);
}

async function main() {
  const schoolsDir = path.join(root, 'public', 'schools');
  if (fs.existsSync(schoolsDir)) {
    for (const name of fs.readdirSync(schoolsDir)) {
      if (!name.toLowerCase().endsWith('.png')) continue;
      const abs = path.join(schoolsDir, name);
      if (!fs.statSync(abs).isFile()) continue;
      await uploadFile(abs, `schools/${name}`);
    }
  } else {
    console.warn('Missing folder:', schoolsDir);
  }

  const imagesDir = path.join(root, 'public', 'images');
  if (fs.existsSync(imagesDir)) {
    for (const name of fs.readdirSync(imagesDir)) {
      if (!/\.(png|jpg|jpeg|webp)$/i.test(name)) continue;
      const abs = path.join(imagesDir, name);
      if (!fs.statSync(abs).isFile()) continue;
      await uploadFile(abs, `images/${name}`);
    }
  } else {
    console.warn('Missing folder:', imagesDir);
  }

  const video = path.join(root, 'public', 'assets', 'videos', 'net360-guide.mp4');
  if (fs.existsSync(video)) {
    await uploadFile(video, 'videos/net360-guide.mp4');
  } else {
    console.warn('Skip video: missing', video);
  }

  console.log('\nDone. Ensure objects are public-read (bucket policy) or served via CloudFront OAC.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
