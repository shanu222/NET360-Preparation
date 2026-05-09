import { Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { useSubscription } from '../../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../../lib/authSession';
import { audienceFriendlyError, showErrorToast, showSuccessToast } from '../../lib/userToast';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

function bearerForApi(): string | undefined {
  if (shouldPersistAuthTokens()) {
    const s = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (s && !isCookieSessionApiMarker(s)) return s;
  }
  return undefined;
}

export function PremiumLockScreen({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const navigate = useNavigate();
  const { surface, me, refresh } = useSubscription();
  const { token: authToken } = useAuth();
  const needsTrial = !me?.subscription?.hasUsedTrial;

  async function startTrial() {
    const bearer =
      authToken && !isCookieSessionApiMarker(authToken)
        ? authToken
        : bearerForApi();
    const sessionMarker = bearer || COOKIE_SESSION_API_MARKER;
    try {
      await apiRequest(
        '/api/subscriptions/start-trial',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        },
        sessionMarker,
      );
      showSuccessToast('Free trial activated successfully');
      await refresh();
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.status === 404) {
        showErrorToast(
          'Subscription service was not found. Please refresh the page. If this continues, the app may need an update on the server.',
        );
        return;
      }
      showErrorToast(audienceFriendlyError(e, 'Unable to start trial. Try again or open Subscription from the menu.'));
    }
  }

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-indigo-200/90 bg-white/95 p-6 text-center shadow-sm dark:border-white/10 dark:bg-slate-900/85">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-50/90 to-indigo-50/80 dark:from-slate-950/30 dark:to-indigo-950/40" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/15 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-100">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">{description}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {needsTrial ? (
            <Button type="button" className="rounded-xl" onClick={() => void startTrial()}>
              Start 7-day free trial
            </Button>
          ) : null}
          <Button
            type="button"
            variant={needsTrial ? 'outline' : 'default'}
            className="rounded-xl"
            onClick={() => navigate('/subscription')}
          >
            View plans &amp; pay
          </Button>
        </div>
        {!surface.allowed && me?.subscription?.hasUsedTrial ? (
          <p className="text-xs text-slate-600 dark:text-slate-400">Your trial has ended. Upgrade to keep premium access.</p>
        ) : null}
      </div>
    </div>
  );
}
