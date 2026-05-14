import { Capacitor } from '@capacitor/core';

let socialLoginInit: Promise<void> | null = null;

/**
 * Web OAuth client ID (Google Cloud / Firebase). Required for Android native Google Sign-In
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

/**
 * Android-only: native Google account picker (Credential Manager / Play services), not WebView OAuth.
 * Returns a Firebase-compatible Google ID token.
 */
export async function signInWithGoogleAndroidNative(): Promise<{ idToken: string }> {
  if (Capacitor.getPlatform() !== 'android' || !Capacitor.isNativePlatform()) {
    throw new Error('Native Google sign-in is only available on Android.');
  }

  const { SocialLogin } = await import('@capgo/capacitor-social-login');

  if (!socialLoginInit) {
    socialLoginInit = SocialLogin.initialize({
      google: {
        webClientId: resolveGoogleWebClientId(),
        mode: 'online',
      },
    });
  }
  await socialLoginInit;

  const res = await SocialLogin.login({
    provider: 'google',
    options: {
      scopes: ['email', 'profile'],
      style: 'standard',
    },
  });

  if (res.provider !== 'google') {
    throw new Error('Google sign-in did not complete.');
  }

  if (res.result.responseType !== 'online') {
    throw new Error('Google sign-in did not return an online session.');
  }

  const idToken = res.result.idToken;
  if (!idToken) {
    throw new Error('Google sign-in did not return an ID token.');
  }

  return { idToken };
}
