/**
 * Recover from stale deployments: old index.html referencing removed Vite chunks.
 * Registers global handlers + optional /version.json check (cache: no-store).
 */

const CHUNK_LOAD_SUBSTR = 'Failed to fetch dynamically imported module';
const LS_VERSION_KEY = 'net360_app_version';

function isChunkLoadFailureMessage(message: unknown): boolean {
  return typeof message === 'string' && message.includes(CHUNK_LOAD_SUBSTR);
}

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

let reloadScheduled = false;

function scheduleReload(message: string) {
  if (reloadScheduled) return;
  reloadScheduled = true;
  showReloadOverlay(message);
  window.setTimeout(() => {
    window.location.reload();
  }, 400);
}

export function installChunkLoadRecovery(): void {
  window.addEventListener('error', (e: ErrorEvent) => {
    if (isChunkLoadFailureMessage(e?.message)) {
      console.warn('Chunk load failed, reloading…', e);
      scheduleReload('Loading latest app, reloading…');
    }
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const r = e.reason;
    const message = r instanceof Error ? r.message : typeof r === 'string' ? r : String(r ?? '');
    if (isChunkLoadFailureMessage(message)) {
      console.warn('Chunk load failed (promise), reloading…', e.reason);
      e.preventDefault();
      scheduleReload('Loading latest app, reloading…');
    }
  });
}

/**
 * Compare public/version.json with localStorage; reload once when deploy version changes.
 * Skipped in dev to avoid fighting HMR.
 */
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
        scheduleReload('App updated, reloading…');
        return;
      }
      localStorage.setItem(LS_VERSION_KEY, next);
    })
    .catch(() => {
      /* offline or missing file — ignore */
    });
}
