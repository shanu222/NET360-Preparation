import { Fragment, memo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Brain, Check, ChevronRight, FileText, MessageCircle, PlayCircle, Sparkles, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { NET360_ADMIN_WHATSAPP, PAYMENT_METHODS } from '../lib/paymentMethods';
import { isVideosOfferActive, useSubscriptionPlans, type StandardPlanKey } from '../lib/subscriptionPlans';
import { Button } from './ui/button';

type ServiceKey = StandardPlanKey | 'videos' | 'mentor';

const STANDARD_SERVICES: Array<{ key: StandardPlanKey; icon: typeof FileText }> = [
  { key: 'tests', icon: FileText },
  { key: 'preparation', icon: BookOpen },
  { key: 'community', icon: Users },
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

function highlight(text: string, phrase: string) {
  const needle = phrase.trim();
  if (!needle || !text.includes(needle)) return text;
  return text.split(needle).map((part, index) => (
    <Fragment key={index}>
      {index > 0 ? <span className="font-semibold text-indigo-700 dark:text-indigo-200">{needle}</span> : null}
      {part}
    </Fragment>
  ));
}

/**
 * Android subscription page. Uses the same admin-managed plans, paid-access records,
 * and WhatsApp activation flow as the website. Layout follows existing Android list cards.
 */
export const SubscriptionPage = memo(function SubscriptionPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { me } = useSubscription();
  const plans = useSubscriptionPlans();
  const [selected, setSelected] = useState<ServiceKey[]>([]);
  const [showPayment, setShowPayment] = useState(false);

  const videos = plans.videos;
  const mentor = plans.mentor;
  const videosLaunchOffer = isVideosOfferActive(videos);
  const videosPrice = videosLaunchOffer ? videos.offerPrice : videos.regularPrice;

  const priceByKey: Record<ServiceKey, number> = {
    tests: plans.tests.price,
    preparation: plans.preparation.price,
    community: plans.community.price,
    videos: videosPrice,
    mentor: mentor.price,
  };
  const labelByKey: Record<ServiceKey, string> = {
    tests: plans.tests.title,
    preparation: plans.preparation.title,
    community: plans.community.title,
    videos: videos.title,
    mentor: mentor.title,
  };
  const durationByKey: Record<ServiceKey, string> = {
    tests: plans.tests.duration,
    preparation: plans.preparation.duration,
    community: plans.community.duration,
    videos: videos.duration,
    mentor: mentor.duration,
  };

  const activeSelection = selected.filter((key) => key !== 'mentor' || mentor.available);
  const total = activeSelection.reduce((sum, key) => sum + priceByKey[key], 0);

  const whatsappRaw = (
    me?.manualSubscriptionWhatsapp ||
    `${import.meta.env.VITE_MANUAL_SUBSCRIPTION_WHATSAPP || ''}` ||
    NET360_ADMIN_WHATSAPP
  ).trim();
  const whatsappDigits = whatsappRaw.replace(/\D/g, '');

  if (!user) {
    return (
      <div className="rounded-3xl bg-white p-6 text-center dark:bg-[#1a2238]">
        <p className="text-slate-700 dark:text-slate-200">Sign in to manage your subscription.</p>
        <Button className="mt-4 min-h-11 rounded-xl" type="button" onClick={() => navigate('/profile')}>
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
      'Assalam o Alaikum NET360, I want to subscribe:',
      ...activeSelection.map((key) => `• ${labelByKey[key]} (${durationByKey[key]}) — ${formatPkr(priceByKey[key])}`),
      `Total: ${formatPkr(total)}`,
      '',
      `Name: ${name || '-'}`,
      `Registered email: ${user.email || '-'}`,
      '',
      'I am sharing my payment screenshot / transaction ID.',
    ];
    window.open(`https://wa.me/${whatsappDigits}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener,noreferrer');
  };

  const checkMark = (isSelected: boolean) => (
    <span
      aria-hidden="true"
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
        isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-[#12182b]'
      }`}
    >
      {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
    </span>
  );

  const videosSelected = selected.includes('videos');
  const videosActive = activeUntil('videos');
  const mentorSelected = mentor.available && selected.includes('mentor');
  const mentorActive = activeUntil('mentor');

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{plans.pageTitle}</h1>
        {plans.pageSubtitle ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plans.pageSubtitle}</p> : null}
      </div>

      <section className="space-y-2">
        <h2 className="px-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">{plans.sectionTitle}</h2>
        {plans.sectionSubtitle ? <p className="px-1 text-[13px] text-slate-500 dark:text-slate-400">{plans.sectionSubtitle}</p> : null}

        <ul className="overflow-hidden rounded-3xl bg-white dark:bg-[#1a2238]">
          <li className="border-b border-[#e6eaf2] dark:border-white/10">
            <button
              type="button"
              role="checkbox"
              aria-checked={videosSelected}
              onClick={() => toggle('videos')}
              className="flex min-h-[4.5rem] w-full touch-manipulation items-start gap-3 px-4 py-3.5 text-left active:bg-slate-100 dark:active:bg-white/10"
            >
              {checkMark(videosSelected)}
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                <PlayCircle className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{videos.title}</span>
                  {videos.badge ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                      <Sparkles className="h-3 w-3" />
                      {videos.badge}
                    </span>
                  ) : null}
                  {videosLaunchOffer && videos.offerLabel ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase text-amber-800 dark:bg-amber-500/20 dark:text-amber-100">
                      {videos.offerLabel}
                    </span>
                  ) : null}
                </span>
                {videos.description ? (
                  <span className="mt-0.5 block text-[13px] text-slate-500 dark:text-slate-400">{videos.description}</span>
                ) : null}
                <span className="mt-1.5 flex flex-wrap items-baseline gap-2">
                  <span className="text-base font-bold text-indigo-700 dark:text-indigo-300">{formatPkr(videosPrice)}</span>
                  <span className="text-[13px] text-slate-500">/ {videos.duration}</span>
                  {videosLaunchOffer ? (
                    <span className="text-[13px] text-slate-400 line-through">{formatPkr(videos.regularPrice)}</span>
                  ) : null}
                </span>
                {videosLaunchOffer && (videos.promoText || videos.promoDetails) ? (
                  <span className="mt-2 block space-y-1 text-[12px] text-slate-600 dark:text-slate-300">
                    {videos.promoText ? <span className="block">{highlight(videos.promoText, videos.offerLabel)}</span> : null}
                    {videos.promoDetails ? <span className="block font-medium">{videos.promoDetails}</span> : null}
                  </span>
                ) : null}
                {videosActive ? (
                  <span className="mt-1 block text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Active until {videosActive}</span>
                ) : null}
              </span>
            </button>
          </li>

          {STANDARD_SERVICES.map((service, index) => {
            const plan = plans[service.key];
            const isSelected = selected.includes(service.key);
            const Icon = service.icon;
            const active = activeUntil(service.key);
            return (
              <li key={service.key} className={index === STANDARD_SERVICES.length - 1 && !mentor.available ? undefined : 'border-b border-[#e6eaf2] dark:border-white/10'}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  onClick={() => toggle(service.key)}
                  className="flex min-h-[4.25rem] w-full touch-manipulation items-center gap-3 px-4 py-3 text-left active:bg-slate-100 dark:active:bg-white/10"
                >
                  {checkMark(isSelected)}
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">{plan.title}</span>
                    <span className="block text-[13px] text-slate-500 dark:text-slate-400">{plan.description}</span>
                    <span className="mt-1 block text-sm font-bold text-indigo-700 dark:text-indigo-300">
                      {formatPkr(plan.price)} <span className="font-medium text-slate-500">/ {plan.duration}</span>
                    </span>
                    {active ? (
                      <span className="mt-0.5 block text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Active until {active}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}

          {mentor.available ? (
            <li>
              <button
                type="button"
                role="checkbox"
                aria-checked={mentorSelected}
                onClick={() => toggle('mentor')}
                className="flex min-h-[4.25rem] w-full touch-manipulation items-center gap-3 px-4 py-3 text-left active:bg-slate-100 dark:active:bg-white/10"
              >
                {checkMark(mentorSelected)}
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200">
                  <Brain className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-slate-900 dark:text-slate-100">{mentor.title}</span>
                  <span className="block text-[13px] text-slate-500 dark:text-slate-400">{mentor.description}</span>
                  <span className="mt-1 block text-sm font-bold text-indigo-700 dark:text-indigo-300">
                    {formatPkr(mentor.price)} <span className="font-medium text-slate-500">/ {mentor.duration}</span>
                  </span>
                  {mentorActive ? (
                    <span className="mt-0.5 block text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">Active until {mentorActive}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ) : (
            <li className="flex items-center gap-3 px-4 py-3 opacity-70">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/10">
                <Brain className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-700 dark:text-slate-200">{mentor.title}</span>
                <span className="block text-[13px] text-slate-500 dark:text-slate-400">{mentor.description}</span>
              </span>
              {mentor.statusLabel ? (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  {mentor.statusLabel}
                </span>
              ) : null}
            </li>
          )}
        </ul>
      </section>

      <section className="overflow-hidden rounded-3xl bg-white dark:bg-[#1a2238]">
        <div className="px-4 pt-4">
          <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Order summary</h2>
          <p className="pt-1 text-[13px] text-slate-500 dark:text-slate-400">
            {activeSelection.length ? 'Review your selected services before payment.' : 'Choose at least one service above.'}
          </p>
        </div>
        {activeSelection.length ? (
          <ul className="mt-3">
            {activeSelection.map((key, index) => (
              <li
                key={key}
                className={`flex items-center justify-between gap-3 px-4 py-3 text-sm ${index ? 'border-t border-[#e6eaf2] dark:border-white/10' : ''}`}
              >
                <span className="font-medium text-slate-800 dark:text-slate-100">
                  {labelByKey[key]} <span className="font-normal text-slate-500">· {durationByKey[key]}</span>
                </span>
                <span className="font-semibold text-slate-900 dark:text-slate-50">{formatPkr(priceByKey[key])}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mx-4 my-3 flex items-center justify-between rounded-2xl bg-indigo-50 px-4 py-3 dark:bg-indigo-500/15">
          <span className="text-sm font-semibold text-indigo-950 dark:text-indigo-100">Total payable</span>
          <span className="text-xl font-bold text-indigo-700 dark:text-indigo-200">{formatPkr(total)}</span>
        </div>

        <div className="space-y-3 px-4 pb-4">
          {!showPayment ? (
            <Button
              type="button"
              className="min-h-12 w-full rounded-2xl"
              disabled={!activeSelection.length}
              onClick={() => setShowPayment(true)}
            >
              Proceed to payment
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <>
              <div className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Step 1 · Send {formatPkr(total)} to any of these accounts
                </p>
                {(Object.keys(PAYMENT_METHODS) as Array<keyof typeof PAYMENT_METHODS>).map((method) => {
                  const info = PAYMENT_METHODS[method];
                  return (
                    <div key={method} className="rounded-xl bg-white p-3 text-xs dark:bg-[#12182b]">
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
              <div className="rounded-2xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">Step 2 · Send your payment proof on WhatsApp</p>
                <p className="mt-1 text-[13px] text-emerald-900/90 dark:text-emerald-100/90">
                  Your selected services and total are filled in for you. Attach your payment screenshot or transaction ID.
                </p>
                <p className="mt-2 text-xs text-emerald-800 dark:text-emerald-200">WhatsApp: {whatsappRaw}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" className="min-h-11 rounded-2xl" onClick={() => setShowPayment(false)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="min-h-12 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700"
                  disabled={!whatsappDigits}
                  onClick={openWhatsapp}
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Continue on WhatsApp
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
});
