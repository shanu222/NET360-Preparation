/**
 * JSON cache helpers with Redis; transparent no-op when Redis is down.
 * Cache operations never block HTTP handlers — fail fast and fall back to Mongo.
 */
import { getRedisMain } from '../services/redis.js';

const PREFIX = String(process.env.REDIS_CACHE_PREFIX || 'net360:').trim() || 'net360:';
const CACHE_OP_TIMEOUT_MS = Number(process.env.REDIS_CACHE_OP_TIMEOUT_MS || 800);

function withCacheOpTimeout(promise, timeoutMs = CACHE_OP_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

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
    const r = await withCacheOpTimeout(getRedisMain());
    if (!r?.isOpen) return null;
    const raw = await withCacheOpTimeout(r.get(key));
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
    const r = await withCacheOpTimeout(getRedisMain());
    if (!r?.isOpen) return;
    const ttl = Math.max(5, Math.min(Number(ttlSec) || 60, 3600));
    await withCacheOpTimeout(r.set(key, JSON.stringify(value), { EX: ttl }));
  } catch {
    // ignore
  }
}

export async function cacheDel(key) {
  try {
    const r = await withCacheOpTimeout(getRedisMain());
    if (!r?.isOpen) return;
    await withCacheOpTimeout(r.del(key));
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
