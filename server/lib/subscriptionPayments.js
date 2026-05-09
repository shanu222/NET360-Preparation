import {
  addMonths,
  mergedSubscription,
  isPaidPlanActive,
  trialIsActive,
  TRIAL_MS,
  PAID_PLAN_MONTHS,
} from './subscriptionAccess.js';

/**
 * @param {import('mongoose').Model} UserModel
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, subscription?: object, code?: string, message?: string }>}
 */
export async function grantTrialIfFirstTime(UserModel, userId) {
  const uid = String(userId || '').trim();
  const existing = await UserModel.findById(uid).select('subscription').lean();
  if (!existing) return { ok: false, code: 'USER_NOT_FOUND' };

  const sub = mergedSubscription(existing);
  if (isPaidPlanActive(sub)) {
    return { ok: true, code: 'ALREADY_PAID', subscription: sub };
  }
  if (trialIsActive(sub)) {
    return { ok: true, code: 'ALREADY_TRIALING', subscription: sub };
  }
  if (sub.hasUsedTrial) {
    return { ok: false, code: 'TRIAL_ALREADY_USED' };
  }

  const now = new Date();
  const trialEndsAt = new Date(now.getTime() + TRIAL_MS);

  const updated = await UserModel.findOneAndUpdate(
    {
      _id: uid,
      $or: [{ 'subscription.hasUsedTrial': false }, { 'subscription.hasUsedTrial': { $exists: false } }],
    },
    {
      $set: {
        'subscription.hasUsedTrial': true,
        'subscription.trialStartedAt': now,
        'subscription.trialEndsAt': trialEndsAt,
        'subscription.status': 'trial',
      },
    },
    { new: true, runValidators: true },
  ).select('subscription').lean();

  if (!updated) {
    return { ok: false, code: 'TRIAL_ALREADY_USED' };
  }

  return { ok: true, subscription: mergedSubscription(updated) };
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
    { $set: { subscription: nextSubscription } },
    { runValidators: true },
  );

  const merged = await UserModel.findById(uid).select('subscription').lean();
  return { subscription: mergedSubscription(merged), expiresAt };
}
