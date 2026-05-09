/**
 * Central Redis connection for caching and Socket.IO (@socket.io/redis-adapter) pub/sub.
 * Uses env vars only — never embed credentials in code.
 * If Redis is unreachable, the API continues without cache / without multi-instance Socket.IO.
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
const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || '').trim() || undefined;
/** Redis Cloud / ACL: when password is set and username omitted, default user is standard. */
const REDIS_USERNAME = String(process.env.REDIS_USERNAME || '').trim() || (REDIS_PASSWORD ? 'default' : undefined);
const REDIS_USE_TLS =
  String(process.env.REDIS_TLS || process.env.REDIS_USE_TLS || '').toLowerCase() === 'true'
  || REDIS_URL.startsWith('rediss://');

export const REDIS_CONFIGURED = Boolean(REDIS_URL || REDIS_HOST);

const rawRedisHost = String(process.env.REDIS_HOST || '').trim();
const rawRedisUrl = String(process.env.REDIS_URL || '').trim();
if ((rawRedisHost === PLACEHOLDER_REDIS_HOST || rawRedisUrl.includes(PLACEHOLDER_REDIS_HOST)) && (rawRedisHost || rawRedisUrl)) {
  console.warn('[redis] Ignoring placeholder host (your-redis-host) — set real REDIS_HOST/REDIS_URL or remove those lines.');
}

const SOCKET_OPTIONS = {
  connectTimeout: 15_000,
};

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
      socket: {
        ...SOCKET_OPTIONS,
        reconnectStrategy,
      },
    };
  }
  if (!REDIS_HOST) return null;
  return {
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket: {
      ...SOCKET_OPTIONS,
      host: REDIS_HOST,
      port: REDIS_PORT,
      reconnectStrategy,
      ...(REDIS_USE_TLS ? { tls: true } : {}),
    },
  };
}

let mainClient = null;
/** @type {Promise<import('redis').RedisClientType | null> | null} */
let mainConnectPromise = null;

/**
 * Shared client for GET/SET cache operations (not used for Socket.IO adapter).
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedisMain() {
  if (!REDIS_CONFIGURED) return null;
  if (mainClient?.isOpen) return mainClient;
  if (mainConnectPromise) return mainConnectPromise;

  mainConnectPromise = (async () => {
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
      console.log('[redis] connected successfully');
      return client;
    } catch (err) {
      console.error('[redis] connection failed', err?.message || err);
      mainClient = null;
      return null;
    } finally {
      mainConnectPromise = null;
    }
  })();

  return mainConnectPromise;
}

/** True when cache/commands can run */
export function isRedisReady() {
  return Boolean(mainClient?.isOpen);
}

/** Single in-process attempt: dedicated pub/sub pair for Socket.IO (must not share with blocking commands). */
/** @type {Promise<{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null> | null} */
let socketAdapterPairPromise = null;

async function connectSocketIoAdapterPairOnce() {
  const opts = buildClientOptions();
  if (!opts) return null;

  let pub;
  let sub;
  try {
    pub = createClient(opts);
    sub = pub.duplicate();
    const onErr = (e) => console.error('[redis] Client error:', e?.message || e);
    pub.on('error', onErr);
    sub.on('error', onErr);
    pub.on('reconnecting', () => console.warn('[redis] Reconnecting…'));
    sub.on('reconnecting', () => console.warn('[redis] Reconnecting…'));
    await Promise.all([pub.connect(), sub.connect()]);
    console.log('[redis] connected successfully');
    return { pub, sub };
  } catch (err) {
    console.error('[redis] connection failed', err?.message || err);
    try {
      sub?.disconnect?.();
    } catch {
      /* ignore */
    }
    try {
      pub?.disconnect?.();
    } catch {
      /* ignore */
    }
    return null;
  }
}

/**
 * Lazily creates one pub + one sub client for @socket.io/redis-adapter (duplicate() shares connection options).
 * @returns {Promise<{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null>}
 */
export function getSocketIoAdapterRedisClients() {
  if (!REDIS_CONFIGURED) return Promise.resolve(null);
  if (!socketAdapterPairPromise) {
    socketAdapterPairPromise = connectSocketIoAdapterPairOnce();
  }
  return socketAdapterPairPromise;
}
