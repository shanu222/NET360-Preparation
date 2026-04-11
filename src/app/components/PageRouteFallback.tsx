/**
 * Shown while lazy-loaded route chunks resolve — avoids blank main content during navigation.
 */
export function PageRouteFallback() {
  return (
    <div
      className="net360-page w-full"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="space-y-5 pt-1">
        <div className="h-9 max-w-[min(100%,320px)] animate-pulse rounded-xl bg-slate-200/90 dark:bg-slate-700/80" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100/95 dark:bg-slate-800/70" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100/95 dark:bg-slate-800/70" />
          <div className="h-28 animate-pulse rounded-2xl bg-slate-100/95 dark:bg-slate-800/70 sm:col-span-2 lg:col-span-1" />
        </div>
        <div className="space-y-3 rounded-2xl border border-indigo-100/60 bg-white/50 p-4 dark:border-slate-700/50 dark:bg-slate-900/20">
          <div className="h-4 w-3/4 max-w-md animate-pulse rounded-md bg-slate-200/80 dark:bg-slate-600/60" />
          <div className="h-4 w-full max-w-lg animate-pulse rounded-md bg-slate-100 dark:bg-slate-700/50" />
          <div className="h-4 w-5/6 max-w-lg animate-pulse rounded-md bg-slate-100 dark:bg-slate-700/50" />
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          Loading…
        </div>
      </div>
    </div>
  );
}

/** Minimal full-viewport fallback for exam / admin lazy chunks. */
export function FullViewportRouteFallback() {
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-[#eef2f6] p-4 text-[#0d2c5a] dark:bg-[#0f172a] dark:text-slate-100"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#2b5f9f]/30 bg-white/95 px-6 py-8 shadow-sm dark:border-slate-600/50 dark:bg-slate-900/90">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#2b5f9f] border-t-transparent dark:border-indigo-400" />
        <p className="text-center text-sm font-medium text-[#0d2c5a] dark:text-slate-100">Loading…</p>
        <div className="space-y-2">
          <div className="h-3 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  );
}
