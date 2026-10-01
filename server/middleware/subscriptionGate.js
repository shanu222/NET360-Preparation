import {
  finalizeStaleSubscription,
  mergedSubscription,
  trialIsActive,
} from '../lib/subscriptionAccess.js';
import { logAuthDebug, normalizeAuthDebugRoute } from '../lib/authDebug.js';
import { applyDemoAllowance } from '../lib/demoMode.js';

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
      const fresh = await UserModel.findById(req.user._id).select('subscription accessControls paidServices role demoMode').lean();
      const sub = mergedSubscription(fresh);
      const entitlementSnapshot = typeof resolveEntitlements === 'function'
        ? await resolveEntitlements(fresh || req.user)
        : null;
      const fullPath = String(req.originalUrl || req.path || '').toLowerCase();
      const serviceType = fullPath.includes('/api/videos')
        ? 'videos'
        : fullPath.startsWith('/api/community')
          ? 'community'
          : fullPath.startsWith('/api/tests')
            ? 'tests'
            : 'preparation';
      const serviceAccess = serviceType === 'community'
        ? entitlementSnapshot?.paidServices?.community
        : serviceType === 'tests'
          ? entitlementSnapshot?.paidServices?.tests
          : serviceType === 'videos'
            ? entitlementSnapshot?.paidServices?.videos
            : entitlementSnapshot?.paidServices?.preparation;
      // Preparation also honors accessControls.preparationManual / global preparation grants.
      const preparationEntitlement = serviceType === 'preparation'
        ? entitlementSnapshot?.preparation
        : null;
      let allowed = Boolean(serviceAccess?.allowed)
        || Boolean(preparationEntitlement?.allowed && preparationEntitlement.source !== 'legacy');
      if (!allowed && fresh?.demoMode?.startedAt) {
        const demo = await applyDemoAllowance({ UserModel, req, res, user: fresh, serviceType, fullPath });
        if (demo.limitReached) {
          res.status(403).json({
            code: 'DEMO_LIMIT_REACHED',
            error: demo.slot === 'preparation'
              ? 'You have used your demo preparation item. Subscribe to continue.'
              : demo.slot === 'videos'
                ? 'You have used your demo video. Subscribe to continue.'
                : 'You have used your demo test. Subscribe to continue.',
            serviceType,
            demoSlot: demo.slot,
          });
          return;
        }
        allowed = demo.allowed;
        if (allowed) req.demoAccess = demo.slot;
      }
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
          legacyAllowed: false,
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
          legacyAllowed: false,
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
