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

let listenersAttached = false;
let reconnectTimer = null;
let reconnectInFlight = false;
let lastUri = '';

function isConnected() {
  return mongoose.connection.readyState === 1;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
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

function scheduleReconnect() {
  if (!lastUri || reconnectTimer || reconnectInFlight || isConnected()) {
    return;
  }

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;

    if (!lastUri || reconnectInFlight || isConnected()) {
      return;
    }

    reconnectInFlight = true;
    try {
      console.warn('[mongo] Attempting reconnect...');
      await mongoose.connect(lastUri, MONGO_CONNECT_OPTIONS);
      attachMongoClientListeners();
      console.log('[mongo] Reconnected successfully.');
    } catch (error) {
      const message = String(error?.message || error || '').trim();
      console.error(`[mongo] Reconnect failed: ${message}`);
      scheduleReconnect();
    } finally {
      reconnectInFlight = false;
    }
  }, 5_000);

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
    console.log('Mongo connected');
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
    scheduleReconnect();
  });
}

export async function connectMongo(uri) {
  if (!uri || !String(uri).trim()) {
    console.error('[mongo] failed: MONGODB_URI / DATABASE_URL / MONGO_URI is not set.');
    return mongoose.connection;
  }

  if (isConnected()) {
    return mongoose.connection;
  }

  lastUri = uri;
  mongoose.set('strictQuery', true);
  attachConnectionListeners();

  try {
    await mongoose.connect(uri, MONGO_CONNECT_OPTIONS);
    attachMongoClientListeners();
    console.log('[mongo] connected (mongoose.connect resolved)');
  } catch (error) {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '').trim();
    console.error('[mongo] failed:', `${name}: ${message}`);
    console.warn('[mongo] Server will continue running and retry MongoDB connection in the background.');
    scheduleReconnect();
  }

  return mongoose.connection;
}
