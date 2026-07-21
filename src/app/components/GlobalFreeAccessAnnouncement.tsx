import { useEffect, useMemo, useState } from 'react';
import { Crown, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';

const DISMISS_PREFIX = 'net360-global-free-access-dismissed:';

function formatOfferDate(value: string | null | undefined) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function GlobalFreeAccessAnnouncement({
  onStartLearning,
}: {
  onStartLearning?: () => void;
}) {
  const { user } = useAuth();
  const { me } = useSubscription();
  const [open, setOpen] = useState(false);

  const offer = me?.globalFreeAccess;
  const dismissKey = useMemo(() => {
    const uid = String(user?.id || '').trim();
    const ends = String(offer?.expiresAt || '').trim();
    if (!uid || !ends) return '';
    return `${DISMISS_PREFIX}${uid}:${ends}`;
  }, [user?.id, offer?.expiresAt]);

  useEffect(() => {
    if (!offer?.active || !dismissKey) {
      setOpen(false);
      return;
    }
    try {
      if (localStorage.getItem(dismissKey) === '1') {
        setOpen(false);
        return;
      }
    } catch {
      // ignore storage failures
    }
    setOpen(true);
  }, [offer?.active, dismissKey]);

  if (!open || !offer?.active) return null;

  const until = formatOfferDate(offer.expiresAt);
  const announcement = String(offer.announcement || '').trim()
    || 'Enjoy unlimited Premium MCQs, practice, mock tests, community, and premium resources.';

  const dismiss = () => {
    try {
      if (dismissKey) localStorage.setItem(dismissKey, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[5.5rem] z-[75] flex justify-center px-3 sm:bottom-5 sm:z-[80]">
      <div
        className="pointer-events-auto relative w-full max-w-lg overflow-hidden rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4 shadow-[0_18px_40px_rgba(16,185,129,0.18)] animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
        role="dialog"
        aria-label="Premium free access announcement"
      >
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-2 top-2 rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          aria-label="Dismiss announcement"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="flex items-start gap-3 pr-6">
          <div className="mt-0.5 rounded-xl bg-emerald-500/15 p-2 text-emerald-700">
            <Crown className="h-5 w-5" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
              <Sparkles className="h-4 w-4" />
              NET360 Premium is FREE
            </p>
            <p className="text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{announcement}</p>
            <ul className="grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
              <li>✓ Premium MCQs</li>
              <li>✓ Practice & Mock Tests</li>
              <li>✓ Community</li>
              <li>✓ Premium Resources</li>
            </ul>
            {until ? (
              <p className="text-xs font-medium text-emerald-800">
                Offer valid until: {until}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  dismiss();
                  onStartLearning?.();
                }}
              >
                Start Learning
              </Button>
              <Button size="sm" variant="outline" onClick={dismiss}>
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
