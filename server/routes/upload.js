import express from 'express';
import { uploadSingleFile, validateUploadedFileSize } from '../upload.js';
import { isS3Configured, uploadBufferToS3 } from '../s3.js';

/**
 * POST /  (mounted at /api/upload)
 * multipart field: file
 */
export function createUploadRouter({ authMiddleware, requireAdmin }) {
  const router = express.Router();

  router.post(
    '/',
    authMiddleware,
    requireAdmin,
    uploadSingleFile,
    validateUploadedFileSize,
    async (req, res) => {
      try {
        if (!isS3Configured()) {
          res.status(503).json({
            error: 'File upload is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME.',
          });
          return;
        }

        const result = await uploadBufferToS3({
          buffer: req.file.buffer,
          mimetype: req.file.mimetype,
          originalname: req.file.originalname,
        });

        res.json({
          url: result.url,
          key: result.key,
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
