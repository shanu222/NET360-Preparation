import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';

function sanitizeFileName(name: string) {
  return String(name || 'file')
    .replace(/[^\w.\-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 80) || 'file';
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function openWebBlob(blob: Blob, fileName: string, download: boolean) {
  const objectUrl = URL.createObjectURL(blob);
  if (download) {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export async function openOrSaveBlobOnDevice(
  blob: Blob,
  fileName: string,
  mode: 'open' | 'download' = 'open',
) {
  const safeName = sanitizeFileName(fileName);
  if (!Capacitor.isNativePlatform()) {
    openWebBlob(blob, safeName, mode === 'download');
    return;
  }

  const path = `net360/${Date.now()}-${safeName}`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  const webUrl = Capacitor.convertFileSrc(uri);
  const opened = window.open(webUrl, '_blank');
  if (opened) return;

  const link = document.createElement('a');
  link.href = webUrl;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
