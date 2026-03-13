import mongoose from 'mongoose';

const MONGO_CONNECT_OPTIONS = {
  minPoolSize: 2,
  maxPoolSize: 20,
  maxIdleTimeMS: 30_000,
  socketTimeoutMS: 45_000,
  serverSelectionTimeoutMS: 15_000,
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
    console.log('[mongo] Connected.');
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongo] Disconnected. Scheduling reconnect.');
    scheduleReconnect();
  });

  mongoose.connection.on('reconnected', () => {
    clearReconnectTimer();
    console.log('[mongo] Reconnected event received.');
  });

  mongoose.connection.on('error', (error) => {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '').trim();
    console.error(`[mongo:error] ${name}: ${message}`);
    scheduleReconnect();
  });
}

export async function connectMongo(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is required for production backend mode.');
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
  } catch (error) {
    const name = String(error?.name || 'Error');
    const message = String(error?.message || '').trim();
    console.error(`[mongo] Initial connect failed: ${name}: ${message}`);
    console.warn('[mongo] Server will continue running and retry MongoDB connection in the background.');
    scheduleReconnect();
  }

  return mongoose.connection;
}
