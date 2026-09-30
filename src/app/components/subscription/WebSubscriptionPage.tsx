import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, Check, FileText, MessageCircle, PlayCircle, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useSubscription } from '../../context/SubscriptionContext';
import { NET360_ADMIN_WHATSAPP, PAYMENT_METHODS } from '../../lib/paymentMethods';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

type ServiceKey = 'tests' | 'preparation' | 'community' | 'videos';

const VIDEOS_REGULAR_PRICE = 6000;
const VIDEOS_LAUNCH_PRICE = 3000;
const VIDEOS_LAUNCH_ENDS = new Date('2026-12-01T00:00:00+05:00');

const SERVICES: Array<{
  key: ServiceKey;
  label: string;
  description: string;
  icon: typeof FileText;
  price: number;
}> = [
  {
    key: 'tests',
    label: 'Tests',
    description: 'Full-length mocks, subject tests, and adaptive practice.',
    icon: FileText,
    price: 1000,
  },
  {
    key: 'preparation',
    label: 'Preparation Material',
    description: 'Chapter-wise notes and topic tests across the NET syllabus.',
    icon: BookOpen,
    price: 1000,
  },
  {
    key: 'community',
    label: 'Community',
    description: 'Study partners, quiz battles, discussion rooms, and messaging.',
    icon: Users,
    price: 1000,
  },
];

function formatPkr(amount: number) {
  return `PKR ${amount.toLocaleString('en-PK')}`;
}

function formatDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function WebSubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { me } = useSubscription();
  const [selected, setSelected] = useState<ServiceKey[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  const videosLaunchOffer = Date.now() < VIDEOS_LAUNCH_ENDS.getTime();
  const videosPrice = videosLaunchOffer ? VIDEOS_LAUNCH_PRICE : VIDEOS_REGULAR_PRICE;

  const priceByKey: Record<ServiceKey, number> = {
    tests: 1000,
    preparation: 1000,
    community: 1000,
    videos: videosPrice,
  };
  const labelByKey: Record<ServiceKey, string> = {
    tests: 'Tests',
    preparation: 'Preparation Material',
    community: 'Community',
    videos: 'Videos',
  };

  const total = useMemo(
    () => selected.reduce((sum, key) => sum + priceByKey[key], 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, videosPrice],
  );

  const whatsappRaw = (
    me?.manualSubscriptionWhatsapp ||
    `${import.meta.env.VITE_MANUAL_SUBSCRIPTION_WHATSAPP || ''}` ||
    NET360_ADMIN_WHATSAPP
  ).trim();
  const whatsappDigits = whatsappRaw.replace(/\D/g, '');

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

  const toggle = (key: ServiceKey) => {
    setShowPayment(false);
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const activeUntil = (key: ServiceKey) => {
    const access = me?.paidServices?.[key];
    if (!access?.allowed) return '';
    return formatDate(access.expiresAt) || 'Active';
  };

  const openWhatsapp = () => {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
    const lines = [
      'Assalam o Alaikum NET360, I want to subscribe (6 months):',
      ...selected.map((key) => `• ${labelByKey[key]} — ${formatPkr(priceByKey[key])}`),
      `Total: ${formatPkr(total)}`,
      '',
      `Name: ${name || '-'}`,
      `Registered email: ${user.email || '-'}`,
      '',
      'I am sharing my payment screenshot / transaction ID.',
    ];
    window.open(`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  };

  const serviceCardClass = (isSelected: boolean) =>
    `group relative flex w-full flex-col gap-3 rounded-2xl border p-4 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      isSelected
        ? 'border-indigo-500 bg-indigo-50/80 shadow-[0_10px_24px_rgba(79,70,229,0.16)] dark:border-indigo-400 dark:bg-indigo-950/40'
        : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:hover:border-indigo-500/60'
    }`;

  const checkMark = (isSelected: boolean) => (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
        isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
      }`}
    >
      {isSelected ? <Check className="h-4 w-4" /> : null}
    </span>
  );

  const videosSelected = selected.includes('videos');
  const videosActive = activeUntil('videos');

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Subscription</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Choose one or more services. Every plan gives you 6 months of access.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Choose your services</CardTitle>
          <CardDescription>Select the services you want. Your total updates automatically.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <button
            type="button"
            role="checkbox"
            aria-checked={videosSelected}
            onClick={() => toggle('videos')}
            className={`${serviceCardClass(videosSelected)} overflow-hidden ${
              videosSelected ? '' : 'border-violet-300 dark:border-violet-500/50'
            } bg-gradient-to-br from-violet-50 via-white to-amber-50 dark:from-violet-950/40 dark:via-slate-900/60 dark:to-amber-950/20`}
          >
            {videosLaunchOffer ? (
              <span className="absolute right-0 top-0 rounded-bl-2xl bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white shadow">
                50% OFF
              </span>
            ) : null}
            <div className="flex items-start gap-3 pr-16">
              {checkMark(videosSelected)}
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600/15 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200">
                <PlayCircle className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
                  Videos
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200">
                    <Sparkles className="h-3 w-3" />
                    New lessons daily
                  </span>
                </p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                  Syllabus-aligned video lectures for every NET subject.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-baseline gap-2 pl-9">
              <span className="text-xl font-bold text-violet-700 dark:text-violet-200">{formatPkr(videosPrice)}</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">/ 6 months</span>
              {videosLaunchOffer ? (
                <span className="text-sm text-slate-400 line-through dark:text-slate-500">{formatPkr(VIDEOS_REGULAR_PRICE)}</span>
              ) : null}
            </div>
            {videosLaunchOffer ? (
              <div className="space-y-2 rounded-xl border border-violet-200/80 bg-white/80 p-3 text-sm dark:border-violet-500/30 dark:bg-slate-900/70">
                <p className="text-slate-700 dark:text-slate-200">
                  Video lessons are being uploaded daily, with the complete video library scheduled to be available by 1 December 2026.
                  Subscribe now and get <span className="font-semibold text-violet-700 dark:text-violet-200">50% OFF</span> the regular
                  video subscription price.
                </p>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Subscribe before 1 December 2026 for PKR 3,000 for 6 months. From 1 December 2026, the regular price will be PKR 6,000
                  for 6 months.
                </p>
              </div>
            ) : null}
            {videosActive ? (
              <p className="pl-9 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Active until {videosActive}</p>
            ) : null}
          </button>

          <div className="grid gap-3 sm:grid-cols-3">
            {SERVICES.map((service) => {
              const isSelected = selected.includes(service.key);
              const Icon = service.icon;
              const active = activeUntil(service.key);
              return (
                <button
                  key={service.key}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(service.key)}
                  className={serviceCardClass(isSelected)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200">
                      <Icon className="h-5 w-5" />
                    </span>
                    {checkMark(isSelected)}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-50">{service.label}</p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{service.description}</p>
                  </div>
                  <p className="mt-auto">
                    <span className="text-lg font-bold text-indigo-700 dark:text-indigo-200">{formatPkr(service.price)}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400"> / 6 months</span>
                  </p>
                  {active ? (
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Active until {active}</p>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            aria-disabled="true"
            className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 p-4 opacity-80 dark:border-slate-600 dark:bg-slate-900/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <Brain className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700 dark:text-slate-200">AI Smart Study Mentor</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Personal AI study guidance. Not available for purchase yet.</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Coming Soon
            </span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-indigo-200/80 dark:border-indigo-500/30">
        <CardHeader>
          <CardTitle as="h2">Order summary</CardTitle>
          <CardDescription>
            {selected.length ? 'Review your selected services before payment.' : 'No services selected yet. Choose at least one service above.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {selected.length ? (
            <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
              {selected.map((key) => (
                <li key={key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {labelByKey[key]} <span className="font-normal text-slate-500 dark:text-slate-400">· 6 months</span>
                  </span>
                  <span className="font-semibold text-slate-900 dark:text-slate-50">{formatPkr(priceByKey[key])}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex items-center justify-between rounded-xl bg-indigo-50 px-4 py-3 dark:bg-indigo-950/40">
            <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">Total payable</span>
            <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-200">{formatPkr(total)}</span>
          </div>

          {!showPayment ? (
            <Button
              type="button"
              className="w-full rounded-xl"
              disabled={!selected.length}
              onClick={() => setShowPayment(true)}
            >
              Proceed to payment
            </Button>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Step 1 · Send {formatPkr(total)} to any of these accounts
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(Object.keys(PAYMENT_METHODS) as Array<keyof typeof PAYMENT_METHODS>).map((method) => {
                    const info = PAYMENT_METHODS[method];
                    return (
                      <div key={method} className="rounded-lg bg-slate-50 p-3 text-xs dark:bg-slate-800/60">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{info.label}</p>
                        <p className="mt-1 text-slate-600 dark:text-slate-300">
                          {info.accountLabel}: <span className="font-semibold text-slate-900 dark:text-slate-100">{info.accountValue}</span>
                        </p>
                        {info.holderValue ? (
                          <p className="text-slate-600 dark:text-slate-300">
                            {info.holderLabel}: {info.holderValue}
                          </p>
                        ) : null}
                        {info.extraDetails?.map((detail) => (
                          <p key={detail.label} className="break-all text-slate-600 dark:text-slate-300">
                            {detail.label}: {detail.value}
                          </p>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/30 dark:bg-emerald-950/30">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Step 2 · Send your payment proof on WhatsApp</p>
                <p className="mt-1 text-sm text-emerald-900/90 dark:text-emerald-100/90">
                  Your selected services and total are filled in for you. Attach your payment screenshot or transaction ID, and the admin
                  team will activate your access.
                </p>
                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">WhatsApp: {whatsappRaw}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => setShowPayment(false)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!whatsappDigits}
                  onClick={openWhatsapp}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Continue on WhatsApp
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
