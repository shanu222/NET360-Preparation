import crypto from 'node:crypto';
import {
  addMonths,
  mergedSubscription,
  isPaidPlanActive,
  trialIsActive,
  TRIAL_MS,
  PAID_PLAN_MONTHS,
} from './subscriptionAccess.js';

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeFirebaseUid(value) {
  return String(value || '').trim();
}

function normalizeIp(value) {
  return String(value || '').split(',')[0].trim().slice(0, 45);
}

function hashDeviceFingerprint(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex');
}

function compactUnique(values, maxLen = 12) {
  const list = [];
  for (const raw of values || []) {
    const item = String(raw || '').trim();
    if (!item) continue;
    if (!list.includes(item)) list.push(item);
    if (list.length >= maxLen) break;
  }
  return list;
}

function buildLedgerIdentity(subLike, identity = {}) {
  return {
    email: normalizeEmail(identity.email || subLike?.email),
    firebaseUid: normalizeFirebaseUid(identity.firebaseUid || subLike?.firebaseUid),
    deviceFingerprint: hashDeviceFingerprint(identity.deviceId || subLike?.activeSession?.deviceId),
    ipAddress: normalizeIp(identity.ipAddress || ''),
  };
}

async function findTrialLedger(TrialLedgerModel, identity) {
  if (!TrialLedgerModel) return null;
  const strongOr = [];
  if (identity.email) strongOr.push({ emailHistory: identity.email });
  if (identity.firebaseUid) strongOr.push({ firebaseUidHistory: identity.firebaseUid });
  if (strongOr.length) {
    const byStrong = await TrialLedgerModel.findOne({ $or: strongOr }).sort({ updatedAt: -1 });
    if (byStrong) return byStrong;
  }
  if (identity.deviceFingerprint) {
    return TrialLedgerModel.findOne({ deviceFingerprintHistory: identity.deviceFingerprint }).sort({ updatedAt: -1 });
  }
  return null;
}

function mergeLedgerIdentity(ledger, identity, userId, deletedAccountId) {
  const nextEmailHistory = compactUnique([...(ledger.emailHistory || []), identity.email]);
  const nextFirebaseUidHistory = compactUnique([...(ledger.firebaseUidHistory || []), identity.firebaseUid]);
  const nextDeviceFingerprintHistory = compactUnique([...(ledger.deviceFingerprintHistory || []), identity.deviceFingerprint]);
  const nextIpHistory = compactUnique([...(ledger.ipHistory || []), identity.ipAddress], 20);
  const nextDeletedIds = compactUnique([...(ledger.linkedDeletedAccountIds || []), String(deletedAccountId || '')], 30);
  ledger.emailHistory = nextEmailHistory;
  ledger.firebaseUidHistory = nextFirebaseUidHistory;
  ledger.deviceFingerprintHistory = nextDeviceFingerprintHistory;
  ledger.ipHistory = nextIpHistory;
  ledger.linkedDeletedAccountIds = nextDeletedIds;
  if (userId) ledger.latestAccountId = userId;
}

/**
 * Reconciles subscription trial fields from durable ledger so recreated accounts
 * can continue only their remaining original trial window.
 */
export async function syncTrialStateFromLedger(UserModel, userId, options = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, code: 'USER_NOT_FOUND' };
  const TrialLedgerModel = options.trialLedgerModel || null;
  const existing = await UserModel.findById(uid).select('subscription email firebaseUid activeSession').lean();
  if (!existing) return { ok: false, code: 'USER_NOT_FOUND' };

  const sub = mergedSubscription(existing);
  const identity = buildLedgerIdentity(existing, options.identity || {});
  const now = new Date();

  if (!TrialLedgerModel) {
    return { ok: true, code: 'NO_LEDGER_MODEL', subscription: sub };
  }

  let ledger = await findTrialLedger(TrialLedgerModel, identity);

  if (!ledger && sub.hasUsedTrial && sub.trialStartedAt && sub.trialEndsAt) {
    ledger = await TrialLedgerModel.create({
      emailHistory: compactUnique([identity.email]),
      firebaseUidHistory: compactUnique([identity.firebaseUid]),
      deviceFingerprintHistory: compactUnique([identity.deviceFingerprint]),
      ipHistory: compactUnique([identity.ipAddress], 20),
      originalTrialStartedAt: new Date(sub.trialStartedAt),
      originalTrialEndsAt: new Date(sub.trialEndsAt),
      trialConsumed: true,
      trialConsumedAt: new Date(sub.trialStartedAt),
      latestAccountId: existing._id,
    });
  }

  if (!ledger) {
    return { ok: true, code: 'LEDGER_NOT_FOUND', subscription: sub };
  }

  mergeLedgerIdentity(ledger, identity, existing._id, options.deletedAccountId);
  if (!ledger.trialConsumedAt && ledger.originalTrialStartedAt) {
    ledger.trialConsumedAt = ledger.originalTrialStartedAt;
  }
  await ledger.save();

  if (isPaidPlanActive(sub)) {
    return { ok: true, code: 'ALREADY_PAID', subscription: sub };
  }

  const originalStart = ledger.originalTrialStartedAt ? new Date(ledger.originalTrialStartedAt) : null;
  const originalEnd = ledger.originalTrialEndsAt ? new Date(ledger.originalTrialEndsAt) : null;
  if (!originalStart || !originalEnd) {
    return { ok: true, code: 'LEDGER_INCOMPLETE', subscription: sub };
  }

  if (originalEnd.getTime() > now.getTime()) {
    const needsRestore = !trialIsActive(sub)
      || String(sub.trialEndsAt || '') !== originalEnd.toISOString()
      || String(sub.trialStartedAt || '') !== originalStart.toISOString()
      || !sub.hasUsedTrial;
    if (needsRestore) {
      const restored = await UserModel.findByIdAndUpdate(
        uid,
        {
          $set: {
            'subscription.hasUsedTrial': true,
            'subscription.trialStartedAt': originalStart,
            'subscription.trialEndsAt': originalEnd,
            'subscription.status': 'trial',
          },
        },
        { new: true, runValidators: true },
      ).select('subscription').lean();
      return { ok: true, code: 'TRIAL_RESTORED', subscription: mergedSubscription(restored || existing) };
    }
    return { ok: true, code: 'ALREADY_TRIALING', subscription: sub };
  }

  if (!sub.hasUsedTrial || sub.status === 'trial') {
    const patched = await UserModel.findByIdAndUpdate(
      uid,
      {
        $set: {
          'subscription.hasUsedTrial': true,
          ...(sub.status === 'trial' ? { 'subscription.status': 'inactive' } : {}),
        },
      },
      { new: true, runValidators: true },
    ).select('subscription').lean();
    return { ok: true, code: 'TRIAL_EXPIRED', subscription: mergedSubscription(patched || existing) };
  }

  return { ok: true, code: 'TRIAL_EXPIRED', subscription: sub };
}

/**
 * @param {import('mongoose').Model} UserModel
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, subscription?: object, code?: string, message?: string }>}
 */
export async function grantTrialIfFirstTime(UserModel, userId, options = {}) {
  const uid = String(userId || '').trim();
  const existing = await UserModel.findById(uid).select('subscription email firebaseUid activeSession').lean();
  if (!existing) return { ok: false, code: 'USER_NOT_FOUND' };

  const preSync = await syncTrialStateFromLedger(UserModel, uid, options);
  const sub = mergedSubscription({ subscription: preSync.subscription || existing.subscription });
  if (isPaidPlanActive(sub)) {
    return { ok: true, code: 'ALREADY_PAID', subscription: sub };
  }
  if (trialIsActive(sub)) {
    return { ok: true, code: preSync.code === 'TRIAL_RESTORED' ? 'TRIAL_RESTORED' : 'ALREADY_TRIALING', subscription: sub };
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

  const TrialLedgerModel = options.trialLedgerModel || null;
  if (TrialLedgerModel) {
    const identity = buildLedgerIdentity(existing, options.identity || {});
    let ledger = await findTrialLedger(TrialLedgerModel, identity);
    if (!ledger) {
      ledger = await TrialLedgerModel.create({
        emailHistory: compactUnique([identity.email]),
        firebaseUidHistory: compactUnique([identity.firebaseUid]),
        deviceFingerprintHistory: compactUnique([identity.deviceFingerprint]),
        ipHistory: compactUnique([identity.ipAddress], 20),
        originalTrialStartedAt: now,
        originalTrialEndsAt: trialEndsAt,
        trialConsumed: true,
        trialConsumedAt: now,
        latestAccountId: existing._id,
      });
    } else {
      mergeLedgerIdentity(ledger, identity, existing._id, options.deletedAccountId);
      if (!ledger.originalTrialStartedAt) ledger.originalTrialStartedAt = now;
      if (!ledger.originalTrialEndsAt) ledger.originalTrialEndsAt = trialEndsAt;
      ledger.trialConsumed = true;
      if (!ledger.trialConsumedAt) ledger.trialConsumedAt = now;
      await ledger.save();
    }
  }

  return { ok: true, code: 'TRIAL_STARTED', subscription: mergedSubscription(updated) };
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
