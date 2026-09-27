import mongoose from 'mongoose';

const serverSelectionTimeoutMS = Math.min(
  120_000,
  Math.max(5_000, Number.parseInt(String(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '20000'), 10) || 20_000),
);

const MONGO_CONNECT_OPTIONS = {
  minPoolSize: Math.min(20, Math.max(1, Number.parseInt(String(process.env.MONGODB_MIN_POOL_SIZE || '2'), 10) || 2)),
  maxPoolSize: Math.min(100, Math.max(2, Number.parseInt(String(process.env.MONGODB_MAX_POOL_SIZE || '20'), 10) || 20)),
  maxIdleTimeMS: 30_000,
  socketTimeoutMS: Math.min(120_000, Math.max(10_000, Number.parseInt(String(process.env.MONGODB_SOCKET_TIMEOUT_MS || '45000'), 10) || 45_000)),
  serverSelectionTimeoutMS,
  connectTimeoutMS: Math.min(60_000, Math.max(5_000, Number.parseInt(String(process.env.MONGODB_CONNECT_TIMEOUT_MS || '15000'), 10) || 15_000)),
  heartbeatFrequencyMS: 10_000,
  maxConnecting: 5,
  autoIndex: process.env.NODE_ENV !== 'production',
};

/** Retry quickly when an explicit connect() attempt failed (no live client to preserve). */
const RECONNECT_DELAY_AFTER_FAILURE_MS = 5_000;
/**
 * After a `disconnected` event the MongoDB driver (SDAM) reconnects on its own and Mongoose emits
 * `reconnected`. Only rebuild the client if it is still disconnected after this grace period —
 * calling mongoose.connect() on every blip creates a new MongoClient without closing the old one.
 */
const RECONNECT_GRACE_AFTER_DISCONNECT_MS = 30_000;
const CLIENT_CLOSE_TIMEOUT_MS = 5_000;

let listenersAttached = false;
let reconnectTimer = null;
let reconnectDueAt = 0;
let reconnectInFlight = false;
let lastUri = '';

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function isConnectedOrConnecting() {
  const state = mongoose.connection.readyState;
  return state === 1 || state === 2;
}

/**
 * Close the current MongoClient before mongoose.connect() replaces it. Mongoose's openUri() always
 * constructs a new MongoClient and overwrites connection.client, so without this the previous
 * client (pool + replica-set monitors) stays open and keeps mutating the shared readyState.
 */
async function closeExistingClient() {
  let client = null;
  try {
    client = mongoose.connection.getClient?.();
  } catch {
    client = null;
  }
  if (!client) {
    return;
  }

  try {
    // Detach Mongoose's topology listeners so the retired client can no longer flip readyState.
    client.removeAllListeners('topologyDescriptionChanged');
    client.removeAllListeners('serverDescriptionChanged');
    client.removeAllListeners('serverHeartbeatSucceeded');
    await Promise.race([
      client.close(true),
      new Promise((resolve) => {
        const timer = setTimeout(resolve, CLIENT_CLOSE_TIMEOUT_MS);
        if (typeof timer?.unref === 'function') timer.unref();
      }),
    ]);
    console.warn('[mongo] Closed previous MongoDB client before reconnect.');
  } catch (error) {
    console.warn(`[mongo] Closing previous MongoDB client failed (continuing): ${String(error?.message || error)}`);
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectDueAt = 0;
}

function attachMongoClientListeners() {
  try {
    const client = mongoose.connection.getClient?.();
    if (!client || client.__net360MongoListenersAttached) {
      return;
    }

    client.__net360MongoListenersAttached = true;

    client.on('error', (error) => {
      const name = String(error?.name || 'Error');
      const message = String(error?.message || '').trim();
      console.error(`[mongo-client:error] ${name}: ${message}`);
    });

    client.on('close', () => {
      console.warn('[mongo-client:close] MongoDB client closed.');
    });
  } catch {
    // Client may not be available yet; connection-level listeners still handle reconnection.
  }
}

function scheduleReconnect(delayMs = RECONNECT_GRACE_AFTER_DISCONNECT_MS) {
  if (!lastUri || reconnectInFlight || isConnected()) {
    return;
  }

  const dueAt = Date.now() + delayMs;
  if (reconnectTimer) {
    // A failed explicit connect() asks for a fast retry; let it preempt a pending longer grace timer.
    if (dueAt >= reconnectDueAt) {
      return;
    }
    clearReconnectTimer();
  }

  reconnectDueAt = dueAt;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    reconnectDueAt = 0;

    // The driver may have recovered on its own (Mongoose emits `reconnected`), or a connect() may
    // already be in progress. Never stack a second MongoClient on top of either.
    if (!lastUri || reconnectInFlight || isConnectedOrConnecting()) {
      return;
    }

    reconnectInFlight = true;
    let failed = false;
    try {
      console.warn('[mongo] Still disconnected. Replacing MongoDB client...');
      await closeExistingClient();
      await mongoose.connect(lastUri, MONGO_CONNECT_OPTIONS);
      attachMongoClientListeners();
      console.log('[mongo] Reconnected successfully.');
    } catch (error) {
      failed = true;
      const message = String(error?.message || error || '').trim();
      console.error(`[mongo] Reconnect failed: ${message}`);
    } finally {
      reconnectInFlight = false;
    }
    if (failed) {
      scheduleReconnect(RECONNECT_DELAY_AFTER_FAILURE_MS);
    }
  }, delayMs);

  if (typeof reconnectTimer?.unref === 'function') {
    reconnectTimer.unref();
  }
}

function attachConnectionListeners() {
  if (listenersAttached) {
    return;
  }

  listenersAttached = true;

  mongoose.connection.on('connected', () => {
    clearReconnectTimer();
    const dbName = String(mongoose.connection.name || '').trim() || '(unknown)';
    const host = String(mongoose.connection.host || '').trim() || '(unknown)';
    console.log(`[mongo] connected db=${dbName} host=${host} collections=users(+mongoose models)`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] Disconnected. Scheduling reconnect.');
    scheduleReconnect();
  });

  mongoose.connection.on('reconnected', () => {
    clearReconnectTimer();
    console.log('[mongo] connected (reconnected)');
  });

  mongoose.connection.on('error', (error) => {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '').trim();
    console.error(`[mongo:error] ${name}: ${message}`);
    scheduleReconnect(RECONNECT_DELAY_AFTER_FAILURE_MS);
  });
}

export async function connectMongo(uri) {
  if (!uri || !String(uri).trim()) {
    console.error('[mongo] failed: MONGODB_URI / DATABASE_URL / MONGO_URI is not set.');
    return mongoose.connection;
  }

  if (isConnectedOrConnecting()) {
    return mongoose.connection;
  }

  lastUri = uri;
  mongoose.set('strictQuery', true);
  attachConnectionListeners();

  try {
    await mongoose.connect(uri, MONGO_CONNECT_OPTIONS);
    attachMongoClientListeners();
    const dbName = String(mongoose.connection.name || '').trim() || '(unknown)';
    const host = String(mongoose.connection.host || '').trim() || '(unknown)';
    console.log(`[mongo] connected (mongoose.connect resolved) db=${dbName} host=${host}`);
  } catch (error) {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '').trim();
    console.error('[mongo] failed:', `${name}: ${message}`);
    console.warn('[mongo] Server will continue running and retry MongoDB connection in the background.');
    scheduleReconnect(RECONNECT_DELAY_AFTER_FAILURE_MS);
  }

  return mongoose.connection;
}

const MONGO_READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getMongoHealth() {
  const readyState = mongoose.connection.readyState;
  return {
    configured: Boolean(lastUri),
    connected: readyState === 1,
    readyState,
    state: MONGO_READY_STATES[readyState] || 'unknown',
    dbName: String(mongoose.connection.name || '').trim() || null,
    host: String(mongoose.connection.host || '').trim() || null,
    reconnectScheduled: Boolean(reconnectTimer),
    reconnectInFlight,
  };
}
