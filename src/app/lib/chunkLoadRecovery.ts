/**
 * Stale-deployment recovery for Vite code-split chunks (hashed filenames change after deploy).
 * - Global listeners for script/import failures
 * - lazyWithRetry() wraps React.lazy importers
 * - Optional /version.json check (see vite version plugin writing dist/version.json)
 */

import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_COUNT_KEY = 'net360_stale_chunk_reload_n';
const RELOAD_RESET_MS = 12_000;
const MAX_AUTO_RELOADS = 4;

function isChunkLoadFailureMessage(message: unknown): boolean {
  if (typeof message !== 'string' || !message.trim()) return false;
  const m = message;
  return (
    m.includes('Failed to fetch dynamically imported module')
    || m.includes('Importing a module script failed')
    || m.includes('error loading dynamically imported module')
    || m.includes('Unable to preload CSS')
    || m.includes('ChunkLoadError')
    || m.includes('Loading chunk')
    || m.includes('Loading CSS chunk')
  );
}

/** Public API for ErrorBoundary / UI (avoid showing raw URLs). */
export function isChunkLoadFailure(error: unknown): boolean {
  if (!error) return false;
  if (error instanceof TypeError && String(error.message || '').includes('Failed to fetch')) return true;
  const name = typeof (error as Error).name === 'string' ? (error as Error).name : '';
  if (name === 'ChunkLoadError') return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  return isChunkLoadFailureMessage(message);
}

let reloadScheduled = false;

function showReloadOverlay(message: string) {
  if (document.getElementById('net360-reload-overlay')) return;
  const el = document.createElement('div');
  el.id = 'net360-reload-overlay';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;
  el.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(15,23,42,0.92);color:#f8fafc;font-family:system-ui,sans-serif;font-size:1rem;padding:1rem;text-align:center;';
  document.body.appendChild(el);
}

/**
 * Hard refresh to pick up new index.html + chunk map. Bounded retries to avoid infinite loops.
 */
export function scheduleStaleChunkReload(reason: string): boolean {
  if (reloadScheduled) return true;
  const n = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) || '0');
  if (n >= MAX_AUTO_RELOADS) {
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
    if (import.meta.env.DEV) {
      console.error('[NET360]', reason, '— reload limit reached');
    }
    return false;
  }
  sessionStorage.setItem(RELOAD_COUNT_KEY, String(n + 1));
  reloadScheduled = true;
  showReloadOverlay('An update is ready — refreshing this page…');
  if (import.meta.env.DEV) {
    console.warn('[NET360] Stale chunk / asset:', reason);
  }
  window.setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('_cb', String(Date.now()));
      window.location.replace(url.pathname + url.search + url.hash);
    } catch {
      window.location.reload();
    }
  }, 120);
  return true;
}

export function installChunkLoadRecovery(): void {
  window.setTimeout(() => {
    sessionStorage.removeItem(RELOAD_COUNT_KEY);
  }, RELOAD_RESET_MS);

  window.addEventListener(
    'error',
    (e: Event) => {
      if (isChunkLoadFailureMessage((e as ErrorEvent)?.message)) {
        scheduleStaleChunkReload('window.error (message)');
        return;
      }
      const t = (e as ErrorEvent).target as HTMLElement | null;
      if (t && t.tagName === 'SCRIPT') {
        const src = (t as HTMLScriptElement).src || '';
        if (src.includes('/assets/') && (t as HTMLScriptElement).type === 'module') {
          scheduleStaleChunkReload(`script: ${src.slice(-80)}`);
        }
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason;
    const message = r instanceof Error ? r.message : typeof r === 'string' ? r : String(r ?? '');
    if (isChunkLoadFailureMessage(message)) {
      e.preventDefault();
      scheduleStaleChunkReload('unhandledrejection');
    }
  });
}

const LS_VERSION_KEY = 'net360_app_version';

export function checkAppVersionFromServer(): void {
  if (import.meta.env.DEV) return;

  void fetch('/version.json', { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { version?: string } | null) => {
      const next = data?.version;
      if (!next) return;

      const prev = localStorage.getItem(LS_VERSION_KEY);
      if (prev && prev !== next) {
        localStorage.setItem(LS_VERSION_KEY, next);
        scheduleStaleChunkReload('version.json changed');
        return;
      }
      localStorage.setItem(LS_VERSION_KEY, next);
    })
    .catch(() => {
      /* offline or missing — ignore */
    });
}

/**
 * React.lazy wrapper: on chunk 404 after deploy, trigger reload before ErrorBoundary paints.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      if (isChunkLoadFailure(err)) {
        const ok = scheduleStaleChunkReload('React.lazy import');
        if (ok) {
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw err;
    }),
  );
}
