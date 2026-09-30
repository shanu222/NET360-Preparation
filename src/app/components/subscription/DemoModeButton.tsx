import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Check, FileText, FlaskConical, Loader2, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { formatDemoTimeLeft, useDemoMode } from '../../lib/demoMode';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { handleApiError, showNeutralToast, showSuccessToast } from '../../lib/userToast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type RowStatus = { label: string; tone: 'ready' | 'used' | 'idle' };

const TONE_CLASS: Record<RowStatus['tone'], string> = {
  ready: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200',
  used: 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  idle: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-200',
};

export function DemoModeBanner({ message, used }: { message: string; used?: boolean }) {
  const navigate = useNavigate();
  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${
        used
          ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100'
      }`}
      role="status"
    >
      <FlaskConical className="h-4 w-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">Demo Mode · </span>
        {message}
      </p>
      <Button type="button" size="sm" variant="outline" className="rounded-lg" onClick={() => navigate('/subscription')}>
        View plans
      </Button>
    </div>
  );
}

/** Web-only header entry point for Demo Mode. */
export function DemoModeButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { me } = useSubscription();
  const demo = useDemoMode();
  const [open, setOpen] = useState(false);

  const triggerClass =
    'relative min-h-10 touch-manipulation rounded-xl border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50 sm:min-h-9';

  if (isNativeRuntime() || user?.role === 'admin') return null;
  if (!user) {
    return (
      <Button
        type="button"
        variant="outline"
        className={triggerClass}
        aria-label="Open Demo Mode"
        onClick={() => {
          showNeutralToast('Sign in to start Demo Mode.');
          navigate('/profile');
        }}
      >
        <FlaskConical className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Demo Mode</span>
      </Button>
    );
  }
  if (!demo.enabled || !demo.loaded) return null;
  const paid = me?.paidServices;
  if (paid?.tests?.allowed && paid?.preparation?.allowed && paid?.community?.allowed) return null;

  const anyRemaining = demo.testAvailable || demo.preparationAvailable || demo.communityActive;

  const statusFor = (available: boolean, usedLabel: string): RowStatus => {
    if (!demo.started) return { label: 'Included', tone: 'idle' };
    return available ? { label: 'Available', tone: 'ready' } : { label: usedLabel, tone: 'used' };
  };

  const rows = [
    {
      key: 'tests',
      icon: FileText,
      title: 'Tests',
      detail: '1 test from any NET type',
      status: paid?.tests?.allowed ? { label: 'Subscribed', tone: 'ready' as const } : statusFor(demo.testAvailable, 'Used'),
      canOpen: Boolean(paid?.tests?.allowed) || demo.started,
      path: '/tests',
    },
    {
      key: 'preparation',
      icon: BookOpen,
      title: 'Preparation Material',
      detail: '1 item from any subject',
      status: paid?.preparation?.allowed
        ? { label: 'Subscribed', tone: 'ready' as const }
        : statusFor(demo.preparationAvailable, 'Used'),
      canOpen: Boolean(paid?.preparation?.allowed) || demo.started,
      path: '/preparation',
    },
    {
      key: 'community',
      icon: Users,
      title: 'Community',
      detail: '24 hours of access',
      status: paid?.community?.allowed
        ? { label: 'Subscribed', tone: 'ready' as const }
        : demo.started
          ? demo.communityActive
            ? { label: `${formatDemoTimeLeft(demo.communityMsLeft)} left`, tone: 'ready' as const }
            : { label: 'Expired', tone: 'used' as const }
          : { label: 'Included', tone: 'idle' as const },
      canOpen: Boolean(paid?.community?.allowed) || demo.started,
      path: '/community',
    },
  ];

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const startDemo = async () => {
    try {
      await demo.start();
      showSuccessToast('Demo Mode is on. Enjoy your free test, preparation item, and 24 hours of Community.');
    } catch (error) {
      handleApiError(error, 'Could not start Demo Mode.');
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className={triggerClass}
        onClick={() => setOpen(true)}
        aria-label="Open Demo Mode"
      >
        <FlaskConical className="h-4 w-4 sm:mr-1.5" />
        <span className="hidden sm:inline">Demo Mode</span>
        {demo.started && anyRemaining ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" aria-hidden="true" />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-600" />
              Demo Mode
            </DialogTitle>
            <DialogDescription>
              {demo.started
                ? anyRemaining
                  ? 'Your demo access is saved to your account. Here is what you have left.'
                  : 'You have used all of your demo access. Subscribe to keep going.'
                : 'Try NET360 before you subscribe. Demo Mode can be used once per account.'}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {rows.map((row) => {
              const Icon = row.icon;
              return (
                <li key={row.key} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{row.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{row.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASS[row.status.tone]}`}>
                    {row.status.tone === 'ready' && row.status.label === 'Subscribed' ? <Check className="mr-1 inline h-3 w-3" /> : null}
                    {row.status.label}
                  </span>
                  {row.canOpen && row.status.tone === 'ready' ? (
                    <Button type="button" size="sm" variant="ghost" className="shrink-0 rounded-lg" onClick={() => go(row.path)}>
                      Open
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="flex flex-col gap-2 sm:flex-row">
            {!demo.started ? (
              <Button type="button" className="flex-1 rounded-xl" disabled={demo.starting} onClick={() => void startDemo()}>
                {demo.starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Start Demo Mode
              </Button>
            ) : null}
            <Button
              type="button"
              variant={demo.started ? 'default' : 'outline'}
              className="flex-1 rounded-xl"
              onClick={() => go('/subscription')}
            >
              View subscription plans
            </Button>
          </div>
          {!demo.started ? (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Community access runs for 24 hours from the moment you start Demo Mode.
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
