import { Capacitor } from '@capacitor/core';
import { API_BASE } from './api';
import { consumeBriefNativeHide, markNativeDocumentHidden } from './nativeForeground';

const SESSION_KEY = 'net360-analytics-session-id';
const ANON_KEY = 'net360-analytics-anonymous-id';
const QUEUE_KEY = 'net360-analytics-queue';
const MAX_QUEUE = 20;
const HEARTBEAT_MS = 60_000;

type AnalyticsPayload = Record<string, unknown>;

function randomId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readStorage(key: string) {
  try {
    return String(window.sessionStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readPersistent(key: string) {
  try {
    return String(window.localStorage.getItem(key) || '').trim();
  } catch {
    return '';
  }
}

function writePersistent(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function resolveAnalyticsPlatform() {
  try {
    if (Capacitor.isNativePlatform()) {
      const platform = String(Capacitor.getPlatform() || '').toLowerCase();
      if (platform === 'ios') return 'ios';
      return 'android';
    }
  } catch {
    /* web */
  }
  return 'web';
}

export function getAnalyticsSessionId() {
  let sessionId = readStorage(SESSION_KEY);
  if (!sessionId) {
    sessionId = randomId('ses');
    writeStorage(SESSION_KEY, sessionId);
  }
  return sessionId;
}

export function getAnonymousAnalyticsId() {
  let anonymousId = readPersistent(ANON_KEY);
  if (!anonymousId) {
    anonymousId = randomId('anon');
    writePersistent(ANON_KEY, anonymousId);
  }
  return anonymousId;
}

function queueEvent(path: string, body: AnalyticsPayload) {
  try {
    const raw = window.sessionStorage.getItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) as Array<{ path: string; body: AnalyticsPayload }> : [];
    list.push({ path, body });
    window.sessionStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
  } catch {
    /* ignore */
  }
}

function takeQueue() {
  try {
    const raw = window.sessionStorage.getItem(QUEUE_KEY);
    window.sessionStorage.removeItem(QUEUE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function analyticsUrl(path: string) {
  const base = String(API_BASE || '').replace(/\/$/, '');
  return `${base}${path}`;
}

async function postAnalytics(path: string, body: AnalyticsPayload) {
  const payload = {
    ...body,
    sessionId: body.sessionId || getAnalyticsSessionId(),
    anonymousId: body.anonymousId || getAnonymousAnalyticsId(),
    platform: body.platform || resolveAnalyticsPlatform(),
    eventId: body.eventId || randomId('evt'),
    timestamp: body.timestamp || new Date().toISOString(),
  };
  try {
    const response = await fetch(analyticsUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error('analytics-http');
  } catch {
    queueEvent(path, payload);
  }
}

export function reportAnalyticsEvent(body: AnalyticsPayload) {
  void postAnalytics('/api/analytics/event', body);
}

export function reportAnalyticsError(body: AnalyticsPayload) {
  void postAnalytics('/api/analytics/error', body);
}

export function reportAnalyticsSession(action: 'start' | 'activity' | 'end', extra: AnalyticsPayload = {}) {
  void postAnalytics('/api/analytics/session', { action, ...extra });
}

export function flushQueuedAnalytics() {
  const queued = takeQueue();
  queued.forEach((item) => {
    void postAnalytics(item.path, item.body);
  });
}

export function featureFromPath(pathname: string) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  if (path === '/') return 'HOME';
  if (path.startsWith('/guide')) return 'NUST_ADMISSION_GUIDE';
  if (path.startsWith('/programs')) return 'PROGRAMS';
  if (path.startsWith('/practice-board')) return 'PRACTICE_BOARD';
  if (path.startsWith('/preparation')) return 'PREPARATION_MATERIALS';
  if (path.startsWith('/tests') || path.startsWith('/exam-interface')) return 'TESTS';
  if (path.startsWith('/analytics')) return 'PERFORMANCE_ANALYTICS';
  if (path.startsWith('/community')) return 'COMMUNITY';
  if (path.startsWith('/profile')) return 'PROFILE';
  if (path.startsWith('/subscription')) return 'TARGET_PROGRAM';
  return '';
}

export function startAnalyticsRuntime() {
  if (typeof window === 'undefined') return () => undefined;

  reportAnalyticsSession('start');
  flushQueuedAnalytics();

  const heartbeat = window.setInterval(() => {
    if (document.hidden) return;
    reportAnalyticsSession('activity');
  }, HEARTBEAT_MS);

  const onVisibility = () => {
    if (document.hidden) {
      markNativeDocumentHidden();
      return;
    }
    if (consumeBriefNativeHide()) return;
    reportAnalyticsSession('activity');
    flushQueuedAnalytics();
  };
  const onOnline = () => {
    flushQueuedAnalytics();
  };
  const onPageHide = () => {
    reportAnalyticsSession('end');
  };

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('online', onOnline);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    window.clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('pagehide', onPageHide);
  };
}
