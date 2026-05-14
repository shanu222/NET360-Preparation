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
    androidNativeLog('plugin-import-failed', { message: (e as Error)?.message || String(e) });
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
        androidNativeLog('social-login-initialize-failed', { message: (e as Error)?.message || String(e) });
        socialLoginInit = null;
        throw e;
      }
    })();
  }

  try {
    await socialLoginInit;
  } catch (e) {
    androidNativeLog('social-login-init-await-failed', { message: (e as Error)?.message || String(e) });
    throw e;
  }

  let res: Awaited<ReturnType<typeof SocialLogin.login>>;
  try {
    res = await SocialLogin.login({
      provider: 'google',
      options: {
        scopes: ['email', 'profile'],
        style: 'standard',
      },
    });
  } catch (e) {
    const code = String((e as { code?: string })?.code || '').trim();
    androidNativeLog('social-login-login-failed', {
      code: code || undefined,
      message: (e as Error)?.message || String(e),
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

  androidNativeLog('social-login-login-ok', {
    hasIdToken: Boolean(idToken),
    hasAccessToken: Boolean(accessToken),
    idTokenLen: idToken ? idToken.length : 0,
  });

  if (!idToken) {
    androidNativeLog('missing-id-token', { hasAccessToken: Boolean(accessToken) });
    throw new Error('Google sign-in did not return an ID token.');
  }

  return { idToken, accessToken };
}
