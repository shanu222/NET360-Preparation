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

function guessMimeType(fileName: string, blobType: string) {
  const typed = String(blobType || '').trim();
  if (typed && typed !== 'application/octet-stream') return typed;
  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return typed || 'application/octet-stream';
}

async function assertReadableFile(blob: Blob, fileName: string) {
  if (!blob || blob.size < 5) {
    throw new Error('The file was empty and was not saved.');
  }
  if (!fileName.toLowerCase().endsWith('.pdf')) return;
  const head = new Uint8Array(await blob.slice(0, 5).arrayBuffer());
  const signature = String.fromCharCode(...head);
  if (signature !== '%PDF-') {
    throw new Error('The report was not a valid PDF and was not saved.');
  }
}

type NativePdfBridge = {
  openOrShare?: (absolutePath: string, share: boolean) => void;
};

function androidPdfBridge(): NativePdfBridge | null {
  if (Capacitor.getPlatform() !== 'android') return null;
  const bridge = (window as Window & { NET360NativeFiles?: NativePdfBridge }).NET360NativeFiles;
  if (!bridge || typeof bridge.openOrShare !== 'function') return null;
  return bridge;
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

async function shareNativeBlob(blob: Blob, fileName: string, mimeType: string): Promise<boolean> {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (!nav || typeof nav.share !== 'function' || typeof File === 'undefined') return false;
  try {
    const file = new File([blob], fileName, { type: mimeType });
    const payload = { files: [file], title: fileName };
    if (typeof nav.canShare === 'function' && !nav.canShare(payload)) return false;
    await nav.share(payload);
    return true;
  } catch (error) {
    const name = String((error as { name?: string })?.name || '');
    if (name === 'AbortError') return true;
    return false;
  }
}

function openNativeFileUrl(webUrl: string) {
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

export async function openOrSaveBlobOnDevice(
  blob: Blob,
  fileName: string,
  mode: 'open' | 'download' = 'open',
) {
  const safeName = sanitizeFileName(fileName);
  await assertReadableFile(blob, safeName);
  if (!Capacitor.isNativePlatform()) {
    openWebBlob(blob, safeName, mode === 'download');
    return;
  }

  const mimeType = guessMimeType(safeName, blob.type);
  const path = `net360/${Date.now()}-${safeName}`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });

  const pdfBridge = androidPdfBridge();
  if (pdfBridge?.openOrShare) {
    pdfBridge.openOrShare(uri, mode === 'download');
    return;
  }

  const webUrl = Capacitor.convertFileSrc(uri);
  if (mode === 'download') {
    const shared = await shareNativeBlob(blob, safeName, mimeType);
    if (shared) return;
  }

  openNativeFileUrl(webUrl);
}
