import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FlaskConical, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { formatDemoTimeLeft, useDemoMode, type DemoService } from '../../lib/demoMode';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { handleApiError } from '../../lib/userToast';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';

export function DemoModeBanner({ message, used }: { message: string; used?: boolean }) {
  const navigate = useNavigate();
  if (isNativeRuntime()) {
    return (
      <div
        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${
          used ? 'net360-android-demo-banner-used' : 'net360-android-demo-banner'
        }`}
        role="status"
      >
        <FlaskConical className="h-4 w-4 shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Demo · </span>
          {message}
        </p>
        <button
          type="button"
          className="net360-android-demo-banner-btn shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold active:opacity-80"
          onClick={() => navigate('/subscription')}
        >
          Plans
        </button>
      </div>
    );
  }
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

type DemoOption = {
  service: DemoService;
  emoji: string;
  title: string;
  allowance: string;
  path: string;
  eligible: boolean;
  inProgress?: boolean;
  note?: string;
};

/**
 * Demo services offered to a signed-in student. A service is offered only while the user has no paid
 * access to it and has not used its demo; each service is independent. Returns no options once none is eligible.
 */
function useDemoOptions(onOpened: () => void) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const demo = useDemoMode();
  const [openingService, setOpeningService] = useState<DemoService | null>(null);

  const visible = Boolean(user) && demo.enabled && demo.loaded;
  const paid = demo.paidServices;
  const options = visible
    ? ([
      {
        service: 'tests',
        emoji: '📝',
        title: 'Tests',
        allowance: 'Try 1 test',
        path: '/tests',
        eligible: !paid?.tests?.allowed && !demo.testUsed,
      },
      {
        service: 'preparation',
        emoji: '📚',
        title: 'Preparation Material',
        allowance: 'Try 1 item',
        path: '/preparation',
        eligible: !paid?.preparation?.allowed && !demo.preparationUsed,
      },
      {
        service: 'videos',
        emoji: '🎥',
        title: 'Videos',
        allowance: 'Try 1 video',
        path: '/videos',
        eligible: !paid?.videos?.allowed && !demo.videoUsed,
      },
      {
        service: 'community',
        emoji: '👥',
        title: 'Community',
        allowance: 'Try 1 day',
        path: '/community',
        eligible: !paid?.community?.allowed && !demo.communityExpired,
        inProgress: demo.communityActive,
        note: demo.communityActive ? `${formatDemoTimeLeft(demo.communityMsLeft)} left` : undefined,
      },
    ] satisfies DemoOption[]).filter((option) => option.eligible)
    : [];

  const openOption = async (option: DemoOption) => {
    if (openingService) return;
    setOpeningService(option.service);
    try {
      await demo.ensureStarted(option.service);
      onOpened();
      navigate(option.path);
    } catch (error) {
      handleApiError(error, 'Could not start the demo.');
    } finally {
      setOpeningService(null);
    }
  };

  return { options, openOption, openingService };
}

const actionLabel = (option: DemoOption) => (option.inProgress ? 'Continue' : 'Try Demo');

/** Web header entry point for Demo Mode. */
export function DemoModeButton() {
  const [open, setOpen] = useState(false);
  const { options, openOption, openingService } = useDemoOptions(() => setOpen(false));

  if (isNativeRuntime() || !options.length) return null;

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
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" aria-hidden="true" />
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
                return (
                  <li
                    key={option.service}
                    className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur-md transition hover:border-indigo-200 hover:bg-white/75 dark:border-white/10 dark:bg-slate-800/50 dark:hover:bg-slate-800/70"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-2xl shadow-inner dark:bg-slate-900/60" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-slate-50">{option.title}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">{option.note || option.allowance}</span>
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      disabled={Boolean(openingService)}
                      className="shrink-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_8px_18px_rgba(79,70,229,0.28)] hover:from-indigo-700 hover:to-violet-600"
                      onClick={() => void openOption(option)}
                      aria-label={`${actionLabel(option)}: ${option.title}`}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : actionLabel(option)}
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

/** Android header entry point for Demo Mode: a top-bar action that opens a bottom sheet. */
export function AndroidDemoModeButton() {
  const [open, setOpen] = useState(false);
  const { options, openOption, openingService } = useDemoOptions(() => setOpen(false));

  if (!isNativeRuntime() || !options.length) return null;

  return (
    <>
      <button
        type="button"
        className="net360-android-demo-chip relative inline-flex min-h-10 shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold active:opacity-80"
        onClick={() => setOpen(true)}
        aria-label="Open Demo Mode"
      >
        <FlaskConical className="h-4 w-4" aria-hidden="true" />
        Demo
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#12182e]" aria-hidden="true" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="net360-android-demo-sheet max-h-[85dvh] gap-0 overflow-y-auto rounded-t-[28px] border-0 bg-[#f7f8fb] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3 text-slate-900 dark:bg-[#12182b] dark:text-slate-100"
        >
          <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-slate-300 dark:bg-slate-500" aria-hidden="true" />
          <SheetTitle className="px-1 text-xl font-semibold text-slate-900 dark:text-slate-100">Try Demo</SheetTitle>
          <SheetDescription className="px-1 pb-4 pt-1 text-sm text-slate-600 dark:text-slate-300">
            Experience NET360 before subscribing
          </SheetDescription>

          <ul className="space-y-2">
            {options.map((option) => {
              const busy = openingService === option.service;
              return (
                <li key={option.service}>
                  <button
                    type="button"
                    disabled={Boolean(openingService)}
                    className="net360-android-plan-card flex min-h-[4.5rem] w-full touch-manipulation items-center gap-3 rounded-[22px] px-4 py-3 text-left active:opacity-90 disabled:opacity-70"
                    onClick={() => void openOption(option)}
                    aria-label={`${actionLabel(option)}: ${option.title}`}
                  >
                    <span className="net360-android-plan-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">{option.title}</span>
                      <span className="block text-[13px] text-slate-600 dark:text-slate-300">{option.note || option.allowance}</span>
                    </span>
                    <span className={`inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] font-semibold ${
                      option.inProgress ? 'net360-android-demo-action-active' : 'net360-android-demo-action'
                    }`}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                        <>
                          {actionLabel(option)}
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="px-2 pt-4 text-center text-xs text-slate-600 dark:text-slate-300">
            Each demo is separate and can be used once. Community lasts 1 day from when you start it.
          </p>
        </SheetContent>
      </Sheet>
    </>
  );
}
