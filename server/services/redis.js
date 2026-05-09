/**
 * Central Redis connection for caching and Socket.IO pub/sub.
 * Uses env vars only — never embed credentials in code.
 * If Redis is unreachable, the API continues without cache/adapter (degraded mode).
 */
import { createClient } from 'redis';

const PLACEHOLDER_REDIS_HOST = 'your-redis-host';

function normalizeRedisUrl(url) {
  const u = String(url || '').trim();
  if (!u || u.includes(PLACEHOLDER_REDIS_HOST)) return '';
  return u;
}

function normalizeRedisHost(host) {
  const h = String(host || '').trim();
  if (!h || h === PLACEHOLDER_REDIS_HOST) return '';
  return h;
}

const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL);
const REDIS_HOST = normalizeRedisHost(process.env.REDIS_HOST);
const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
const REDIS_USERNAME = String(process.env.REDIS_USERNAME || '').trim() || undefined;
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || '').trim() || undefined;

export const REDIS_CONFIGURED = Boolean(REDIS_URL || REDIS_HOST);

const rawRedisHost = String(process.env.REDIS_HOST || '').trim();
const rawRedisUrl = String(process.env.REDIS_URL || '').trim();
if ((rawRedisHost === PLACEHOLDER_REDIS_HOST || rawRedisUrl.includes(PLACEHOLDER_REDIS_HOST)) && (rawRedisHost || rawRedisUrl)) {
  console.warn('[redis] Ignoring placeholder host (your-redis-host) — set real REDIS_HOST/REDIS_URL or remove those lines.');
}

let mainClient = null;
/** @type {Promise<import('redis').RedisClientType | null> | null} */
let connectPromise = null;

function reconnectStrategy(retries) {
  if (retries > 50) {
    console.warn('[redis] Giving up reconnect after 50 attempts');
    return new Error('Redis reconnect limit');
  }
  return Math.min(500 + retries * 200, 10_000);
}

function buildClientOptions() {
  if (REDIS_URL) {
    return {
      url: REDIS_URL,
      socket: { reconnectStrategy },
    };
  }
  if (!REDIS_HOST) return null;
  return {
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      host: REDIS_HOST,
      port: REDIS_PORT,
      reconnectStrategy,
    },
  };
}

/**
 * Shared client for GET/SET cache operations.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedisMain() {
  if (!REDIS_CONFIGURED) return null;
  if (mainClient?.isOpen) return mainClient;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    try {
      const opts = buildClientOptions();
      if (!opts) return null;
      const client = createClient(opts);
      client.on('error', (err) => {
        console.error('[redis] Client error:', err?.message || err);
      });
      client.on('reconnecting', () => {
        console.warn('[redis] Reconnecting…');
      });
      await client.connect();
      mainClient = client;
      console.log('[redis] Main client connected');
      return client;
    } catch (err) {
      console.error('[redis] Connect failed (cache disabled):', err?.message || err);
      mainClient = null;
      return null;
    } finally {
      connectPromise = null;
    }
  })();

  return connectPromise;
}

/** True when cache/commands can run */
export function isRedisReady() {
  return Boolean(mainClient?.isOpen);
}

/**
 * Dedicated pub/sub pair for Socket.IO adapter (must not share with blocking commands).
 * @returns {Promise<{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null>}
 */
export async function createSocketAdapterClients() {
  if (!REDIS_CONFIGURED) return null;
  const opts = buildClientOptions();
  if (!opts) return null;

  try {
    const pub = createClient(opts);
    const sub = pub.duplicate();
    pub.on('error', (e) => console.error('[redis] socket pub error:', e?.message || e));
    sub.on('error', (e) => console.error('[redis] socket sub error:', e?.message || e));
    await Promise.all([pub.connect(), sub.connect()]);
    console.log('[redis] Socket.IO adapter pub/sub connected');
    return { pub, sub };
  } catch (err) {
    console.error('[redis] Socket adapter connect failed:', err?.message || err);
    return null;
  }
}
