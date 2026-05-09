/**
 * Central Redis connection for caching and Socket.IO (@socket.io/redis-adapter) pub/sub.
 * Uses env vars only — never embed credentials in code.
 * If Redis is unreachable, the API continues without cache / without multi-instance Socket.IO.
 *
 * IMPORTANT: All REDIS_* settings are read lazily from process.env inside functions.
 * In ESM, static imports run before dotenv.config() in server/index.js; reading env at
 * module top level would miss values from .env and disable Redis permanently.
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

function isTruthyEnv(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function isFalsyEnv(raw) {
  const s = String(raw ?? '').trim().toLowerCase();
  return s === 'false' || s === '0' || s === 'no' || s === 'off';
}

/** Redis Cloud / managed vendors that require TLS on the public endpoint. */
function hostLooksLikeManagedRedisTls(host) {
  const h = String(host || '').toLowerCase();
  return h.includes('redislabs.com') || h.includes('redis-cloud.com');
}

const SOCKET_OPTIONS = {
  connectTimeout: 15_000,
};

let loggedPlaceholder = false;
let loggedAutoTls = false;

/**
 * Fresh read of Redis-related env (call after dotenv has loaded).
 */
function readRedisEnvFromProcess() {
  const REDIS_URL = normalizeRedisUrl(process.env.REDIS_URL);
  const REDIS_HOST = normalizeRedisHost(process.env.REDIS_HOST);
  const REDIS_PORT = Number(process.env.REDIS_PORT || 6379);
  const REDIS_PASSWORD = String(process.env.REDIS_PASSWORD || '').trim() || undefined;
  const REDIS_USERNAME = String(process.env.REDIS_USERNAME || '').trim() || (REDIS_PASSWORD ? 'default' : undefined);

  const tlsEnvRaw = process.env.REDIS_TLS ?? process.env.REDIS_USE_TLS;
  let REDIS_USE_TLS = REDIS_URL.startsWith('rediss://');
  let redisTlsAuto = false;
  if (!REDIS_USE_TLS && REDIS_HOST) {
    if (isTruthyEnv(tlsEnvRaw)) {
      REDIS_USE_TLS = true;
    } else if (isFalsyEnv(tlsEnvRaw)) {
      REDIS_USE_TLS = false;
    } else if (hostLooksLikeManagedRedisTls(REDIS_HOST)) {
      REDIS_USE_TLS = true;
      redisTlsAuto = true;
    }
  }

  const rawRedisHost = String(process.env.REDIS_HOST || '').trim();
  const rawRedisUrl = String(process.env.REDIS_URL || '').trim();
  if (!loggedPlaceholder && (rawRedisHost === PLACEHOLDER_REDIS_HOST || rawRedisUrl.includes(PLACEHOLDER_REDIS_HOST)) && (rawRedisHost || rawRedisUrl)) {
    loggedPlaceholder = true;
    console.warn('[redis] Ignoring placeholder host (your-redis-host) — set real REDIS_HOST/REDIS_URL or remove those lines.');
  }
  if (!loggedAutoTls && redisTlsAuto) {
    loggedAutoTls = true;
    console.log('[redis] TLS enabled automatically for managed Redis host. Set REDIS_TLS=false to force plaintext.');
  }

  return {
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    REDIS_USERNAME,
    REDIS_USE_TLS,
  };
}

/** Whether Redis host or URL is configured (after .env load). */
export function isRedisConfigured() {
  const { REDIS_URL, REDIS_HOST } = readRedisEnvFromProcess();
  return Boolean(REDIS_URL || REDIS_HOST);
}

function reconnectStrategy(retries) {
  if (retries > 50) {
    console.warn('[redis] Giving up reconnect after 50 attempts');
    return new Error('Redis reconnect limit');
  }
  return Math.min(500 + retries * 200, 10_000);
}

/** @param {string} redisHost */
function buildTlsForSocket(redisHost) {
  /** @type {import('node:tls').ConnectionOptions} */
  const tls = {};
  if (redisHost) {
    tls.servername = redisHost;
  }
  if (isTruthyEnv(process.env.REDIS_TLS_INSECURE)) {
    tls.rejectUnauthorized = false;
  }
  return tls;
}

function buildClientOptions() {
  const {
    REDIS_URL,
    REDIS_HOST,
    REDIS_PORT,
    REDIS_PASSWORD,
    REDIS_USERNAME,
    REDIS_USE_TLS,
  } = readRedisEnvFromProcess();

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

  const tls = REDIS_USE_TLS ? buildTlsForSocket(REDIS_HOST) : undefined;
  const socket = {
    ...SOCKET_OPTIONS,
    host: REDIS_HOST,
    port: REDIS_PORT,
    reconnectStrategy,
    ...(tls ? { tls } : {}),
  };

  return {
    username: REDIS_USERNAME,
    password: REDIS_PASSWORD,
    socket,
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
  if (!isRedisConfigured()) return null;
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

function attachRedisClientHandlers(client) {
  const onErr = (e) => console.error('[redis] Client error:', e?.message || e);
  client.on('error', onErr);
  client.on('reconnecting', () => console.warn('[redis] Reconnecting…'));
}

async function connectSocketIoAdapterPairOnce() {
  if (!isRedisConfigured()) return null;

  const opts = buildClientOptions();
  if (!opts) {
    console.warn('[redis] Socket.IO adapter skipped: could not build Redis client options (check REDIS_HOST / REDIS_URL).');
    return null;
  }

  let pub;
  let sub;
  try {
    pub = createClient(structuredClone(opts));
    sub = createClient(structuredClone(opts));
    attachRedisClientHandlers(pub);
    attachRedisClientHandlers(sub);
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
 * Lazily creates one pub + one sub client for @socket.io/redis-adapter.
 * @returns {Promise<{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null>}
 */
export function getSocketIoAdapterRedisClients() {
  if (!isRedisConfigured()) return Promise.resolve(null);
  if (!socketAdapterPairPromise) {
    socketAdapterPairPromise = connectSocketIoAdapterPairOnce();
  }
  return socketAdapterPairPromise;
}
