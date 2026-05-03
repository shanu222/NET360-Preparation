import { apiRequest } from './api';

/**
 * Upload a file to S3 via POST /api/upload (admin-only). Returns the public URL and object key.
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
