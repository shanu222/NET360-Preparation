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
