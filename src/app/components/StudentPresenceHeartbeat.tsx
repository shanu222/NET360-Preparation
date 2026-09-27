import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import {
  acquireRealtimeSocket,
  reconnectRealtimeIfNeeded,
  releaseRealtimeSocket,
  setRealtimeAuthToken,
} from '../lib/realtimeSocket';

const HEARTBEAT_INTERVAL_MS = 30_000;
const ACTIVITY_MIN_INTERVAL_MS = 20_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

/**
 * Web-app presence: while a student is signed in on ANY page, hold the shared Socket.IO
 * connection (the server marks the user online on handshake and offline when the last socket
 * drops) and send a heartbeat on an interval, on tab visibility changes and on user activity.
 * Native builds are untouched.
 */
export function StudentPresenceHeartbeat() {
  const { token, user } = useAuth();
  const isStudent = Boolean(token && user && user.role !== 'admin');
  const userId = String(user?.id || '');

  useEffect(() => {
    if (isStudent) setRealtimeAuthToken('student', token);
  }, [isStudent, token]);

  useEffect(() => {
    if (!isStudent || !userId || Capacitor.isNativePlatform()) return;

    const socket = acquireRealtimeSocket('student');
    let lastSentAt = 0;
    let lastAway: boolean | null = null;

    const send = (force: boolean) => {
      if (!socket.connected) return;
      const away = document.hidden;
      const now = Date.now();
      if (!force && away === lastAway && now - lastSentAt < ACTIVITY_MIN_INTERVAL_MS) return;
      lastSentAt = now;
      lastAway = away;
      socket.emit('presence:heartbeat', { away });
    };

    const onConnect = () => send(true);
    const onActivity = () => send(false);
    const onVisibilityChange = () => {
      if (!document.hidden) reconnectRealtimeIfNeeded('student');
      send(true);
    };
    const onOnline = () => reconnectRealtimeIfNeeded('student');

    socket.on('connect', onConnect);
    if (socket.connected) send(true);
    const interval = window.setInterval(() => send(true), HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      socket.off('connect', onConnect);
      releaseRealtimeSocket('student', socket);
    };
  }, [isStudent, userId]);

  return null;
}
