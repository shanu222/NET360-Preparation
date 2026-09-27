/**
 * Central Redis connection for caching and Socket.IO (@socket.io/redis-adapter) pub/sub.
 * Uses env vars only — never embed credentials in code.
 * If Redis is unreachable, the API continues without cache / without multi-instance Socket.IO.
 *
 * Connection lifecycle: one client per role for the process lifetime. Clients reconnect on their
 * own (bounded backoff, never give up) so a Redis restart or Railway private-DNS lag at boot does
 * not permanently detach the cache or the Socket.IO adapter. Callers only use a client while
 * `isReady`; otherwise they fall back to Mongo / local delivery.
 *
 * IMPORTANT: All REDIS_* settings are read lazily from process.env inside functions.
 * In ESM, static imports run before dotenv.config() in server/index.js; reading env at
 * module top level would miss values from .env and disable Redis permanently.
 */
import { createClient } from 'redis';

const PLACEHOLDER_REDIS_HOST = 'your-redis-host';

/** Per-attempt TCP connect timeout for the redis client socket. */
const CACHE_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CACHE_CONNECT_TIMEOUT_MS || 2_000);
/** How long the first cache lookup waits for Redis before falling back to Mongo. */
const CACHE_FIRST_USE_WAIT_MS = CACHE_CONNECT_TIMEOUT_MS;
/** How long Socket.IO startup waits for the pub/sub pair before using the in-memory adapter. */
const SOCKET_ADAPTER_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_SOCKET_ADAPTER_CONNECT_TIMEOUT_MS || 15_000);
const REDIS_RECONNECT_MAX_DELAY_MS = 5_000;
/** Cap queued commands while disconnected so an outage cannot grow memory without bound. */
const REDIS_COMMANDS_QUEUE_MAX_LENGTH = 5_000;
const REDIS_ERROR_LOG_INTERVAL_MS = 60_000;

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

/**
 * Never give up: returning an Error here closes the client for good, which is what used to detach
 * the Socket.IO adapter after a short Redis blip. Linear backoff capped at 5s with jitter.
 */
function reconnectStrategy(retries) {
  const base = Math.min(200 + retries * 200, REDIS_RECONNECT_MAX_DELAY_MS);
  return base + Math.floor(Math.random() * 200);
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    if (typeof timer?.unref === 'function') timer.unref();
  });
}

/**
 * Log connection errors at most once a minute per client; the driver retries on its own and
 * a long outage would otherwise flood Railway logs.
 * @param {import('redis').RedisClientType} client
 * @param {string} label
 */
function attachRedisClientHandlers(client, label) {
  let lastErrorLoggedAt = 0;
  let suppressed = 0;
  client.on('error', (err) => {
    const now = Date.now();
    if (now - lastErrorLoggedAt < REDIS_ERROR_LOG_INTERVAL_MS) {
      suppressed += 1;
      return;
    }
    const suffix = suppressed ? ` (+${suppressed} similar suppressed)` : '';
    console.error(`[redis:${label}] Client error${suffix}:`, err?.message || err);
    lastErrorLoggedAt = now;
    suppressed = 0;
  });
  client.on('ready', () => {
    console.log(`[redis:${label}] connected successfully`);
  });
  client.on('end', () => {
    console.warn(`[redis:${label}] connection closed`);
  });
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
      commandsQueueMaxLength: REDIS_COMMANDS_QUEUE_MAX_LENGTH,
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
    commandsQueueMaxLength: REDIS_COMMANDS_QUEUE_MAX_LENGTH,
    socket,
  };
}

/** @type {import('redis').RedisClientType | null} */
let mainClient = null;
/** @type {Promise<import('redis').RedisClientType | null> | null} */
let mainConnectPromise = null;

/**
 * Shared client for GET/SET cache operations (not used for Socket.IO adapter).
 * Created once per process; the driver reconnects it in the background. Returns null (Mongo
 * fallback) whenever the client is not ready, so request handlers never wait on Redis.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
export async function getRedisMain() {
  if (!isRedisConfigured()) return null;
  if (mainClient) return mainClient.isReady ? mainClient : null;
  if (mainConnectPromise) return mainConnectPromise;

  mainConnectPromise = (async () => {
    const opts = buildClientOptions();
    if (!opts) return null;

    const client = createClient(opts);
    attachRedisClientHandlers(client, 'cache');
    mainClient = client;

    // connect() keeps retrying per reconnectStrategy; only give the first caller a short wait.
    client.connect().catch((err) => {
      console.error('[redis:cache] connection failed', err?.message || err);
      if (mainClient === client) mainClient = null;
      try {
        client.destroy();
      } catch {
        /* ignore */
      }
    });
    await Promise.race([
      new Promise((resolve) => client.once('ready', resolve)),
      sleep(CACHE_FIRST_USE_WAIT_MS),
    ]);

    if (!client.isReady) {
      console.warn(`[redis:cache] not ready after ${CACHE_FIRST_USE_WAIT_MS}ms — using Mongo until Redis connects.`);
      return null;
    }
    return client;
  })().finally(() => {
    mainConnectPromise = null;
  });

  return mainConnectPromise;
}

/** True when cache/commands can run */
export function isRedisReady() {
  return Boolean(mainClient?.isReady);
}

/** Single in-process attempt: dedicated pub/sub pair for Socket.IO (must not share with blocking commands). */
/** @type {Promise<{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null> | null} */
let socketAdapterPairPromise = null;
/** @type {{ pub: import('redis').RedisClientType, sub: import('redis').RedisClientType } | null} */
let socketAdapterPair = null;

async function connectSocketIoAdapterPairOnce() {
  if (!isRedisConfigured()) return null;

  // Build options separately per client: they contain the reconnectStrategy function, which
  // structuredClone() cannot copy (it used to throw here and silently skip the adapter).
  const pubOpts = buildClientOptions();
  const subOpts = buildClientOptions();
  if (!pubOpts || !subOpts) {
    console.warn('[redis] Socket.IO adapter skipped: could not build Redis client options (check REDIS_HOST / REDIS_URL).');
    return null;
  }

  const pub = createClient(pubOpts);
  const sub = createClient(subOpts);
  attachRedisClientHandlers(pub, 'socket.io-pub');
  attachRedisClientHandlers(sub, 'socket.io-sub');

  const connectAll = Promise.all([pub.connect(), sub.connect()]).catch(() => {
    /* surfaced via the 'error' handlers; readiness is checked below */
  });

  // The adapter must be chosen before Socket.IO starts accepting connections, so wait a bounded
  // time (Railway private DNS can take a few seconds after boot) and otherwise stay in-memory.
  await Promise.race([connectAll, sleep(SOCKET_ADAPTER_CONNECT_TIMEOUT_MS)]);

  if (!pub.isReady || !sub.isReady) {
    console.warn(`[redis] Socket.IO adapter skipped: Redis not reachable within ${SOCKET_ADAPTER_CONNECT_TIMEOUT_MS}ms — using in-memory adapter for this process.`);
    try {
      pub.destroy();
    } catch {
      /* ignore */
    }
    try {
      sub.destroy();
    } catch {
      /* ignore */
    }
    return null;
  }

  socketAdapterPair = { pub, sub };
  return socketAdapterPair;
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

/** True when the Socket.IO Redis adapter is attached and both pub/sub clients are connected. */
export function isSocketIoRedisAdapterReady() {
  return Boolean(socketAdapterPair?.pub?.isReady && socketAdapterPair?.sub?.isReady);
}
