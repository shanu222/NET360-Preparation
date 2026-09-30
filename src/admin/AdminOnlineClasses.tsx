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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<{ content: unknown; updatedAt: string | null; updatedByEmail: string }>('/api/admin/online-classes');
      setContent(mergeOnlineClassesContent(payload.content));
      setCustomized(Boolean(payload.content));
      setMeta({ updatedAt: payload.updatedAt, updatedByEmail: payload.updatedByEmail || '' });
      setDirty(false);
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
      showSuccessToast('Online Classes card text saved. Web and Android both use this copy.');
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
      showSuccessToast('Online Classes card text reset to defaults.');
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
              Edit the Home/Dashboard card. The same text is shown on Web and Android. The Register button opens WhatsApp.
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
        <Field label="Title">
          <Input value={content.title} onChange={(e) => setField('title', e.target.value)} />
        </Field>
        <Field label="Description" hint="Promotional copy shown on the card.">
          <Textarea value={content.description} onChange={(e) => setField('description', e.target.value)} rows={3} />
        </Field>
        <Field label="Registration message" hint="Shown on the card below the description.">
          <Textarea value={content.registrationMessage} onChange={(e) => setField('registrationMessage', e.target.value)} rows={4} />
        </Field>
      </CardContent>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Online Classes text?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the built-in title, description, and registration message on both Web and Android.
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
