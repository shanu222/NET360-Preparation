export function dataUrlToBlob(dataUrlRaw: string): Blob | null {
  const dataUrl = String(dataUrlRaw || '').trim();
  if (!dataUrl.startsWith('data:')) return null;

  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex <= 0) return null;

  const meta = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const mimeType = (meta.split(';')[0] || 'application/octet-stream').trim().toLowerCase();

  try {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
  } catch {
    return null;
  }
}

export function openBlobPreview(blob: Blob, existingWindow?: Window | null) {
  const objectUrl = URL.createObjectURL(blob);
  if (existingWindow) {
    existingWindow.location.href = objectUrl;
  } else {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }

  // Delay revocation so the opened tab has enough time to load the resource.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
}

export function openDataUrlPreview(dataUrlRaw: string): boolean {
  const blob = dataUrlToBlob(dataUrlRaw);
  if (!blob) return false;
  openBlobPreview(blob);
  return true;
}

export function downloadBlobFile(blob: Blob, fileNameRaw: string) {
  const fileName = String(fileNameRaw || 'file').trim() || 'file';
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}

export function downloadDataUrlFile(dataUrlRaw: string, fileNameRaw: string): boolean {
  const blob = dataUrlToBlob(dataUrlRaw);
  if (!blob) return false;
  downloadBlobFile(blob, fileNameRaw);
  return true;
}
