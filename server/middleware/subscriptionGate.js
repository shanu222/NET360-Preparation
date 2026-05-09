import {
  finalizeStaleSubscription,
  hasPremiumSurfaceAccess,
  mergedSubscription,
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

export function requireTrialOrPremiumContent(UserModel) {
  return async (req, res, next) => {
    try {
      if (req.user?.role === 'admin') {
        next();
        return;
      }
      const fresh = await UserModel.findById(req.user._id).select('subscription role').lean();
      const sub = mergedSubscription(fresh);
      if (!hasPremiumSurfaceAccess(sub)) {
        res.status(403).json({
          code: 'PREMIUM_CONTENT_LOCKED',
          error: 'Subscribe or start your free trial to unlock this area.',
          subscription: sub,
        });
        return;
      }
      req.studentSubscription = sub;
      next();
    } catch {
      res.status(500).json({ error: 'Could not verify subscription.', code: 'SUBSCRIPTION_CHECK_FAILED' });
    }
  };
}

/** Optional: alias for clarity */
export const requirePremiumSurface = requireTrialOrPremiumContent;
