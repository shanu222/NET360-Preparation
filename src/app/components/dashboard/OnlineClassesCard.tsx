import { ChevronRight, GraduationCap, Sparkles } from 'lucide-react';
import { isNativeRuntime } from '../../lib/nativeDiagnostics';
import { useOnlineClassesContent } from '../../lib/onlineClasses';

export function OnlineClassesCard({ onOpen }: { onOpen: () => void }) {
  const content = useOnlineClassesContent();
  const nativeApp = isNativeRuntime();

  if (nativeApp) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full touch-manipulation items-start gap-3 rounded-3xl bg-white p-4 text-left shadow-sm active:bg-slate-50 dark:bg-[#1a2238] dark:active:bg-white/10"
        aria-label={content.cardTitle}
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
          <GraduationCap className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          {content.cardBadge ? (
            <span className="mb-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
              {content.cardBadge}
            </span>
          ) : null}
          <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">{content.cardTitle}</span>
          {content.cardDescription ? (
            <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{content.cardDescription}</span>
          ) : null}
        </span>
        <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative w-full overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 via-white to-indigo-50 p-5 text-left shadow-[0_14px_32px_rgba(217,119,6,0.12)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_rgba(79,70,229,0.16)] dark:border-amber-500/30 dark:from-amber-950/40 dark:via-slate-900 dark:to-indigo-950/40"
      aria-label={content.cardTitle}
    >
      <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-amber-300/25 blur-2xl" aria-hidden />
      <div className="relative flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md">
          <GraduationCap className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          {content.cardBadge ? (
            <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-indigo-600/10 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-200">
              <Sparkles className="h-3 w-3" />
              {content.cardBadge}
            </span>
          ) : null}
          <span className="block text-lg font-semibold text-indigo-950 dark:text-slate-50">{content.cardTitle}</span>
          {content.cardDescription ? (
            <span className="mt-1 block text-sm text-slate-600 dark:text-slate-300">{content.cardDescription}</span>
          ) : null}
          <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 dark:text-indigo-300">
            {content.ctaText || 'Register now'}
            <ChevronRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </span>
        </span>
      </div>
    </button>
  );
}
