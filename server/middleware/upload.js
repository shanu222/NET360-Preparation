import path from 'node:path';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import multerS3 from 'multer-s3';
import { getS3Client, getS3Config, isS3Configured } from '../config/s3.js';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const PDF_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
]);

export function maxBytesForMime(mime = '') {
  const m = String(mime || '').toLowerCase();
  if (m.startsWith('video/')) return VIDEO_MAX_BYTES;
  if (m === 'application/pdf') return PDF_MAX_BYTES;
  return IMAGE_MAX_BYTES;
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

let cachedUploadSingle = null;

/**
 * Lazy singleton: multer + multer-s3 streaming to S3 (no full-file memory buffer).
 * Returns null when S3 env is not configured (caller should return 503 before invoking).
 */
export function getS3UploadSingleMiddleware() {
  if (!isS3Configured()) return null;
  if (cachedUploadSingle) return cachedUploadSingle;

  const s3 = getS3Client();
  const { bucket } = getS3Config();
  const aclRaw = String(process.env.S3_OBJECT_ACL || 'public-read').trim().toLowerCase();
  const useAcl = aclRaw && aclRaw !== 'none';

  const storageOptions = {
    s3,
    bucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (req, file, cb) => {
      const mime = String(file.mimetype || '').toLowerCase();
      const original = String(file.originalname || 'file');
      const ext = path.extname(original) || extensionFromMime(mime) || '.bin';
      const base = path.basename(original, ext).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80) || 'file';
      cb(null, `uploads/${Date.now()}-${randomUUID()}-${base}${ext}`);
    },
  };

  if (useAcl) {
    storageOptions.acl = 'public-read';
  }

  cachedUploadSingle = multer({
    storage: multerS3(storageOptions),
    limits: { fileSize: VIDEO_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const mime = String(file.mimetype || '').toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        cb(
          new Error(
            'Unsupported file type. Allowed: images (jpeg, png, gif, webp, svg), video (mp4, webm, mov), PDF.',
          ),
        );
        return;
      }
      cb(null, true);
    },
  }).single('file');

  return cachedUploadSingle;
}

export function validateUploadedFileSize(req, res, next) {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Use multipart field name "file".' });
    return;
  }
  const mime = String(req.file.mimetype || '').toLowerCase();
  const max = maxBytesForMime(mime);
  const size = Number(req.file.size ?? 0);
  if (size > max) {
    const mb = Math.round(max / (1024 * 1024));
    res.status(413).json({ error: `File too large for this type (max ${mb}MB).` });
    return;
  }
  next();
}
