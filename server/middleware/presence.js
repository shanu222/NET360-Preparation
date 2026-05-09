/**
 * Presence / real-time helpers (Redis key naming & TTL hints).
 * Core presence state remains in-process + MongoDB; Redis used for cache and pub/sub via Socket.IO.
 */
import { cacheKey } from '../utils/cache.js';

export const PRESENCE_REDIS_HINT_TTL_SEC = 30;

export function presenceUserKey(userId) {
  return cacheKey(`presence:user:${String(userId || '').trim()}`);
}
