import { useCallback, useEffect, useMemo, useState } from 'react';
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

export function StudentNotifications() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StudentNotice[]>([]);
  const [loading, setLoading] = useState(false);

  const unread = useMemo(() => items.filter((item) => !item.readAt).length, [items]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const payload = await apiRequest<{ notifications: StudentNotice[] }>('/api/notifications');
      setItems(Array.isArray(payload.notifications) ? payload.notifications : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, token]);

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="touch-manipulation min-h-10 min-w-10 rounded-xl text-slate-600 hover:bg-indigo-50 sm:min-h-9 sm:min-w-9"
        aria-label="Notifications"
        disabled
      >
        <Bell className="w-4 h-4" />
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative touch-manipulation min-h-10 min-w-10 rounded-xl text-slate-600 hover:bg-indigo-50 active:scale-95 sm:min-h-9 sm:min-w-9"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void load();
        }}
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500" />
        ) : null}
      </Button>
      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] dark:border-white/15 dark:bg-slate-900">
          <div className="border-b border-indigo-50 px-3 py-2 text-sm font-medium">Updates</div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? <p className="px-3 py-4 text-sm text-muted-foreground">Loading updates...</p> : null}
            {!loading && items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No notifications yet.</p>
            ) : null}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block w-full px-3 py-3 text-left text-sm transition hover:bg-indigo-50 active:bg-indigo-100 ${item.readAt ? 'opacity-70' : ''}`}
                onClick={() => {
                  void apiRequest(`/api/notifications/${item.id}/read`, { method: 'PATCH' }).catch(() => undefined);
                  setOpen(false);
                  if (item.link) navigate(item.link);
                }}
              >
                <p className="font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
