import path from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getS3Client, getS3Config, buildVirtualHostedS3Url } from './config/s3.js';

export { getS3Config, isS3Configured, getS3Client, buildVirtualHostedS3Url } from './config/s3.js';

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
 * Buffer upload (e.g. legacy callers). Prefer streaming via middleware/upload + multer-s3 for large files.
 *
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
