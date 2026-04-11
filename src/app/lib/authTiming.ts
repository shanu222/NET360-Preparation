/**
 * Wait until AuthProvider finishes its initial session resolution.
 * Prevents test/API calls while token and user are still unset (common on mobile cold start).
 */
export async function waitUntilAuthHydrated(
  isAuthLoading: () => boolean,
  maxWaitMs = 16000,
  pollMs = 45,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (isAuthLoading() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return !isAuthLoading();
}

/**
 * After auth loading finishes, poll until a client token snapshot is available (mobile storage/hydration lag).
 * Callers must run {@link waitUntilAuthHydrated} first and reject clearly logged-out users before calling this.
 */
export async function waitUntilClientAuthToken(
  getToken: () => string | null,
  maxWaitMs = 6000,
  pollMs = 50,
): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (!getToken() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return Boolean(getToken());
}
