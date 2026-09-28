export function uploadWithProgress(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) {
  return new Promise<{ etag: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    Object.entries(headers || {}).forEach(([key, value]) => {
      if (key && value) xhr.setRequestHeader(key, value);
    });
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onProgress(Math.max(0, Math.min(99, Math.round((event.loaded / event.total) * 100))));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ etag: xhr.getResponseHeader('ETag') || '' });
        return;
      }
      reject(new Error(`Direct upload to storage failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Direct upload to storage failed. Check Cloudflare R2 CORS.'));
    xhr.onabort = () => reject(new Error('Upload cancelled.'));
    const abort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
    }
    xhr.send(file);
  });
}

export async function uploadMultipartWithProgress(
  file: File,
  options: {
    partSize: number;
    partCount: number;
    getPartUrl: (partNumber: number) => Promise<string>;
  },
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
) {
  const completed: Array<{ partNumber: number; eTag: string }> = [];
  let uploadedBytes = 0;
  const total = file.size || 1;
  for (let partNumber = 1; partNumber <= options.partCount; partNumber += 1) {
    if (signal?.aborted) throw new Error('Upload cancelled.');
    const start = (partNumber - 1) * options.partSize;
    const chunk = file.slice(start, start + options.partSize);
    const url = await options.getPartUrl(partNumber);
    const result = await uploadWithProgress(
      url,
      chunk,
      {},
      (localPercent) => {
        const chunkDone = Math.round((chunk.size * localPercent) / 100);
        onProgress(Math.max(0, Math.min(99, Math.round(((uploadedBytes + chunkDone) / total) * 100))));
      },
      signal,
    );
    uploadedBytes += chunk.size;
    completed.push({ partNumber, eTag: result.etag });
  }
  onProgress(100);
  return completed;
}
