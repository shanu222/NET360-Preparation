import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { apiRequest } from '../lib/api';
import {
  clearTrialSyncPending,
  isTrialSyncPending,
  postStartTrialWithFallback,
} from '../lib/startTrialRequest';
import { useAuth } from './AuthContext';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../lib/authSession';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

export type PremiumBadgeVariant = 'green' | 'orange' | 'red' | 'neutral';

export interface SubscriptionBadge {
  variant: PremiumBadgeVariant;
  label: string;
  endsAt: string | null;
  source: 'trial' | 'paid' | 'none' | 'bypass' | 'manual' | 'global';
}

export interface PremiumSurfaceState {
  allowed: boolean;
  source: 'trial' | 'paid' | 'none' | 'bypass' | 'manual' | 'global';
  endsAt: string | null;
  msRemaining: number;
  serverNow: string;
  badge?: SubscriptionBadge;
  hasSurfaceAccess?: boolean;
}

export interface AccessState {
  allowed: boolean;
  source: 'legacy' | 'manual' | 'global' | 'none';
  status: string;
  startsAt: string | null;
  expiresAt: string | null;
  durationDays: number;
  isGlobal?: boolean;
  isManual?: boolean;
  isLegacy?: boolean;
  legacyAllowed?: boolean;
  durationValue?: number;
  durationUnit?: string;
}

export interface PaidServicesState {
  tests: AccessState;
  preparation: AccessState;
  community: AccessState;
}

export interface SubscriptionMePayload {
  serverTime?: string;
  payfastCheckoutDisabled?: boolean;
  premiumSurfaceBypass?: boolean;
  manualSubscriptionWhatsapp?: string;
  subscription: {
    status: string;
    planId: string;
    isActive: boolean;
    trialActive?: boolean;
    planName?: string;
    dailyAiLimit?: number;
    expiresAt?: string | null;
    trialEndsAt?: string | null;
    hasUsedTrial?: boolean;
  };
  mentorAccess?: AccessState;
  preparationAccess?: AccessState;
  paidServices?: PaidServicesState;
  premiumSurface?: PremiumSurfaceState;
  subscriptionBadge?: SubscriptionBadge;
}

const emptySurface: PremiumSurfaceState = {
  allowed: false,
  source: 'none',
  endsAt: null,
  msRemaining: 0,
  serverNow: new Date().toISOString(),
  hasSurfaceAccess: false,
};

const SubscriptionContext = createContext<{
  loading: boolean;
  refresh: () => Promise<void>;
  me: SubscriptionMePayload | null;
  surface: PremiumSurfaceState;
  badge: SubscriptionBadge | null;
  serverOffsetMs: number;
} | null>(null);

function resolveBearer(token: string | null): string | undefined {
  if (!token || isCookieSessionApiMarker(token)) return undefined;
  return token;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { token: authToken, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [me, setMe] = useState<SubscriptionMePayload | null>(null);
  const serverOffsetRef = useRef(0);
  const [tick, setTick] = useState(0);
  const trialAutoSyncAttemptedRef = useRef(false);
  const trialAutoSyncUserIdRef = useRef<string | null>(null);

  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setMe(null);
      return;
    }

    let p = refreshInFlightRef.current;
    if (!p) {
      const bearer = resolveBearer(authToken);
      p = (async () => {
        setLoading(true);
        try {
          const stored = shouldPersistAuthTokens() ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
          const t = bearer ?? (stored && !isCookieSessionApiMarker(stored) ? stored : undefined);
          const payload = await apiRequest<SubscriptionMePayload>('/api/subscriptions/me', {}, t || COOKIE_SESSION_API_MARKER);
          if (payload?.serverTime) {
            serverOffsetRef.current = new Date(payload.serverTime).getTime() - Date.now();
          }
          setMe(payload);
        } catch {
          setMe(null);
        } finally {
          setLoading(false);
        }
      })();
      refreshInFlightRef.current = p;
      void p.finally(() => {
        if (refreshInFlightRef.current === p) {
          refreshInFlightRef.current = null;
        }
      });
    }

    return p;
  }, [authToken, user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const uid = user?.id?.trim();
    if (!uid || !me) {
      trialAutoSyncAttemptedRef.current = false;
      trialAutoSyncUserIdRef.current = null;
      return;
    }
    if (trialAutoSyncUserIdRef.current !== uid) {
      trialAutoSyncUserIdRef.current = uid;
      trialAutoSyncAttemptedRef.current = false;
    }
    if (me.premiumSurface?.hasSurfaceAccess) {
      clearTrialSyncPending(uid);
      trialAutoSyncAttemptedRef.current = false;
      return;
    }
    if (!isTrialSyncPending(uid)) {
      trialAutoSyncAttemptedRef.current = false;
      return;
    }
    if (trialAutoSyncAttemptedRef.current) return;
    trialAutoSyncAttemptedRef.current = true;

    const bearer = resolveBearer(authToken);
    const stored = shouldPersistAuthTokens() ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
    const t = bearer ?? (stored && !isCookieSessionApiMarker(stored) ? stored : undefined);
    const sessionMarker = t || COOKIE_SESSION_API_MARKER;

    void postStartTrialWithFallback(sessionMarker)
      .then(async () => {
        clearTrialSyncPending(uid);
        trialAutoSyncAttemptedRef.current = false;
        await refresh();
      })
      .catch(() => {
        trialAutoSyncAttemptedRef.current = false;
      });
  }, [authToken, me, refresh, user?.id]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((n) => n + 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [refresh]);

  const surface = useMemo(() => {
    const base = me?.premiumSurface || emptySurface;
    const off = serverOffsetRef.current;
    const now = Date.now() + off;
    if (!me?.premiumSurface || !base.endsAt) {
      return { ...base, msRemaining: 0 };
    }
    const end = new Date(base.endsAt).getTime();
    const msRemaining = Math.max(0, end - now);
    return { ...base, msRemaining };
  }, [me, tick]);

  const badge = me?.subscriptionBadge ?? me?.premiumSurface?.badge ?? null;

  const value = useMemo(
    () => ({
      loading,
      refresh,
      me,
      surface,
      badge,
      serverOffsetMs: serverOffsetRef.current,
    }),
    [loading, refresh, me, surface, badge],
  );

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
}

export function formatCountdown(ms: number): { days: number; hours: number; minutes: number; seconds: number } {
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  return { days, hours, minutes, seconds };
}
