const FALLBACK = 'Could not start your test. Please try again.';
const MAX_LEN = 320;

/**
 * Prefer API/server error text from failed test start; safe length for toast UI.
 */
export function formatTestStartFailureToast(error: unknown): string {
  if (!(error instanceof Error)) return FALLBACK;
  const msg = String(error.message || '').trim();
  if (!msg) return FALLBACK;
  if (msg.length <= MAX_LEN) return msg;
  return `${msg.slice(0, MAX_LEN)}…`;
}
