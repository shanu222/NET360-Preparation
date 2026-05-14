/**
 * Capacitor Android: OAuth and post-login URLs must load in the WebView with the full URL
 * (query + hash) so Firebase `getRedirectResult` can complete. React Router `navigate()` alone
 * drops the original document URL and can leave `/__/auth/handler` state incomplete.
 *
 * When the OS hands us `https://localhost/...` or `http://localhost/...` after an external
 * handoff, normalize to `https://localhost` and force a document navigation.
 *
 * Production web / Vercel hosts are left to the caller (return null → SPA routing).
 *
 * Also configure `server.allowNavigation` in `capacitor.config.json` (Google / Firebase hosts
 * plus `localhost`) so `Bridge.launchIntent` does not send OAuth to the external browser.
 */
export function resolveCapacitorAndroidWebViewUrl(incoming: string): string | null {
  const raw = String(incoming || '').trim();
  if (!raw) return null;

  const toLocal = (pathname: string, search: string, hash: string) => {
    const p = pathname && pathname.startsWith('/') ? pathname : `/${pathname || ''}`;
    return `https://localhost${p}${search || ''}${hash || ''}`;
  };

  try {
    const u = new URL(raw);
    const host = u.hostname.toLowerCase();

    if (host === 'net360preparation.com' || host === 'www.net360preparation.com') {
      return null;
    }

    if ((u.protocol === 'https:' || u.protocol === 'http:') && (host === 'localhost' || host === '127.0.0.1')) {
      return toLocal(u.pathname || '/', u.search || '', u.hash || '');
    }

    // Custom scheme (see android `custom_url_scheme`)
    if (u.protocol === 'com.net360.preparation:') {
      const withoutScheme = raw.slice(raw.indexOf(':') + 1);
      const bridge = withoutScheme.match(/^\/\/https?\/(?:localhost|127\.0\.0\.1)(.*)$/i);
      if (bridge) {
        const tail = bridge[1] && bridge[1].length > 0 ? bridge[1] : '/';
        const normalizedTail = tail.startsWith('/') ? tail : `/${tail}`;
        const bridged = new URL(`https://localhost${normalizedTail}`);
        return toLocal(bridged.pathname || '/', bridged.search || '', bridged.hash || '');
      }
      if (host === 'localhost' || host === '127.0.0.1') {
        return toLocal(u.pathname || '/', u.search || '', u.hash || '');
      }
      const pathOnly = u.pathname && u.pathname !== '/' ? u.pathname : '';
      if (pathOnly) {
        return toLocal(pathOnly, u.search || '', u.hash || '');
      }
    }
  } catch {
    return null;
  }

  return null;
}
