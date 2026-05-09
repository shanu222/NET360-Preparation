/**
 * JSON cache helpers with Redis; transparent no-op when Redis is down.
 */
import { getRedisMain } from '../services/redis.js';

const PREFIX = String(process.env.REDIS_CACHE_PREFIX || 'net360:').trim() || 'net360:';

export function cacheKey(suffix) {
  return `${PREFIX}${String(suffix || '').replace(/^\:+/, '')}`;
}

/**
 * @template T
 * @param {string} key
 * @returns {Promise<T | null>}
 */
export async function cacheGetJson(key) {
  try {
    const r = await getRedisMain();
    if (!r?.isOpen) return null;
    const raw = await r.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} key
 * @param {unknown} value
 * @param {number} ttlSec
 */
export async function cacheSetJson(key, value, ttlSec) {
  try {
    const r = await getRedisMain();
    if (!r?.isOpen) return;
    const ttl = Math.max(5, Math.min(Number(ttlSec) || 60, 3600));
    await r.set(key, JSON.stringify(value), { EX: ttl });
  } catch {
    // ignore
  }
}

export async function cacheDel(key) {
  try {
    const r = await getRedisMain();
    if (!r?.isOpen) return;
    await r.del(key);
  } catch {
    // ignore
  }
}

/** Invalidate community leaderboard cache(s) */
export async function invalidateCommunityLeaderboardCache() {
  await Promise.all([
    cacheDel(cacheKey('community:leaderboard:weekly')),
    cacheDel(cacheKey('community:leaderboard:monthly')),
  ]);
}

export async function invalidateQuizLeaderboardCache() {
  await cacheDel(cacheKey('community:quiz-leaderboard'));
}

/** Bust cached subscription snapshot for a student (Redis). */
export async function invalidateUserSubscriptionCache(userId) {
  const id = String(userId || '').trim();
  if (!id) return;
  await cacheDel(cacheKey(`substate:${id}`));
}
