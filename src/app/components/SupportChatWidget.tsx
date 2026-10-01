import { type ChangeEvent, type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useAuth } from '../context/AuthContext';
import { useAppData } from '../context/AppDataContext';
import { apiRequest } from '../lib/api';
import { showSuccessToast, showErrorToast, showNeutralToast, handleApiError } from '../lib/userToast';
import {
  acquireRealtimeSocket,
  getRealtimeStatus,
  reconnectRealtimeIfNeeded,
  releaseRealtimeSocket,
  setRealtimeAuthToken,
  subscribeRealtimeStatus,
  type RealtimeStatus,
} from '../lib/realtimeSocket';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

interface SupportMessage {
  id: string;
  userId: string;
  senderRole: 'user' | 'admin';
  messageType?: 'text' | 'file' | string;
  text: string;
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  reactions?: Array<{ emoji: string }>;
  createdAt: string | null;
  readByUser?: boolean;
  readByAdmin?: boolean;
  /** Local only: set on optimistic rows until the server acknowledges them. */
  clientMessageId?: string;
  /** Local only: 'pending' while the POST is in flight, 'failed' when it must be retried. */
  deliveryState?: 'pending' | 'failed';
}

interface SupportInboxPayload {
  unreadFromAdmin?: number;
  messages?: SupportMessage[];
}

interface SupportMessageEvent {
  type?: string;
  userId?: string;
  messageId?: string;
  senderRole?: string;
  message?: SupportMessage;
  clientMessageId?: string;
  /** support.typing */
  from?: 'user' | 'admin' | string;
  typing?: boolean;
  /** support.read */
  by?: 'user' | 'admin' | string;
}

const TYPING_INDICATOR_TTL_MS = 4_000;
const TYPING_EMIT_MIN_INTERVAL_MS = 1_500;
const TYPING_IDLE_STOP_MS = 2_500;

/** Fallback reconcile interval while the realtime socket is down (events are the primary path). */
const SUPPORT_FALLBACK_POLL_MS = 20_000;

function newClientMessageId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().replace(/-/g, '');
    }
  } catch {
    // fall through
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Insert or replace a message by stable server id (or by clientMessageId for optimistic rows).
 * Keeps a locally known attachment payload when the incoming copy (a realtime event) omits it.
 */
function upsertSupportMessage(list: SupportMessage[], incoming: SupportMessage, clientMessageId = ''): SupportMessage[] {
  const incomingId = String(incoming.id || '');
  const matchIndex = list.findIndex((row) => (
    (incomingId && String(row.id) === incomingId)
    || (clientMessageId && row.clientMessageId === clientMessageId)
  ));
  if (matchIndex < 0) {
    return [...list, incoming];
  }
  const existing = list[matchIndex];
  const merged: SupportMessage = {
    ...existing,
    ...incoming,
    attachment: incoming.attachment && !incoming.attachment.dataUrl && existing.attachment?.dataUrl
      ? { ...incoming.attachment, dataUrl: existing.attachment.dataUrl }
      : incoming.attachment ?? existing.attachment ?? null,
    clientMessageId: undefined,
    deliveryState: undefined,
  };
  const next = list.slice();
  next[matchIndex] = merged;
  // The same message may exist twice if both the ack and the event arrived: drop later copies.
  return next.filter((row, index) => index === matchIndex || !incomingId || String(row.id) !== incomingId);
}

/** Server snapshot + any local rows still pending/failed (they are not on the server yet). */
function mergeServerSnapshot(serverMessages: SupportMessage[], local: SupportMessage[]): SupportMessage[] {
  const serverIds = new Set(serverMessages.map((row) => String(row.id)));
  const unsent = local.filter((row) => row.deliveryState && !serverIds.has(String(row.id)));
  return unsent.length ? [...serverMessages, ...unsent] : serverMessages;
}
const SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const SUPPORT_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg';
const SUPPORT_REACTION_SET = ['😀', '🙏', '👍', '❤️', '✅'];
const CHAT_EDGE_GAP = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Resolve safe-area insets for notched devices / Capacitor WebView (computed from env()). */
function readSafeAreaInsets(): { top: number; right: number; bottom: number; left: number } {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:fixed;left:-9999px;top:0;width:0;height:0;pointer-events:none;visibility:hidden;' +
    'padding-top:env(safe-area-inset-top,0px);padding-right:env(safe-area-inset-right,0px);' +
    'padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);';
  document.documentElement.appendChild(probe);
  const style = getComputedStyle(probe);
  const top = parseFloat(style.paddingTop) || 0;
  const right = parseFloat(style.paddingRight) || 0;
  const bottom = parseFloat(style.paddingBottom) || 0;
  const left = parseFloat(style.paddingLeft) || 0;
  probe.remove();
  return { top, right, bottom, left };
}

function getViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

function getChatButtonSize(viewportWidth: number): number {
  return viewportWidth < 420 ? 48 : 56;
}

type DragBounds = { minX: number; minY: number; maxX: number; maxY: number };

function getPanelMetrics(viewportWidth: number, viewportHeight: number): { width: number; maxHeight: number } {
  const safe = readSafeAreaInsets();
  const innerW = Math.max(0, viewportWidth - safe.left - safe.right - CHAT_EDGE_GAP * 2);
  const innerH = Math.max(0, viewportHeight - safe.top - safe.bottom - CHAT_EDGE_GAP * 2);
  const width = Math.min(360, Math.max(280, innerW));
  const maxHeight = Math.max(300, Math.min(560, innerH));
  return { width, maxHeight };
}

function getButtonBounds(viewportWidth: number, viewportHeight: number): DragBounds {
  const safe = readSafeAreaInsets();
  const buttonSize = getChatButtonSize(viewportWidth);
  const minX = CHAT_EDGE_GAP + safe.left;
  const minY = CHAT_EDGE_GAP + safe.top;
  const maxX = Math.max(minX, viewportWidth - buttonSize - CHAT_EDGE_GAP - safe.right);
  const maxY = Math.max(minY, viewportHeight - buttonSize - CHAT_EDGE_GAP - safe.bottom);
  return { minX, minY, maxX, maxY };
}

function getPanelBounds(viewportWidth: number, viewportHeight: number): DragBounds {
  const safe = readSafeAreaInsets();
  const metrics = getPanelMetrics(viewportWidth, viewportHeight);
  const minX = CHAT_EDGE_GAP + safe.left;
  const minY = CHAT_EDGE_GAP + safe.top;
  const maxX = Math.max(minX, viewportWidth - metrics.width - CHAT_EDGE_GAP - safe.right);
  const maxY = Math.max(minY, viewportHeight - metrics.maxHeight - CHAT_EDGE_GAP - safe.bottom);
  return { minX, minY, maxX, maxY };
}

/** Matches the web launcher classes: h-12 below the sm breakpoint, h-14 from 640px. */
function webLauncherSize(viewportWidth: number): number {
  return viewportWidth < 640 ? 48 : 56;
}

function webLauncherBounds(viewportWidth: number, viewportHeight: number, size = webLauncherSize(viewportWidth)): DragBounds {
  const safe = readSafeAreaInsets();
  const minX = CHAT_EDGE_GAP + safe.left;
  const minY = CHAT_EDGE_GAP + safe.top;
  const maxX = Math.max(minX, viewportWidth - size - CHAT_EDGE_GAP - safe.right);
  const maxY = Math.max(minY, viewportHeight - size - CHAT_EDGE_GAP - safe.bottom);
  return { minX, minY, maxX, maxY };
}

const LAUNCHER_DRAG_THRESHOLD_PX = 8;

/**
 * Place the chat panel against the launcher's current viewport box.
 * Prefer the side with room; flip vertically or stack above/below so the panel
 * stays on screen and still meets the icon.
 */
function placeSupportPanel(
  iconX: number,
  iconY: number,
  iconSize: number,
  viewportWidth: number,
  viewportHeight: number,
): CSSProperties {
  const safe = readSafeAreaInsets();
  const gap = 10;
  const minX = CHAT_EDGE_GAP + safe.left;
  const minY = CHAT_EDGE_GAP + safe.top;
  const maxRight = viewportWidth - CHAT_EDGE_GAP - safe.right;
  const maxBottom = viewportHeight - CHAT_EDGE_GAP - safe.bottom;
  const widthCap = Math.max(0, maxRight - minX);
  const heightCap = Math.max(0, maxBottom - minY);
  const width = Math.min(360, widthCap);
  const preferredHeight = Math.min(520, heightCap);
  const iconRight = iconX + iconSize;
  const iconBottom = iconY + iconSize;
  const iconOnRight = iconX + iconSize / 2 >= viewportWidth / 2;
  const iconOnBottom = iconY + iconSize / 2 >= viewportHeight / 2;
  const candidates: CSSProperties[] = [];

  const pushBeside = (side: 'left' | 'right', growUp: boolean) => {
    const room = side === 'right' ? maxRight - (iconRight + gap) : iconX - gap - minX;
    if (room < 160 || width <= 0) return;
    const panelWidth = Math.min(width, room);
    const left = side === 'right' ? iconRight + gap : iconX - gap - panelWidth;
    if (left < minX - 0.5 || left + panelWidth > maxRight + 0.5) return;
    if (growUp) {
      const roomUp = iconBottom - minY;
      if (roomUp < 140) return;
      candidates.push({
        left,
        bottom: Math.max(0, viewportHeight - iconBottom),
        width: panelWidth,
        maxHeight: Math.min(preferredHeight, roomUp),
      });
      return;
    }
    const roomDown = maxBottom - iconY;
    if (roomDown < 140) return;
    candidates.push({
      left,
      top: iconY,
      width: panelWidth,
      maxHeight: Math.min(preferredHeight, roomDown),
    });
  };

  const sides: Array<'left' | 'right'> = iconOnRight ? ['left', 'right'] : ['right', 'left'];
  for (const side of sides) {
    if (iconOnBottom) {
      pushBeside(side, true);
      pushBeside(side, false);
    } else {
      pushBeside(side, false);
      pushBeside(side, true);
    }
  }

  const pushStacked = (above: boolean) => {
    const room = above ? iconY - gap - minY : maxBottom - (iconBottom + gap);
    if (room < 120 || width <= 0) return;
    const panelWidth = Math.min(width, widthCap);
    const rawLeft = iconOnRight ? iconRight - panelWidth : iconX;
    const left = clamp(rawLeft, minX, Math.max(minX, maxRight - panelWidth));
    if (above) {
      candidates.push({
        left,
        bottom: Math.max(0, viewportHeight - (iconY - gap)),
        width: panelWidth,
        maxHeight: Math.min(preferredHeight, room),
      });
      return;
    }
    candidates.push({
      left,
      top: iconBottom + gap,
      width: panelWidth,
      maxHeight: Math.min(preferredHeight, room),
    });
  };

  if (iconOnBottom) {
    pushStacked(true);
    pushStacked(false);
  } else {
    pushStacked(false);
    pushStacked(true);
  }

  if (candidates.length > 0) return candidates[0];

  const panelWidth = Math.min(width, widthCap);
  const panelHeight = Math.min(preferredHeight, heightCap);
  return {
    left: clamp(iconOnRight ? iconX - gap - panelWidth : iconRight + gap, minX, Math.max(minX, maxRight - panelWidth)),
    top: clamp(iconOnBottom ? iconBottom - panelHeight : iconY, minY, Math.max(minY, maxBottom - panelHeight)),
    width: panelWidth,
    maxHeight: panelHeight,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected file.'));
    reader.readAsDataURL(file);
  });
}

export function SupportChatWidget() {
  const { token, user } = useAuth();
  const { preferences } = useAppData();
  const supportRepliesEnabled = preferences.notificationPreferences?.supportReplies !== false;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<SupportMessage['attachment']>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [viewport, setViewport] = useState(() => getViewportSize());
  const [launcherSize, setLauncherSize] = useState(() => webLauncherSize(getViewportSize().width));
  const [position, setPosition] = useState(() => {
    const { width, height } = getViewportSize();
    const bounds = getButtonBounds(width, height);
    return {
      x: bounds.maxX,
      y: clamp(bounds.maxY - 72, bounds.minY, bounds.maxY),
    };
  });
  const [panelPosition, setPanelPosition] = useState(() => {
    const { width, height } = getViewportSize();
    const bounds = getPanelBounds(width, height);
    return {
      x: bounds.maxX,
      y: clamp(bounds.maxY - 140, bounds.minY, bounds.maxY),
    };
  });

  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>(() => getRealtimeStatus('student'));
  const [adminTyping, setAdminTyping] = useState(false);
  const adminTypingTimerRef = useRef<number | null>(null);
  const socketRef = useRef<ReturnType<typeof acquireRealtimeSocket> | null>(null);
  const typingStateRef = useRef({ lastEmitAt: 0, idleTimer: null as number | null, active: false });

  const dragStateRef = useRef({ dragging: false, target: 'button' as 'button' | 'panel', offsetX: 0, offsetY: 0 });
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const iconDragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    x: 0,
    y: 0,
  });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const positionRef = useRef(position);
  positionRef.current = position;
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const didHydrateRef = useRef(false);
  const lastAdminMessageIdRef = useRef('');
  const openRef = useRef(open);
  openRef.current = open;
  const loadInFlightRef = useRef<Promise<void> | null>(null);
  const resyncTimerRef = useRef<number | null>(null);
  /** Realtime-delivered admin messages already announced (tone/toast) — never announce twice. */
  const announcedAdminIdsRef = useRef<Set<string>>(new Set());

  const playNotificationTone = () => {
    try {
      const AudioCtx = (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 880;
      gain.gain.value = 0.035;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
    } catch {
      // Ignore notification audio failures.
    }
  };

  const isNativeRuntime = (() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  })();
  const canUseWebNotifications = typeof window !== 'undefined' && 'Notification' in window;
  const panelMetrics = useMemo(() => getPanelMetrics(viewport.width, viewport.height), [viewport.height, viewport.width]);

  const enableNotifications = async () => {
    if (!supportRepliesEnabled) return;
    if (isNativeRuntime) {
      try {
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive === 'granted') {
          await PushNotifications.register();
          showSuccessToast('Device alerts are allowed. Support replies follow your notification settings.');
        } else {
          showErrorToast('Notification permission was not granted on this device.');
        }
      } catch {
        showErrorToast('Could not enable notifications on this device.');
      }
      return;
    }

    if (!canUseWebNotifications) {
      showErrorToast('Notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'granted') {
      showSuccessToast('Browser alerts are already allowed.');
      return;
    }

    if (Notification.permission === 'denied') {
      showErrorToast('Notifications are blocked in browser settings.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      showSuccessToast('Browser alerts are allowed. Support replies follow your notification settings.');
    } else {
      showErrorToast('Notification permission was not granted.');
    }
  };

  const notifyDesktop = (title: string, body: string) => {
    if (!supportRepliesEnabled || isNativeRuntime || !canUseWebNotifications) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    try {
      const notification = new Notification(title, {
        body,
        tag: 'net360-support-user',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Ignore notification delivery errors.
    }
  };

  const canUseChat = Boolean(token && user && user.role !== 'admin');

  const panelStyle = useMemo(() => {
    if (!isNativeRuntime) {
      return placeSupportPanel(
        position.x,
        position.y,
        launcherSize,
        viewport.width,
        viewport.height,
      );
    }
    const panelBounds = getPanelBounds(viewport.width, viewport.height);
    return {
      left: clamp(panelPosition.x, panelBounds.minX, panelBounds.maxX),
      top: clamp(panelPosition.y, panelBounds.minY, panelBounds.maxY),
      width: panelMetrics.width,
      maxHeight: panelMetrics.maxHeight,
    };
  }, [isNativeRuntime, launcherSize, panelMetrics.maxHeight, panelMetrics.width, panelPosition.x, panelPosition.y, position.x, position.y, viewport.height, viewport.width]);

  const announceAdminMessage = (item: SupportMessage | undefined) => {
    const id = String(item?.id || '');
    if (!id || announcedAdminIdsRef.current.has(id)) return;
    announcedAdminIdsRef.current.add(id);
    lastAdminMessageIdRef.current = id;
    playNotificationTone();
    showNeutralToast('New reply from admin support');
    notifyDesktop('NET360 Support', item?.text || 'You have a new reply from admin support.');
  };

  /**
   * Fetch the thread from the server (source of truth) and reconcile it with local optimistic rows.
   * Also marks admin replies as read server-side, so it runs when the panel is open/opened.
   * `loading` is only shown for the very first hydrate — background resyncs never flicker the UI.
   */
  const loadMessages = (): Promise<void> => {
    if (!canUseChat || !token) return Promise.resolve();
    if (loadInFlightRef.current) return loadInFlightRef.current;

    const showLoading = !didHydrateRef.current;
    const run = (async () => {
      try {
        if (showLoading) setLoading(true);
        const payload = await apiRequest<SupportInboxPayload>(
          '/api/support-chat/messages',
          { retryCount: 2, retryDelayMs: 1_500 },
          token,
        );
        const nextMessages = payload.messages || [];
        setMessages((prev) => mergeServerSnapshot(nextMessages, prev));

        // `unreadFromAdmin` = admin replies this GET just marked read (i.e. new since the last
        // fetch). Accumulate while the panel is closed; the badge clears when it is opened.
        const newlyRead = Number(payload.unreadFromAdmin || 0);
        setUnreadCount((prev) => (openRef.current ? 0 : prev + newlyRead));

        const latestAdmin = [...nextMessages].reverse().find((item) => item.senderRole === 'admin');
        const latestAdminId = latestAdmin?.id || '';
        if (!didHydrateRef.current) {
          didHydrateRef.current = true;
          lastAdminMessageIdRef.current = latestAdminId;
          if (latestAdminId) announcedAdminIdsRef.current.add(latestAdminId);
        } else if (latestAdminId && latestAdminId !== lastAdminMessageIdRef.current) {
          announceAdminMessage(latestAdmin);
        }
      } catch {
        // Silent for background resync; explicit actions surface their own errors.
      } finally {
        if (showLoading) setLoading(false);
      }
    })();
    loadInFlightRef.current = run;
    void run.finally(() => {
      if (loadInFlightRef.current === run) loadInFlightRef.current = null;
    });
    return run;
  };

  // Long-lived socket/timer callbacks must always call the latest closure (current token).
  const loadMessagesRef = useRef(loadMessages);
  loadMessagesRef.current = loadMessages;

  /** Coalesce bursts (reconnect + visibility + several events) into one thread fetch. */
  const scheduleResync = (delayMs = 300) => {
    if (resyncTimerRef.current != null) return;
    resyncTimerRef.current = window.setTimeout(() => {
      resyncTimerRef.current = null;
      void loadMessagesRef.current();
    }, delayMs);
  };

  const userId = String(user?.id || '');

  // Keep the shared socket's credentials current (never recreates the connection).
  useEffect(() => {
    if (canUseChat) setRealtimeAuthToken('student', token);
  }, [canUseChat, token]);

  // Realtime: ONE shared Socket.IO connection (lib/realtimeSocket.ts). Server pushes
  // `support.message` / `support.message.updated` `sync` events to this user's room.
  useEffect(() => {
    if (!canUseChat || !userId) {
      setMessages([]);
      setUnreadCount(0);
      didHydrateRef.current = false;
      lastAdminMessageIdRef.current = '';
      announcedAdminIdsRef.current = new Set();
      return;
    }

    let closed = false;
    const socket = acquireRealtimeSocket('student');
    socketRef.current = socket;

    const onSync = (data: unknown) => {
      if (closed || !data || typeof data !== 'object') return;
      const event = data as SupportMessageEvent;
      const type = String(event.type || '');
      if (type === 'support.typing') {
        if (String(event.userId || '') !== userId || event.from !== 'admin') return;
        if (adminTypingTimerRef.current != null) window.clearTimeout(adminTypingTimerRef.current);
        adminTypingTimerRef.current = null;
        setAdminTyping(Boolean(event.typing));
        if (event.typing) {
          adminTypingTimerRef.current = window.setTimeout(() => setAdminTyping(false), TYPING_INDICATOR_TTL_MS);
        }
        return;
      }
      if (type === 'support.read') {
        if (String(event.userId || '') !== userId || event.by !== 'admin') return;
        setMessages((prev) => (prev.some((row) => row.senderRole === 'user' && !row.readByAdmin && !row.deliveryState)
          ? prev.map((row) => (row.senderRole === 'user' && !row.deliveryState ? { ...row, readByAdmin: true } : row))
          : prev));
        return;
      }
      if (type !== 'support.message' && type !== 'support.message.updated') return;
      const incoming = event.message;
      if (!incoming || !incoming.id) return;
      if (String(event.userId || incoming.userId || '') !== userId) return;

      const clientMessageId = String(event.clientMessageId || '');
      setMessages((prev) => upsertSupportMessage(prev, { ...incoming, userId }, clientMessageId));

      if (type === 'support.message' && incoming.senderRole === 'admin') {
        if (adminTypingTimerRef.current != null) window.clearTimeout(adminTypingTimerRef.current);
        adminTypingTimerRef.current = null;
        setAdminTyping(false);
        if (openRef.current) {
          // Visible: mark read on the server and reconcile (also fetches file bytes if any).
          scheduleResync(250);
        } else {
          setUnreadCount((prev) => prev + 1);
          if (incoming.messageType === 'file') scheduleResync(250);
        }
        announceAdminMessage(incoming);
        return;
      }
      // Own message (other tab / ack raced by the event) or a reaction update: bytes for file
      // messages are not carried in events, fetch them quietly.
      if (incoming.messageType === 'file' && !incoming.attachment?.dataUrl) scheduleResync(250);
    };

    const onConnect = () => {
      // Events may have been missed while offline: the server thread is the source of truth.
      scheduleResync(0);
    };

    socket.on('sync', onSync);
    socket.on('connect', onConnect);
    const unsubscribeStatus = subscribeRealtimeStatus('student', (status) => {
      if (!closed) setRealtimeStatus(status);
    });
    setRealtimeStatus(getRealtimeStatus('student'));

    const onVisibility = () => {
      if (document.hidden) return;
      reconnectRealtimeIfNeeded('student');
      scheduleResync(0);
    };
    document.addEventListener('visibilitychange', onVisibility);

    void loadMessagesRef.current();

    return () => {
      closed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribeStatus();
      socket.off('sync', onSync);
      socket.off('connect', onConnect);
      if (socketRef.current === socket) socketRef.current = null;
      releaseRealtimeSocket('student', socket);
      if (resyncTimerRef.current != null) {
        window.clearTimeout(resyncTimerRef.current);
        resyncTimerRef.current = null;
      }
      if (adminTypingTimerRef.current != null) {
        window.clearTimeout(adminTypingTimerRef.current);
        adminTypingTimerRef.current = null;
      }
      if (typingStateRef.current.idleTimer != null) {
        window.clearTimeout(typingStateRef.current.idleTimer);
        typingStateRef.current.idleTimer = null;
      }
      typingStateRef.current.active = false;
      setAdminTyping(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseChat, userId]);

  // Bounded fallback only while the realtime channel is down (no 5s polling when connected).
  useEffect(() => {
    if (!canUseChat || realtimeStatus === 'connected') return;
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadMessagesRef.current();
    }, SUPPORT_FALLBACK_POLL_MS);
    return () => window.clearInterval(timer);
  }, [canUseChat, realtimeStatus]);

  // Opening the panel marks admin replies read (server) and clears the badge.
  useEffect(() => {
    if (!open || !canUseChat) return;
    setUnreadCount(0);
    scheduleResync(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canUseChat]);

  useEffect(() => {
    if (!open) return;
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    const onResize = () => {
      const { width, height } = getViewportSize();
      let native = false;
      try {
        native = Capacitor.isNativePlatform();
      } catch {
        native = false;
      }
      const measured = buttonRef.current?.offsetWidth || 0;
      const buttonBounds = native ? getButtonBounds(width, height) : webLauncherBounds(width, height, measured || undefined);
      const panelBounds = getPanelBounds(width, height);
      setViewport({ width, height });
      setPosition((prev) => ({
        x: clamp(prev.x, buttonBounds.minX, buttonBounds.maxX),
        y: clamp(prev.y, buttonBounds.minY, buttonBounds.maxY),
      }));
      setPanelPosition((prev) => ({
        x: clamp(prev.x, panelBounds.minX, panelBounds.maxX),
        y: clamp(prev.y, panelBounds.minY, panelBounds.maxY),
      }));
    };

    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('scroll', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('scroll', onResize);
    };
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragStateRef.current.dragging) return;
      if (dragStateRef.current.target === 'panel') {
        const panelBounds = getPanelBounds(viewport.width, viewport.height);
        setPanelPosition({
          x: clamp(event.clientX - dragStateRef.current.offsetX, panelBounds.minX, panelBounds.maxX),
          y: clamp(event.clientY - dragStateRef.current.offsetY, panelBounds.minY, panelBounds.maxY),
        });
      } else {
        const buttonBounds = getButtonBounds(viewport.width, viewport.height);
        setPosition({
          x: clamp(event.clientX - dragStateRef.current.offsetX, buttonBounds.minX, buttonBounds.maxX),
          y: clamp(event.clientY - dragStateRef.current.offsetY, buttonBounds.minY, buttonBounds.maxY),
        });
      }
    };

    const onUp = () => {
      dragStateRef.current.dragging = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [viewport.height, viewport.width]);

  useEffect(() => {
    if (isNativeRuntime) return;

    let frame = 0;
    const writeLauncher = (x: number, y: number) => {
      const el = buttonRef.current;
      if (!el) return;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    const onMove = (event: PointerEvent) => {
      const drag = iconDragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved && Math.hypot(dx, dy) < LAUNCHER_DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      event.preventDefault();
      const { width, height } = viewportRef.current;
      const measured = buttonRef.current?.offsetWidth || 0;
      const bounds = webLauncherBounds(width, height, measured || undefined);
      drag.x = Math.round(clamp(drag.originX + dx, bounds.minX, bounds.maxX));
      drag.y = Math.round(clamp(drag.originY + dy, bounds.minY, bounds.maxY));
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        writeLauncher(iconDragRef.current.x, iconDragRef.current.y);
      });
    };

    const finish = (event: PointerEvent) => {
      const drag = iconDragRef.current;
      if (!drag.active || event.pointerId !== drag.pointerId) return;
      drag.active = false;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
      if (!drag.moved) return;
      writeLauncher(drag.x, drag.y);
      setPosition({ x: drag.x, y: drag.y });
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
  }, [isNativeRuntime]);

  useLayoutEffect(() => {
    if (isNativeRuntime) return;
    const drag = iconDragRef.current;
    if (drag.active && drag.moved && buttonRef.current) {
      buttonRef.current.style.left = `${drag.x}px`;
      buttonRef.current.style.top = `${drag.y}px`;
    }
    const next = buttonRef.current?.offsetWidth ?? 0;
    if (next > 0 && next !== launcherSize) setLauncherSize(next);
  });

  useEffect(() => {
    const openFromHeader = () => {
      setOpen(true);
      if (!isNativeRuntime) return;
      const panelBounds = getPanelBounds(viewport.width, viewport.height);
      setPanelPosition({
        x: clamp(position.x - panelMetrics.width + 56, panelBounds.minX, panelBounds.maxX),
        y: clamp(position.y - panelMetrics.maxHeight + 180, panelBounds.minY, panelBounds.maxY),
      });
    };

    window.addEventListener('net360:open-support-chat', openFromHeader as EventListener);
    return () => window.removeEventListener('net360:open-support-chat', openFromHeader as EventListener);
  }, [isNativeRuntime, panelMetrics.maxHeight, panelMetrics.width, position.x, position.y, viewport.height, viewport.width]);

  const onLauncherPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const current = positionRef.current;
    iconDragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: current.x,
      originY: current.y,
      x: current.x,
      y: current.y,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is unavailable for some synthetic events. Window listeners still track the gesture.
    }
  };

  const onLauncherClick = () => {
    if (iconDragRef.current.moved) {
      iconDragRef.current.moved = false;
      return;
    }
    setOpen((prev) => !prev);
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current.target = 'panel';
    dragStateRef.current.dragging = true;
    dragStateRef.current.offsetX = event.clientX - panelPosition.x;
    dragStateRef.current.offsetY = event.clientY - panelPosition.y;
  };

  /**
   * Deliver one optimistic row: POST it, then replace the pending bubble with the persisted
   * message (the REST 201 is the acknowledgement; the realtime event may reconcile it first —
   * both paths key on `clientMessageId`, so the row is never duplicated).
   */
  const deliverPendingMessage = async (row: SupportMessage) => {
    if (!token || !row.clientMessageId) return;
    const clientMessageId = row.clientMessageId;
    setMessages((prev) => prev.map((item) => (
      item.clientMessageId === clientMessageId ? { ...item, deliveryState: 'pending' } : item
    )));
    try {
      setSending(true);
      const payload = await apiRequest<{ message?: SupportMessage; clientMessageId?: string }>('/api/support-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          messageType: row.messageType || 'text',
          text: row.text,
          attachment: row.attachment ?? null,
          clientMessageId,
        }),
      }, token);
      const persisted = payload?.message;
      if (persisted?.id) {
        setMessages((prev) => upsertSupportMessage(
          prev,
          { ...persisted, attachment: persisted.attachment?.dataUrl ? persisted.attachment : (row.attachment ?? persisted.attachment ?? null) },
          clientMessageId,
        ));
      } else {
        scheduleResync(0);
      }
    } catch (error) {
      setMessages((prev) => prev.map((item) => (
        item.clientMessageId === clientMessageId ? { ...item, deliveryState: 'failed' } : item
      )));
      handleApiError(error, 'Could not send message. Tap Retry to try again.');
    } finally {
      setSending(false);
    }
  };

  /** Ephemeral typing signal over the shared socket (throttled; auto-stops after idle). */
  const emitTyping = (typing: boolean) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) return;
    socket.emit('support:typing', { typing });
  };

  const notifyTyping = () => {
    const state = typingStateRef.current;
    const now = Date.now();
    if (!state.active || now - state.lastEmitAt >= TYPING_EMIT_MIN_INTERVAL_MS) {
      state.active = true;
      state.lastEmitAt = now;
      emitTyping(true);
    }
    if (state.idleTimer != null) window.clearTimeout(state.idleTimer);
    state.idleTimer = window.setTimeout(() => {
      state.idleTimer = null;
      state.active = false;
      emitTyping(false);
    }, TYPING_IDLE_STOP_MS);
  };

  const stopTyping = () => {
    const state = typingStateRef.current;
    if (state.idleTimer != null) {
      window.clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }
    if (state.active) {
      state.active = false;
      emitTyping(false);
    }
  };

  const sendMessage = async () => {
    if (!token || !user || sending) return;
    const text = messageText.trim();
    const messageType = messageAttachment ? 'file' : 'text';
    if (messageType === 'text' && !text) return;
    stopTyping();

    const clientMessageId = newClientMessageId();
    const optimistic: SupportMessage = {
      id: `pending:${clientMessageId}`,
      clientMessageId,
      userId: String(user.id || ''),
      senderRole: 'user',
      messageType,
      text,
      attachment: messageAttachment ?? null,
      reactions: [],
      createdAt: new Date().toISOString(),
      deliveryState: 'pending',
    };
    // Show the bubble immediately; the text lives on in the bubble (with Retry) if delivery fails.
    setMessages((prev) => [...prev, optimistic]);
    setMessageText('');
    setMessageAttachment(null);
    await deliverPendingMessage(optimistic);
  };

  const retryMessage = (row: SupportMessage) => {
    if (row.deliveryState !== 'failed' || sending) return;
    void deliverPendingMessage(row);
  };

  const discardFailedMessage = (row: SupportMessage) => {
    setMessages((prev) => prev.filter((item) => item !== row));
  };

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      showErrorToast('File exceeds 8MB size limit.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setMessageAttachment({
        name: file.name,
        mimeType: String(file.type || 'application/octet-stream').toLowerCase(),
        size: file.size,
        dataUrl,
      });
      showSuccessToast('File attached.');
    } catch {
      showErrorToast('Could not read selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    if (!token || messageId.startsWith('pending:')) return;
    try {
      const payload = await apiRequest<{ message?: SupportMessage }>(`/api/support-chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, token);
      if (payload?.message?.id) {
        setMessages((prev) => upsertSupportMessage(prev, payload.message as SupportMessage));
      } else {
        scheduleResync(0);
      }
    } catch (error) {
      handleApiError(error, 'Could not update reaction.');
    }
  };

  return (
    <>
      {open ? (
        <Card
          className={`fixed z-[60] w-full max-w-full overflow-hidden border-emerald-200 bg-white text-slate-900 shadow-[0_16px_44px_rgba(15,118,110,0.24)] dark:border-emerald-500/40 dark:bg-slate-900 dark:text-emerald-50 dark:shadow-[0_18px_44px_rgba(3,8,24,0.7)] ${isNativeRuntime ? 'transition-all duration-200' : ''}`}
          style={panelStyle}
        >
          <CardHeader className="pb-2">
            <div
              className={`flex items-center justify-between gap-2 ${isNativeRuntime ? 'cursor-move' : ''}`}
              onPointerDown={isNativeRuntime ? startPanelDrag : undefined}
            >
              <CardTitle className="text-base text-emerald-900 dark:text-emerald-300">Live Support Chat</CardTitle>
              <Button size="icon" variant="ghost" className="h-8 w-8 dark:hover:bg-emerald-500/15 dark:text-emerald-100" onClick={() => setOpen(false)} aria-label="Close support chat">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">Reach NET360 admin directly. Replies appear here in real time.</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              {canUseChat ? (
                realtimeStatus === 'connected' ? (
                  <Badge className="h-6 bg-emerald-600 text-[10px] text-white" aria-live="polite">Live</Badge>
                ) : (
                  <Badge variant="outline" className="h-6 border-amber-300 text-[10px] text-amber-800 dark:text-amber-200" aria-live="polite">
                    {realtimeStatus === 'disconnected' ? 'Reconnecting…' : 'Connecting…'}
                  </Badge>
                )
              ) : null}
              {supportRepliesEnabled && canUseWebNotifications && typeof Notification !== 'undefined' && Notification.permission !== 'granted' ? (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] dark:border-emerald-500/45 dark:bg-slate-800 dark:text-emerald-100 dark:hover:bg-emerald-900/35" onClick={() => void enableNotifications()}>
                  Allow browser alerts
                </Button>
              ) : null}
              {isNativeRuntime && supportRepliesEnabled ? (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] dark:border-emerald-500/45 dark:bg-slate-800 dark:text-emerald-100 dark:hover:bg-emerald-900/35" onClick={() => void enableNotifications()}>
                  Allow device alerts
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!canUseChat ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/45 dark:bg-amber-900/25 dark:text-amber-100">
                <p>Login as student to use support chat.</p>
                <a
                  href="https://wa.me/923403318127"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
                >
                  Contact on WhatsApp (+923403318127)
                </a>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800 dark:border-emerald-500/45 dark:bg-emerald-900/30 dark:text-emerald-200">
                  Messages are end-to-end encrypted.
                </div>
                <ScrollArea className="h-[min(42vh,16rem)] rounded-lg border bg-slate-50 p-2 sm:h-64 dark:border-slate-600 dark:bg-slate-800/65">
                  <div className="space-y-2">
                    {loading && !messages.length ? <p className="text-xs text-slate-500 dark:text-slate-300" aria-live="polite">Loading messages...</p> : null}
                    {!loading && !messages.length ? <p className="text-xs text-slate-500 dark:text-slate-300">Start a conversation with admin support.</p> : null}
                    {messages.map((item, index) => (
                      <div
                        key={item.id}
                        data-last-own={item.senderRole === 'user' && !messages.slice(index + 1).some((row) => row.senderRole === 'user') ? 'true' : undefined}
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          item.senderRole === 'user'
                            ? 'chat-bubble-own ml-auto bg-emerald-600 text-white dark:bg-emerald-600 dark:text-white'
                            : 'mr-auto border bg-white text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100'
                        } ${item.deliveryState === 'pending' ? 'opacity-70' : ''} ${item.deliveryState === 'failed' ? 'ring-2 ring-rose-400' : ''}`}
                        aria-busy={item.deliveryState === 'pending' || undefined}
                      >
                        {item.messageType === 'file' && item.attachment ? (
                          <div className="space-y-1">
                            <p>{item.text || 'Shared a file'}</p>
                            <a href={item.attachment.dataUrl} download={item.attachment.name} className="text-xs underline underline-offset-2">
                              {item.attachment.name}
                            </a>
                          </div>
                        ) : (
                          <p>{item.text}</p>
                        )}
                        {item.deliveryState ? null : (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {SUPPORT_REACTION_SET.map((emoji) => (
                              <button
                                key={`${item.id}-${emoji}`}
                                type="button"
                                className="rounded border bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-800 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100"
                                onClick={() => void reactToMessage(item.id, emoji)}
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                        {item.deliveryState === 'pending' ? (
                          <p className="mt-1 text-[10px] text-emerald-100 dark:text-emerald-900/80" aria-live="polite">Sending…</p>
                        ) : null}
                        {item.deliveryState === 'failed' ? (
                          <div className="mt-1 flex items-center gap-2 text-[10px]" role="alert">
                            <span className="text-rose-100 dark:text-rose-900">Not sent.</span>
                            <button
                              type="button"
                              className="rounded border border-white/70 px-1.5 py-0.5 font-medium underline-offset-2 hover:underline disabled:opacity-60"
                              onClick={() => retryMessage(item)}
                              disabled={sending}
                            >
                              Retry
                            </button>
                            <button
                              type="button"
                              className="rounded border border-white/40 px-1.5 py-0.5 hover:underline"
                              onClick={() => discardFailedMessage(item)}
                            >
                              Discard
                            </button>
                          </div>
                        ) : null}
                        {Array.isArray(item.reactions) && item.reactions.length ? (
                          <p className={`mt-1 text-[10px] ${item.senderRole === 'user' ? 'text-emerald-100' : 'text-slate-500'}`}>
                            {item.reactions.map((reaction) => reaction.emoji).join(' ')}
                          </p>
                        ) : null}
                        <p className={`mt-1 text-[10px] ${item.senderRole === 'user' ? 'text-emerald-100 dark:text-emerald-900/80' : 'text-slate-400 dark:text-slate-300'}`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''}
                          {item.senderRole === 'user' && !item.deliveryState && !messages.slice(index + 1).some((row) => row.senderRole === 'user')
                            ? ` · ${item.readByAdmin ? 'Seen' : 'Sent'}`
                            : ''}
                        </p>
                      </div>
                    ))}
                    {adminTyping ? (
                      <p className="text-[11px] italic text-slate-500 dark:text-slate-300" aria-live="polite">Admin is typing…</p>
                    ) : null}
                    <div ref={scrollAnchorRef} />
                  </div>
                </ScrollArea>

                <div className="flex min-w-0 items-end gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(event) => {
                      setMessageText(event.target.value);
                      if (event.target.value.trim()) notifyTyping(); else stopTyping();
                    }}
                    onBlur={stopTyping}
                    placeholder="Type your message"
                    className="min-h-[70px] min-w-0 flex-1 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-400"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" className="h-10 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                      File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={SUPPORT_ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => void onFileSelected(e)}
                    />
                    <Button
                      className="h-10 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400"
                      onClick={() => void sendMessage()}
                      disabled={sending || (!messageText.trim() && !messageAttachment)}
                      aria-busy={sending || undefined}
                      aria-label={sending ? 'Sending message' : 'Send message'}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {messageAttachment ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100">
                    <p className="font-medium">Attached: {messageAttachment.name}</p>
                    <Button type="button" size="sm" variant="outline" className="mt-2 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600" onClick={() => setMessageAttachment(null)}>
                      Remove File
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {!isNativeRuntime ? (
        <button
          ref={buttonRef}
          type="button"
          className="fixed z-[70] flex h-12 w-12 cursor-grab touch-none select-none items-center justify-center rounded-full border border-emerald-300 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_rgba(13,148,136,0.35)] active:cursor-grabbing sm:h-14 sm:w-14"
          style={{ left: position.x, top: position.y, touchAction: 'none' }}
          onPointerDown={onLauncherPointerDown}
          onClick={onLauncherClick}
          aria-label={open ? 'Close support chat' : 'Open support chat'}
          aria-expanded={open}
          draggable={false}
        >
          <MessageCircle className="h-5 w-5 pointer-events-none sm:h-6 sm:w-6" />
          {unreadCount > 0 ? (
            <Badge className="pointer-events-none absolute -right-2 -top-2 h-5 min-w-[1.25rem] bg-rose-600 px-1 text-[10px] text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          ) : null}
        </button>
      ) : null}
    </>
  );
}
