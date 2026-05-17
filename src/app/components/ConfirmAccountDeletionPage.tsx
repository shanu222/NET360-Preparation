import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { showErrorToast, showSuccessToast } from '../lib/userToast';

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'invalid'; message: string }
  | { status: 'ready'; email: string; firstName: string; expiresAt: string };

export const ConfirmAccountDeletionPage = memo(function ConfirmAccountDeletionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const rawToken = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);

  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [submitError, setSubmitError] = useState('');

  useEffect(() => {
    if (!rawToken || rawToken.length > 512) {
      setVerify({ status: 'invalid', message: 'This deletion link is missing or invalid.' });
      return;
    }
    let cancelled = false;
    setVerify({ status: 'loading' });
    void (async () => {
      try {
        const res = await apiRequest<{
          valid?: boolean;
          email?: string;
          firstName?: string;
          expiresAt?: string;
          error?: string;
        }>(`/api/auth/verify-delete-token?token=${encodeURIComponent(rawToken)}`, { method: 'GET' }, null);
        if (cancelled) return;
        if (!res?.valid) {
          const invalidMessage = String(res?.error || 'This deletion link is not valid.');
          setVerify({ status: 'invalid', message: invalidMessage });
          if (invalidMessage.toLowerCase().includes('expired')) {
            showErrorToast('This deletion link has expired. Request a new verification email.');
          } else if (invalidMessage.toLowerCase().includes('already been used')) {
            showErrorToast('This deletion link was already used.');
          } else {
            showErrorToast(invalidMessage);
          }
          return;
        }
        setVerify({
          status: 'ready',
          email: String(res.email || ''),
          firstName: String(res.firstName || ''),
          expiresAt: String(res.expiresAt || ''),
        });
      } catch (e) {
        if (!cancelled) {
          setVerify({
            status: 'invalid',
            message: (e as Error)?.message || 'Could not verify this deletion link.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  const handleConfirm = useCallback(async () => {
    if (!rawToken || verify.status !== 'ready') return;
    if (confirmationText.trim() !== 'DELETE') {
      setSubmitError('Type DELETE exactly to confirm permanent account deletion.');
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError('');
      const result = await apiRequest<{ message: string }>(
        '/api/auth/confirm-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            token: rawToken,
            confirmationText: 'DELETE',
          }),
          timeoutMs: 90_000,
          retryCount: 0,
        },
        null,
      );
      setDone(true);
      showSuccessToast(
        result?.message || 'Your NET360 account has been permanently deleted.',
      );
      try {
        await logout();
      } catch {
        /* session may already be invalid */
      }
      window.setTimeout(() => {
        navigate('/', { replace: true });
      }, 2200);
    } catch (error) {
      const message = String((error as Error)?.message || 'Could not complete account deletion.');
      setSubmitError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  }, [confirmationText, logout, navigate, rawToken, verify.status]);

  const expiryLabel = verify.status === 'ready' && verify.expiresAt
    ? new Date(verify.expiresAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '';
  const canConfirmDelete = verify.status === 'ready'
    && confirmationText.trim() === 'DELETE'
    && !submitting
    && !done;

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4 py-10">
      <Helmet>
        <title>Confirm account deletion | NET360 Preparation</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Card className="border-rose-200/80 bg-white/95 shadow-lg dark:border-rose-900/40 dark:bg-slate-900/90">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
            <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
            <CardTitle className="text-xl">Account deletion</CardTitle>
          </div>
          <CardDescription className="text-base text-slate-600 dark:text-slate-300">
            This page is only shown when you open a secure deletion link from your email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {verify.status === 'loading' || verify.status === 'idle' ? (
            <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
              <p>Verifying your deletion link…</p>
            </div>
          ) : null}

          {verify.status === 'invalid' ? (
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">{verify.message}</p>
          ) : null}

          {verify.status === 'ready' ? (
            <>
              <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-4 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-50">
                <p className="font-semibold">This action is permanent</p>
                <p className="mt-2 leading-relaxed">
                  Deleting your NET360 account removes your access, subscriptions, preparation progress, community
                  presence, and support chat history associated with this account. Billing records may be retained in
                  redacted form where the law requires.
                </p>
              </div>
              <div className="space-y-1 text-sm text-slate-700 dark:text-slate-200">
                <p>
                  <span className="font-medium text-slate-900 dark:text-slate-50">Account email:</span>{' '}
                  {verify.email}
                </p>
                {verify.firstName ? (
                  <p>
                    <span className="font-medium text-slate-900 dark:text-slate-50">Name on file:</span>{' '}
                    {verify.firstName}
                  </p>
                ) : null}
                {expiryLabel ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">Link valid until {expiryLabel}.</p>
                ) : null}
                <p className="text-xs font-medium text-rose-700 dark:text-rose-300">
                  This deletion link is single-use and cannot be reused after confirmation.
                </p>
                {user?.email && verify.email && user.email.toLowerCase() !== verify.email.toLowerCase() ? (
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    You are signed in as a different NET360 account. After deletion, this browser session will be
                    cleared.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-delete-text" className="text-sm font-semibold text-rose-800 dark:text-rose-200">
                  Type DELETE to permanently remove your account
                </Label>
                <Input
                  id="confirm-delete-text"
                  name="confirm-delete-text"
                  autoComplete="off"
                  placeholder="DELETE"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="border-rose-300 bg-white text-slate-900 placeholder:text-slate-500 dark:border-rose-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>
              <Button
                type="button"
                variant="destructive"
                className={`w-full min-h-11 touch-manipulation ${canConfirmDelete ? 'opacity-100' : 'opacity-60'}`}
                disabled={!canConfirmDelete}
                onClick={() => void handleConfirm()}
              >
                {submitting ? 'Deleting account…' : done ? 'Account deleted' : 'Confirm Permanent Account Deletion'}
              </Button>
              {submitError ? (
                <p className="text-xs font-medium text-rose-700 dark:text-rose-300">{submitError}</p>
              ) : null}
            </>
          ) : null}

          {done ? (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50/90 p-3 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p>Your account has been deleted. Redirecting to the home page…</p>
            </div>
          ) : null}

          <Button type="button" variant="outline" className="w-full" onClick={() => navigate('/', { replace: true })}>
            Cancel and return home
          </Button>
        </CardContent>
      </Card>
    </div>
  );
});
