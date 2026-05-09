import { Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import { useSubscription } from '../../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../../lib/authSession';
import {
  clearTrialSyncPending,
  markTrialSyncPending,
  postStartTrialWithFallback,
  shouldMarkTrialPendingAfterError,
} from '../../lib/startTrialRequest';
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
  const { token: authToken, user } = useAuth();
  const needsTrial = !me?.subscription?.hasUsedTrial;

  async function startTrial() {
    const bearer =
      authToken && !isCookieSessionApiMarker(authToken)
        ? authToken
        : bearerForApi();
    const sessionMarker = bearer || COOKIE_SESSION_API_MARKER;
    const uid = user?.id?.trim();
    try {
      await postStartTrialWithFallback(sessionMarker);
      if (uid) clearTrialSyncPending(uid);
      showSuccessToast('Free trial activated successfully');
      await refresh();
    } catch (e) {
      if (uid && shouldMarkTrialPendingAfterError(e)) {
        markTrialSyncPending(uid);
        showErrorToast(
          'Could not reach the subscription service. Your unlock will retry automatically when the connection is back.',
        );
        void refresh();
        return;
      }
      showErrorToast(audienceFriendlyError(e, 'Unable to start trial. Try again or open Subscription from the menu.'));
    }
  }

  return (
    <div
      className="relative min-h-[320px] overflow-hidden rounded-2xl border border-indigo-200/90 bg-white/95 p-6 text-center shadow-sm dark:border-indigo-400/25 dark:!bg-slate-900/95 dark:!text-slate-100"
      data-premium-lock-screen
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-50/90 to-indigo-50/80 dark:from-slate-950/60 dark:to-indigo-950/50" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/15 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-100">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:!text-slate-50">{title}</h2>
          {description ? (
            <p className="mt-2 text-sm font-medium text-slate-700 dark:!text-slate-300">{description}</p>
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
            className={cn(
              'rounded-xl',
              needsTrial &&
                'border-indigo-500/45 bg-white text-indigo-950 shadow-sm hover:bg-indigo-50 dark:border-indigo-300/50 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-700/95',
            )}
            onClick={() => navigate('/subscription')}
          >
            View plans &amp; pay
          </Button>
        </div>
        {!surface.allowed && me?.subscription?.hasUsedTrial ? (
          <p className="text-xs text-slate-600 dark:!text-slate-400">Your trial has ended. Upgrade to keep premium access.</p>
        ) : null}
      </div>
    </div>
  );
}
