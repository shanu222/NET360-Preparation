import { type ChangeEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, X, GripHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { ScrollArea } from './ui/scroll-area';
import { Badge } from './ui/badge';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import { toast } from 'sonner';
import { PushNotifications } from '@capacitor/push-notifications';

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
  const [position, setPosition] = useState(() => ({
    x: Math.max(16, window.innerWidth - 88),
    y: Math.max(16, window.innerHeight - 140),
  }));
  const [panelPosition, setPanelPosition] = useState(() => ({
    x: Math.max(12, window.innerWidth - 392),
    y: Math.max(12, window.innerHeight - 520),
  }));

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

  const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  const canUseWebNotifications = typeof window !== 'undefined' && 'Notification' in window;

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
          toast.success('Notifications enabled on this device.');
        } else {
          toast.error('Notification permission was not granted on this device.');
        }
      } catch {
        toast.error('Could not enable notifications on this device.');
      }
      return;
    }

    if (!canUseWebNotifications) {
      toast.error('Notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationPreference(true);
      toast.success('Notifications enabled for this tab.');
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error('Notifications are blocked in browser settings.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setNotificationPreference(true);
      toast.success('Notifications enabled for this tab.');
    } else {
      toast.error('Notification permission was not granted.');
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

  const panelStyle = useMemo(
    () => ({
      left: Math.min(Math.max(12, panelPosition.x), Math.max(12, window.innerWidth - 372)),
      top: Math.min(Math.max(12, panelPosition.y), Math.max(12, window.innerHeight - 220)),
    }),
    [panelPosition.x, panelPosition.y],
  );

  const loadMessages = async () => {
    if (!canUseChat || !token) return;
    try {
      setLoading(true);
      const payload = await apiRequest<SupportInboxPayload>('/api/support-chat/messages', {}, token);
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
        toast.message('New reply from admin support');
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
      setPosition((prev) => ({
        x: Math.min(Math.max(12, prev.x), Math.max(12, window.innerWidth - 56)),
        y: Math.min(Math.max(12, prev.y), Math.max(12, window.innerHeight - 56)),
      }));
      setPanelPosition((prev) => ({
        x: Math.min(Math.max(12, prev.x), Math.max(12, window.innerWidth - 372)),
        y: Math.min(Math.max(12, prev.y), Math.max(12, window.innerHeight - 220)),
      }));
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragStateRef.current.dragging) return;
      if (dragStateRef.current.target === 'panel') {
        setPanelPosition({
          x: Math.min(Math.max(12, event.clientX - dragStateRef.current.offsetX), Math.max(12, window.innerWidth - 372)),
          y: Math.min(Math.max(12, event.clientY - dragStateRef.current.offsetY), Math.max(12, window.innerHeight - 220)),
        });
      } else {
        setPosition({
          x: Math.min(Math.max(12, event.clientX - dragStateRef.current.offsetX), Math.max(12, window.innerWidth - 56)),
          y: Math.min(Math.max(12, event.clientY - dragStateRef.current.offsetY), Math.max(12, window.innerHeight - 56)),
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
  }, []);

  useEffect(() => {
    const openFromHeader = () => {
      setOpen(true);
      setPanelPosition({
        x: Math.min(Math.max(12, position.x - 302), Math.max(12, window.innerWidth - 372)),
        y: Math.min(Math.max(12, position.y - 340), Math.max(12, window.innerHeight - 220)),
      });
    };

    window.addEventListener('net360:open-support-chat', openFromHeader as EventListener);
    return () => window.removeEventListener('net360:open-support-chat', openFromHeader as EventListener);
  }, [position.x, position.y]);

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
      toast.error(error instanceof Error ? error.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const onFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
      toast.error('File exceeds 8MB size limit.');
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
      toast.success('File attached.');
    } catch {
      toast.error('Could not read selected file.');
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
      toast.error(error instanceof Error ? error.message : 'Could not update reaction.');
    }
  };

  return (
    <>
      {open ? (
        <Card
          className="fixed z-[60] w-[min(92vw,360px)] border-emerald-200 bg-white/95 shadow-[0_16px_44px_rgba(15,118,110,0.24)] transition-all duration-200"
          style={panelStyle}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 cursor-move" onPointerDown={startPanelDrag}>
              <CardTitle className="text-base text-emerald-900">Live Support Chat</CardTitle>
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-500">Reach NET360 admin directly. Replies appear here in real time.</p>
            <div className="mt-1 flex items-center justify-end gap-2">
              {notificationsEnabled ? (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setNotificationPreference(false)}>
                  Notifications: On
                </Button>
              ) : (
                <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void enableNotifications()}>
                  Enable Notifications
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!canUseChat ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p>Login as student to use support chat.</p>
                <a
                  href="https://wa.me/923403318127"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-700 underline underline-offset-2"
                >
                  Contact on WhatsApp (+923403318127)
                </a>
              </div>
            ) : (
              <>
                <div className="rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800">
                  Messages are end-to-end encrypted.
                </div>
                <ScrollArea className="h-64 rounded-lg border bg-slate-50 p-2">
                  <div className="space-y-2">
                    {loading ? <p className="text-xs text-slate-500">Loading messages...</p> : null}
                    {!messages.length ? <p className="text-xs text-slate-500">Start a conversation with admin support.</p> : null}
                    {messages.map((item) => (
                      <div
                        key={item.id}
                        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          item.senderRole === 'user'
                            ? 'ml-auto bg-emerald-600 text-white'
                            : 'mr-auto border bg-white text-slate-700'
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
                              className="rounded border bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-800"
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
                        <p className={`mt-1 text-[10px] ${item.senderRole === 'user' ? 'text-emerald-100' : 'text-slate-400'}`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleTimeString() : ''}
                        </p>
                      </div>
                    ))}
                    <div ref={scrollAnchorRef} />
                  </div>
                </ScrollArea>

                <div className="flex items-end gap-2">
                  <Textarea
                    value={messageText}
                    onChange={(event) => setMessageText(event.target.value)}
                    placeholder="Type your message"
                    className="min-h-[70px]"
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void sendMessage();
                      }
                    }}
                  />
                  <div className="flex flex-col gap-2">
                    <Button type="button" variant="outline" className="h-10" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                      File
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={SUPPORT_ATTACHMENT_ACCEPT}
                      className="hidden"
                      onChange={(e) => void onFileSelected(e)}
                    />
                    <Button className="h-10 bg-emerald-600 hover:bg-emerald-700" onClick={() => void sendMessage()} disabled={sending || (!messageText.trim() && !messageAttachment)}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {messageAttachment ? (
                  <div className="rounded-md border bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-medium">Attached: {messageAttachment.name}</p>
                    <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setMessageAttachment(null)}>
                      Remove File
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      <button
        type="button"
        className="fixed z-[70] flex h-14 w-14 items-center justify-center rounded-full border border-emerald-300 bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_12px_28px_rgba(13,148,136,0.35)]"
        style={{ left: position.x, top: position.y }}
        onPointerDown={startDrag}
        onClick={() => setOpen((prev) => !prev)}
        title="Drag to move. Click to open support chat."
      >
        <MessageCircle className="h-6 w-6" />
        {unreadCount > 0 ? (
          <Badge className="absolute -right-2 -top-2 h-5 min-w-[1.25rem] bg-rose-600 px-1 text-[10px] text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        ) : null}
        <span className="pointer-events-none absolute -bottom-5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
          <GripHorizontal className="h-3 w-3" /> drag
        </span>
      </button>
    </>
  );
}
