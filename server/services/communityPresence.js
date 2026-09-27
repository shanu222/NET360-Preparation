/**
 * Community presence store.
 *
 * Redis (shared by every API instance) is the source of truth:
 *   community:presence:{userId}   JSON record, expires PRESENCE_TTL_MS after the last heartbeat
 *   community:presence:index      sorted set userId -> lastSeen (ms), used to list and sweep
 *
 * A record only exists while the client keeps sending heartbeats, so a closed tab, a lost
 * network or an expired session drops out on its own. When Redis is not reachable the same
 * semantics run on a per-process Map so Community keeps working on a single instance.
 */
import { getRedisMain } from './redis.js';

export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_TTL_MS = 50_000;

const KEY_PREFIX = 'community:presence:';
const INDEX_KEY = 'community:presence:index';
const REDIS_OP_TIMEOUT_MS = 1_500;

const ACTIVITY_MAX_LENGTH = 40;
const SUBJECT_MAX_LENGTH = 80;

/** @type {Map<string, PresenceRecord>} */
const memoryStore = new Map();

/**
 * @typedef {object} PresenceRecord
 * @property {string} userId
 * @property {'online'|'away'} status
 * @property {string} activity
 * @property {string} studyingSubject
 * @property {string} displayName
 * @property {string} username
 * @property {number} lastSeen
 */

function keyFor(userId) {
  return `${KEY_PREFIX}${userId}`;
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('redis_timeout')), REDIS_OP_TIMEOUT_MS)),
  ]);
}

async function redisClient() {
  try {
    const client = await withTimeout(getRedisMain());
    return client?.isReady ? client : null;
  } catch {
    return null;
  }
}

function parseRecord(raw) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && value.userId ? value : null;
  } catch {
    return null;
  }
}

function isLive(record, now = Date.now()) {
  return Boolean(record) && now - Number(record.lastSeen || 0) <= PRESENCE_TTL_MS;
}

export function sanitizePresenceText(value, maxLength) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

async function readRecord(userId) {
  const client = await redisClient();
  if (client) {
    try {
      return parseRecord(await withTimeout(client.get(keyFor(userId))));
    } catch {
      // fall through to memory
    }
  }
  const record = memoryStore.get(userId) || null;
  return isLive(record) ? record : null;
}

/**
 * Create/refresh the caller's presence record (called only with the authenticated user id).
 * @param {string} userId
 * @param {{ away?: boolean, activity?: string, studyingSubject?: string, displayName?: string, username?: string }} [patch]
 * @returns {Promise<{ record: PresenceRecord, previous: PresenceRecord | null }>}
 */
export async function upsertPresence(userId, patch = {}) {
  const uid = String(userId || '').trim();
  const now = Date.now();
  const previous = uid ? await readRecord(uid) : null;
  const record = {
    userId: uid,
    status: patch.away === undefined ? (previous?.status || 'online') : (patch.away ? 'away' : 'online'),
    activity: patch.activity === undefined
      ? String(previous?.activity || '')
      : sanitizePresenceText(patch.activity, ACTIVITY_MAX_LENGTH),
    studyingSubject: patch.studyingSubject === undefined
      ? String(previous?.studyingSubject || '')
      : sanitizePresenceText(patch.studyingSubject, SUBJECT_MAX_LENGTH),
    displayName: patch.displayName === undefined
      ? String(previous?.displayName || '')
      : sanitizePresenceText(patch.displayName, 80),
    username: patch.username === undefined
      ? String(previous?.username || '')
      : sanitizePresenceText(patch.username, 40),
    lastSeen: now,
  };
  if (!uid) return { record, previous: null };

  memoryStore.set(uid, record);
  const client = await redisClient();
  if (client) {
    try {
      await withTimeout(
        client.multi()
          .set(keyFor(uid), JSON.stringify(record), { PX: PRESENCE_TTL_MS })
          .zAdd(INDEX_KEY, { score: now, value: uid })
          .exec(),
      );
    } catch (error) {
      console.warn('[presence] redis write failed:', error?.message || error);
    }
  }
  return { record, previous };
}

/**
 * Remove presence immediately (logout, last socket closed).
 * @returns {Promise<boolean>} true when a live record existed
 */
export async function removePresence(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  const hadMemory = isLive(memoryStore.get(uid));
  memoryStore.delete(uid);
  const client = await redisClient();
  if (client) {
    try {
      const [deleted] = await withTimeout(client.multi().del(keyFor(uid)).zRem(INDEX_KEY, uid).exec());
      return Number(deleted || 0) > 0;
    } catch {
      return hadMemory;
    }
  }
  return hadMemory;
}

/** @returns {Promise<PresenceRecord[]>} every live record across all API instances */
export async function listPresence() {
  const now = Date.now();
  const client = await redisClient();
  if (client) {
    try {
      const ids = await withTimeout(client.zRangeByScore(INDEX_KEY, now - PRESENCE_TTL_MS, '+inf'));
      if (!ids.length) return [];
      const raws = await withTimeout(client.mGet(ids.map(keyFor)));
      return raws.map(parseRecord).filter(Boolean);
    } catch {
      // fall through to memory
    }
  }
  return Array.from(memoryStore.values()).filter((record) => isLive(record, now));
}

/**
 * Drop records whose heartbeat stopped. Safe to run on every instance: ZREM is atomic, so
 * exactly one instance reports each expired user.
 * @returns {Promise<string[]>} user ids that just went offline
 */
export async function sweepExpiredPresence() {
  const now = Date.now();
  const expired = [];
  const client = await redisClient();
  if (client) {
    try {
      const ids = await withTimeout(client.zRangeByScore(INDEX_KEY, '-inf', now - PRESENCE_TTL_MS));
      for (const id of ids) {
        const removed = await withTimeout(client.zRem(INDEX_KEY, id));
        if (Number(removed) !== 1) continue;
        const live = parseRecord(await withTimeout(client.get(keyFor(id))));
        if (live) {
          await withTimeout(client.zAdd(INDEX_KEY, { score: Number(live.lastSeen) || now, value: id }));
        } else {
          expired.push(id);
        }
      }
      for (const [id, record] of memoryStore) {
        if (!isLive(record, now)) memoryStore.delete(id);
      }
      return expired;
    } catch {
      // fall through to memory
    }
  }
  for (const [id, record] of memoryStore) {
    if (!isLive(record, now)) {
      memoryStore.delete(id);
      expired.push(id);
    }
  }
  return expired;
}
