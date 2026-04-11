import { apiRequest } from './api';

/** Must match `Community.tsx` cache keys / TTL so preloads hydrate the same localStorage entries. */
const COMMUNITY_CACHE_PREFIX = 'net360:community-cache:';
const COMMUNITY_CACHE_TTL_MS = 45_000;

type CommunityCacheEntry = {
  expiresAt: number;
  payload: unknown;
};

function writeCachedPayload(path: string, payload: unknown, ttlMs = COMMUNITY_CACHE_TTL_MS) {
  const entry: CommunityCacheEntry = {
    expiresAt: Date.now() + Math.max(1_000, Math.floor(ttlMs)),
    payload,
  };
  try {
    localStorage.setItem(`${COMMUNITY_CACHE_PREFIX}${path}`, JSON.stringify(entry));
  } catch {
    // Ignore quota / private mode.
  }
}

const PRELOAD_PATHS = [
  '/api/community/profile',
  '/api/community/connections/requests',
  '/api/community/connections',
  '/api/community/discussion-rooms',
  '/api/community/study-partners',
  '/api/community/leaderboard?period=weekly',
  '/api/community/achievements',
  '/api/community/quiz-challenges',
  '/api/community/quiz-leaderboard',
] as const;

/**
 * Warms the same localStorage cache the Community page reads before first paint.
 * Fire-and-forget; safe to call on sidebar click before navigation.
 */
export function preloadCommunityCache(token: string | null): void {
  if (!token) return;

  void (async () => {
    await Promise.allSettled(
      PRELOAD_PATHS.map(async (path) => {
        try {
          const payload = await apiRequest<unknown>(path, {}, token);
          writeCachedPayload(path, payload);
        } catch {
          // Best-effort preload only.
        }
      }),
    );
  })();
}
