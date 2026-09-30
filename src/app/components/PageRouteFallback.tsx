/**
 * Shown while lazy-loaded route chunks resolve — avoids blank main content during navigation.
 */
export function PageRouteFallback() {
  return (
    <div
      className="net360-page w-full min-w-0 max-w-full overflow-x-hidden"
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

/** Shown while the first session is resolving. Not a progress animation — it stays only until auth is ready. */
export function FullViewportRouteFallback() {
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{
        minHeight: '100dvh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: dark ? '#0f172a' : '#f4f6fb',
        color: dark ? '#f8fafc' : '#1e1b4b',
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
      }}
    >
      <img src="/net360-logo.png" alt="" width={88} height={88} style={{ width: 88, height: 88, borderRadius: 22 }} />
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em' }}>NET360</p>
      <span style={{ color: dark ? '#cbd5e1' : '#64748b', fontSize: 13, fontWeight: 600 }}>NUST entry test preparation</span>
    </div>
  );
}
