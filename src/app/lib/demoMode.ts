import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSubscription, type DemoModeState } from '../context/SubscriptionContext';
import { apiRequest } from './api';
import { COOKIE_SESSION_API_MARKER, isCookieSessionApiMarker, shouldPersistAuthTokens } from './authSession';
import { isNativeRuntime } from './nativeDiagnostics';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

function resolveSessionMarker(authToken: string | null) {
  if (authToken && !isCookieSessionApiMarker(authToken)) return authToken;
  if (shouldPersistAuthTokens()) {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && !isCookieSessionApiMarker(stored)) return stored;
  }
  return COOKIE_SESSION_API_MARKER;
}

export function formatDemoTimeLeft(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function isDemoLimitError(error: unknown) {
  return (error as { code?: string } | null)?.code === 'DEMO_LIMIT_REACHED';
}

export type DemoService = 'tests' | 'preparation' | 'community' | 'videos';

/** Web-only Demo Mode state; always inactive inside the native app. */
export function useDemoMode() {
  const { token, user } = useAuth();
  const { me, refresh, serverOffsetMs } = useSubscription();
  const [starting, setStarting] = useState(false);
  const enabled = !isNativeRuntime() && Boolean(user) && user?.role !== 'admin';
  const state: DemoModeState | null = enabled ? me?.demoMode || null : null;
  const started = Boolean(state?.started);

  const communityEndsMs = state?.community.endsAt ? new Date(state.community.endsAt).getTime() : 0;
  const communityMsLeft = Math.max(0, communityEndsMs - (Date.now() + serverOffsetMs));

  const communityStarted = Boolean(communityEndsMs);

  /** Starts the demo for one service; other services' allowances are not touched. */
  const start = useCallback(async (service?: DemoService) => {
    setStarting(true);
    try {
      await apiRequest(
        '/api/demo/start',
        { method: 'POST', retryCount: 0, body: JSON.stringify({ service: service || '' }) },
        resolveSessionMarker(token),
      );
      await refresh();
    } finally {
      setStarting(false);
    }
  }, [refresh, token]);

  const ensureStarted = useCallback(async (service?: DemoService) => {
    if (!started || (service === 'community' && !communityStarted)) await start(service);
  }, [communityStarted, start, started]);

  return {
    enabled,
    loaded: Boolean(me),
    started,
    starting,
    start,
    ensureStarted,
    refresh,
    testAvailable: started && !state?.tests.used,
    testUsed: started && Boolean(state?.tests.used),
    preparationAvailable: started && !state?.preparation.used,
    preparationUsed: started && Boolean(state?.preparation.used),
    videoAvailable: started && !state?.videos?.used,
    videoUsed: started && Boolean(state?.videos?.used),
    demoVideoId: state?.videos?.videoId || null,
    communityStarted: started && communityStarted,
    communityActive: started && communityMsLeft > 0,
    communityExpired: started && communityStarted && communityMsLeft <= 0,
    communityMsLeft,
  };
}
