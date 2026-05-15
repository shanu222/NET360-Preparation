import { useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../lib/authSession';
import { NET360_ADMIN_WHATSAPP } from '../lib/paymentMethods';
import { audienceFriendlyError, showErrorToast, showInfoToast, showSuccessToast } from '../lib/userToast';
import { formatCountdown, useSubscription } from '../context/SubscriptionContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { PremiumCountdownBadge } from './subscription/PremiumCountdownBadge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

function bearerForApi(): string | undefined {
  if (shouldPersistAuthTokens()) {
    const s = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (s && !isCookieSessionApiMarker(s)) return s;
  }
  return undefined;
}

export const SubscriptionPage = memo(function SubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { surface, me, refresh, loading } = useSubscription();
  const [payMethod, setPayMethod] = useState<'easypaisa' | 'jazzcash'>('easypaisa');
  const [mobile, setMobile] = useState('');
  const [cnic, setCnic] = useState('');
  const [walletAccountNumber, setWalletAccountNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [orderId, setOrderId] = useState('');
  const [basketId, setBasketId] = useState('');
  const [payBusy, setPayBusy] = useState(false);
  const [plans, setPlans] = useState<Array<{ id: string; name: string; pricePkr: number }>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await apiRequest<{ plans: Array<{ id: string; name: string; pricePkr: number }> }>(
          '/api/subscriptions/plans',
          {},
          bearerForApi() || COOKIE_SESSION_API_MARKER,
        );
        if (!cancelled) setPlans(p.plans || []);
      } catch {
        if (!cancelled) setPlans([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const premiumPlan = plans.find((p) => p.id === 'premium_6m');

  /** Automated PayFast only when `/subscriptions/me` sets `payfastCheckoutDisabled: false`. Missing flag (older API) → manual flow to avoid 404 on `/payments/order`. */
  const automatedCheckoutLive = me?.payfastCheckoutDisabled === false;
  const checkoutDisabled = !automatedCheckoutLive;
  const [paymentStep, setPaymentStep] = useState<'summary' | 'manual'>('summary');

  useEffect(() => {
    if (automatedCheckoutLive) {
      setPaymentStep('summary');
    }
  }, [automatedCheckoutLive]);

  const whatsappRaw = (
    me?.manualSubscriptionWhatsapp ||
    `${import.meta.env.VITE_MANUAL_SUBSCRIPTION_WHATSAPP || ''}` ||
    NET360_ADMIN_WHATSAPP
  ).trim();
  const whatsappDigits = whatsappRaw.replace(/\D/g, '');

  const notifyCheckoutPaused = () => {
    const contact =
      whatsappRaw && whatsappDigits
        ? ` Contact us on WhatsApp for manual activation: ${whatsappRaw}.`
        : ` Contact us on WhatsApp: ${NET360_ADMIN_WHATSAPP}.`;
    showInfoToast(`JazzCash and Easypaisa automatic payments are coming soon.${contact}`);
  };

  const openWhatsappManual = () => {
    if (!whatsappDigits) {
      notifyCheckoutPaused();
      return;
    }
    window.open(`https://wa.me/${whatsappDigits}`, '_blank', 'noopener,noreferrer');
  };

  const countdownLabel = (() => {
    if (!surface?.allowed) return '';
    if (surface.source === 'bypass') {
      return me?.subscriptionBadge?.label || 'Enjoy full tests, preparation, and community during the free period.';
    }
    if (!surface.endsAt) return '';
    const { days, hours, minutes } = formatCountdown(surface.msRemaining);
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    const { seconds } = formatCountdown(surface.msRemaining);
    return `${minutes}m ${seconds}s remaining`;
  })();

  const formatDateTime = (value?: string | null) => {
    if (!value) return 'N/A';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'N/A';
    return dt.toLocaleString();
  };

  const normalizeStatus = (status?: string) => {
    const key = String(status || '').trim().toLowerCase();
    if (key === 'active') return { label: 'Active', tone: 'text-emerald-700 dark:text-emerald-300' };
    if (key === 'expired' || key === 'cancelled' || key === 'revoked') return { label: 'Expired', tone: 'text-rose-700 dark:text-rose-300' };
    return { label: 'Inactive', tone: 'text-slate-600 dark:text-slate-300' };
  };

  const formatRemaining = (remainingDays?: number, remainingHours?: number) => {
    const days = Number(remainingDays || 0);
    const hours = Number(remainingHours || 0);
    if (days <= 0 && hours <= 0) return '0h left';
    if (days > 0) return `${days} day(s) ${hours} hour(s) left`;
    return `${hours} hour(s) left`;
  };

  const resolvePlanDuration = (durationValue?: number, durationUnit?: string, durationDays?: number) => {
    const value = Number(durationValue || 0);
    const unit = String(durationUnit || '').trim();
    if (value > 0 && unit) return `${value} ${unit}`;
    const days = Number(durationDays || 0);
    if (days > 0) return `${days} days`;
    return 'N/A';
  };

  if (!user) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-indigo-100 bg-white/80 p-6 text-center dark:border-white/10 dark:bg-slate-900/60">
        <p className="text-slate-700 dark:text-slate-200">Sign in to manage your subscription.</p>
        <Button className="mt-4 rounded-xl" type="button" onClick={() => navigate('/profile')}>
          Go to profile
        </Button>
      </div>
    );
  }

  async function createOrder() {
    if (checkoutDisabled) {
      notifyCheckoutPaused();
      return;
    }
    setPayBusy(true);
    try {
      const res = await apiRequest<{
        ok: boolean;
        orderId: string;
        basketId: string;
        payfastConfigured: boolean;
      }>(
        '/api/payments/order',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: 'premium_6m', paymentMethod: payMethod }),
        },
        bearerForApi() || COOKIE_SESSION_API_MARKER,
      );
      setOrderId(res.orderId);
      setBasketId(res.basketId);
      showSuccessToast('Order ready — enter wallet details to pay.');
    } catch (e) {
      showErrorToast(audienceFriendlyError(e, 'Could not start payment.'));
    } finally {
      setPayBusy(false);
    }
  }

  async function submitPay() {
    if (checkoutDisabled) {
      notifyCheckoutPaused();
      return;
    }
    if (!orderId) {
      showErrorToast('Create an order first.');
      return;
    }
    setPayBusy(true);
    try {
      const res = await apiRequest<{ ok: boolean; needsOtp?: boolean }>(
        '/api/payments/payfast/pay',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId,
            mobile,
            cnic,
            walletAccountNumber,
            otp: otp || undefined,
          }),
        },
        bearerForApi() || COOKIE_SESSION_API_MARKER,
      );
      if (res.needsOtp) {
        showSuccessToast('Enter the code sent to your mobile to continue.');
        return;
      }
      showSuccessToast('Payment successful. Premium activated.');
      setOtp('');
      await refresh();
      navigate('/');
    } catch (e) {
      showErrorToast(audienceFriendlyError(e, 'Payment could not be completed.'));
    } finally {
      setPayBusy(false);
    }
  }

  async function mockComplete() {
    if (!orderId) return;
    setPayBusy(true);
    try {
      await apiRequest(
        '/api/payments/mock/complete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId }),
        },
        bearerForApi() || COOKIE_SESSION_API_MARKER,
      );
      showSuccessToast('Premium activated');
      await refresh();
    } catch (e) {
      showErrorToast(audienceFriendlyError(e, 'Mock payment not available.'));
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Subscription</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {checkoutDisabled
              ? 'Easypaisa & JazzCash auto-pay is coming soon — pay manually via WhatsApp for now.'
              : 'Automated checkout — no admin approval required.'}
          </p>
        </div>
        <PremiumCountdownBadge />
      </div>

      {surface.allowed ? (
        <Card className="border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-950/30">
          <CardHeader>
            <CardTitle as="h2" className="text-emerald-900 dark:text-emerald-100">You have premium access</CardTitle>
            <CardDescription className="text-emerald-800/90 dark:text-emerald-200/90">
              {countdownLabel || me?.subscriptionBadge?.label || 'Enjoy full tests, preparation, and community.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">Your Service Access</CardTitle>
          <CardDescription>
            Track active, expired, and remaining duration across all services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="free-services" className="gap-4">
            <TabsList>
              <TabsTrigger value="free-services">FREE SERVICES</TabsTrigger>
              <TabsTrigger value="paid-services">PAID SERVICES</TabsTrigger>
            </TabsList>

            <TabsContent value="free-services" className="space-y-3">
              {[
                { key: 'tests', label: 'Tests' },
                { key: 'preparation', label: 'Preparation Material' },
                { key: 'community', label: 'Community' },
              ].map((item) => {
                const detail = me?.freeServices?.[item.key as 'tests' | 'preparation' | 'community'];
                const status = normalizeStatus(detail?.status);
                return (
                  <div key={`free-${item.key}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                      <p className={`text-xs font-semibold ${status.tone}`}>{status.label}</p>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                      <p>Expires on: {formatDateTime(detail?.expiresAt)}</p>
                      <p>Remaining: {formatRemaining(detail?.remainingDays, detail?.remainingHours)}</p>
                    </div>
                  </div>
                );
              })}
            </TabsContent>

            <TabsContent value="paid-services" className="space-y-3">
              {[
                { key: 'tests', label: 'Tests' },
                { key: 'preparation', label: 'Preparation Material' },
                { key: 'community', label: 'Community' },
                { key: 'mentor', label: 'Smart Study Mentor' },
              ].map((item) => {
                const detail = me?.paidServices?.[item.key as 'tests' | 'preparation' | 'community' | 'mentor'];
                const status = normalizeStatus(detail?.status);
                return (
                  <div key={`paid-${item.key}`} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.label}</p>
                      <p className={`text-xs font-semibold ${status.tone}`}>{status.label}</p>
                    </div>
                    {item.key === 'mentor' ? (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Smart Study Mentor subscription status is visible for future launch. Mentor feature access remains controlled separately.
                      </p>
                    ) : null}
                    <div className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300">
                      <p>Plan duration: {resolvePlanDuration(detail?.durationValue, detail?.durationUnit, detail?.durationDays)}</p>
                      <p>Expires on: {formatDateTime(detail?.expiresAt)}</p>
                      <p>Remaining: {formatRemaining(detail?.remainingDays, detail?.remainingHours)}</p>
                    </div>
                  </div>
                );
              })}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">{premiumPlan?.name || 'NET360 Premium'}</CardTitle>
          <CardDescription>
            PKR {premiumPlan?.pricePkr ?? 1000} / 6 months — Easypaisa &amp; JazzCash
            {checkoutDisabled ? ' (PayFast checkout on standby).' : ' via PayFast.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkoutDisabled ? (
            paymentStep === 'summary' ? (
              <>
                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/90 p-4 text-left text-sm text-slate-800 dark:border-indigo-500/30 dark:bg-indigo-950/40 dark:text-slate-100">
                  <p className="font-semibold text-indigo-950 dark:text-indigo-50">NET360 Premium</p>
                  <p className="mt-1 text-slate-700 dark:text-slate-200">
                    PKR {premiumPlan?.pricePkr ?? 1000} / 6 months — unlock tests, preparation materials, and community.
                  </p>
                </div>
                <Button type="button" className="w-full rounded-xl sm:w-auto" onClick={() => setPaymentStep('manual')}>
                  Continue to payment
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-xl border border-amber-200/90 bg-amber-50/90 p-4 text-sm text-amber-950 shadow-sm dark:border-amber-500/35 dark:bg-amber-950/50 dark:text-amber-50">
                  <p className="text-base font-semibold">Manual payment via WhatsApp</p>
                  <p className="mt-3 leading-relaxed text-amber-950/95 dark:text-amber-100/95">
                    Automated Easypaisa and JazzCash checkout is <span className="font-medium">coming soon</span>. To activate
                    premium now, contact the admin team on WhatsApp with your registered email and proof of payment (screenshot /
                    transaction ID).
                  </p>
                  {whatsappRaw ? (
                    <p className="mt-4 text-base font-semibold">
                      WhatsApp:{' '}
                      <a
                        href={`https://wa.me/${whatsappDigits}`}
                        className="text-amber-900 underline underline-offset-2 dark:text-amber-200"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {whatsappRaw}
                      </a>
                    </p>
                  ) : (
                    <p className="mt-4 text-sm text-amber-900/90 dark:text-amber-200/90">
                      Ask your administrator to set <code className="rounded bg-white/70 px-1 dark:bg-black/30">MANUAL_SUBSCRIPTION_WHATSAPP</code>{' '}
                      on the API server so your number appears here.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="outline" className="rounded-xl" onClick={() => setPaymentStep('summary')}>
                    Back
                  </Button>
                  <Button type="button" className="rounded-xl" onClick={openWhatsappManual}>
                    Open WhatsApp
                  </Button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  When automated PayFast checkout is enabled on the server, this page will show wallet fields again.
                </p>
              </>
            )
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={payMethod === 'easypaisa' ? 'default' : 'outline'}
                  className="rounded-xl"
                  onClick={() => setPayMethod('easypaisa')}
                >
                  Easypaisa
                </Button>
                <Button
                  type="button"
                  variant={payMethod === 'jazzcash' ? 'default' : 'outline'}
                  className="rounded-xl"
                  onClick={() => setPayMethod('jazzcash')}
                >
                  JazzCash
                </Button>
              </div>

              {!orderId ? (
                <Button type="button" className="rounded-xl" disabled={payBusy || loading} onClick={() => void createOrder()}>
                  {payBusy ? 'Please wait…' : 'Continue to payment'}
                </Button>
              ) : (
                <p className="text-xs text-slate-500">OrderRef: {basketId}</p>
              )}

              {orderId ? (
                <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-600">
                  <div>
                    <Label htmlFor="pmobile">Mobile</Label>
                    <Input id="pmobile" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+923001234567" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="pcnic">CNIC (digits only)</Label>
                    <Input id="pcnic" value={cnic} onChange={(e) => setCnic(e.target.value)} placeholder="3520112345671" className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="pwallet">Wallet account number</Label>
                    <Input
                      id="pwallet"
                      value={walletAccountNumber}
                      onChange={(e) => setWalletAccountNumber(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="potp">OTP (if prompted)</Label>
                    <Input id="potp" value={otp} onChange={(e) => setOtp(e.target.value)} className="mt-1" />
                  </div>
                  <Button type="button" className="w-full rounded-xl" disabled={payBusy} onClick={() => void submitPay()}>
                    Submit payment
                  </Button>
                </div>
              ) : null}

              {import.meta.env.DEV ? (
                <Button type="button" variant="ghost" size="sm" className="text-xs" disabled={!orderId || payBusy} onClick={() => void mockComplete()}>
                  Dev: mock complete (requires PAYMENT_MOCK_ENABLE on API)
                </Button>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
