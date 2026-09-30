import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from '../app/lib/api';
import {
  DEFAULT_ONLINE_CLASSES,
  mergeOnlineClassesContent,
  type OnlineClassesContent,
} from '../app/lib/onlineClasses';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Textarea } from '../app/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../app/components/ui/alert-dialog';
import { BusyButton } from '../app/components/BusyButton';
import { handleApiError, showSuccessToast } from '../app/lib/userToast';

type RegistrationRow = {
  id: string;
  email: string;
  accountName: string;
  fullName: string;
  phone: string;
  city: string;
  targetProgram: string;
  note: string;
  platform: string;
  registeredAt: string | null;
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function AdminOnlineClasses() {
  const [content, setContent] = useState<OnlineClassesContent>(DEFAULT_ONLINE_CLASSES);
  const [customized, setCustomized] = useState(false);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedByEmail: string }>({ updatedAt: null, updatedByEmail: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<{ content: unknown; updatedAt: string | null; updatedByEmail: string }>('/api/admin/online-classes');
      setContent(mergeOnlineClassesContent(payload.content));
      setCustomized(Boolean(payload.content));
      setMeta({ updatedAt: payload.updatedAt, updatedByEmail: payload.updatedByEmail || '' });
      setDirty(false);
      const list = await apiRequest<{ registrations: RegistrationRow[] }>('/api/admin/online-classes/registrations');
      setRegistrations(list.registrations || []);
    } catch (error) {
      handleApiError(error, 'Could not load Online Classes settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (key: keyof OnlineClassesContent, value: string) => {
    setContent((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/admin/online-classes', { method: 'PUT', body: JSON.stringify({ content }) });
      showSuccessToast('Online Classes content saved. Web and Android both use this copy.');
      await load();
    } catch (error) {
      handleApiError(error, 'Could not save Online Classes content.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/admin/online-classes', { method: 'DELETE' });
      showSuccessToast('Online Classes content reset to defaults.');
      setConfirmReset(false);
      await load();
    } catch (error) {
      handleApiError(error, 'Could not reset Online Classes content.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Online Classes</CardTitle>
            <CardDescription>
              Edit the dashboard card and registration page. The same text is shown on Web and Android.
              {customized && meta.updatedAt ? ` Last saved ${new Date(meta.updatedAt).toLocaleString()} by ${meta.updatedByEmail || 'admin'}.` : ' Using built-in defaults until you save.'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading || saving}>
              Refresh
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmReset(true)} disabled={saving || !customized}>
              Reset defaults
            </Button>
            <BusyButton type="button" size="sm" busy={saving} disabled={!dirty} onClick={() => void save()}>
              Save
            </BusyButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Card badge">
            <Input value={content.cardBadge} onChange={(e) => setField('cardBadge', e.target.value)} />
          </Field>
          <Field label="Card title">
            <Input value={content.cardTitle} onChange={(e) => setField('cardTitle', e.target.value)} />
          </Field>
          <Field label="Page title">
            <Input value={content.pageTitle} onChange={(e) => setField('pageTitle', e.target.value)} />
          </Field>
          <Field label="Button / CTA text">
            <Input value={content.ctaText} onChange={(e) => setField('ctaText', e.target.value)} />
          </Field>
        </div>
        <Field label="Card description" hint="Shown on the Home/Dashboard card.">
          <Textarea value={content.cardDescription} onChange={(e) => setField('cardDescription', e.target.value)} rows={3} />
        </Field>
        <Field label="Page description">
          <Textarea value={content.description} onChange={(e) => setField('description', e.target.value)} rows={3} />
        </Field>
        <Field label="Registration message">
          <Textarea value={content.registrationMessage} onChange={(e) => setField('registrationMessage', e.target.value)} rows={3} />
        </Field>
        <Field label="Class details">
          <Textarea value={content.classDetails} onChange={(e) => setField('classDetails', e.target.value)} rows={5} />
        </Field>

        <div className="rounded-xl border border-slate-200 p-4">
          <p className="font-semibold text-slate-900">Registrations ({registrations.length})</p>
          <p className="mb-3 text-xs text-slate-500">Students who submitted the form on Web or Android.</p>
          {registrations.length ? (
            <div className="max-h-80 space-y-2 overflow-auto text-sm">
              {registrations.map((row) => (
                <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="font-medium">{row.fullName || row.accountName || 'Student'}</p>
                  <p className="text-xs text-slate-500">{row.email} · {row.phone} · {row.platform || 'web'}</p>
                  {row.city || row.targetProgram ? (
                    <p className="text-xs text-slate-600">{[row.city, row.targetProgram].filter(Boolean).join(' · ')}</p>
                  ) : null}
                  {row.note ? <p className="mt-1 text-xs text-slate-600">{row.note}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No registrations yet.</p>
          )}
        </div>
      </CardContent>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Online Classes text?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the built-in titles and descriptions on both Web and Android. Student registrations are not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
