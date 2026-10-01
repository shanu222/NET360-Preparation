import {
  addMonths,
  mergedSubscription,
  PAID_PLAN_MONTHS,
} from './subscriptionAccess.js';

/**
 * Reconciles subscription trial fields from durable ledger so recreated accounts
 * can continue only their remaining original trial window.
 */
export async function syncTrialStateFromLedger(UserModel, userId, options = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, code: 'USER_NOT_FOUND' };
  const existing = await UserModel.findById(uid).select('subscription').lean();
  if (!existing) return { ok: false, code: 'USER_NOT_FOUND' };
  // The 7-day trial is no longer granted or restored. Leave stored admin grants untouched.
  void options;
  return { ok: true, code: 'TRIAL_GRANT_DISABLED', subscription: mergedSubscription(existing) };
}

/**
 * The automatic 7-day trial no longer grants access. Demo remains a separate one-time allowance.
 * Stored subscription fields are not rewritten.
 */
export async function grantTrialIfFirstTime(UserModel, userId) {
  const uid = String(userId || '').trim();
  const existing = uid ? await UserModel.findById(uid).select('subscription').lean() : null;
  if (!existing) return { ok: false, code: 'USER_NOT_FOUND' };
  return { ok: false, code: 'TRIAL_DISABLED', subscription: mergedSubscription(existing) };
}


/**
 * @param {import('mongoose').Model} UserModel
 * @param {object} opts
 */
export async function grantPaidPlanAfterPayment(UserModel, {
  userId,
  planId,
  billingCycle,
  gatewayPaymentRef,
  paymentGateway,
}) {
  const uid = String(userId || '').trim();
  const existing = await UserModel.findById(uid).select('subscription').lean();
  const base = mergedSubscription(existing || { subscription: {} });
  const now = new Date();
  const expiresAt = addMonths(now, PAID_PLAN_MONTHS);

  const nextSubscription = {
    ...base,
    status: 'active',
    planId: String(planId || '').trim(),
    billingCycle: String(billingCycle || 'six_month'),
    startedAt: now,
    expiresAt,
    paymentReference: String(gatewayPaymentRef || '').slice(0, 200),
    lastActivatedAt: now,
    paymentGateway: String(paymentGateway || 'payfast').slice(0, 80),
    lastPaymentAt: now,
  };

  await UserModel.findByIdAndUpdate(
    uid,
    {
      $set: {
        subscription: nextSubscription,
        'paidServices.tests': {
          status: 'active',
          startsAt: now,
          expiresAt,
          durationDays: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
          source: 'payment',
          grantedAt: now,
          lastUpdatedAt: now,
          notes: 'Independent module grant from paid checkout',
        },
        'paidServices.preparation': {
          status: 'active',
          startsAt: now,
          expiresAt,
          durationDays: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
          source: 'payment',
          grantedAt: now,
          lastUpdatedAt: now,
          notes: 'Independent module grant from paid checkout',
        },
        'paidServices.community': {
          status: 'active',
          startsAt: now,
          expiresAt,
          durationDays: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
          source: 'payment',
          grantedAt: now,
          lastUpdatedAt: now,
          notes: 'Independent module grant from paid checkout',
        },
        'paidServices.videos': {
          status: 'active',
          startsAt: now,
          expiresAt,
          durationDays: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))),
          source: 'payment',
          grantedAt: now,
          lastUpdatedAt: now,
          notes: 'Independent module grant from paid checkout',
        },
      },
    },
    { runValidators: true },
  );

  const merged = await UserModel.findById(uid).select('subscription').lean();
  return { subscription: mergedSubscription(merged), expiresAt };
}
