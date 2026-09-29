import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';
import { NotificationPreferencesList } from './NotificationPreferences';

type StudentNotice = {
  id: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

export function StudentNotifications() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotice[]>([]);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="ghost"
        size="icon"
        className="relative touch-manipulation min-h-10 min-w-10 rounded-xl text-slate-600 hover:bg-indigo-50 active:scale-95 sm:min-h-9 sm:min-w-9"
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
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] dark:border-indigo-400/30 dark:bg-[#12182f]">
          <div className="border-b border-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-950 dark:border-white/10 dark:text-indigo-100">Notifications</div>
          <div className="max-h-[min(70vh,28rem)] overflow-y-auto">
            {!user ? (
              <p className="px-3 py-4 text-sm text-slate-500">Log in to view notifications.</p>
            ) : (
              <>
                <div className="border-b border-indigo-50">
                  {loading ? <p className="px-3 py-4 text-sm text-slate-500">Loading notifications...</p> : null}
                  {!loading && items.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-slate-500 dark:text-indigo-200/80">No new notifications</p>
                  ) : null}
                  {items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`block w-full px-3 py-3 text-left text-sm transition hover:bg-indigo-50 ${item.readAt ? 'opacity-70' : ''}`}
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
                      <p className="font-medium text-indigo-950 dark:text-indigo-100">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-indigo-200/80">{item.body}</p>
                    </button>
                  ))}
                </div>
                <div className="px-3 py-3">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-200">Notification preferences</p>
                  <NotificationPreferencesList compact />
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
