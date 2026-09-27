import { io, type Socket } from 'socket.io-client';
import { API_BASE } from './api';
import { isCookieSessionApiMarker } from './authSession';

/**
 * ONE authenticated Socket.IO connection per browser session (per scope: student app or
 * admin panel), shared by every component that needs realtime events (Community roster,
 * Support Chat, ...). Components acquire a reference, attach their own listeners with
 * `socket.on(...)`, remove them with `socket.off(...)` and release the reference on unmount.
 * The connection is only closed when the last reference is released (logout / app teardown),
 * so navigating between pages never tears the socket down or re-registers presence.
 *
 * Auth: the current in-memory access token is handed to the server in the handshake
 * (`auth.token`) and re-evaluated on every (re)connection attempt, so a refreshed token is
 * picked up automatically. Nothing is persisted here.
 */

export type RealtimeScope = 'student' | 'admin';
export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected';
type StatusListener = (status: RealtimeStatus) => void;

interface ScopeEntry {
  socket: Socket | null;
  token: string | null;
  refCount: number;
  status: RealtimeStatus;
  listeners: Set<StatusListener>;
  authRetryTimer: number | null;
  authRetryCount: number;
  detachInternal: (() => void) | null;
}

const AUTH_RETRY_BASE_MS = 3_000;
const AUTH_RETRY_MAX_MS = 60_000;

function createEntry(): ScopeEntry {
  return {
    socket: null,
    token: null,
    refCount: 0,
    status: 'idle',
    listeners: new Set(),
    authRetryTimer: null,
    authRetryCount: 0,
    detachInternal: null,
  };
}

const entries: Record<RealtimeScope, ScopeEntry> = {
  student: createEntry(),
  admin: createEntry(),
};

function log(scope: RealtimeScope, level: 'info' | 'warn', message: string, details?: Record<string, unknown>) {
  const line = `[realtime:${scope}] ${message}`;
  if (level === 'warn') {
    if (details) console.warn(line, details); else console.warn(line);
    return;
  }
  if (details) console.info(line, details); else console.info(line);
}

function setStatus(scope: RealtimeScope, entry: ScopeEntry, status: RealtimeStatus) {
  if (entry.status === status) return;
  entry.status = status;
  entry.listeners.forEach((listener) => {
    try {
      listener(status);
    } catch {
      // listener errors must never break the socket lifecycle
    }
  });
}

function clearAuthRetry(entry: ScopeEntry) {
  if (entry.authRetryTimer != null) {
    window.clearTimeout(entry.authRetryTimer);
    entry.authRetryTimer = null;
  }
}

function hasUsableToken(entry: ScopeEntry): boolean {
  // The cookie-session marker is not a JWT: the server then reads the auth cookie instead.
  return Boolean(entry.token);
}

function createSocket(scope: RealtimeScope, entry: ScopeEntry): Socket {
  const socket = io(API_BASE, {
    path: '/socket.io',
    auth: (cb) => {
      const current = entry.token;
      cb(current && !isCookieSessionApiMarker(current) ? { token: current } : {});
    },
    withCredentials: true,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 15_000,
    randomizationFactor: 0.5,
    timeout: 25_000,
  });

  const onConnect = () => {
    entry.authRetryCount = 0;
    clearAuthRetry(entry);
    log(scope, 'info', 'connected', {
      transport: socket.io.engine?.transport?.name || 'unknown',
      recovered: Boolean(socket.recovered),
    });
    setStatus(scope, entry, 'connected');
  };

  /**
   * Socket.IO stops retrying on its own in two cases: the server auth middleware rejected the
   * handshake (`connect_error` with `socket.active === false`, e.g. expired / rotated token) and a
   * server-initiated `socket.disconnect()` (`io server disconnect`, e.g. stale session kicked).
   * Retry ourselves with the latest token and exponential backoff (3s ... 60s); a fresh token
   * arriving via setRealtimeAuthToken() shortcuts the wait.
   */
  const scheduleManualReconnect = () => {
    if (entry.refCount === 0 || entry.authRetryTimer != null) return;
    const delay = Math.min(AUTH_RETRY_MAX_MS, AUTH_RETRY_BASE_MS * 2 ** Math.min(entry.authRetryCount, 5));
    entry.authRetryCount += 1;
    entry.authRetryTimer = window.setTimeout(() => {
      entry.authRetryTimer = null;
      if (entry.refCount > 0 && socket.disconnected && hasUsableToken(entry)) {
        setStatus(scope, entry, 'connecting');
        socket.connect();
      }
    }, delay);
  };

  const onDisconnect = (reason: string) => {
    log(scope, 'warn', 'disconnected', { reason: String(reason || '') });
    // `io client disconnect` = we closed it on purpose (release/logout). For transport-level
    // reasons the manager reconnects by itself (we surface "connecting" from reconnect_attempt).
    if (reason === 'io client disconnect') {
      setStatus(scope, entry, 'idle');
      return;
    }
    setStatus(scope, entry, 'disconnected');
    if (reason === 'io server disconnect') scheduleManualReconnect();
  };

  const onConnectError = (error: Error) => {
    // `socket.active === true`  -> transport-level failure, Socket.IO keeps retrying by itself.
    // `socket.active === false` -> rejected by the server auth middleware; retry manually.
    const willRetry = socket.active;
    log(scope, 'warn', 'connect_error', { message: String(error?.message || ''), willRetry });
    setStatus(scope, entry, 'disconnected');
    if (!willRetry) scheduleManualReconnect();
  };

  const onSocketError = (error: unknown) => {
    log(scope, 'warn', 'error', { message: String((error as Error)?.message || error || '') });
  };

  const onReconnectAttempt = (attempt: number) => {
    setStatus(scope, entry, 'connecting');
    // Keep the console readable during long outages.
    if (attempt <= 3 || attempt % 10 === 0) {
      log(scope, 'info', 'reconnect_attempt', { attempt });
    }
  };

  const onReconnect = (attempt: number) => {
    log(scope, 'info', 'reconnected', { attempt });
  };

  // App-wide session/subscription signals. The server sends these to the student's own room;
  // AuthContext / SubscriptionContext already listen for the window events (they were previously
  // only forwarded from the `/api/stream` SSE handler, which the browser may not be able to open).
  const onSessionSync = (data: unknown) => {
    if (scope !== 'student' || !data || typeof data !== 'object') return;
    const parsed = data as { type?: string; previousSessionId?: string; userId?: string };
    if (parsed.type === 'auth.session_revoked' && parsed.previousSessionId) {
      window.dispatchEvent(new CustomEvent('net360:session-revoked', {
        detail: { previousSessionId: parsed.previousSessionId, userId: parsed.userId },
      }));
    } else if (parsed.type === 'subscription.refresh') {
      window.dispatchEvent(new CustomEvent('net360:subscription-refresh', { detail: parsed }));
    }
  };
  const onSubscriptionRefresh = (data: unknown) => {
    if (scope !== 'student') return;
    window.dispatchEvent(new CustomEvent('net360:subscription-refresh', { detail: data }));
  };

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('connect_error', onConnectError);
  socket.on('error', onSocketError);
  socket.on('sync', onSessionSync);
  socket.on('subscription:refresh', onSubscriptionRefresh);
  socket.io.on('reconnect_attempt', onReconnectAttempt);
  socket.io.on('reconnect', onReconnect);

  entry.detachInternal = () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('connect_error', onConnectError);
    socket.off('error', onSocketError);
    socket.off('sync', onSessionSync);
    socket.off('subscription:refresh', onSubscriptionRefresh);
    socket.io.off('reconnect_attempt', onReconnectAttempt);
    socket.io.off('reconnect', onReconnect);
  };

  setStatus(scope, entry, 'connecting');
  return socket;
}

/**
 * Keep the shared socket's credentials current without recreating it. If the socket was
 * rejected earlier (expired token) and a fresh token arrives, reconnect right away.
 */
export function setRealtimeAuthToken(scope: RealtimeScope, token: string | null | undefined): void {
  const entry = entries[scope];
  const next = token ? String(token) : null;
  const changed = entry.token !== next;
  entry.token = next;
  if (!changed) return;
  const socket = entry.socket;
  if (!socket || entry.refCount === 0) return;
  if (next && socket.disconnected) {
    clearAuthRetry(entry);
    entry.authRetryCount = 0;
    setStatus(scope, entry, 'connecting');
    socket.connect();
  }
}

/** Acquire a reference to the shared socket for this scope (creates/connects it on first use). */
export function acquireRealtimeSocket(scope: RealtimeScope): Socket {
  const entry = entries[scope];
  entry.refCount += 1;
  if (!entry.socket) {
    entry.socket = createSocket(scope, entry);
  } else if (entry.socket.disconnected && hasUsableToken(entry)) {
    setStatus(scope, entry, 'connecting');
    entry.socket.connect();
  }
  return entry.socket;
}

/** Release a reference; the connection is closed only when nobody holds a reference anymore. */
export function releaseRealtimeSocket(scope: RealtimeScope, socket?: Socket | null): void {
  const entry = entries[scope];
  if (socket && entry.socket && socket !== entry.socket) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  if (entry.refCount > 0 || !entry.socket) return;
  const current = entry.socket;
  clearAuthRetry(entry);
  entry.authRetryCount = 0;
  entry.detachInternal?.();
  entry.detachInternal = null;
  entry.socket = null;
  current.removeAllListeners();
  current.close();
  log(scope, 'info', 'closed (no subscribers)');
  setStatus(scope, entry, 'idle');
}

export function getRealtimeStatus(scope: RealtimeScope): RealtimeStatus {
  return entries[scope].status;
}

export function isRealtimeConnected(scope: RealtimeScope): boolean {
  return Boolean(entries[scope].socket?.connected);
}

/** Subscribe to connection status changes; returns an unsubscribe function. */
export function subscribeRealtimeStatus(scope: RealtimeScope, listener: StatusListener): () => void {
  const entry = entries[scope];
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
  };
}

/**
 * Called on tab visibility / network resume: nudge a disconnected socket. Socket.IO already
 * reconnects on its own; this only shortcuts a pending backoff timer.
 */
export function reconnectRealtimeIfNeeded(scope: RealtimeScope): void {
  const entry = entries[scope];
  const socket = entry.socket;
  if (!socket || entry.refCount === 0 || !hasUsableToken(entry)) return;
  if (socket.disconnected) {
    clearAuthRetry(entry);
    setStatus(scope, entry, 'connecting');
    socket.connect();
  }
}
