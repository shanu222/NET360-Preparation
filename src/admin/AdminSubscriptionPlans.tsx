import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { apiRequest } from '../app/lib/api';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  mergeSubscriptionPlans,
  type MentorPlanContent,
  type StandardPlanKey,
  type SubscriptionPlansContent,
  type VideosPlanContent,
} from '../app/lib/subscriptionPlans';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Textarea } from '../app/components/ui/textarea';
import { Switch } from '../app/components/ui/switch';
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

const STANDARD_KEYS: StandardPlanKey[] = ['tests', 'preparation', 'community'];

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <p className="font-semibold text-slate-900">{title}</p>
      <div className="grid gap-3 md:grid-cols-2">{children}</div>
    </div>
  );
}

export function AdminSubscriptionPlans() {
  const [plans, setPlans] = useState<SubscriptionPlansContent>(DEFAULT_SUBSCRIPTION_PLANS);
  const [customized, setCustomized] = useState(false);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedByEmail: string }>({ updatedAt: null, updatedByEmail: '' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await apiRequest<{ plans: unknown; updatedAt: string | null; updatedByEmail: string }>('/api/admin/subscription-plans');
      setPlans(mergeSubscriptionPlans(payload.plans));
      setCustomized(Boolean(payload.plans));
      setMeta({ updatedAt: payload.updatedAt, updatedByEmail: payload.updatedByEmail || '' });
      setDirty(false);
    } catch (error) {
      handleApiError(error, 'Could not load subscription settings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setPage = (key: 'pageTitle' | 'pageSubtitle' | 'sectionTitle' | 'sectionSubtitle', value: string) => {
    setPlans((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const setStandard = (plan: StandardPlanKey, key: keyof SubscriptionPlansContent[StandardPlanKey], value: string | number) => {
    setPlans((current) => ({ ...current, [plan]: { ...current[plan], [key]: value } }));
    setDirty(true);
  };

  const setVideos = <K extends keyof VideosPlanContent>(key: K, value: VideosPlanContent[K]) => {
    setPlans((current) => ({ ...current, videos: { ...current.videos, [key]: value } }));
    setDirty(true);
  };

  const setMentor = <K extends keyof MentorPlanContent>(key: K, value: MentorPlanContent[K]) => {
    setPlans((current) => ({ ...current, mentor: { ...current.mentor, [key]: value } }));
    setDirty(true);
  };

  const priceInput = (value: number, onChange: (next: number) => void) => (
    <Input
      type="number"
      min={0}
      step={1}
      inputMode="numeric"
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Math.max(0, Math.round(Number(event.target.value) || 0)))}
    />
  );

  const save = async () => {
    setSaving(true);
    try {
      await apiRequest('/api/admin/subscription-plans', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plans }),
      });
      showSuccessToast('Subscription settings saved. The website subscription page now shows the new details.');
      await load();
    } catch (error) {
      handleApiError(error, 'Could not save subscription settings.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setConfirmReset(false);
    setSaving(true);
    try {
      await apiRequest('/api/admin/subscription-plans', { method: 'DELETE' });
      showSuccessToast('Subscription settings restored to the defaults.');
      await load();
    } catch (error) {
      handleApiError(error, 'Could not reset subscription settings.');
    } finally {
      setSaving(false);
    }
  };

  const videos = plans.videos;
  const mentor = plans.mentor;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Website Subscription Plans</CardTitle>
            <CardDescription>
              Edit the titles, prices, durations, and promotional text shown on the website subscription page. The Android app is not affected.
            </CardDescription>
          </div>
          <BusyButton type="button" variant="outline" busy={loading} busyLabel="Refreshing..." onClick={() => void load()}>
            Refresh
          </BusyButton>
        </div>
        <p className="text-xs text-slate-500">
          {customized
            ? [meta.updatedAt ? `Last saved ${new Date(meta.updatedAt).toLocaleString()}` : 'Custom settings', meta.updatedByEmail ? `by ${meta.updatedByEmail}` : '']
                .filter(Boolean)
                .join(' ')
            : 'Showing the built-in default settings.'}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Section title="Page text">
          <Field label="Page title">
            <Input value={plans.pageTitle} maxLength={80} onChange={(event) => setPage('pageTitle', event.target.value)} />
          </Field>
          <Field label="Page subtitle">
            <Input value={plans.pageSubtitle} maxLength={600} onChange={(event) => setPage('pageSubtitle', event.target.value)} />
          </Field>
          <Field label="Services heading">
            <Input value={plans.sectionTitle} maxLength={80} onChange={(event) => setPage('sectionTitle', event.target.value)} />
          </Field>
          <Field label="Services subheading">
            <Input value={plans.sectionSubtitle} maxLength={600} onChange={(event) => setPage('sectionSubtitle', event.target.value)} />
          </Field>
        </Section>

        {STANDARD_KEYS.map((key) => {
          const plan = plans[key];
          return (
            <Section key={key} title={plan.title || key}>
              <Field label="Title">
                <Input value={plan.title} maxLength={80} onChange={(event) => setStandard(key, 'title', event.target.value)} />
              </Field>
              <Field label="Price (PKR)">{priceInput(plan.price, (next) => setStandard(key, 'price', next))}</Field>
              <Field label="Duration" hint="Shown as “/ 6 months”.">
                <Input value={plan.duration} maxLength={80} onChange={(event) => setStandard(key, 'duration', event.target.value)} />
              </Field>
              <Field label="Description">
                <Textarea value={plan.description} maxLength={600} rows={2} onChange={(event) => setStandard(key, 'description', event.target.value)} />
              </Field>
            </Section>
          );
        })}

        <Section title={videos.title || 'Videos'}>
          <Field label="Title">
            <Input value={videos.title} maxLength={80} onChange={(event) => setVideos('title', event.target.value)} />
          </Field>
          <Field label="Badge" hint="Small green tag next to the title. Leave empty to hide.">
            <Input value={videos.badge} maxLength={80} onChange={(event) => setVideos('badge', event.target.value)} />
          </Field>
          <Field label="Regular price (PKR)">{priceInput(videos.regularPrice, (next) => setVideos('regularPrice', next))}</Field>
          <Field label="Offer price (PKR)" hint="Charged until the offer end date.">
            {priceInput(videos.offerPrice, (next) => setVideos('offerPrice', next))}
          </Field>
          <Field label="Offer ends on" hint="From this date (Pakistan time) the regular price applies and the offer text is hidden. Clear to disable the offer.">
            <Input type="date" value={videos.offerEndsOn} onChange={(event) => setVideos('offerEndsOn', event.target.value)} />
          </Field>
          <Field label="Offer label" hint="Corner ribbon, e.g. “50% OFF”.">
            <Input value={videos.offerLabel} maxLength={80} onChange={(event) => setVideos('offerLabel', event.target.value)} />
          </Field>
          <Field label="Duration">
            <Input value={videos.duration} maxLength={80} onChange={(event) => setVideos('duration', event.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={videos.description} maxLength={600} rows={2} onChange={(event) => setVideos('description', event.target.value)} />
          </Field>
          <Field label="Promotional message">
            <Textarea value={videos.promoText} maxLength={600} rows={3} onChange={(event) => setVideos('promoText', event.target.value)} />
          </Field>
          <Field label="Offer details">
            <Textarea value={videos.promoDetails} maxLength={600} rows={3} onChange={(event) => setVideos('promoDetails', event.target.value)} />
          </Field>
        </Section>

        <Section title={mentor.title || 'AI Smart Study Mentor'}>
          <Field label="Title">
            <Input value={mentor.title} maxLength={80} onChange={(event) => setMentor('title', event.target.value)} />
          </Field>
          <Field label="Available for purchase" hint="When off, the service is shown as unavailable and cannot be selected.">
            <div className="flex h-9 items-center">
              <Switch checked={mentor.available} onCheckedChange={(checked) => setMentor('available', Boolean(checked))} />
            </div>
          </Field>
          <Field label="Status label" hint="Shown while unavailable, e.g. “Coming Soon”.">
            <Input value={mentor.statusLabel} maxLength={80} onChange={(event) => setMentor('statusLabel', event.target.value)} />
          </Field>
          <Field label="Price (PKR)" hint="Used only when available for purchase.">
            {priceInput(mentor.price, (next) => setMentor('price', next))}
          </Field>
          <Field label="Duration">
            <Input value={mentor.duration} maxLength={80} onChange={(event) => setMentor('duration', event.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={mentor.description} maxLength={600} rows={2} onChange={(event) => setMentor('description', event.target.value)} />
          </Field>
        </Section>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving || !customized} onClick={() => setConfirmReset(true)}>
            Restore defaults
          </Button>
          <Button type="button" variant="outline" disabled={saving || !dirty} onClick={() => void load()}>
            Discard changes
          </Button>
          <BusyButton type="button" busy={saving} busyLabel="Saving..." disabled={!dirty} onClick={() => void save()}>
            Save changes
          </BusyButton>
        </div>
      </CardContent>
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore default subscription settings?</AlertDialogTitle>
            <AlertDialogDescription>
              All custom titles, prices, durations, and promotional text are removed and the website shows the built-in defaults.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void reset()}>Restore defaults</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
