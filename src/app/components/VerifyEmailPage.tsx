import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MailWarning } from 'lucide-react';
import { apiRequest } from '../lib/api';

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'invalid'; message: string }
  | { status: 'success'; email: string; alreadyVerified?: boolean };

export const VerifyEmailPage = memo(function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawToken = useMemo(() => String(searchParams.get('token') || '').trim(), [searchParams]);
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' });

  useEffect(() => {
    if (!rawToken || rawToken.length > 256) {
      setVerify({ status: 'invalid', message: 'This verification link is missing or invalid.' });
      return;
    }
    let cancelled = false;
    setVerify({ status: 'loading' });
    void (async () => {
      try {
        const res = await apiRequest<{
          ok?: boolean;
          email?: string;
          alreadyVerified?: boolean;
          error?: string;
        }>(`/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`, { method: 'GET' }, null);
        if (cancelled) return;
        if (!res?.ok) {
          setVerify({
            status: 'invalid',
            message: String(res?.error || 'This verification link is not valid.'),
          });
          return;
        }
        setVerify({
          status: 'success',
          email: String(res.email || ''),
          alreadyVerified: Boolean(res.alreadyVerified),
        });
      } catch (error) {
        if (!cancelled) {
          setVerify({
            status: 'invalid',
            message: (error as Error)?.message || 'Could not verify this email. Please try again.',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rawToken]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 items-center justify-center py-6">
      <section className="w-full rounded-2xl border border-[#c7d2fe] bg-white p-6 shadow-[0_16px_40px_rgba(79,70,229,0.12)]">
        <header className="space-y-2">
          <h1 className="text-xl font-bold leading-tight text-[#312e81]">Verify your email</h1>
          <p className="text-sm leading-relaxed text-[#334155]">
            Confirm your NET360 account, then sign in with your email and password.
          </p>
        </header>

        <div className="mt-6 space-y-5">
          {verify.status === 'loading' || verify.status === 'idle' ? (
            <div className="flex items-center gap-3 text-[#334155]">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-600" aria-hidden />
              <p className="text-base font-medium">Verifying your email…</p>
            </div>
          ) : null}

          {verify.status === 'invalid' ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#fda4af] bg-[#fff1f2] p-3 text-sm font-medium text-[#9f1239]">
              <MailWarning className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <p>{verify.message}</p>
            </div>
          ) : null}

          {verify.status === 'success' ? (
            <div className="flex items-start gap-2 rounded-xl border border-[#059669] bg-[#ecfdf5] p-3 text-sm font-medium text-[#064e3b]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#047857]" aria-hidden />
              <p>
                {verify.alreadyVerified
                  ? 'This email is already verified. You can sign in now.'
                  : 'Your email is verified. You can sign in now.'}
                {verify.email ? (
                  <>
                    {' '}
                    <span className="break-all font-semibold">{verify.email}</span>
                  </>
                ) : null}
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => navigate('/profile', { replace: true })}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-indigo-700 px-4 text-base font-semibold text-white shadow-sm touch-manipulation"
          >
            {verify.status === 'success' ? 'Sign in' : 'Back to sign in'}
          </button>
        </div>
      </section>
    </div>
  );
});
