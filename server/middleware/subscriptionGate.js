import {
  finalizeStaleSubscription,
  hasPremiumSurfaceAccess,
  mergedSubscription,
  premiumSurfaceBypassEnabled,
} from '../lib/subscriptionAccess.js';

/**
 * After auth: sync trial/paid expiry in Mongo, then require tests/community/study-plan access.
 * Admins bypass.
 */
export function subscriptionExpiryRefresh(UserModel) {
  return async (req, res, next) => {
    try {
      if (!req.user?._id) {
        res.status(401).json({ error: 'Unauthorized.', code: 'AUTH_REQUIRED' });
        return;
      }
      if (req.user.role === 'admin') {
        next();
        return;
      }
      await finalizeStaleSubscription(UserModel, req.user._id);
      next();
    } catch {
      next();
    }
  };
}

export function requireTrialOrPremiumContent(UserModel, resolveEntitlements) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'admin') {
        next();
        return;
      }
      if (premiumSurfaceBypassEnabled()) {
        next();
        return;
      }
      const fresh = await UserModel.findById(req.user._id).select('subscription accessControls paidServices role').lean();
      const sub = mergedSubscription(fresh);
      const entitlementSnapshot = typeof resolveEntitlements === 'function'
        ? await resolveEntitlements(fresh || req.user)
        : null;
      const fullPath = String(req.originalUrl || req.path || '').toLowerCase();
      const serviceType = fullPath.startsWith('/api/community')
        ? 'community'
        : fullPath.startsWith('/api/tests')
          ? 'tests'
          : 'preparation';
      const serviceAccess = serviceType === 'community'
        ? entitlementSnapshot?.paidServices?.community
        : serviceType === 'tests'
          ? entitlementSnapshot?.paidServices?.tests
          : entitlementSnapshot?.paidServices?.preparation;
      const allowed = Boolean(serviceAccess?.allowed) || hasPremiumSurfaceAccess(sub);
      if (!allowed) {
        res.status(403).json({
          code: 'PREMIUM_CONTENT_LOCKED',
          error: 'Subscribe or start your free trial to unlock this area.',
          subscription: sub,
          serviceType,
          serviceAccess: serviceAccess || null,
        });
        return;
      }
      req.studentSubscription = sub;
      req.studentPreparationAccess = entitlementSnapshot?.paidServices?.preparation || null;
      req.studentTestsAccess = entitlementSnapshot?.paidServices?.tests || null;
      req.studentCommunityAccess = entitlementSnapshot?.paidServices?.community || null;
      next();
    } catch {
      res.status(500).json({ error: 'Could not verify subscription.', code: 'SUBSCRIPTION_CHECK_FAILED' });
    }
  };
}

/** Optional: alias for clarity */
export const requirePremiumSurface = requireTrialOrPremiumContent;
