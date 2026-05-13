import { toast } from 'sonner';
import type { ExternalToast } from 'sonner';

export { toast } from 'sonner';

export const TOAST_DURATION = {
  success: 4000,
  error: 5500,
  warning: 4500,
  info: 4000,
  neutral: 3500,
} as const;

const TECHNICAL_PATTERN =
  /mongo|mongoose|redis|socket\.?io|ioredis|websocket|firebase\s*admin|firestore|stack\s*trace|ECONN|axios|syntaxerror|referenceerror|typeerror|undefined|null\.|\/api\/|statuscode|internal server|exception in thread| casting | ObjectId |duplicate key|localhost:\d+|VITE_|http:\/\/|https:\/\/.*:\d{4}/i;

function toastId(kind: string, message: string): string {
  let h = 0;
  const s = `${kind}:${message.slice(0, 200)}`;
  for (let i = 0; i < s.length; i += 1) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  return `${kind}-${h}`;
}

const defaultToastOptions: Partial<ExternalToast> = {
  className: 'net360-user-toast',
};

export function showSuccessToast(message: string, options?: ExternalToast): void {
  toast.success(message, {
    duration: TOAST_DURATION.success,
    id: toastId('s', message),
    ...defaultToastOptions,
    ...options,
  });
}

export function showErrorToast(message: string, options?: ExternalToast): void {
  toast.error(message, {
    duration: TOAST_DURATION.error,
    id: toastId('e', message),
    ...defaultToastOptions,
    ...options,
  });
}

export function showWarningToast(message: string, options?: ExternalToast): void {
  toast.warning(message, {
    duration: TOAST_DURATION.warning,
    id: toastId('w', message),
    ...defaultToastOptions,
    ...options,
  });
}

export function showInfoToast(message: string, options?: ExternalToast): void {
  toast.info(message, {
    duration: TOAST_DURATION.info,
    id: toastId('i', message),
    ...defaultToastOptions,
    ...options,
  });
}

/** Short neutral messages (tips, “coming soon”, etc.). */
export function showNeutralToast(message: string, options?: ExternalToast): void {
  toast.message(message, {
    duration: TOAST_DURATION.neutral,
    id: toastId('m', message),
    ...defaultToastOptions,
    ...options,
  });
}

const FIREBASE_AUTH_USER_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/user-disabled': 'This account is disabled. Please contact support.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect password. Please try again.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/email-already-in-use': 'Account already exists. Please log in.',
  'auth/weak-password': 'Choose a stronger password and try again.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Unable to connect. Please check your internet.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
  'auth/argument-error':
    'Google sign-in could not start in this browser. Refresh the page, allow pop-ups, or use email sign-in.',
  'auth/popup-blocked': 'Pop-up was blocked. Please allow pop-ups for this site.',
  'auth/cancelled-popup-request': 'Sign-in was cancelled.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email. Try logging in with email and password.',
  'auth/operation-not-allowed': 'This sign-in method is not available. Please contact support.',
  'auth/requires-recent-login': 'For your security, please sign in again and retry.',
  'auth/invalid-verification-code': 'That code is invalid or expired.',
  'auth/invalid-action-code': 'That reset link is invalid or expired.',
  'auth/expired-action-code': 'That reset link has expired. Request a new one.',
};

function mapFirebaseCode(code: string): string | null {
  const c = String(code || '').trim();
  if (!c) return null;
  return FIREBASE_AUTH_USER_MESSAGES[c] || null;
}

function httpStatusUserMessage(status: number): string | null {
  if (status === 400) return 'Invalid request. Check your input and try again.';
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) return 'We could not find what you requested.';
  if (status === 409) return 'Account already exists. Please log in.';
  if (status === 410) return 'That option is no longer available.';
  if (status === 413) return 'That file is too large. Try a smaller file.';
  if (status === 422) return 'Some information could not be processed. Check your input.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a few minutes.';
  return null;
}

function isLikelySafeServerMessage(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 180) return false;
  if (TECHNICAL_PATTERN.test(t)) return false;
  if (/request failed\s*\(\d+\)/i.test(t)) return false;
  if (/unexpected api response/i.test(t)) return false;
  if (/timed out after \d+/i.test(t)) return false;
  if (/returned html instead of json/i.test(t)) return false;
  if (/api configuration error/i.test(t)) return false;
  if (/ENSURE|undefined/i.test(t)) return false;
  return true;
}

/**
 * Turns any thrown value into copy suitable for end users (no raw Firebase/Mongo/API internals).
 */
export function audienceFriendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = error as Error & { status?: number; code?: string; message?: string };

  if (typeof error === 'string') {
    return isLikelySafeServerMessage(error) ? error.trim() : fallback;
  }

  const code = typeof err?.code === 'string' ? err.code : '';
  const firebaseMsg = mapFirebaseCode(code);
  if (firebaseMsg) return firebaseMsg;

  if (code === 'PREMIUM_CONTENT_LOCKED' || code === 'TRIAL_ALREADY_USED') {
    return 'This area needs an active trial or premium plan. Open Subscription to continue.';
  }
  if (code === 'PAYMENT_CHECKOUT_DISABLED') {
    return 'JazzCash and Easypaisa automatic payments are coming soon. Use WhatsApp on the Subscription page for manual activation.';
  }
  if (code === 'ACTIVE_SESSION_ELSEWHERE') {
    return 'Your account is already active on another device.';
  }
  if (code === 'SESSION_NO_LONGER_ACTIVE') {
    return 'You were signed out. Please log in again.';
  }
  if (code === 'SESSION_REVOKED') {
    return 'You were logged out because your account was signed in on another device.';
  }

  const status = Number(err?.status);
  if (Number.isFinite(status) && status > 0) {
    const msg = String(err?.message || '').trim();
    if (status === 401) {
      if (/password|credential|invalid|wrong|sign.?in|authentication|firebase/i.test(msg) && !/session|expired|token/i.test(msg)) {
        return 'Unable to sign you in. Please check your email and password.';
      }
      if (!msg || !isLikelySafeServerMessage(msg)) {
        return 'Session expired. Please log in again.';
      }
    } else {
      const fromStatus = httpStatusUserMessage(status);
      if (fromStatus && (!msg || !isLikelySafeServerMessage(msg))) return fromStatus;
    }
  }

  const message = String(err?.message || err || '').trim();
  if (!message) return fallback;

  const firebaseFromMessage = /^auth\/[\w-]+$/.test(message) ? mapFirebaseCode(message) : null;
  if (firebaseFromMessage) return firebaseFromMessage;

  const lower = message.toLowerCase();
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('load failed')
    || lower.includes('network error while calling')
  ) {
    return 'Unable to connect. Please check your internet connection and try again.';
  }
  if (lower.includes('request timed out') || err?.code === 'REQUEST_TIMEOUT') {
    return 'The request took too long. Please try again.';
  }
  if (lower.includes('aborterror') || lower.includes('aborted')) {
    return 'The request was cancelled.';
  }
  if (lower.includes('firebase auth is not configured')) {
    return 'Sign-in could not start yet. Check your connection and retry.';
  }
  if (lower.includes('firebase admin sdk is not configured')) {
    return 'Sign-in could not be completed right now. Please retry.';
  }
  if (lower.includes('invalid firebase token') || lower.includes('firebase token')) {
    return 'Session expired. Please log in again.';
  }
  if (lower.includes('active session exists') || err?.code === 'active_session_exists') {
    return 'This account is open on another device.';
  }
  if (lower.includes('incorrect email or password')) return 'Incorrect email or password.';
  if (lower.includes('duplicate')) return 'This already exists. Try refreshing the page.';
  if (lower.includes('google login did not return')) return 'Google did not share an email. Use another account or email sign-in.';

  if (isLikelySafeServerMessage(message)) return message;

  if (Number.isFinite(status) && status > 0) {
    const fromStatus = httpStatusUserMessage(status);
    if (fromStatus) return fromStatus;
  }

  return fallback;
}

export function handleApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): void {
  showErrorToast(audienceFriendlyError(error, fallback));
}
