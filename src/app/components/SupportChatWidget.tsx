import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X, GripHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast, showNeutralToast, handleApiError, audienceFriendlyError } from '../lib/userToast';
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
}

interface SupportInboxPayload {
  unreadFromAdmin?: number;
  messages?: SupportMessage[];
}

const USER_SUPPORT_NOTIFICATIONS_KEY = 'net360-support-notifications-user';
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
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [messageAttachment, setMessageAttachment] = useState<SupportMessage['attachment']>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(USER_SUPPORT_NOTIFICATIONS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [viewport, setViewport] = useState(() => getViewportSize());
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

  const dragStateRef = useRef({ dragging: false, target: 'button' as 'button' | 'panel', offsetX: 0, offsetY: 0 });
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const didHydrateRef = useRef(false);
  const lastAdminMessageIdRef = useRef('');

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

  const setNotificationPreference = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    try {
      sessionStorage.setItem(USER_SUPPORT_NOTIFICATIONS_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  };

  const enableNotifications = async () => {
    if (isNativeRuntime) {
      try {
        const permission = await PushNotifications.requestPermissions();
        if (permission.receive === 'granted') {
          await PushNotifications.register();
          setNotificationPreference(true);
          showSuccessToast('Notifications enabled on this device.');
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
      setNotificationPreference(true);
      showSuccessToast('Notifications enabled for this tab.');
      return;
    }

    if (Notification.permission === 'denied') {
      showErrorToast('Notifications are blocked in browser settings.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationPreference(true);
      showSuccessToast('Notifications enabled for this tab.');
    } else {
      showErrorToast('Notification permission was not granted.');
    }
  };

  const notifyDesktop = (title: string, body: string) => {
    if (!notificationsEnabled || isNativeRuntime || !canUseWebNotifications) return;
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
    const panelBounds = getPanelBounds(viewport.width, viewport.height);
    return {
      left: clamp(panelPosition.x, panelBounds.minX, panelBounds.maxX),
      top: clamp(panelPosition.y, panelBounds.minY, panelBounds.maxY),
      width: panelMetrics.width,
      maxHeight: panelMetrics.maxHeight,
    };
  }, [panelMetrics.maxHeight, panelMetrics.width, panelPosition.x, panelPosition.y, viewport.height, viewport.width]);

  const loadMessages = async () => {
    if (!canUseChat || !token) return;
    try {
      setLoading(true);
      const payload = await apiRequest<SupportInboxPayload>(
        '/api/support-chat/messages',
        { retryCount: 2, retryDelayMs: 1_500 },
        token,
      );
      const nextMessages = payload.messages || [];
      setMessages(nextMessages);
      setUnreadCount(Number(payload.unreadFromAdmin || 0));

      const latestAdmin = [...nextMessages].reverse().find((item) => item.senderRole === 'admin');
      const latestAdminId = latestAdmin?.id || '';
      if (!didHydrateRef.current) {
        didHydrateRef.current = true;
        lastAdminMessageIdRef.current = latestAdminId;
      } else if (latestAdminId && latestAdminId !== lastAdminMessageIdRef.current) {
        lastAdminMessageIdRef.current = latestAdminId;
        playNotificationTone();
        showNeutralToast('New reply from admin support');
        notifyDesktop('NET360 Support', latestAdmin?.text || 'You have a new reply from admin support.');
      }
    } catch {
      // Keep silent for background refresh.
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canUseChat) {
      setMessages([]);
      setUnreadCount(0);
      didHydrateRef.current = false;
      lastAdminMessageIdRef.current = '';
      return;
    }

    void loadMessages();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      void loadMessages();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [canUseChat, token]);

  useEffect(() => {
    if (!open) return;
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    const onResize = () => {
      const { width, height } = getViewportSize();
      const buttonBounds = getButtonBounds(width, height);
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
    const openFromHeader = () => {
      const panelBounds = getPanelBounds(viewport.width, viewport.height);
      setOpen(true);
      setPanelPosition({
        x: clamp(position.x - panelMetrics.width + 56, panelBounds.minX, panelBounds.maxX),
        y: clamp(position.y - panelMetrics.maxHeight + 180, panelBounds.minY, panelBounds.maxY),
      });
    };

    window.addEventListener('net360:open-support-chat', openFromHeader as EventListener);
    return () => window.removeEventListener('net360:open-support-chat', openFromHeader as EventListener);
  }, [panelMetrics.maxHeight, panelMetrics.width, position.x, position.y, viewport.height, viewport.width]);

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragStateRef.current.target = 'button';
    dragStateRef.current.dragging = true;
    dragStateRef.current.offsetX = event.clientX - position.x;
    dragStateRef.current.offsetY = event.clientY - position.y;
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragStateRef.current.target = 'panel';
    dragStateRef.current.dragging = true;
    dragStateRef.current.offsetX = event.clientX - panelPosition.x;
    dragStateRef.current.offsetY = event.clientY - panelPosition.y;
  };

  const sendMessage = async () => {
    if (!token) return;
    const text = messageText.trim();
    const messageType = messageAttachment ? 'file' : 'text';
    if (messageType === 'text' && !text) return;
    try {
      setSending(true);
      await apiRequest('/api/support-chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          messageType,
          text,
          attachment: messageAttachment,
        }),
      }, token);
      setMessageText('');
      setMessageAttachment(null);
      await loadMessages();
    } catch (error) {
      handleApiError(error, 'Could not send message.');
    } finally {
      setSending(false);
    }
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
    if (!token) return;
    try {
      await apiRequest(`/api/support-chat/messages/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, token);
      await loadMessages();
    } catch (error) {
      handleApiError(error, 'Could not update reaction.');
    }
  };

  return (
    <>
      {open ? (
        <Card
          className="fixed z-[60] w-full max-w-full overflow-hidden border-emerald-200 bg-white/95 text-slate-900 shadow-[0_16px_44px_rgba(15,118,110,0.24)] transition-all duration-200 dark:border-emerald-500/40 dark:bg-slate-900/96 dark:text-emerald-50 dark:shadow-[0_18px_44px_rgba(3,8,24,0.7)]"
          style={panelStyle}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 cursor-move" onPointerDown={startPanelDrag}>
              <CardTitle className="text-base text-emerald-900 dark:text-emerald-300">Live Support Chat</CardTitle>
              <Button size="icon" variant="ghost" className="h-8 w-8 dark:hover:bg-emerald-500/15 dark:text-emerald-100" onClick={() => setOpen(false)} aria-label="Close support chat">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-300">Reach NET360 admin directly. Replies appear here in real time.</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              {notificationsEnabled ? (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] dark:border-emerald-500/45 dark:bg-emerald-900/30 dark:text-emerald-100 dark:hover:bg-emerald-800/40" onClick={() => setNotificationPreference(false)}>
                  Notifications: On
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px] dark:border-emerald-500/45 dark:bg-slate-800 dark:text-emerald-100 dark:hover:bg-emerald-900/35" onClick={() => void enableNotifications()}>
                  Enable Notifications
                </Button>
              )}
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
                    {loading ? <p className="text-xs text-slate-500 dark:text-slate-300">Loading messages...</p> : null}
                    {!messages.length ? <p className="text-xs text-slate-500 dark:text-slate-300">Start a conversation with admin support.</p> : null}
                    {messages.map((item) => (
                      <div
                        key={item.id}
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          item.senderRole === 'user'
                            ? 'ml-auto bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950'
                            : 'mr-auto border bg-white text-slate-700 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-100'
                        }`}
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
                        {Array.isArray(item.reactions) && item.reactions.length ? (
                          <p className={`mt-1 text-[10px] ${item.senderRole === 'user' ? 'text-emerald-100' : 'text-slate-500'}`}>
                            {item.reactions.map((reaction) => reaction.emoji).join(' ')}
                          </p>
                        ) : null}
                        <p className={`mt-1 text-[10px] ${item.senderRole === 'user' ? 'text-emerald-100 dark:text-emerald-900/80' : 'text-slate-400 dark:text-slate-300'}`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''}
                        </p>
                      </div>
                    ))}
                    <div ref={scrollAnchorRef} />
                  </div>
                </ScrollArea>

                <div className="flex min-w-0 items-end gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
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
                    <Button className="h-10 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400" onClick={() => void sendMessage()} disabled={sending || (!messageText.trim() && !messageAttachment)}>
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
          type="button"
          className="fixed z-[70] flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_rgba(13,148,136,0.35)] sm:h-14 sm:w-14"
          style={{ left: position.x, top: position.y }}
          onPointerDown={startDrag}
          onClick={() => setOpen((prev) => !prev)}
          title="Drag to move. Click to open support chat."
        >
          <MessageCircle className="h-5 w-5 sm:h-6 sm:w-6" />
          {unreadCount > 0 ? (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-[1.25rem] bg-rose-600 px-1 text-[10px] text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          ) : null}
          <span className="pointer-events-none absolute -bottom-5 hidden items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white sm:inline-flex">
            <GripHorizontal className="h-3 w-3" /> drag
          </span>
        </button>
      ) : null}
    </>
  );
}
