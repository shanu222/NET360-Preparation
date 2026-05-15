import {
  buildPremiumBadgeState,
  hasPremiumSurfaceAccess,
  isPaidPlanActive,
  mergedSubscription,
  premiumSurfaceBypassEnabled,
  surfaceAccessDetail,
} from './subscriptionAccess.js';

export const ACCESS_TYPES = {
  mentor: 'mentor',
  preparation: 'preparation',
};

export const PAID_SERVICE_TYPES = {
  tests: 'tests',
  preparation: 'preparation',
  community: 'community',
};

export function defaultManualGrant() {
  return {
    status: 'inactive',
    startsAt: null,
    expiresAt: null,
    durationDays: 0,
    durationValue: 0,
    durationUnit: 'days',
    source: '',
    grantedAt: null,
    grantedByUserId: '',
    grantedByEmail: '',
    lastUpdatedAt: null,
    notes: '',
  };
}

function toPlain(value) {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') return value.toObject();
  if (value._doc && typeof value._doc === 'object') return { ...value._doc };
  return { ...value };
}

export function normalizeManualGrant(value) {
  const merged = { ...defaultManualGrant(), ...toPlain(value) };
  merged.durationValue = Number(merged.durationValue || 0);
  merged.durationDays = Number(merged.durationDays || 0);
  merged.durationUnit = String(merged.durationUnit || 'days');
  return merged;
}

export function isGrantActive(grantLike, serverNow = Date.now()) {
  const grant = normalizeManualGrant(grantLike);
  if (grant.status !== 'active') return false;
  if (!grant.expiresAt) return false;
  return new Date(grant.expiresAt).getTime() > serverNow;
}

function normalizeGlobalGrant(value) {
  return {
    accessType: '',
    status: 'inactive',
    startsAt: null,
    expiresAt: null,
    durationDays: 0,
    grantedByUserId: '',
    grantedByEmail: '',
    lastActionByUserId: '',
    lastActionByEmail: '',
    lastActionAt: null,
    notes: '',
    ...toPlain(value),
  };
}

export function buildGlobalGrantMap(rows) {
  const map = {
    mentor: normalizeGlobalGrant({ accessType: ACCESS_TYPES.mentor }),
    preparation: normalizeGlobalGrant({ accessType: ACCESS_TYPES.preparation }),
  };
  (rows || []).forEach((row) => {
    const normalized = normalizeGlobalGrant(row);
    if (normalized.accessType === ACCESS_TYPES.mentor || normalized.accessType === ACCESS_TYPES.preparation) {
      map[normalized.accessType] = normalized;
    }
  });
  return map;
}

function activeSourceDetail({ type, manual, globalGrant, legacyAllowed, sub, now }) {
  const legacy = type === ACCESS_TYPES.mentor
    ? isPaidPlanActive(sub)
    : hasPremiumSurfaceAccess(sub);
  if (isGrantActive(manual, now)) {
    return {
      allowed: true,
      source: 'manual',
      startsAt: manual.startsAt || null,
      expiresAt: manual.expiresAt || null,
      durationDays: Number(manual.durationDays || 0),
      status: 'active',
      legacyAllowed: legacy,
    };
  }
  if (isGrantActive(globalGrant, now)) {
    return {
      allowed: true,
      source: 'global',
      startsAt: globalGrant.startsAt || null,
      expiresAt: globalGrant.expiresAt || null,
      durationDays: Number(globalGrant.durationDays || 0),
      status: 'active',
      legacyAllowed: legacy,
    };
  }
  if (legacyAllowed) {
    return {
      allowed: true,
      source: 'legacy',
      startsAt: null,
      expiresAt: type === ACCESS_TYPES.mentor ? (sub.expiresAt || null) : (sub.trialEndsAt || sub.expiresAt || null),
      durationDays: 0,
      status: 'active',
      legacyAllowed: true,
    };
  }
  return {
    allowed: false,
    source: 'none',
    startsAt: null,
    expiresAt: null,
    durationDays: 0,
    status: 'inactive',
    legacyAllowed: legacy,
  };
}

export function resolveUserEntitlements(userLike, globalGrantMap, serverNow = Date.now()) {
  const now = typeof serverNow === 'number' ? serverNow : new Date(serverNow).getTime();
  const user = toPlain(userLike);
  const sub = mergedSubscription(user);
  const manualControls = toPlain(user.accessControls || {});
  const mentorManual = normalizeManualGrant(manualControls.mentorManual);
  const preparationManual = normalizeManualGrant(manualControls.preparationManual);
  const globals = buildGlobalGrantMap([globalGrantMap?.mentor, globalGrantMap?.preparation]);

  const mentorLegacyAllowed = isPaidPlanActive(sub);
  const preparationLegacyAllowed = hasPremiumSurfaceAccess(sub);

  const mentor = activeSourceDetail({
    type: ACCESS_TYPES.mentor,
    manual: mentorManual,
    globalGrant: globals.mentor,
    legacyAllowed: mentorLegacyAllowed,
    sub,
    now,
  });
  const preparation = activeSourceDetail({
    type: ACCESS_TYPES.preparation,
    manual: preparationManual,
    globalGrant: globals.preparation,
    legacyAllowed: preparationLegacyAllowed,
    sub,
    now,
  });

  return {
    mentor,
    preparation,
    legacy: {
      mentorAllowed: mentorLegacyAllowed,
      preparationAllowed: preparationLegacyAllowed,
    },
    manual: {
      mentor: mentorManual,
      preparation: preparationManual,
    },
    global: globals,
  };
}

function buildLegacyPaidServiceState(serviceType, sub, now) {
  const legacyAllowed = hasPremiumSurfaceAccess(sub);
  if (!legacyAllowed) {
    return {
      allowed: false,
      source: 'none',
      status: 'inactive',
      startsAt: null,
      expiresAt: null,
      durationDays: 0,
      durationValue: 0,
      durationUnit: 'days',
      legacyAllowed: false,
      serviceType,
    };
  }
  const trialEndsAt = sub?.trialEndsAt ? new Date(sub.trialEndsAt).getTime() : 0;
  const paidEndsAt = sub?.expiresAt ? new Date(sub.expiresAt).getTime() : 0;
  const end = Math.max(trialEndsAt, paidEndsAt);
  return {
    allowed: true,
    source: 'legacy',
    status: 'active',
    startsAt: null,
    expiresAt: end > 0 ? new Date(end).toISOString() : null,
    durationDays: 0,
    durationValue: 0,
    durationUnit: 'days',
    legacyAllowed: true,
    serviceType,
  };
}

function resolveManualPaidService(serviceType, paidServices, sub, now) {
  const legacy = buildLegacyPaidServiceState(serviceType, sub, now);
  const manual = normalizeManualGrant(paidServices?.[serviceType]);
  if (isGrantActive(manual, now)) {
    return {
      allowed: true,
      source: 'manual',
      status: 'active',
      startsAt: manual.startsAt ? new Date(manual.startsAt).toISOString() : null,
      expiresAt: manual.expiresAt ? new Date(manual.expiresAt).toISOString() : null,
      durationDays: Number(manual.durationDays || 0),
      durationValue: Number(manual.durationValue || 0),
      durationUnit: String(manual.durationUnit || 'days'),
      legacyAllowed: legacy.legacyAllowed,
      serviceType,
      notes: manual.notes || '',
    };
  }
  if (legacy.allowed) return legacy;
  return {
    ...legacy,
    status: manual.status || legacy.status,
  };
}

export function resolvePaidServices(userLike, serverNow = Date.now()) {
  const now = typeof serverNow === 'number' ? serverNow : new Date(serverNow).getTime();
  const user = toPlain(userLike);
  const sub = mergedSubscription(user);
  const paidServices = toPlain(user.paidServices || {});
  const tests = resolveManualPaidService(PAID_SERVICE_TYPES.tests, paidServices, sub, now);
  const preparation = resolveManualPaidService(PAID_SERVICE_TYPES.preparation, paidServices, sub, now);
  const community = resolveManualPaidService(PAID_SERVICE_TYPES.community, paidServices, sub, now);
  return {
    tests,
    preparation,
    community,
  };
}

export function resolveRequestedServiceAccess(paidServices, serviceType) {
  const key = String(serviceType || '').trim().toLowerCase();
  if (key === PAID_SERVICE_TYPES.tests) return paidServices?.tests;
  if (key === PAID_SERVICE_TYPES.community) return paidServices?.community;
  return paidServices?.preparation;
}

export function buildPreparationSurfaceForClient(entitlements, subscription, serverNow = Date.now()) {
  const sub = mergedSubscription({ subscription });
  const legacyDetail = surfaceAccessDetail(sub, serverNow);
  const legacyBadge = buildPremiumBadgeState(sub, serverNow);
  const prep = entitlements?.paidServices?.preparation || entitlements?.preparation;
  if (!prep?.allowed || prep.source === 'legacy') {
    return {
      ...legacyDetail,
      badge: legacyBadge,
      hasSurfaceAccess: legacyDetail.allowed,
      source: legacyDetail.source,
    };
  }

  const endMs = prep.expiresAt ? new Date(prep.expiresAt).getTime() : 0;
  const nowMs = typeof serverNow === 'number' ? serverNow : new Date(serverNow).getTime();
  const msRemaining = endMs > 0 ? Math.max(0, endMs - nowMs) : 0;
  return {
    allowed: true,
    source: prep.source,
    endsAt: prep.expiresAt ? new Date(prep.expiresAt).toISOString() : null,
    msRemaining,
    serverNow: new Date(nowMs).toISOString(),
    hasSurfaceAccess: true,
    badge: {
      variant: msRemaining <= 3 * 24 * 60 * 60 * 1000 ? 'orange' : 'green',
      label: prep.source === 'global' ? 'Preparation global access active' : 'Preparation access active',
      endsAt: prep.expiresAt ? new Date(prep.expiresAt).toISOString() : null,
      source: prep.source,
    },
  };
}

export async function finalizeExpiredManualAccess(UserModel, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const user = await UserModel.findById(uid).select('accessControls').lean();
  if (!user?.accessControls) return;
  const controls = toPlain(user.accessControls);
  const mentor = normalizeManualGrant(controls.mentorManual);
  const preparation = normalizeManualGrant(controls.preparationManual);
  const now = Date.now();
  const updates = {};
  if (mentor.status === 'active' && mentor.expiresAt && new Date(mentor.expiresAt).getTime() <= now) {
    updates['accessControls.mentorManual.status'] = 'expired';
    updates['accessControls.mentorManual.lastUpdatedAt'] = new Date();
  }
  if (preparation.status === 'active' && preparation.expiresAt && new Date(preparation.expiresAt).getTime() <= now) {
    updates['accessControls.preparationManual.status'] = 'expired';
    updates['accessControls.preparationManual.lastUpdatedAt'] = new Date();
  }
  if (Object.keys(updates).length) {
    await UserModel.updateOne({ _id: uid }, { $set: updates });
  }
}

export async function finalizeExpiredPaidServices(UserModel, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const user = await UserModel.findById(uid).select('paidServices').lean();
  if (!user?.paidServices) return;
  const paid = toPlain(user.paidServices);
  const now = Date.now();
  const updates = {};
  for (const key of [PAID_SERVICE_TYPES.tests, PAID_SERVICE_TYPES.preparation, PAID_SERVICE_TYPES.community]) {
    const grant = normalizeManualGrant(paid[key]);
    if (grant.status === 'active' && grant.expiresAt && new Date(grant.expiresAt).getTime() <= now) {
      updates[`paidServices.${key}.status`] = 'expired';
      updates[`paidServices.${key}.lastUpdatedAt`] = new Date();
    }
  }
  if (Object.keys(updates).length > 0) {
    await UserModel.updateOne({ _id: uid }, { $set: updates });
  }
}

export async function finalizeExpiredGlobalAccess(GlobalAccessGrantModel) {
  const now = new Date();
  await GlobalAccessGrantModel.updateMany(
    { status: 'active', expiresAt: { $lte: now } },
    { $set: { status: 'expired', lastActionAt: now } },
  );
}

export function premiumSurfaceBypassActive() {
  return premiumSurfaceBypassEnabled();
}
