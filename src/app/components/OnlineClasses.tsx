import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../lib/authSession';
import { isNativeRuntime } from '../lib/nativeDiagnostics';
import {
  useOnlineClassesContent,
  type OnlineClassesRegistration,
} from '../lib/onlineClasses';
import { handleApiError, showSuccessToast } from '../lib/userToast';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

function bearerForApi(): string | undefined {
  if (shouldPersistAuthTokens()) {
    const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (stored && !isCookieSessionApiMarker(stored)) return stored;
  }
  return undefined;
}

export function OnlineClassesPage() {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const content = useOnlineClassesContent();
  const nativeApp = isNativeRuntime();
  const [registration, setRegistration] = useState<OnlineClassesRegistration | null>(null);
  const [loading, setLoading] = useState(Boolean(user));
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    fullName: '',
    phone: '',
    city: '',
    targetProgram: '',
    note: '',
  });

  useEffect(() => {
    if (!user) {
      setRegistration(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const session = (token && !isCookieSessionApiMarker(token) ? token : bearerForApi()) || COOKIE_SESSION_API_MARKER;
    apiRequest<OnlineClassesRegistration>('/api/online-classes/me', {}, session)
      .then((payload) => {
        if (cancelled) return;
        setRegistration(payload);
        setForm({
          fullName: payload.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
          phone: payload.phone || '',
          city: payload.city || '',
          targetProgram: payload.targetProgram || '',
          note: payload.note || '',
        });
      })
      .catch(() => {
        if (!cancelled) {
          setForm((current) => ({
            ...current,
            fullName: current.fullName || [user.firstName, user.lastName].filter(Boolean).join(' '),
          }));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    const session = (token && !isCookieSessionApiMarker(token) ? token : bearerForApi()) || COOKIE_SESSION_API_MARKER;
    try {
      const payload = await apiRequest<OnlineClassesRegistration & { ok?: boolean }>(
        '/api/online-classes/register',
        {
          method: 'POST',
          body: JSON.stringify({
            ...form,
            platform: nativeApp ? 'android' : 'web',
          }),
        },
        session,
      );
      setRegistration(payload);
      showSuccessToast('You are registered for Online Classes.');
    } catch (error) {
      handleApiError(error, 'Could not submit your registration.');
    } finally {
      setSaving(false);
    }
  };

  const shell = nativeApp
    ? 'space-y-4'
    : 'mx-auto max-w-2xl space-y-5';
  const panel = nativeApp
    ? 'overflow-hidden rounded-3xl bg-white p-4 dark:bg-[#1a2238]'
    : 'rounded-2xl border border-indigo-100 bg-white/90 p-5 shadow-[0_10px_25px_rgba(98,113,202,0.11)] dark:border-white/10 dark:bg-slate-900/60';

  return (
    <div className={shell}>
      <div>
        <h1 className={nativeApp ? 'text-xl font-semibold text-slate-900 dark:text-slate-100' : 'text-2xl font-bold text-indigo-950 dark:text-slate-50'}>
          {content.pageTitle}
        </h1>
        {content.description ? (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{content.description}</p>
        ) : null}
      </div>

      {content.classDetails ? (
        <section className={panel}>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Class details</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{content.classDetails}</p>
        </section>
      ) : null}

      <section className={panel}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
            <GraduationCap className="h-5 w-5" />
          </span>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Registration</p>
        </div>
        {content.registrationMessage ? (
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">{content.registrationMessage}</p>
        ) : null}

        {!user ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-300">Sign in to register for Online Classes.</p>
            <Button type="button" className="min-h-11 rounded-xl" onClick={() => navigate('/profile')}>
              Go to profile
            </Button>
          </div>
        ) : loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </p>
        ) : registration?.registered ? (
          <div className="space-y-2 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100">
            <p className="font-semibold">You are registered.</p>
            <p>We have your details and will contact you with class timings.</p>
            {registration.registeredAt ? (
              <p className="text-xs opacity-80">Submitted {new Date(registration.registeredAt).toLocaleString()}</p>
            ) : null}
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="oc-name">Full name</Label>
              <Input id="oc-name" value={form.fullName} onChange={(e) => setForm((c) => ({ ...c, fullName: e.target.value }))} className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-phone">WhatsApp / phone</Label>
              <Input id="oc-phone" value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} placeholder="03xx xxxxxxx" className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-city">City</Label>
              <Input id="oc-city" value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-program">Target NET / programme</Label>
              <Input id="oc-program" value={form.targetProgram} onChange={(e) => setForm((c) => ({ ...c, targetProgram: e.target.value }))} placeholder="e.g. NET Engineering" className="min-h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="oc-note">Message (optional)</Label>
              <Textarea id="oc-note" value={form.note} onChange={(e) => setForm((c) => ({ ...c, note: e.target.value }))} rows={3} />
            </div>
            <Button type="submit" className="min-h-11 w-full rounded-xl" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : content.ctaText || 'Register now'}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
