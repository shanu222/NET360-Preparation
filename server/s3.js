import path from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

/**
 * Configure via:
 *   AWS_REGION (or AWS_DEFAULT_REGION)
 *   AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY)
 *   AWS_SECRET_ACCESS_KEY (or AWS_SECRET_KEY)
 *   AWS_BUCKET_NAME
 * Optional: AWS_PUBLIC_BASE_URL (e.g. CloudFront) for returned URLs; otherwise virtual-hosted S3 URL.
 * Optional: S3_OBJECT_ACL=public-read | none (default public-read; use "none" if bucket uses BucketOwnerEnforced)
 */

export function getS3Config() {
  const region = String(process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || '').trim();
  const accessKeyId = String(
    process.env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY || '',
  ).trim();
  const secretAccessKey = String(
    process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY || '',
  ).trim();
  const bucket = String(process.env.AWS_BUCKET_NAME || '').trim();
  return { region, accessKeyId, secretAccessKey, bucket };
}

export function isS3Configured() {
  const c = getS3Config();
  return Boolean(c.region && c.accessKeyId && c.secretAccessKey && c.bucket);
}

let cachedClient;

export function getS3Client() {
  if (!isS3Configured()) {
    throw new Error('S3 is not configured (check AWS_REGION, credentials, AWS_BUCKET_NAME).');
  }
  if (!cachedClient) {
    const { region, accessKeyId, secretAccessKey } = getS3Config();
    cachedClient = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }
  return cachedClient;
}

export function buildVirtualHostedS3Url(bucket, region, key) {
  const safeKey = String(key || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://${bucket}.s3.${region}.amazonaws.com/${safeKey}`;
}

function extensionFromMime(mime = '') {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/svg+xml') return '.svg';
  if (m === 'video/mp4') return '.mp4';
  if (m === 'video/webm') return '.webm';
  if (m === 'video/quicktime') return '.mov';
  if (m === 'application/pdf') return '.pdf';
  return '';
}

/**
 * @param {{ buffer: Buffer; mimetype?: string; originalname?: string }} file
 * @returns {Promise<{ url: string; key: string; bucket: string }>}
 */
export async function uploadBufferToS3(file) {
  const { bucket, region } = getS3Config();
  const buffer = file.buffer;
  if (!buffer || !buffer.length) {
    throw new Error('Empty file buffer.');
  }

  const mime = String(file.mimetype || 'application/octet-stream').toLowerCase();
  const original = String(file.originalname || 'file');
  const ext = path.extname(original) || extensionFromMime(mime) || '.bin';
  const base = path.basename(original, ext).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
  const key = `uploads/${Date.now()}-${base}${ext}`;

  const baseInput = {
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: mime,
  };

  const client = getS3Client();
  const aclRaw = String(process.env.S3_OBJECT_ACL || 'public-read').trim().toLowerCase();
  const useAcl = aclRaw && aclRaw !== 'none';

  const inputWithAcl = useAcl
    ? { ...baseInput, ACL: 'public-read' }
    : baseInput;

  try {
    await client.send(new PutObjectCommand(inputWithAcl));
  } catch (err) {
    const msg = String(err?.message || err || '').toLowerCase();
    const aclBlocked = useAcl && (msg.includes('acl') || msg.includes('access control'));
    if (aclBlocked) {
      await client.send(new PutObjectCommand(baseInput));
    } else {
      throw err;
    }
  }

  const publicBase = String(process.env.AWS_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  const url = publicBase ? `${publicBase}/${key}` : buildVirtualHostedS3Url(bucket, region, key);

  return { url, key, bucket };
}
