import { audienceFriendlyError } from './userToast';

const FALLBACK = 'Could not start your test. Please try again.';

export function formatTestStartFailureToast(error: unknown): string {
  return audienceFriendlyError(error, FALLBACK);
}
