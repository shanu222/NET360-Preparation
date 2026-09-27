import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useAuth } from '../context/AuthContext';
import {
  acquireRealtimeSocket,
  reconnectRealtimeIfNeeded,
  releaseRealtimeSocket,
  setRealtimeAuthToken,
} from '../lib/realtimeSocket';

const HEARTBEAT_INTERVAL_MS = 20_000;
const ACTIVITY_MIN_INTERVAL_MS = 15_000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'scroll'] as const;

const ACTIVITY_BY_PATH: Record<string, string> = {
  '/community': 'Community',
  '/tests': 'Taking Test',
  '/practice-board': 'Practicing MCQs',
  '/preparation': 'Studying',
  '/smart-mentor': 'Studying',
  '/guide': 'Reading',
  '/programs': 'Reading',
  '/schools-campuses': 'Reading',
  '/net-types': 'Reading',
  '/analytics': 'Reading',
  '/merit-calculator': 'Reading',
  '/question-contribution': 'Community',
};

function activityFromPath(pathname: string): string {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (ACTIVITY_BY_PATH[path]) return ACTIVITY_BY_PATH[path];
  if (path.startsWith('/community')) return 'Community';
  if (path.startsWith('/tests') || path.includes('exam')) return 'Taking Test';
  return '';
}

/**
 * App-wide presence: while a student is signed in on ANY page (web or Android),
 * hold the shared Socket.IO connection and send a heartbeat.
 */
export function StudentPresenceHeartbeat() {
  const { token, user } = useAuth();
  const location = useLocation();
  const isStudent = Boolean(token && user && user.role !== 'admin');
  const userId = String(user?.id || '');
  const activityOverrideRef = useRef('');
  const pathActivityRef = useRef(activityFromPath(location.pathname));
  pathActivityRef.current = activityFromPath(location.pathname);

  useEffect(() => {
    if (isStudent) setRealtimeAuthToken('student', token);
  }, [isStudent, token]);

  useEffect(() => {
    const onOverride = (event: Event) => {
      const detail = (event as CustomEvent<{ activity?: string }>).detail;
      activityOverrideRef.current = String(detail?.activity || '').trim().slice(0, 40);
    };
    window.addEventListener('net360:presence-activity', onOverride as EventListener);
    return () => window.removeEventListener('net360:presence-activity', onOverride as EventListener);
  }, []);

  useEffect(() => {
    if (!isStudent || !userId) return;

    const socket = acquireRealtimeSocket('student');
    let lastSentAt = 0;
    let lastKey = '';

    const currentActivity = () => activityOverrideRef.current || pathActivityRef.current;

    const send = (force: boolean) => {
      if (!socket.connected) return;
      const away = document.hidden;
      const activity = currentActivity();
      const now = Date.now();
      const key = `${away}|${activity}`;
      if (!force && key === lastKey && now - lastSentAt < ACTIVITY_MIN_INTERVAL_MS) return;
      lastSentAt = now;
      lastKey = key;
      socket.emit('presence:heartbeat', { away, activity });
    };

    const onConnect = () => send(true);
    const onActivity = () => send(false);
    const onVisibilityChange = () => {
      if (!document.hidden) reconnectRealtimeIfNeeded('student');
      send(true);
    };
    const onOnline = () => reconnectRealtimeIfNeeded('student');
    const onRoute = () => send(true);

    socket.on('connect', onConnect);
    if (socket.connected) send(true);
    const interval = window.setInterval(() => send(true), HEARTBEAT_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('online', onOnline);
    window.addEventListener('net360:presence-route', onRoute);
    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }));
    const appStateListenerPromise = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) reconnectRealtimeIfNeeded('student');
        send(true);
      }).catch(() => null)
      : Promise.resolve(null);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('net360:presence-route', onRoute);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }));
      void appStateListenerPromise.then((listener) => listener?.remove());
      socket.off('connect', onConnect);
      releaseRealtimeSocket('student', socket);
    };
  }, [isStudent, userId]);

  useEffect(() => {
    if (!isStudent) return;
    window.dispatchEvent(new Event('net360:presence-route'));
  }, [isStudent, location.pathname]);

  return null;
}
