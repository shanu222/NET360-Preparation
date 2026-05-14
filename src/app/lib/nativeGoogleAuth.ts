import { Capacitor } from '@capacitor/core';

let socialLoginInit: Promise<void> | null = null;

function androidNativeLog(event: string, details: Record<string, unknown> = {}) {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) return;
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
  const err = e as Error & { code?: string; data?: unknown };
  const out: Record<string, unknown> = {
    name: err.name,
    message: err.message,
    code: err.code,
  };
  if (typeof err.stack === 'string') out.stackHead = err.stack.slice(0, 500);
  return out;
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
    packageHint: 'com.net360.preparation',
  });

  let SocialLogin: typeof import('@capgo/capacitor-social-login').SocialLogin;
  try {
    ({ SocialLogin } = await import('@capgo/capacitor-social-login'));
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
  } catch (e) {
    const code = String((e as { code?: string })?.code || '').trim();
    androidNativeLog('social-login-login-failed', {
      code: code || undefined,
      error: serializeNativeError(e),
    });
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
