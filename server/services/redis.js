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
import dns from 'node:dns/promises';

const PLACEHOLDER_REDIS_HOST = 'your-redis-host';

const CACHE_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CACHE_CONNECT_TIMEOUT_MS || 2_000);
const REDIS_CIRCUIT_OPEN_MS = Number(process.env.REDIS_CIRCUIT_OPEN_MS || 5 * 60 * 1000);
const REDIS_DNS_PROBE_TIMEOUT_MS = Number(process.env.REDIS_DNS_PROBE_TIMEOUT_MS || 1_500);

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
  connectTimeout: CACHE_CONNECT_TIMEOUT_MS,
};

let loggedPlaceholder = false;
let loggedAutoTls = false;
let loggedRedisDisabled = false;
let redisCircuitOpenUntil = 0;
let redisHostProbePromise = null;
/** After DNS/connect failure, skip Redis until process restart or env fix. */
let redisDisabledForProcess = false;

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

function redisHostFromEnv() {
  const { REDIS_URL, REDIS_HOST } = readRedisEnvFromProcess();
  if (REDIS_HOST) return REDIS_HOST;
  if (!REDIS_URL) return '';
  try {
    return new URL(REDIS_URL).hostname || '';
  } catch {
    return '';
  }
}

function disableRedisGracefully(reason, errorMessage = '') {
  redisDisabledForProcess = true;
  redisCircuitOpenUntil = Date.now() + REDIS_CIRCUIT_OPEN_MS;
  mainClient = null;
  mainConnectPromise = null;
  if (!loggedRedisDisabled) {
    loggedRedisDisabled = true;
    console.warn('[redis] disabled — using Mongo-only fallback.', {
      reason,
      error: errorMessage || undefined,
    });
  }
}

function openRedisCircuit(reason, errorMessage = '') {
  redisCircuitOpenUntil = Date.now() + REDIS_CIRCUIT_OPEN_MS;
  mainClient = null;
  mainConnectPromise = null;
  console.warn('[redis] circuit open — cache skipped temporarily.', {
    reason,
    error: errorMessage || undefined,
    retryAfterMs: REDIS_CIRCUIT_OPEN_MS,
  });
}

async function ensureRedisHostResolvable() {
  if (redisHostProbePromise) return redisHostProbePromise;

  redisHostProbePromise = (async () => {
    const host = redisHostFromEnv();
    if (!host) return true;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host === '127.0.0.1') {
      return true;
    }
    try {
      await Promise.race([
        dns.lookup(host),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('DNS probe timeout')), REDIS_DNS_PROBE_TIMEOUT_MS);
        }),
      ]);
      return true;
    } catch (error) {
      disableRedisGracefully('host_unresolvable', error?.message || String(error));
      return false;
    } finally {
      redisHostProbePromise = null;
    }
  })();

  return redisHostProbePromise;
}

/** Whether Redis host or URL is configured (after .env load). */
export function isRedisConfigured() {
  if (redisDisabledForProcess) return false;
  const { REDIS_URL, REDIS_HOST } = readRedisEnvFromProcess();
  return Boolean(REDIS_URL || REDIS_HOST);
}

function reconnectStrategy(retries) {
  if (retries > 3) {
    return new Error('Redis reconnect limit');
  }
  return Math.min(200 + retries * 100, 1_000);
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
 * Never blocks request handlers for long — fails fast and opens a circuit on errors.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedisMain() {
  if (redisDisabledForProcess) return null;
  if (Date.now() < redisCircuitOpenUntil) return null;
  if (!isRedisConfigured()) return null;
  if (mainClient?.isOpen) return mainClient;
  if (mainConnectPromise) return mainConnectPromise;

  mainConnectPromise = (async () => {
    try {
      const hostOk = await ensureRedisHostResolvable();
      if (!hostOk) return null;

      const opts = buildClientOptions();
      if (!opts) return null;
      const client = createClient(opts);
      client.on('error', (err) => {
        console.error('[redis] Client error:', err?.message || err);
        openRedisCircuit('client_error', err?.message || String(err));
      });
      client.on('reconnecting', () => {
        console.warn('[redis] Reconnecting…');
      });

      await Promise.race([
        client.connect(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`connect timeout after ${CACHE_CONNECT_TIMEOUT_MS}ms`)), CACHE_CONNECT_TIMEOUT_MS);
        }),
      ]);

      mainClient = client;
      redisCircuitOpenUntil = 0;
      console.log('[redis] connected successfully');
      return client;
    } catch (err) {
      const message = err?.message || String(err);
      console.error('[redis] connection failed', message);
      if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout|getaddrinfo/i.test(message)) {
        disableRedisGracefully('connect_failed', message);
      } else {
        openRedisCircuit('connect_failed', message);
      }
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
  return Boolean(mainClient?.isOpen) && !redisDisabledForProcess && Date.now() >= redisCircuitOpenUntil;
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

  const hostOk = await ensureRedisHostResolvable();
  if (!hostOk) return null;

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
    await Promise.race([
      Promise.all([pub.connect(), sub.connect()]),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Socket.IO adapter connect timeout after ${CACHE_CONNECT_TIMEOUT_MS}ms`)), CACHE_CONNECT_TIMEOUT_MS);
      }),
    ]);
    console.log('[redis] connected successfully');
    return { pub, sub };
  } catch (err) {
    console.error('[redis] connection failed', err?.message || err);
    openRedisCircuit('socket_adapter_connect_failed', err?.message || String(err));
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
