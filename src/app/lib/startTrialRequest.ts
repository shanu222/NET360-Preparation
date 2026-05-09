import { apiRequest } from './api';

const PENDING_PREFIX = 'net360-trial-sync-pending:';

export function trialSyncPendingKey(userId: string) {
  return `${PENDING_PREFIX}${userId}`;
}

export function markTrialSyncPending(userId: string) {
  try {
    localStorage.setItem(trialSyncPendingKey(userId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function clearTrialSyncPending(userId: string) {
  try {
    localStorage.removeItem(trialSyncPendingKey(userId));
  } catch {
    /* ignore */
  }
}

export function isTrialSyncPending(userId: string) {
  try {
    return Boolean(localStorage.getItem(trialSyncPendingKey(userId)));
  } catch {
    return false;
  }
}

function isTransientStartTrialFailure(err: unknown) {
  const e = err as Error & { status?: number };
  const status = e.status;
  const msg = String(e.message || '').toLowerCase();
  if (
    status === 404
    || status === 502
    || status === 503
    || status === 504
  ) {
    return true;
  }
  if (
    msg.includes('network')
    || msg.includes('failed to fetch')
    || msg.includes('timed out')
    || msg.includes('timeout')
  ) {
    return true;
  }
  return false;
}

export function shouldMarkTrialPendingAfterError(err: unknown) {
  return isTransientStartTrialFailure(err);
}

const START_TRIAL_PATHS = ['/api/subscriptions/start-trial', '/api/trial/start'] as const;

/**
 * Starts the 7-day premium-surface trial. Tries a shorter alias path if the primary returns 404
 * (some deployments proxy API paths inconsistently).
 */
export async function postStartTrialWithFallback(sessionMarker: string) {
  let lastErr: unknown;
  for (const path of START_TRIAL_PATHS) {
    try {
      await apiRequest(
        path,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        sessionMarker,
      );
      return;
    } catch (e) {
      lastErr = e;
      const status = (e as Error & { status?: number }).status;
      if (status === 404) continue;
      throw e;
    }
  }
  throw lastErr;
}
