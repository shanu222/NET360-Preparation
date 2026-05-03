import { S3Client } from '@aws-sdk/client-s3';

/**
 * Configure via:
 *   AWS_REGION (or AWS_DEFAULT_REGION)
 *   AWS_ACCESS_KEY_ID (or AWS_ACCESS_KEY)
 *   AWS_SECRET_ACCESS_KEY (or AWS_SECRET_KEY)
 *   AWS_BUCKET_NAME
 * Optional: AWS_PUBLIC_BASE_URL (e.g. CloudFront) for returned URLs.
 * Optional: S3_OBJECT_ACL=public-read | none
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
