import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function env(name, fallback = '') {
  return String(process.env[name] || fallback).trim();
}

export function r2Config() {
  const accountId = env('R2_ACCOUNT_ID');
  const bucket = env('R2_BUCKET_NAME', 'net-360-videos');
  const endpoint = env('R2_ENDPOINT')
    || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');
  return {
    accountId,
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    bucket,
    endpoint,
    configured: Boolean(accountId && env('R2_ACCESS_KEY_ID') && env('R2_SECRET_ACCESS_KEY') && bucket && endpoint),
  };
}

let cachedClient = null;

export function getR2Client() {
  const cfg = r2Config();
  if (!cfg.configured) return null;
  if (cachedClient) return cachedClient;
  cachedClient = new S3Client({
    region: 'auto',
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  return cachedClient;
}

export function assertR2Ready() {
  const cfg = r2Config();
  if (!cfg.configured || !getR2Client()) {
    const error = new Error('Cloudflare R2 is not configured on the server.');
    error.code = 'R2_NOT_CONFIGURED';
    throw error;
  }
  return cfg;
}

const DEFAULT_CORS_ORIGINS = [
  'https://net360preparation.com',
  'https://www.net360preparation.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function corsOrigins() {
  const extra = String(process.env.CORS_ALLOWED_ORIGINS || process.env.NET360_CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_CORS_ORIGINS, ...extra]));
}

export async function ensureR2Cors() {
  try {
    const cfg = r2Config();
    const client = getR2Client();
    if (!cfg.configured || !client) return;
    await client.send(new PutBucketCorsCommand({
      Bucket: cfg.bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: corsOrigins(),
            AllowedMethods: ['GET', 'PUT', 'HEAD', 'POST'],
            AllowedHeaders: [
              'Content-Type',
              'Content-Length',
              'Content-MD5',
              'x-amz-content-sha256',
              'x-amz-date',
              'x-amz-meta-subject',
              'x-amz-meta-part',
              'x-amz-meta-chapter',
              'x-amz-meta-topic',
              'x-amz-meta-section',
              'x-amz-meta-sectionid',
              'x-amz-meta-videoid',
              'x-amz-meta-title',
              'x-amz-meta-contenttype',
              'authorization',
            ],
            ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type', 'x-amz-request-id'],
            MaxAgeSeconds: 86400,
          },
        ],
      },
    }));
  } catch (error) {
    console.warn('[r2] CORS update skipped:', error?.message || error);
  }
}

export function objectMetadataFromVideo(fields) {
  const meta = {};
  const assign = (key, value) => {
    const text = String(value || '').trim();
    if (!text) return;
    meta[key] = text.slice(0, 255);
  };
  assign('subject', fields.subjectId || fields.subject);
  assign('part', fields.partId || fields.part);
  assign('chapter', fields.chapterId || fields.chapter);
  assign('topic', fields.topicId || fields.topic);
  assign('section', fields.section);
  assign('sectionid', fields.sectionId);
  assign('videoid', fields.videoId);
  assign('contenttype', fields.mimeType || fields.contentType);
  assign('title', fields.title);
  return meta;
}

export async function presignPut({ key, contentType, metadata, expiresIn = 60 * 60 }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  // Do not sign object metadata into the browser PUT. Extra x-amz-meta-* headers
  // trigger a CORS preflight that R2 rejects unless the bucket CORS policy is exact.
  void metadata;
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return {
    url,
    bucket: cfg.bucket,
    key,
    expiresIn,
    headers: { 'Content-Type': contentType || 'application/octet-stream' },
  };
}

export const MULTIPART_PART_SIZE = 16 * 1024 * 1024;
export const MULTIPART_THRESHOLD = 32 * 1024 * 1024;

export async function startMultipartUpload({ key, contentType, metadata }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  const result = await client.send(new CreateMultipartUploadCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType || 'video/mp4',
    Metadata: metadata && Object.keys(metadata).length ? metadata : undefined,
  }));
  return { uploadId: result.UploadId, key, bucket: cfg.bucket };
}

export async function presignMultipartPart({ key, uploadId, partNumber, expiresIn = 60 * 60 }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  const command = new UploadPartCommand({
    Bucket: cfg.bucket,
    Key: key,
    UploadId: uploadId,
    PartNumber: partNumber,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { url, partNumber, expiresIn };
}

export async function completeMultipartUpload({ key, uploadId, parts }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  await client.send(new CompleteMultipartUploadCommand({
    Bucket: cfg.bucket,
    Key: key,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: (parts || [])
        .map((part) => ({
          ETag: String(part.eTag || part.ETag || '').replaceAll('"', ''),
          PartNumber: Number(part.partNumber || part.PartNumber),
        }))
        .filter((part) => part.ETag && part.PartNumber > 0)
        .map((part) => ({ ETag: `"${part.ETag}"`, PartNumber: part.PartNumber }))
        .sort((a, b) => a.PartNumber - b.PartNumber),
    },
  }));
}

export async function abortMultipartUpload({ key, uploadId }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  await client.send(new AbortMultipartUploadCommand({
    Bucket: cfg.bucket,
    Key: key,
    UploadId: uploadId,
  }));
}

export async function presignGet({ key, expiresIn = 120, filename, contentType }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  const command = new GetObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ResponseContentType: contentType || undefined,
    ResponseContentDisposition: filename ? `inline; filename="${filename}"` : undefined,
  });
  const url = await getSignedUrl(client, command, { expiresIn });
  return { url, bucket: cfg.bucket, key, expiresIn };
}

export async function headObject(key) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  try {
    const result = await client.send(new HeadObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    }));
    return {
      exists: true,
      contentType: result.ContentType || '',
      contentLength: Number(result.ContentLength || 0),
      metadata: result.Metadata || {},
      lastModified: result.LastModified || null,
    };
  } catch (error) {
    if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') {
      return { exists: false };
    }
    throw error;
  }
}

export async function deleteObject(key) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  await client.send(new DeleteObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
  }));
}

export async function replaceObjectMetadata(key, metadata, contentType) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  await client.send(new CopyObjectCommand({
    Bucket: cfg.bucket,
    CopySource: `${cfg.bucket}/${key}`,
    Key: key,
    Metadata: metadata || {},
    MetadataDirective: 'REPLACE',
    ContentType: contentType || undefined,
  }));
}

export async function copyObject(sourceKey, destKey, metadata) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  await client.send(new CopyObjectCommand({
    Bucket: cfg.bucket,
    CopySource: `${cfg.bucket}/${sourceKey}`,
    Key: destKey,
    Metadata: metadata,
    MetadataDirective: metadata ? 'REPLACE' : 'COPY',
  }));
}

export async function listObjects({ prefix = '', continuationToken = '', maxKeys = 50 }) {
  const cfg = assertR2Ready();
  const client = getR2Client();
  const result = await client.send(new ListObjectsV2Command({
    Bucket: cfg.bucket,
    Prefix: String(prefix || ''),
    ContinuationToken: continuationToken || undefined,
    MaxKeys: Math.min(200, Math.max(1, Number(maxKeys) || 50)),
    Delimiter: '',
  }));
  return {
    objects: (result.Contents || []).map((item) => ({
      key: item.Key,
      size: Number(item.Size || 0),
      lastModified: item.LastModified || null,
    })),
    prefixes: (result.CommonPrefixes || []).map((item) => item.Prefix).filter(Boolean),
    nextToken: result.IsTruncated ? (result.NextContinuationToken || '') : '',
    truncated: Boolean(result.IsTruncated),
  };
}
