/**
 * Subscription / trial access rules for premium student surfaces (tests, community, study plans).
 * AI Smart Mentor continues to use {@link isPaidPlanActive} — trial does not unlock mentor quotas.
 */

/** Digits-only WhatsApp for manual premium contact; matches `NET360_ADMIN_WHATSAPP` / `wa.me` in the web app. */
export const DEFAULT_MANUAL_SUBSCRIPTION_WHATSAPP_DIGITS = '923403318127';

const TRIAL_MS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 7) * 24 * 60 * 60 * 1000;
const PAID_PLAN_MONTHS = Number(process.env.PREMIUM_PLAN_DURATION_MONTHS || 6);
const ORANGE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

/** Temporary: allow all signed-in students into premium surfaces (tests, prep, community) without trial/payment. */
export function premiumSurfaceBypassEnabled() {
  return String(process.env.SUBSCRIPTION_PREMIUM_SURFACE_BYPASS || '').toLowerCase() === 'true';
}

/** When true (default if env unset), PayFast order/pay routes reject — set PAYFAST_CHECKOUT_DISABLED=false to enable. */
export function payfastCheckoutDisabled() {
  const v = String(process.env.PAYFAST_CHECKOUT_DISABLED ?? 'true').trim().toLowerCase();
  if (v === 'false' || v === '0' || v === 'no' || v === 'off') return false;
  return true;
}

function toPlain(value) {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') return value.toObject();
  if (value._doc) return { ...value._doc };
  return { ...value };
}

export function defaultSubscriptionShape() {
  return {
    status: 'inactive',
    planId: '',
    billingCycle: '',
    startedAt: null,
    expiresAt: null,
    paymentReference: '',
    lastActivatedAt: null,
    hasUsedTrial: false,
    trialStartedAt: null,
    trialEndsAt: null,
    paymentGateway: '',
    lastPaymentAt: null,
  };
}

export function mergedSubscription(userLike) {
  const u = toPlain(userLike);
  const sub = toPlain(u.subscription);
  return { ...defaultSubscriptionShape(), ...sub };
}

export function trialIsActive(sub) {
  if (!sub || sub.status !== 'trial') return false;
  if (!sub.trialEndsAt) return false;
  return new Date(sub.trialEndsAt).getTime() > Date.now();
}

/** Paid premium (excludes trial). Used for Smart Study Mentor limits. */
export function isPaidPlanActive(sub) {
  if (!sub || sub.status !== 'active') return false;
  if (!sub.expiresAt) return false;
  return new Date(sub.expiresAt).getTime() > Date.now();
}

/** Tests / community / preparation — trial or paid. */
export function hasPremiumSurfaceAccess(sub) {
  if (premiumSurfaceBypassEnabled()) return true;
  if (trialIsActive(sub)) return true;
  return isPaidPlanActive(sub);
}

/**
 * Expire trial or paid term in DB when past end (idempotent).
 * @param {import('mongoose').Model} UserModel
 * @param {string} userId
 */
export async function finalizeStaleSubscription(UserModel, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;

  const user = await UserModel.findById(uid).select('subscription').lean();
  if (!user) return;
  const sub = mergedSubscription(user);
  const now = Date.now();

  if (sub.status === 'trial' && sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() <= now) {
    await UserModel.updateOne(
      { _id: uid, 'subscription.status': 'trial' },
      { $set: { 'subscription.status': 'inactive' } },
    );
  }

  if (sub.status === 'active' && sub.expiresAt && new Date(sub.expiresAt).getTime() <= now) {
    await UserModel.updateOne(
      { _id: uid, 'subscription.status': 'active' },
      { $set: { 'subscription.status': 'expired' } },
    );
  }
}

export function buildPremiumBadgeState(sub, serverNow = Date.now()) {
  const now = typeof serverNow === 'number' ? serverNow : new Date(serverNow).getTime();
  if (premiumSurfaceBypassEnabled()) {
    return {
      variant: 'green',
      label: 'Full access — free period',
      endsAt: null,
      source: 'bypass',
    };
  }
  const trialActive = trialIsActive(sub);
  const paidActive = isPaidPlanActive(sub);

  if (trialActive && sub.trialEndsAt) {
    const end = new Date(sub.trialEndsAt).getTime();
    const msLeft = end - now;
    const urgent = msLeft <= ORANGE_THRESHOLD_MS;
    return {
      variant: urgent ? 'orange' : 'green',
      label: urgent ? 'Trial ending soon' : 'Free trial active',
      endsAt: sub.trialEndsAt,
      source: 'trial',
    };
  }

  if (paidActive && sub.expiresAt) {
    const end = new Date(sub.expiresAt).getTime();
    const msLeft = end - now;
    const urgent = msLeft <= ORANGE_THRESHOLD_MS;
    return {
      variant: urgent ? 'orange' : 'green',
      label: urgent ? 'Premium expiring soon' : 'Premium active',
      endsAt: sub.expiresAt,
      source: 'paid',
    };
  }

  if (sub.status === 'expired' || (sub.status === 'active' && sub.expiresAt && new Date(sub.expiresAt).getTime() <= now)) {
    return { variant: 'red', label: 'Subscription expired', endsAt: sub.expiresAt || null, source: 'none' };
  }

  if (sub.hasUsedTrial) {
    return { variant: 'red', label: 'Upgrade to unlock', endsAt: null, source: 'none' };
  }

  return { variant: 'neutral', label: 'Free plan', endsAt: null, source: 'none' };
}

export function surfaceAccessDetail(sub, serverNow = Date.now()) {
  const now = typeof serverNow === 'number' ? serverNow : new Date(serverNow).getTime();
  if (premiumSurfaceBypassEnabled()) {
    return {
      allowed: true,
      source: 'bypass',
      endsAt: null,
      msRemaining: 0,
      serverNow: new Date(now).toISOString(),
    };
  }
  const trialActive = trialIsActive(sub);
  const paidActive = isPaidPlanActive(sub);

  if (trialActive && sub.trialEndsAt) {
    const end = new Date(sub.trialEndsAt).getTime();
    return {
      allowed: true,
      source: 'trial',
      endsAt: new Date(sub.trialEndsAt).toISOString(),
      msRemaining: Math.max(0, end - now),
      serverNow: new Date(now).toISOString(),
    };
  }
  if (paidActive && sub.expiresAt) {
    const end = new Date(sub.expiresAt).getTime();
    return {
      allowed: true,
      source: 'paid',
      endsAt: new Date(sub.expiresAt).toISOString(),
      msRemaining: Math.max(0, end - now),
      serverNow: new Date(now).toISOString(),
    };
  }
  return {
    allowed: false,
    source: 'none',
    endsAt: null,
    msRemaining: 0,
    serverNow: new Date(now).toISOString(),
  };
}

export { TRIAL_MS, PAID_PLAN_MONTHS };

export function addMonths(baseDate, months) {
  const d = new Date(baseDate);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}
