import { apiRequest } from './api';

/**
 * Legacy admin upload endpoint (POST /api/upload).
 * Hosted S3 uploads are retired — returns 410. Prefer MCQ data URLs in MongoDB.
 */
export async function uploadMediaToS3(
  file: File,
  authToken: string | null | undefined,
): Promise<{ url: string; key: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return apiRequest<{ url: string; key: string }>(
    '/api/upload',
    { method: 'POST', body: formData },
    authToken,
  );
}
