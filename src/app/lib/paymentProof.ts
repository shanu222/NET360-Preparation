export interface PaymentProofPayload {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']);
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'pdf']);

export const PAYMENT_PROOF_ACCEPT = '.jpg,.jpeg,.png,.pdf,image/jpeg,image/jpg,image/png,application/pdf';

function normalizeMimeType(value: string) {
  const mime = String(value || '').trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'application/x-pdf') return 'application/pdf';
  return mime;
}

function inferMimeTypeFromName(fileName: string) {
  const parts = String(fileName || '').toLowerCase().split('.');
  const ext = parts.length > 1 ? parts.pop() || '' : '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return '';
}

function hasAllowedExtension(fileName: string) {
  const parts = String(fileName || '').toLowerCase().split('.');
  const ext = parts.length > 1 ? parts.pop() || '' : '';
  return ALLOWED_EXTENSIONS.has(ext);
}

function readFileAsDataUrl(file: File, onProgress?: (progress: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      resolve(String(reader.result || ''));
    };
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      onProgress?.(percent);
    };
    reader.readAsDataURL(file);
  });
}

export async function buildPaymentProofPayload(file: File, onProgress?: (progress: number) => void): Promise<PaymentProofPayload> {
  const name = String(file?.name || '').trim();
  if (!name) {
    throw new Error('File name is missing. Please choose a valid JPG, PNG, or PDF file.');
  }

  if (!hasAllowedExtension(name)) {
    throw new Error('Payment proof must be JPG, JPEG, PNG, or PDF.');
  }

  const normalizedMime = normalizeMimeType(file.type || '');
  const inferredMime = inferMimeTypeFromName(name);
  const effectiveMime = ALLOWED_MIME_TYPES.has(normalizedMime) ? normalizeMimeType(normalizedMime) : inferredMime;

  if (!effectiveMime || !ALLOWED_MIME_TYPES.has(effectiveMime)) {
    throw new Error('Payment proof must be JPG, JPEG, PNG, or PDF.');
  }

  if (!file.size || file.size > MAX_PAYMENT_PROOF_BYTES) {
    throw new Error('Payment proof must be up to 5MB.');
  }

  onProgress?.(0);
  const dataUrl = await readFileAsDataUrl(file, onProgress);

  return {
    name,
    mimeType: effectiveMime,
    size: file.size,
    dataUrl,
  };
}
