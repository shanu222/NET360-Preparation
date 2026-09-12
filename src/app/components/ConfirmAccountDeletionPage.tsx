import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
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
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-center px-4 py-10 text-[#0f172a]">
      <Helmet>
        <title>Confirm account deletion | NET360 Preparation</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="color-scheme" content="light" />
      </Helmet>

      <section
        className="rounded-2xl border border-[#fecdd3] bg-white p-6 shadow-xl"
        style={{ colorScheme: 'light' }}
      >
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-[#be123c]">
            <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden />
            <h1 className="text-xl font-bold leading-tight text-[#9f1239]">Account deletion</h1>
          </div>
          <p className="text-base leading-relaxed text-[#334155]">
            This page is only shown when you open a secure deletion link from your email.
          </p>
        </header>

        <div className="mt-6 space-y-5">
          {verify.status === 'loading' || verify.status === 'idle' ? (
            <div className="flex items-center gap-3 text-[#334155]">
              <Loader2 className="h-6 w-6 animate-spin text-[#be123c]" aria-hidden />
              <p className="text-base font-medium">Verifying your deletion link…</p>
            </div>
          ) : null}

          {verify.status === 'invalid' ? (
            <p className="text-sm font-semibold text-[#9f1239]">{verify.message}</p>
          ) : null}

          {verify.status === 'ready' ? (
            <>
              <div className="rounded-xl border border-[#f59e0b] bg-[#fffbeb] p-4 text-[#78350f]">
                <p className="text-sm font-bold text-[#92400e]">This action is permanent</p>
                <p className="mt-2 text-sm leading-relaxed text-[#78350f]">
                  Deleting your NET360 account removes your access, subscriptions, preparation progress, community
                  presence, and support chat history associated with this account. Billing records may be retained in
                  redacted form where the law requires.
                </p>
              </div>
              <div className="space-y-2 text-sm leading-relaxed text-[#1e293b]">
                <p>
                  <span className="font-semibold text-[#0f172a]">Account email:</span>{' '}
                  <span className="break-all">{verify.email}</span>
                </p>
                {verify.firstName ? (
                  <p>
                    <span className="font-semibold text-[#0f172a]">Name on file:</span>{' '}
                    {verify.firstName}
                  </p>
                ) : null}
                {expiryLabel ? (
                  <p className="text-sm font-medium text-[#475569]">Link valid until {expiryLabel}.</p>
                ) : null}
                <p className="text-sm font-semibold text-[#9f1239]">
                  This deletion link is single-use and cannot be reused after confirmation.
                </p>
                {user?.email && verify.email && user.email.toLowerCase() !== verify.email.toLowerCase() ? (
                  <p className="text-sm font-semibold text-[#92400e]">
                    You are signed in as a different NET360 account. After deletion, this browser session will be
                    cleared.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <label htmlFor="confirm-delete-text" className="block text-sm font-bold text-[#9f1239]">
                  Type DELETE to permanently remove your account
                </label>
                <input
                  id="confirm-delete-text"
                  name="confirm-delete-text"
                  autoComplete="off"
                  placeholder="DELETE"
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  className="h-12 w-full rounded-xl border-2 border-[#e11d48] bg-white px-3 text-base font-semibold text-[#0f172a] outline-none placeholder:font-medium placeholder:text-[#64748b] focus:border-[#be123c] focus:ring-2 focus:ring-[#fb7185]"
                />
              </div>
              <button
                type="button"
                disabled={!canConfirmDelete}
                onClick={() => void handleConfirm()}
                className="flex min-h-12 w-full items-center justify-center rounded-xl bg-[#be123c] px-4 text-base font-bold text-white shadow-sm touch-manipulation disabled:cursor-not-allowed disabled:bg-[#fda4af] disabled:text-white"
              >
                {submitting ? 'Deleting account…' : done ? 'Account deleted' : 'Confirm Permanent Account Deletion'}
              </button>
              {submitError ? (
                <p className="text-sm font-semibold text-[#9f1239]">{submitError}</p>
              ) : null}
            </>
          ) : null}

          {done ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#059669] bg-[#ecfdf5] p-3 text-sm font-medium text-[#064e3b]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" aria-hidden />
              <p>Your account has been deleted. Redirecting to the home page…</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-[#cbd5e1] bg-white px-4 text-base font-semibold text-[#0f172a] touch-manipulation"
          >
            Cancel and return home
          </button>
        </div>
      </section>
    </div>
  );
});
