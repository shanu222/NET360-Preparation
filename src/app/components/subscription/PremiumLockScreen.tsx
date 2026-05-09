import { Lock } from 'lucide-react';
import { Button } from '../ui/button';
import { useSubscription } from '../../context/SubscriptionContext';
import { useNavigate } from 'react-router-dom';

export function PremiumLockScreen({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const navigate = useNavigate();
  const { surface, me, refresh } = useSubscription();
  const needsTrial = !me?.subscription?.hasUsedTrial;

  return (
    <div className="relative min-h-[320px] overflow-hidden rounded-2xl border border-indigo-100/80 bg-gradient-to-br from-slate-50 to-indigo-50/80 p-6 text-center dark:border-white/10 dark:from-slate-900 dark:to-indigo-950/50">
      <div className="pointer-events-none absolute inset-0 backdrop-blur-[2px]" />
      <div className="relative mx-auto flex max-w-lg flex-col items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-200">
          <Lock className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h2>
          {description ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {needsTrial ? (
            <Button
              type="button"
              className="rounded-xl"
              onClick={async () => {
                try {
                  const { apiRequest } = await import('../../lib/api');
                  const { showSuccessToast, showErrorToast, audienceFriendlyError } = await import('../../lib/userToast');
                  const { shouldPersistAuthTokens } = await import('../../lib/authSession');
                  const TOKEN_STORAGE_KEY = 'net360-auth-token';
                  const { COOKIE_SESSION_API_MARKER, isCookieSessionApiMarker } = await import('../../lib/authSession');
                  let t: string | undefined;
                  if (shouldPersistAuthTokens()) {
                    const s = localStorage.getItem(TOKEN_STORAGE_KEY);
                    if (s && !isCookieSessionApiMarker(s)) t = s;
                  }
                  await apiRequest('/api/subscriptions/start-trial', { method: 'POST', body: JSON.stringify({}) }, t || COOKIE_SESSION_API_MARKER);
                  showSuccessToast('Free trial activated successfully');
                  await refresh();
                } catch (e) {
                  const { showErrorToast, audienceFriendlyError } = await import('../../lib/userToast');
                  showErrorToast(audienceFriendlyError(e, 'Unable to start trial. Try subscribing again.'));
                }
              }}
            >
              Start 7-day free trial
            </Button>
          ) : null}
          <Button type="button" variant={needsTrial ? 'outline' : 'default'} className="rounded-xl" onClick={() => navigate('/subscription')}>
            View plans &amp; pay
          </Button>
        </div>
        {!surface.allowed && me?.subscription?.hasUsedTrial ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">Your trial has ended. Upgrade to keep premium access.</p>
        ) : null}
      </div>
    </div>
  );
}
