import express from 'express';
import { getS3UploadSingleMiddleware, validateUploadedFileSize } from '../middleware/upload.js';
import { isS3Configured, buildVirtualHostedS3Url, getS3Config } from '../config/s3.js';

/**
 * POST /  (mounted at /api/upload)
 * multipart field: file
 * Streams to S3 via multer-s3 (admin-only).
 */
export function createUploadRouter({ authMiddleware, requireAdmin }) {
  const router = express.Router();

  router.post(
    '/',
    authMiddleware,
    requireAdmin,
    (req, res, next) => {
      if (!isS3Configured()) {
        res.status(503).json({
          error:
            'File upload is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME.',
        });
        return;
      }
      const uploadMw = getS3UploadSingleMiddleware();
      if (!uploadMw) {
        res.status(503).json({
          error:
            'File upload is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME.',
        });
        return;
      }
      uploadMw(req, res, (err) => {
        if (err) {
          const msg = err instanceof Error ? err.message : String(err);
          res.status(400).json({ error: msg });
          return;
        }
        next();
      });
    },
    validateUploadedFileSize,
    async (req, res) => {
      try {
        const { bucket, region } = getS3Config();
        const key = req.file.key;
        const publicBase = String(process.env.AWS_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
        const url = publicBase
          ? `${publicBase}/${key}`
          : req.file.location || buildVirtualHostedS3Url(bucket, region, key);

        res.json({
          url,
          key,
        });
      } catch (error) {
        console.error('[api/upload]', error?.message || error);
        res.status(500).json({
          error: 'Upload failed.',
          detail: process.env.NODE_ENV !== 'production' ? String(error?.message || error) : undefined,
        });
      }
    },
  );

  return router;
}
