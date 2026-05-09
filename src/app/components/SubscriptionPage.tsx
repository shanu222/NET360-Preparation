import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  COOKIE_SESSION_API_MARKER,
  isCookieSessionApiMarker,
  shouldPersistAuthTokens,
} from '../lib/authSession';
import { audienceFriendlyError, showErrorToast, showSuccessToast } from '../lib/userToast';
import { formatCountdown, useSubscription } from '../context/SubscriptionContext';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { PremiumCountdownBadge } from './subscription/PremiumCountdownBadge';

const TOKEN_STORAGE_KEY = 'net360-auth-token';

function bearerForApi(): string | undefined {
  if (shouldPersistAuthTokens()) {
    const s = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (s && !isCookieSessionApiMarker(s)) return s;
  }
  return undefined;
}

export function SubscriptionPage() {
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

  const countdownLabel = (() => {
    if (!surface?.allowed || !surface.endsAt) return '';
    const { days, hours, minutes } = formatCountdown(surface.msRemaining);
    if (days > 0) return `${days}d ${hours}h remaining`;
    if (hours > 0) return `${hours}h ${minutes}m remaining`;
    const { seconds } = formatCountdown(surface.msRemaining);
    return `${minutes}m ${seconds}s remaining`;
  })();

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
          <p className="text-sm text-slate-600 dark:text-slate-300">Automated checkout — no admin approval required.</p>
        </div>
        <PremiumCountdownBadge />
      </div>

      {surface.allowed ? (
        <Card className="border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-500/25 dark:bg-emerald-950/30">
          <CardHeader>
            <CardTitle className="text-emerald-900 dark:text-emerald-100">You have premium access</CardTitle>
            <CardDescription className="text-emerald-800/90 dark:text-emerald-200/90">
              {countdownLabel || me?.subscriptionBadge?.label || 'Enjoy full tests, preparation, and community.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{premiumPlan?.name || 'NET360 Premium'}</CardTitle>
          <CardDescription>
            PKR {premiumPlan?.pricePkr ?? 1000} / 6 months — Easypaisa &amp; JazzCash via PayFast.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>
    </div>
  );
}
