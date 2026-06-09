import {
  finalizeStaleSubscription,
  hasPremiumSurfaceAccess,
  mergedSubscription,
  premiumSurfaceBypassEnabled,
  trialIsActive,
} from '../lib/subscriptionAccess.js';
import { logAuthDebug, normalizeAuthDebugRoute } from '../lib/authDebug.js';

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
    const route = normalizeAuthDebugRoute(req);
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
      const legacyAllowed = hasPremiumSurfaceAccess(sub);
      const allowed = Boolean(serviceAccess?.allowed) || legacyAllowed;
      if (!allowed) {
        logAuthDebug(req, {
          userId: String(req.user?._id || ''),
          tokenPresent: true,
          tokenValid: true,
          sessionFound: Boolean(req.user?.activeSession?.sessionId),
          sessionActive: Boolean(req.user?.activeSession?.sessionId),
          deviceMatch: null,
          failureReason: 'premium_content_locked',
          serviceType,
          subscriptionStatus: String(sub?.status || 'inactive'),
          trialActive: trialIsActive(sub),
          legacyAllowed,
          serviceAccessAllowed: Boolean(serviceAccess?.allowed),
          serviceAccessSource: serviceAccess?.source || 'none',
          httpStatus: 403,
        });
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
      if (route === '/api/tests/attempts') {
        logAuthDebug(req, {
          userId: String(req.user?._id || ''),
          tokenPresent: true,
          tokenValid: true,
          sessionFound: Boolean(req.user?.activeSession?.sessionId),
          sessionActive: Boolean(req.user?.activeSession?.sessionId),
          deviceMatch: null,
          failureReason: null,
          serviceType,
          subscriptionStatus: String(sub?.status || 'inactive'),
          trialActive: trialIsActive(sub),
          legacyAllowed,
          serviceAccessAllowed: Boolean(serviceAccess?.allowed),
        });
      }
      next();
    } catch (error) {
      logAuthDebug(req, {
        userId: String(req.user?._id || ''),
        tokenPresent: Boolean(req.user),
        tokenValid: Boolean(req.user),
        sessionFound: Boolean(req.user?.activeSession?.sessionId),
        sessionActive: Boolean(req.user?.activeSession?.sessionId),
        deviceMatch: null,
        failureReason: 'subscription_check_failed',
        error: String(error?.message || error || 'unknown'),
        httpStatus: 500,
      });
      res.status(500).json({ error: 'Could not verify subscription.', code: 'SUBSCRIPTION_CHECK_FAILED' });
    }
  };
}

/** Optional: alias for clarity */
export const requirePremiumSurface = requireTrialOrPremiumContent;
