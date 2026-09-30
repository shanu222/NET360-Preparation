import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { formatDemoTimeLeft, useDemoMode, type DemoService } from '../../lib/demoMode';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { handleApiError } from '../../lib/userToast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

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

type DemoState = 'new' | 'active' | 'used';

type DemoOption = {
  service: DemoService;
  emoji: string;
  title: string;
  allowance: string;
  path: string;
  state: DemoState;
  note?: string;
};

/**
 * Web-only header entry point for Demo Mode; shown to signed-in students.
 * Only services without active paid access are offered; each demo allowance is independent.
 */
export function DemoModeButton() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { me } = useSubscription();
  const demo = useDemoMode();
  const [open, setOpen] = useState(false);
  const [openingService, setOpeningService] = useState<DemoService | null>(null);

  if (isNativeRuntime() || !user || !demo.enabled || !demo.loaded) return null;
  const paid = me?.paidServices;

  const usageState = (used: boolean): DemoState => (used ? 'used' : 'new');
  const options: DemoOption[] = [
    !paid?.tests?.allowed && {
      service: 'tests' as const,
      emoji: '📝',
      title: 'Tests',
      allowance: 'Try 1 test',
      path: '/tests',
      state: usageState(demo.testUsed),
    },
    !paid?.preparation?.allowed && {
      service: 'preparation' as const,
      emoji: '📚',
      title: 'Preparation Material',
      allowance: 'Try 1 item',
      path: '/preparation',
      state: usageState(demo.preparationUsed),
    },
    !paid?.videos?.allowed && {
      service: 'videos' as const,
      emoji: '🎥',
      title: 'Videos',
      allowance: 'Try 1 video',
      path: '/videos',
      state: usageState(demo.videoUsed),
    },
    !paid?.community?.allowed && {
      service: 'community' as const,
      emoji: '👥',
      title: 'Community',
      allowance: 'Try 1 day',
      path: '/community',
      state: demo.communityActive ? 'active' as const : demo.communityExpired ? 'used' as const : 'new' as const,
      note: demo.communityActive ? `${formatDemoTimeLeft(demo.communityMsLeft)} left` : undefined,
    },
  ].filter(Boolean) as DemoOption[];

  if (!options.length) return null;

  const anyRemaining = options.some((option) => option.state !== 'used');

  const openOption = async (option: DemoOption) => {
    if (openingService) return;
    if (option.state === 'used') {
      setOpen(false);
      navigate('/subscription');
      return;
    }
    setOpeningService(option.service);
    try {
      await demo.ensureStarted(option.service);
      setOpen(false);
      navigate(option.path);
    } catch (error) {
      handleApiError(error, 'Could not start the demo.');
    } finally {
      setOpeningService(null);
    }
  };

  const actionLabel = (state: DemoState) => (state === 'used' ? 'Subscribe' : state === 'active' ? 'Continue' : 'Try Demo');

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
        {anyRemaining ? (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" aria-hidden="true" />
        ) : null}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md overflow-hidden rounded-3xl border-white/50 bg-white/65 p-0 shadow-[0_30px_70px_rgba(59,67,146,0.28)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/65 sm:max-w-md md:max-w-md">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.28),transparent_55%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.2),transparent_50%)]" />
          <div className="relative space-y-5 p-6">
            <DialogHeader className="space-y-1 text-left">
              <DialogTitle className="flex items-center gap-2 text-xl text-indigo-950 dark:text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-400 text-white shadow-md">
                  <FlaskConical className="h-5 w-5" />
                </span>
                Try Demo
              </DialogTitle>
              <DialogDescription className="text-slate-600 dark:text-slate-300">
                Experience NET360 before subscribing
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2.5">
              {options.map((option) => {
                const busy = openingService === option.service;
                const used = option.state === 'used';
                return (
                  <li
                    key={option.service}
                    className={`flex items-center gap-3 rounded-2xl border p-3 shadow-sm backdrop-blur-md transition ${
                      used
                        ? 'border-white/40 bg-white/35 dark:border-white/5 dark:bg-slate-800/30'
                        : 'border-white/70 bg-white/55 hover:border-indigo-200 hover:bg-white/75 dark:border-white/10 dark:bg-slate-800/50 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-2xl shadow-inner dark:bg-slate-900/60" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-semibold ${used ? 'text-slate-500 dark:text-slate-400' : 'text-slate-900 dark:text-slate-50'}`}>
                        {option.title}
                      </span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {used ? 'Demo used' : option.note || option.allowance}
                      </span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant={used ? 'outline' : 'default'}
                      disabled={Boolean(openingService)}
                      className={`shrink-0 rounded-xl ${used ? 'bg-white/60 dark:bg-slate-900/40' : 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_8px_18px_rgba(79,70,229,0.28)] hover:from-indigo-700 hover:to-violet-600'}`}
                      onClick={() => void openOption(option)}
                      aria-label={`${actionLabel(option.state)}: ${option.title}`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel(option.state)}
                    </Button>
                  </li>
                );
              })}
            </ul>

            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Each demo is separate and can be used once. Community lasts 1 day from when you start it.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
