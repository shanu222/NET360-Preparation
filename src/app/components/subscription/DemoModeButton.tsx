import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight, FileText, FlaskConical, Loader2, PlayCircle, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { formatDemoTimeLeft, useDemoMode } from '../../lib/demoMode';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { handleApiError } from '../../lib/userToast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type RowTone = 'ready' | 'used' | 'idle';

const TONE_CLASS: Record<RowTone, string> = {
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

/** Web-only header entry point for Demo Mode; shown to signed-in students only. */
export function DemoModeButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { me } = useSubscription();
  const demo = useDemoMode();
  const [open, setOpen] = useState(false);
  const [openingPath, setOpeningPath] = useState<string | null>(null);

  if (isNativeRuntime() || !user || !demo.enabled || !demo.loaded) return null;
  const paid = me?.paidServices;
  if (paid?.tests?.allowed && paid?.preparation?.allowed && paid?.community?.allowed && paid?.videos?.allowed) return null;

  const anyRemaining = demo.testAvailable || demo.preparationAvailable || demo.videoAvailable || demo.communityActive;

  const usageStatus = (subscribed: boolean, available: boolean): { label: string; tone: RowTone } => {
    if (subscribed) return { label: 'Subscribed', tone: 'ready' };
    if (!demo.started) return { label: 'Included', tone: 'idle' };
    return available ? { label: 'Available', tone: 'ready' } : { label: 'Used', tone: 'used' };
  };

  const rows = [
    {
      key: 'tests',
      icon: FileText,
      title: 'Tests',
      detail: '1 test from any NET type',
      status: usageStatus(Boolean(paid?.tests?.allowed), demo.testAvailable),
      path: '/tests',
    },
    {
      key: 'preparation',
      icon: BookOpen,
      title: 'Preparation Material',
      detail: '1 item from any subject',
      status: usageStatus(Boolean(paid?.preparation?.allowed), demo.preparationAvailable),
      path: '/preparation',
    },
    {
      key: 'community',
      icon: Users,
      title: 'Community',
      detail: '1 day of access',
      status: paid?.community?.allowed
        ? { label: 'Subscribed', tone: 'ready' as const }
        : !demo.started
          ? { label: 'Included', tone: 'idle' as const }
          : demo.communityActive
            ? { label: `${formatDemoTimeLeft(demo.communityMsLeft)} left`, tone: 'ready' as const }
            : { label: 'Expired', tone: 'used' as const },
      path: '/community',
    },
    {
      key: 'videos',
      icon: PlayCircle,
      title: 'Videos',
      detail: '1 video lecture',
      status: usageStatus(Boolean(paid?.videos?.allowed), demo.videoAvailable),
      path: '/videos',
    },
  ];

  const openService = async (path: string) => {
    if (openingPath) return;
    setOpeningPath(path);
    try {
      await demo.ensureStarted();
      setOpen(false);
      navigate(path);
    } catch (error) {
      handleApiError(error, 'Could not start Demo Mode.');
    } finally {
      setOpeningPath(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="relative min-h-10 touch-manipulation rounded-xl border-amber-300 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-900/50 sm:min-h-9"
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
                  ? 'Choose a service to continue your demo. Your demo usage is saved to your account.'
                  : 'You have used all of your demo access. Subscribe to keep going.'
                : 'Choose a service to try it free. Demo Mode can be used once per account, and Community access lasts 1 day from when you start.'}
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2">
            {rows.map((row) => {
              const Icon = row.icon;
              const busy = openingPath === row.path;
              return (
                <li key={row.key}>
                  <button
                    type="button"
                    disabled={Boolean(openingPath)}
                    onClick={() => void openService(row.path)}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-70 dark:border-slate-700 dark:hover:border-indigo-500/60 dark:hover:bg-indigo-950/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{row.title}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{row.detail}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_CLASS[row.status.tone]}`}>
                      {row.status.label}
                    </span>
                    {busy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl"
            onClick={() => {
              setOpen(false);
              navigate('/subscription');
            }}
          >
            View subscription plans
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
