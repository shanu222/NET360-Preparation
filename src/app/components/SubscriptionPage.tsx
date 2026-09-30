import { Fragment, memo, type ReactNode, useState } from 'react';
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

function CheckMark({ selected }: { selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
        selected
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-indigo-300 bg-white dark:border-indigo-400 dark:bg-[#12182b]'
      }`}
    >
      {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
    </span>
  );
}

function PlanCard({
  selected,
  onToggle,
  icon,
  title,
  description,
  price,
  duration,
  extra,
  activeUntil,
  disabled,
}: {
  selected: boolean;
  onToggle?: () => void;
  icon: ReactNode;
  title: string;
  description?: string;
  price?: string;
  duration?: string;
  extra?: ReactNode;
  activeUntil?: string;
  disabled?: boolean;
}) {
  const body = (
    <>
      <CheckMark selected={selected} />
      <span className="net360-android-plan-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{title}</span>
          {selected && !disabled ? (
            <span className="net360-android-plan-chosen rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Added
            </span>
          ) : null}
        </span>
        {description ? (
          <span className="mt-0.5 block text-[13px] leading-5 text-slate-600 dark:text-slate-300">{description}</span>
        ) : null}
        {extra}
        {activeUntil ? (
          <span className="net360-android-plan-active mt-2 inline-flex rounded-full px-2 py-0.5 text-[12px] font-semibold">
            Active until {activeUntil}
          </span>
        ) : null}
      </span>
      {price ? (
        <span className="shrink-0 pt-0.5 text-right">
          <span className="net360-android-plan-price block text-[15px] font-bold leading-none">{price}</span>
          {duration ? (
            <span className="mt-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">/ {duration}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  if (disabled) {
    return (
      <div className="net360-android-plan-card flex items-start gap-3 rounded-[22px] px-4 py-3.5 opacity-80">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`net360-android-plan-card flex min-h-[4.75rem] w-full touch-manipulation items-start gap-3 rounded-[22px] px-4 py-3.5 text-left ${
        selected ? 'net360-android-plan-row-selected' : ''
      }`}
    >
      {body}
    </button>
  );
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
      <div className="net360-android-plan-card rounded-3xl p-6 text-center">
        <p className="text-[15px] font-medium text-slate-800 dark:text-slate-100">Sign in to manage your subscription.</p>
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

  return (
    <div className="space-y-5" data-android-subscription="true">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{plans.pageTitle}</h1>
        {plans.pageSubtitle ? <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{plans.pageSubtitle}</p> : null}
      </div>

      <section className="space-y-2.5">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">{plans.sectionTitle}</h2>
            {plans.sectionSubtitle ? <p className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">{plans.sectionSubtitle}</p> : null}
          </div>
          <p className="shrink-0 text-[12px] font-semibold text-indigo-700 dark:text-indigo-300">
            {activeSelection.length ? `${activeSelection.length} selected` : 'Tap to add'}
          </p>
        </div>

        <PlanCard
          selected={selected.includes('videos')}
          onToggle={() => toggle('videos')}
          icon={<PlayCircle className="h-5 w-5" />}
          title={videos.title}
          description={videos.description}
          price={formatPkr(videosPrice)}
          duration={videos.duration}
          activeUntil={activeUntil('videos')}
          extra={(
            <>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {videos.badge ? (
                  <span className="net360-android-plan-badge inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold">
                    <Sparkles className="h-3 w-3" />
                    {videos.badge}
                  </span>
                ) : null}
                {videosLaunchOffer && videos.offerLabel ? (
                  <span className="net360-android-plan-offer rounded-full px-2 py-0.5 text-[11px] font-bold uppercase">
                    {videos.offerLabel}
                  </span>
                ) : null}
                {videosLaunchOffer ? (
                  <span className="text-[12px] text-slate-500 line-through">{formatPkr(videos.regularPrice)}</span>
                ) : null}
              </span>
              {videosLaunchOffer && (videos.promoText || videos.promoDetails) ? (
                <span className="mt-2 block space-y-1 text-[12px] text-slate-700 dark:text-slate-200">
                  {videos.promoText ? <span className="block">{highlight(videos.promoText, videos.offerLabel)}</span> : null}
                  {videos.promoDetails ? <span className="block font-medium">{videos.promoDetails}</span> : null}
                </span>
              ) : null}
            </>
          )}
        />

        {STANDARD_SERVICES.map((service) => {
          const plan = plans[service.key];
          const Icon = service.icon;
          return (
            <PlanCard
              key={service.key}
              selected={selected.includes(service.key)}
              onToggle={() => toggle(service.key)}
              icon={<Icon className="h-5 w-5" />}
              title={plan.title}
              description={plan.description}
              price={formatPkr(plan.price)}
              duration={plan.duration}
              activeUntil={activeUntil(service.key)}
            />
          );
        })}

        {mentor.available ? (
          <PlanCard
            selected={selected.includes('mentor')}
            onToggle={() => toggle('mentor')}
            icon={<Brain className="h-5 w-5" />}
            title={mentor.title}
            description={mentor.description}
            price={formatPkr(mentor.price)}
            duration={mentor.duration}
            activeUntil={activeUntil('mentor')}
          />
        ) : (
          <div className="net360-android-plan-card flex items-center gap-3 rounded-[22px] px-4 py-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-slate-300 bg-white text-slate-500 dark:border-slate-500 dark:bg-[#243056] dark:text-slate-300">
              <Brain className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-slate-700 dark:text-slate-200">{mentor.title}</span>
              <span className="block text-[13px] text-slate-600 dark:text-slate-300">{mentor.description}</span>
            </span>
            {mentor.statusLabel ? (
              <span className="net360-android-plan-status rounded-full px-3 py-1 text-xs font-semibold">
                {mentor.statusLabel}
              </span>
            ) : null}
          </div>
        )}
      </section>

      <section className="net360-android-plan-card overflow-hidden rounded-[22px]">
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div>
            <h2 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">Order summary</h2>
            <p className="pt-1 text-[13px] text-slate-600 dark:text-slate-300">
              {activeSelection.length ? 'Review your selected services before payment.' : 'Choose at least one service above.'}
            </p>
          </div>
          {activeSelection.length ? (
            <span className="net360-android-plan-badge mt-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold">
              {activeSelection.length} item{activeSelection.length === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        {activeSelection.length ? (
          <ul className="mt-3">
            {activeSelection.map((key) => (
              <li
                key={key}
                className="flex items-center justify-between gap-3 border-t border-indigo-100 px-4 py-3 text-sm dark:border-indigo-400/25"
              >
                <span className="min-w-0">
                  <span className="block font-medium text-slate-800 dark:text-slate-100">{labelByKey[key]}</span>
                  <span className="text-[12px] text-slate-600 dark:text-slate-300">{durationByKey[key]}</span>
                </span>
                <span className="net360-android-plan-price shrink-0 font-semibold">{formatPkr(priceByKey[key])}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mx-4 mt-3 rounded-2xl border-[1.5px] border-dashed border-indigo-300 px-4 py-4 text-center text-[13px] text-slate-600 dark:border-indigo-400/40 dark:text-slate-300">
            Nothing selected yet. Tap a service to add it here.
          </p>
        )}
        <div className="net360-android-plan-total mx-4 my-3 flex items-center justify-between rounded-2xl px-4 py-3">
          <span className="text-sm font-semibold">Total payable</span>
          <span className="text-xl font-bold">{formatPkr(total)}</span>
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
              <div className="space-y-2 rounded-2xl border-[1.5px] border-indigo-200 bg-white p-3 dark:border-indigo-400/40 dark:bg-[#1a2238]">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  Step 1 · Send {formatPkr(total)} to any of these accounts
                </p>
                {(Object.keys(PAYMENT_METHODS) as Array<keyof typeof PAYMENT_METHODS>).map((method) => {
                  const info = PAYMENT_METHODS[method];
                  return (
                    <div key={method} className="rounded-xl border-[1.5px] border-indigo-200 bg-white p-3 text-xs dark:border-indigo-400/35 dark:bg-[#12182b]">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{info.label}</p>
                      <p className="mt-1 text-slate-700 dark:text-slate-200">
                        {info.accountLabel}: <span className="font-semibold text-slate-900 dark:text-slate-50">{info.accountValue}</span>
                      </p>
                      {info.holderValue ? (
                        <p className="text-slate-700 dark:text-slate-200">
                          {info.holderLabel}: {info.holderValue}
                        </p>
                      ) : null}
                      {info.extraDetails?.map((detail) => (
                        <p key={detail.label} className="break-all text-slate-700 dark:text-slate-200">
                          {detail.label}: {detail.value}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="net360-android-plan-whatsapp rounded-2xl p-3">
                <p className="text-sm font-semibold">Step 2 · Send your payment proof on WhatsApp</p>
                <p className="mt-1 text-[13px]">
                  Your selected services and total are filled in for you. Attach your payment screenshot or transaction ID.
                </p>
                <p className="mt-2 text-xs font-semibold">WhatsApp: {whatsappRaw}</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button type="button" variant="outline" className="min-h-11 rounded-2xl" onClick={() => setShowPayment(false)}>
                  Back
                </Button>
                <Button
                  type="button"
                  className="net360-android-whatsapp-btn min-h-12 rounded-2xl"
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
