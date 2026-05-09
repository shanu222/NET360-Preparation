/**
 * Upload bundled public media (NUST school cards + user guide video) to S3.
 * Keys match src/app paths: schools/*.png, videos/net360-guide.mp4
 *
 * Requires AWS credentials (env or ~/.aws/credentials), same as the API upload route:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME
 *
 * Optional faster delivery: put CloudFront in front of the bucket and set VITE_S3_BASE_URL to the distribution URL.
 *
 * Bucket CORS (for video Range / cross-origin from your web app), e.g. aws s3api put-bucket-cors --bucket YOUR_BUCKET --cors-configuration file://cors.json
 *   [{"AllowedHeaders":["*"],"AllowedMethods":["GET","HEAD"],"AllowedOrigins":["*"],"ExposeHeaders":["Content-Length","Content-Type","ETag"],"MaxAgeSeconds":3600}]
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
