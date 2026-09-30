import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

type StudentNotice = {
  id: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

type PanelPos = { top: number; right: number; maxHeight: number };

export function StudentNotifications() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotice[]>([]);
  const [loading, setLoading] = useState(false);
  const [panelPos, setPanelPos] = useState<PanelPos | null>(null);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const load = useCallback(async () => {
    if (!user || !token) return;
    setLoading(true);
    try {
      const payload = await apiRequest<{ notifications: StudentNotice[] }>('/api/notifications', {}, token);
      setItems(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, user]);

  const recomputePosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const top = rect.bottom + 8;
    const maxHeight = Math.max(160, Math.min(448, window.innerHeight - top - 8));
    setPanelPos({
      top,
      right: Math.max(8, window.innerWidth - rect.right),
      maxHeight,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLayoutEffect(() => {
    if (!open) return;
    recomputePosition();
  }, [open, recomputePosition]);

  useEffect(() => {
    if (!open) return undefined;

    const pathIncludes = (event: Event, node: Node | null) => {
      if (!node) return false;
      const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
      return path.includes(node);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (pathIncludes(event, buttonRef.current) || pathIncludes(event, panelRef.current)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onWindowScroll = (event: Event) => {
      if (pathIncludes(event, panelRef.current) || pathIncludes(event, listRef.current)) return;
      recomputePosition();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', recomputePosition);
    window.addEventListener('scroll', onWindowScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', recomputePosition);
      window.removeEventListener('scroll', onWindowScroll, true);
    };
  }, [open, recomputePosition]);

  const panel = open && panelPos ? (
    <div
      ref={panelRef}
      className="net360-web-notice-panel fixed z-[1000] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-indigo-200 bg-white text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.22)] dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50"
      style={{ top: panelPos.top, right: panelPos.right, maxHeight: panelPos.maxHeight }}
      role="dialog"
      aria-label="Notifications"
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="shrink-0 border-b border-indigo-100 bg-white px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50">
        Notifications
      </div>
      <div
        ref={listRef}
        className="net360-web-notice-list min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white dark:bg-slate-900"
        onWheel={(event) => event.stopPropagation()}
        onScroll={(event) => event.stopPropagation()}
      >
        {!user ? (
          <p className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">Log in to view notifications.</p>
        ) : loading && items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">Loading notifications...</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-600 dark:text-slate-300">No new notifications</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`block w-full border-b border-indigo-100 px-3 py-3 text-left text-sm last:border-b-0 transition hover:bg-indigo-50 dark:border-slate-700 dark:hover:bg-slate-800 ${item.readAt ? 'bg-white dark:bg-slate-900' : 'bg-indigo-50 dark:bg-indigo-950'}`}
              onClick={() => {
                if (!item.readAt) {
                  void apiRequest(`/api/notifications/${item.id}/read`, { method: 'PATCH' }, token).catch(() => undefined);
                  setItems((current) => current.map((row) => (
                    row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row
                  )));
                }
                setOpen(false);
                if (item.link.startsWith('/')) navigate(item.link);
              }}
            >
              <p className={`font-medium ${item.readAt ? 'text-slate-700 dark:text-slate-200' : 'text-slate-900 dark:text-white'}`}>
                {item.title}
              </p>
              <p className="mt-0.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{item.body}</p>
            </button>
          ))
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="icon"
        className="relative touch-manipulation min-h-10 min-w-10 rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-800 active:scale-95 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white sm:min-h-9 sm:min-w-9"
        onClick={() => {
          setOpen((current) => !current);
          if (!open && user) void load();
        }}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {user && unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        ) : null}
      </Button>
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
