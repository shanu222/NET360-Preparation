import multer from 'multer';

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

const storage = multer.memoryStorage();

export const uploadSingleFile = multer({
  storage,
  limits: { fileSize: VIDEO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      cb(new Error('Unsupported file type. Allowed: images (jpeg, png, gif, webp, svg), video (mp4, webm, mov), PDF.'));
      return;
    }
    cb(null, true);
  },
}).single('file');

export function validateUploadedFileSize(req, res, next) {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded. Use multipart field name "file".' });
    return;
  }
  const mime = String(req.file.mimetype || '').toLowerCase();
  const max = maxBytesForMime(mime);
  const size = Number(req.file.size || req.file.buffer?.length || 0);
  if (size > max) {
    const mb = Math.round(max / (1024 * 1024));
    res.status(413).json({ error: `File too large for this type (max ${mb}MB).` });
    return;
  }
  next();
}
