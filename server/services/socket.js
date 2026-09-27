/**
 * Socket.IO for student/admin real-time sync (mirrors SSE payloads).
 * Works without Redis (single instance); with Redis pub/sub for horizontal scaling.
 */
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { getSocketIoAdapterRedisClients } from './redis.js';

function readCookieFromHeader(headerValue, key) {
  const source = String(headerValue || '').trim();
  if (!source) return '';
  const parts = source.split(';');
  for (const chunk of parts) {
    const [rawKey, ...rawValueParts] = String(chunk || '').split('=');
    const k = String(rawKey || '').trim();
    if (k !== key) continue;
    const value = rawValueParts.join('=').trim();
    return decodeURIComponent(value || '');
  }
  return '';
}

/**
 * Bearer from auth payload, optional ?token=, or httpOnly access cookie (student cookie sessions).
 * @param {import('socket.io').Handshake} handshake
 * @param {string} accessCookieName
 */
function resolveHandshakeToken(handshake, accessCookieName) {
  const auth = String(handshake.auth?.token || '').trim();
  if (auth) return auth;
  const query = String(handshake.query?.token || '').trim();
  if (query) return query;
  if (accessCookieName) {
    const fromCookie = readCookieFromHeader(handshake.headers?.cookie, accessCookieName);
    if (fromCookie) return fromCookie;
  }
  return '';
}

/** @type {import('socket.io').Server | null} */
let ioRef = null;

function studentRoom(userId) {
  return `user:${String(userId || '')}`;
}

function adminRoom(userId) {
  return `admin:${String(userId || '')}`;
}

/**
 * @param {import('http').Server} httpServer
 * @param {object} opts
 * @param {string} opts.jwtSecret
 * @param {import('mongoose').Model} opts.UserModel
 * @param {(user: import('mongoose').Document, payload: object) => boolean} opts.isSocketSessionValid
 * @param {string} [opts.accessTokenCookieName]
 * @param {boolean | string[]} [opts.corsOrigins] Same as Express CORS: true = any, or allowlist of origins
 * @param {(userId: string, clientId: string) => void} [opts.onStudentPresenceRegister]
 * @param {(userId: string, clientId: string) => void} [opts.onStudentPresenceUnregister]
 * @param {(userId: string, meta: { away: boolean }) => void} [opts.onStudentPresenceHeartbeat]
 */
export async function initSocketIo(httpServer, opts) {
  const {
    jwtSecret,
    UserModel,
    isSocketSessionValid,
    accessTokenCookieName = '',
    corsOrigins = true,
    onStudentPresenceRegister,
    onStudentPresenceUnregister,
    onStudentPresenceHeartbeat,
  } = opts;

  // Resolve the adapter BEFORE attaching Socket.IO to the HTTP server. `new Server(httpServer)`
  // starts accepting handshakes immediately, so awaiting Redis afterwards let connections in
  // before the auth middleware / connection handler existed (and swapping adapters later would
  // drop their room membership).
  let redisAdapterPair = null;
  try {
    redisAdapterPair = await getSocketIoAdapterRedisClients();
  } catch (e) {
    console.error('[redis] connection failed', e?.message || e);
  }

  const io = new Server(httpServer, {
    path: '/socket.io',
    cors: {
      origin: corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
    },
    transports: ['websocket', 'polling'],
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: true,
    },
  });

  if (redisAdapterPair?.pub && redisAdapterPair?.sub) {
    io.adapter(createAdapter(redisAdapterPair.pub, redisAdapterPair.sub));
    console.log('[socket.io] Redis adapter enabled');
  } else {
    console.warn('[socket.io] Running without Redis adapter');
  }

  io.use(async (socket, next) => {
    try {
      const token = resolveHandshakeToken(socket.handshake, accessTokenCookieName);
      if (!token) {
        next(new Error('auth_required'));
        return;
      }
      const payload = jwt.verify(token, jwtSecret);
      const user = await UserModel.findById(payload.userId).select('role activeSession').lean();
      if (!user) {
        next(new Error('user_not_found'));
        return;
      }
      if (!isSocketSessionValid(user, payload)) {
        next(new Error('session_invalid'));
        return;
      }
      socket.data.userId = String(user._id);
      socket.data.role = user.role || 'student';
      socket.data.sessionId = String(payload.sessionId || '');
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const role = socket.data.role || 'student';

    if (role === 'admin') {
      socket.join(adminRoom(userId));
      socket.join('community-admins');
    } else {
      socket.join(studentRoom(userId));
      socket.join('community-students');
      const clientId = `socket:${socket.id}`;
      try {
        onStudentPresenceRegister?.(userId, clientId);
      } catch {
        // non-fatal
      }
    }

    socket.emit('ready', { ok: true, ts: Date.now() });

    // Support-chat typing indicator (ephemeral; never persisted). Students notify every admin,
    // admins notify the one student whose thread they are typing in. Throttled per socket.
    let lastTypingEmitAt = 0;
    socket.on('support:typing', (payload) => {
      const now = Date.now();
      if (now - lastTypingEmitAt < 250) return;
      lastTypingEmitAt = now;
      const typing = Boolean(payload && typeof payload === 'object' && payload.typing);
      if (role === 'admin') {
        const target = String((payload && typeof payload === 'object' && payload.userId) || '').trim();
        if (!/^[a-f\d]{24}$/i.test(target)) return;
        io.to(studentRoom(target)).emit('sync', { type: 'support.typing', userId: target, from: 'admin', typing, ts: now });
      } else {
        io.to('community-admins').emit('sync', { type: 'support.typing', userId, from: 'user', typing, ts: now });
      }
    });

    // App-wide presence heartbeat from the web client (any page, not just Community).
    // Offline is still driven by socket disconnect / Socket.IO ping timeout.
    let lastHeartbeatAt = 0;
    let lastHeartbeatAway = null;
    socket.on('presence:heartbeat', (payload) => {
      if (role === 'admin') return;
      const now = Date.now();
      const away = Boolean(payload && typeof payload === 'object' && payload.away);
      if (away === lastHeartbeatAway && now - lastHeartbeatAt < 5_000) return;
      lastHeartbeatAt = now;
      lastHeartbeatAway = away;
      try {
        onStudentPresenceHeartbeat?.(userId, { away });
      } catch {
        // non-fatal
      }
    });

    socket.on('disconnect', () => {
      if (role !== 'admin') {
        const clientId = `socket:${socket.id}`;
        try {
          onStudentPresenceUnregister?.(userId, clientId);
        } catch {
          // non-fatal
        }
      }
    });
  });

  ioRef = io;
  console.log('[socket.io] Listening');
  return io;
}

export function getIo() {
  return ioRef;
}

/**
 * Disconnect student sockets still using a replaced session (e.g. another device / tab took over).
 * @param {string} userId
 * @param {string} staleSessionId
 */
export async function disconnectStudentSocketsWithStaleSession(userId, staleSessionId) {
  const uid = String(userId || '').trim();
  const stale = String(staleSessionId || '').trim();
  if (!ioRef || !uid || !stale) return;
  try {
    const sockets = await ioRef.in(studentRoom(uid)).fetchSockets();
    for (const s of sockets) {
      if (String(s.data?.sessionId || '') === stale) {
        s.disconnect(true);
      }
    }
  } catch {
    // non-fatal
  }
}

/** @param {string} userId */
export function emitSocketSyncToStudentUser(userId, data) {
  if (!ioRef) return;
  try {
    ioRef.to(studentRoom(userId)).emit('sync', { ...data, ts: Date.now() });
  } catch {
    // ignore
  }
}

/** Push subscription/trial updates for countdown sync */
export function emitSubscriptionRefresh(userId, payload) {
  if (!ioRef) return;
  try {
    ioRef.to(studentRoom(userId)).emit('subscription:refresh', { ...payload, ts: Date.now() });
  } catch {
    // ignore
  }
}

/** @param {Record<string, unknown>} data */
export function emitSocketSyncToStudents(data) {
  if (!ioRef) return;
  try {
    ioRef.to('community-students').emit('sync', { ...data, ts: Date.now() });
  } catch {
    // ignore
  }
}

/** @param {Record<string, unknown>} data */
export function emitSocketSyncToAdmins(data) {
  if (!ioRef) return;
  try {
    ioRef.to('community-admins').emit('sync', { ...data, ts: Date.now() });
  } catch {
    // ignore
  }
}

/**
 * Mirror broadcastSyncEvent routing for Socket.IO.
 * @param {'all'|'student'|'admin'} role
 * @param {Record<string, unknown>} data
 */
export function mirrorBroadcastSyncEvent(role, data) {
  const payload = { ...data, ts: Date.now() };
  if (!ioRef) return;
  try {
    if (role === 'all' || role === 'student') {
      ioRef.to('community-students').emit('sync', payload);
    }
    if (role === 'all' || role === 'admin') {
      ioRef.to('community-admins').emit('sync', payload);
    }
  } catch {
    // ignore
  }
}
