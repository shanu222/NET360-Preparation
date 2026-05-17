import { Capacitor } from '@capacitor/core';

let socialLoginInit: Promise<void> | null = null;

function nativeGoogleLogEnabled(): boolean {
  try {
    if (Capacitor.getPlatform() === 'android' && Capacitor.isNativePlatform()) return true;
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; VITE_NATIVE_AUTH_DEBUG?: string } }).env;
    return Boolean(env?.DEV) || String(env?.VITE_NATIVE_AUTH_DEBUG || '').trim() === '1';
  } catch {
    return false;
  }
}

function androidNativeLog(event: string, details: Record<string, unknown> = {}) {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) return;
  if (!nativeGoogleLogEnabled()) return;
  const payload = { ts: new Date().toISOString(), event, ...details };
  try {
    // eslint-disable-next-line no-console
    console.error('[net360/google-native]', JSON.stringify(payload));
  } catch {
    // eslint-disable-next-line no-console
    console.error('[net360/google-native]', event, details);
  }
}

function maskClientId(id: string): string {
  const s = String(id || '').trim();
  if (s.length < 24) return s ? '***' : '';
  return `${s.slice(0, 12)}…${s.slice(-10)}`;
}

/** Decode JWT payload for logs only (no signature verification). */
function peekJwtPayload(token: string): { aud?: string; iss?: string; exp?: number; email?: string } {
  try {
    const payloadPart = String(token || '').split('.')[1] || '';
    if (!payloadPart) return {};
    const normalized = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    const parsed = JSON.parse(atob(normalized + pad)) as { aud?: string; iss?: string; exp?: number; email?: string };
    return {
      aud: parsed.aud != null ? String(parsed.aud) : undefined,
      iss: parsed.iss != null ? String(parsed.iss) : undefined,
      exp: typeof parsed.exp === 'number' ? parsed.exp : undefined,
      email: parsed.email != null ? String(parsed.email) : undefined,
    };
  } catch {
    return {};
  }
}

function serializeNativeError(e: unknown): Record<string, unknown> {
  if (e == null) return { kind: 'nullish' };
  if (typeof e === 'string') return { message: e };
  const err = e as Error & { code?: string; data?: unknown; status?: number; statusCode?: number };
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
    statusCode: err.statusCode,
  };
  if (err.data != null) out.data = err.data;
  if (typeof err.stack === 'string') out.stackHead = err.stack.slice(0, 500);
  for (const [k, v] of Object.entries(err as Record<string, unknown>)) {
    if (k in out) continue;
    if (v == null) continue;
    if (typeof v === 'function') continue;
    out[k] = v;
  }
  return out;
}

function readNativeStatusCode(e: unknown): number | null {
  const anyErr = e as {
    status?: unknown;
    statusCode?: unknown;
    nativeStatusCode?: unknown;
    data?: { status?: unknown; statusCode?: unknown; code?: unknown };
  };
  const candidates = [
    anyErr?.status,
    anyErr?.statusCode,
    anyErr?.nativeStatusCode,
    anyErr?.data?.status,
    anyErr?.data?.statusCode,
    anyErr?.data?.code,
  ];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isLikelyAndroidOauthMisconfig(code: string, statusCode: number | null, message: string): boolean {
  const msg = String(message || '').toLowerCase();
  if (statusCode === 10 || statusCode === 12500) return true;
  if (msg.includes('developer_error')) return true;
  if (msg.includes('status: 10')) return true;
  if (msg.includes('oauth')) return true;
  if (msg.includes('sha-1') || msg.includes('sha1') || msg.includes('certificate')) return true;
  if (code === 'USER_CANCELLED' && (msg.includes('failed') || msg.includes('misconfig'))) return true;
  return false;
}

function isGoogleSignInCancelled(code: string, statusCode: number | null, message: string): boolean {
  const msg = String(message || '').toLowerCase();
  return code === 'USER_CANCELLED'
    || statusCode === 12501
    || msg.includes('cancel')
    || msg.includes('sign_in_cancelled');
}

function isLikelyPlayServicesIssue(statusCode: number | null, message: string): boolean {
  const msg = String(message || '').toLowerCase();
  return statusCode === 1
    || statusCode === 2
    || statusCode === 3
    || statusCode === 9
    || msg.includes('play services')
    || msg.includes('service_missing')
    || msg.includes('service_version_update_required')
    || msg.includes('service_disabled');
}

/**
 * Web OAuth client ID (Google Cloud / Firebase type 3). Required for Android native Google Sign-In
 * so the returned ID token is accepted by Firebase `GoogleAuthProvider.credential`.
 */
function resolveGoogleWebClientId(): string {
  const fromEnv = String(
    (import.meta as ImportMeta & { env?: { VITE_GOOGLE_WEB_CLIENT_ID?: string } }).env?.VITE_GOOGLE_WEB_CLIENT_ID || '',
  ).trim();
  if (fromEnv) return fromEnv;
  /* Public client id from `android/app/google-services.json` (client_type 3). */
  return '87406335066-599uplr6pkiaiknklfmt3uimdqnn0rci.apps.googleusercontent.com';
}

export type NativeGoogleSignInResult = {
  idToken: string;
  accessToken: string | null;
};

/**
 * Android-only: native Google account picker (Credential Manager / Play services), not WebView OAuth.
 * Returns a Firebase-compatible Google ID token (and access token when present).
 */
export async function signInWithGoogleAndroidNative(): Promise<NativeGoogleSignInResult> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
    throw new Error('Native Google sign-in is only available on Android.');
  }

  const webClientId = resolveGoogleWebClientId();
  androidNativeLog('google-native-start', {
    webClientId: maskClientId(webClientId),
    packageHint: 'com.net360prep.app',
  });

  let SocialLogin: {
    initialize: (options: unknown) => Promise<void>;
    getPluginVersion?: () => Promise<{ version?: string }>;
    login: (options: unknown) => Promise<{
      provider: string;
      result: {
        responseType?: string;
        idToken?: string;
        accessToken?: { token?: string };
        profile?: { email?: string };
      };
    }>;
  };
  try {
    const importDynamic = new Function('specifier', 'return import(specifier)') as
      (specifier: string) => Promise<Record<string, unknown>>;
    const mod = await importDynamic('@capgo/capacitor-social-login');
    SocialLogin = mod.SocialLogin as typeof SocialLogin;
    if (typeof SocialLogin.getPluginVersion === 'function') {
      try {
        const info = await SocialLogin.getPluginVersion();
        androidNativeLog('social-login-plugin-version', { version: String(info?.version || '') || undefined });
      } catch (e) {
        androidNativeLog('social-login-plugin-version-failed', { error: serializeNativeError(e) });
      }
    }
  } catch (e) {
    androidNativeLog('plugin-import-failed', { error: serializeNativeError(e) });
    throw e;
  }

  if (!socialLoginInit) {
    socialLoginInit = (async () => {
      try {
        androidNativeLog('social-login-initialize', { webClientId: maskClientId(webClientId), mode: 'online' });
        await SocialLogin.initialize({
          google: {
            webClientId,
            mode: 'online',
          },
        });
        androidNativeLog('social-login-initialize-ok', {});
      } catch (e) {
        androidNativeLog('social-login-initialize-failed', { error: serializeNativeError(e) });
        socialLoginInit = null;
        throw e;
      }
    })();
  }

  try {
    await socialLoginInit;
  } catch (e) {
    androidNativeLog('social-login-init-await-failed', { error: serializeNativeError(e) });
    throw e;
  }

  let res: Awaited<ReturnType<typeof SocialLogin.login>>;
  try {
    /*
     * Do NOT pass `options.scopes` on Android: @capgo GoogleProvider rejects login when scopes are set
     * unless MainActivity implements ModifiedMainActivityForSocialLoginPlugin (OAuth consent activity).
     * Defaults already include userinfo email/profile + openid.
     */
    androidNativeLog('social-login-login-call', { style: 'standard', scopesOmitted: true });
    res = await SocialLogin.login({
      provider: 'google',
      options: {
        style: 'standard',
      },
    });
    androidNativeLog('social-login-login-raw-result', {
      provider: res?.provider,
      responseType: res?.result?.responseType,
      hasIdToken: Boolean(res?.result?.idToken),
      hasAccessToken: Boolean(res?.result?.accessToken?.token),
      profileEmailPresent: Boolean(res?.result?.profile?.email),
    });
  } catch (e) {
    const code = String((e as { code?: string })?.code || '').trim();
    const statusCode = readNativeStatusCode(e);
    const message = String((e as Error)?.message || '');
    androidNativeLog('social-login-login-failed', {
      code: code || undefined,
      statusCode: statusCode ?? undefined,
      error: serializeNativeError(e),
    });
    if (isGoogleSignInCancelled(code, statusCode, message)) {
      const err = new Error('Google sign-in was cancelled.') as Error & { code?: string };
      err.code = 'USER_CANCELLED';
      throw err;
    }
    if (isLikelyPlayServicesIssue(statusCode, message)) {
      const err = new Error(
        'Google Play Services is unavailable or needs an update on this device. Update Google Play Services and try again.',
      ) as Error & { code?: string };
      err.code = 'GOOGLE_PLAY_SERVICES_UNAVAILABLE';
      throw err;
    }
    if (isLikelyAndroidOauthMisconfig(code, statusCode, message)) {
      const err = new Error(
        'Android Google OAuth is misconfigured for this package/signing key. ' +
          'Verify Firebase Android app package, SHA-1/SHA-256, and Android OAuth client.',
      ) as Error & { code?: string };
      err.code = 'GOOGLE_OAUTH_ANDROID_MISCONFIG';
      throw err;
    }
    throw e;
  }

  if (res.provider !== 'google') {
    androidNativeLog('unexpected-provider', { provider: res.provider });
    throw new Error('Google sign-in did not complete.');
  }

  if (res.result.responseType !== 'online') {
    androidNativeLog('unexpected-response-type', { responseType: (res.result as { responseType?: string }).responseType });
    throw new Error('Google sign-in did not return an online session.');
  }

  const idToken = res.result.idToken;
  const accessToken = res.result.accessToken?.token ?? null;
  const profileEmail = res.result.profile?.email ?? null;

  androidNativeLog('social-login-login-ok', {
    hasIdToken: Boolean(idToken),
    hasAccessToken: Boolean(accessToken),
    idTokenLen: idToken ? idToken.length : 0,
    profileEmailPresent: Boolean(profileEmail),
    googleIdJwt: idToken ? peekJwtPayload(idToken) : {},
  });

  if (!idToken) {
    androidNativeLog('missing-id-token', { hasAccessToken: Boolean(accessToken) });
    throw new Error('Google sign-in did not return an ID token.');
  }

  return { idToken, accessToken };
}
