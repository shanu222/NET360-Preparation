import express from 'express';

/**
 * POST /  (mounted at /api/upload)
 * AWS S3 uploads retired — static assets are bundled in the frontend;
 * MCQ/admin media should use data URLs stored in MongoDB.
 * Route kept for API contract stability (same path; returns 410).
 */
export function createUploadRouter({ authMiddleware, requireAdmin }) {
  const router = express.Router();

  router.post('/', authMiddleware, requireAdmin, (_req, res) => {
    res.status(410).json({
      error:
        'Hosted file upload is retired. Bundle static assets in the frontend, or store MCQ media as data URLs in MongoDB.',
      code: 'UPLOAD_RETIRED',
    });
  });

  return router;
}
