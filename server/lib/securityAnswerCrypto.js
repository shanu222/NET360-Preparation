import crypto from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Loads 32-byte key from SECURITY_ANSWER_ENCRYPTION_KEY:
 * - 64 hex characters, or
 * - Base64 that decodes to exactly 32 bytes (e.g. openssl rand -base64 32)
 */
function loadEncryptionKeyBuffer() {
  const raw = process.env.SECURITY_ANSWER_ENCRYPTION_KEY;
  if (!raw || !String(raw).trim()) return null;
  const s = String(raw).trim();
  if (/^[0-9a-fA-F]{64}$/.test(s)) {
    return Buffer.from(s, 'hex');
  }
  try {
    const buf = Buffer.from(s, 'base64');
    if (buf.length === KEY_LENGTH) return buf;
  } catch {
    return null;
  }
  return null;
}

/**
 * @param {string} plaintext Normalized security answer (same string that is bcrypt-hashed).
 * @returns {string} Base64 ciphertext (iv + tag + body) or '' if key missing / empty input.
 */
export function encryptSecurityAnswerPlaintext(plaintext) {
  const key = loadEncryptionKeyBuffer();
  if (!key) return '';
  const pt = String(plaintext ?? '');
  if (!pt) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const enc = Buffer.concat([cipher.update(pt, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

/**
 * @param {string} stored Base64 from encryptSecurityAnswerPlaintext
 * @returns {string|null} Plaintext or null if missing, wrong key, or corrupt data
 */
export function decryptSecurityAnswerCiphertext(stored) {
  const key = loadEncryptionKeyBuffer();
  if (!key || !stored || !String(stored).trim()) return null;
  try {
    const buf = Buffer.from(String(stored).trim(), 'base64');
    if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) return null;
    const iv = buf.subarray(0, IV_LENGTH);
    const tag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const data = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString('utf8');
  } catch {
    return null;
  }
}
