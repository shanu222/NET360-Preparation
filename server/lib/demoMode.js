/**
 * Web Demo Mode: one test, one preparation item (topic/section test), and 24 hours of Community.
 * State lives on the user document so it survives refreshes, logouts, and new devices.
 * Demo Mode can be started once per account and never resets.
 */

export const DEMO_COMMUNITY_MS = 24 * 60 * 60 * 1000;

const DEMO_SLOTS = {
  tests: { claimedAt: 'demoMode.testsClaimedAt', sessionId: 'demoMode.testsSessionId' },
  preparation: { claimedAt: 'demoMode.preparationClaimedAt', sessionId: 'demoMode.preparationSessionId' },
};

function toMs(value) {
  if (!value) return 0;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function toIso(value) {
  const ms = toMs(value);
  return ms ? new Date(ms).toISOString() : null;
}

export function demoStatusPayload(userLike, now = Date.now()) {
  const demo = userLike?.demoMode || {};
  const startedAtMs = toMs(demo.startedAt);
  const communityEndsMs = toMs(demo.communityEndsAt);
  return {
    started: Boolean(startedAtMs),
    startedAt: toIso(demo.startedAt),
    tests: { used: Boolean(toMs(demo.testsClaimedAt)), usedAt: toIso(demo.testsClaimedAt) },
    preparation: { used: Boolean(toMs(demo.preparationClaimedAt)), usedAt: toIso(demo.preparationClaimedAt) },
    community: {
      active: Boolean(startedAtMs && communityEndsMs > now),
      endsAt: toIso(demo.communityEndsAt),
      msRemaining: Math.max(0, communityEndsMs - now),
    },
  };
}

/** Preparation Material launches topic/section tests without a Tests-page testType. */
export function isPreparationDemoStart(body) {
  const mode = String(body?.mode || '').trim().toLowerCase();
  const testType = String(body?.testType || '').trim();
  return mode === 'topic' && !testType;
}

export async function startDemoMode(UserModel, userId, now = new Date()) {
  await UserModel.updateOne(
    { _id: userId, $or: [{ 'demoMode.startedAt': null }, { 'demoMode.startedAt': { $exists: false } }] },
    {
      $set: {
        'demoMode.startedAt': now,
        'demoMode.communityEndsAt': new Date(now.getTime() + DEMO_COMMUNITY_MS),
      },
    },
  );
  return UserModel.findById(userId).select('demoMode').lean();
}

/**
 * Runs after the regular subscription check has denied access.
 * Returns true when the request is covered by the user's demo allowance.
 * For a new test start it atomically claims the demo slot, and releases it if the start fails.
 */
export async function applyDemoAllowance({ UserModel, req, res, user, serviceType, fullPath }) {
  const demo = user?.demoMode;
  if (!demo?.startedAt) return { allowed: false };

  if (serviceType === 'community') {
    return { allowed: toMs(demo.communityEndsAt) > Date.now(), slot: 'community' };
  }
  if (serviceType !== 'tests') return { allowed: false };

  if (req.method === 'POST' && fullPath.startsWith('/api/tests/start')) {
    const slot = isPreparationDemoStart(req.body) ? 'preparation' : 'tests';
    const fields = DEMO_SLOTS[slot];
    const claimedAt = new Date();
    const claim = await UserModel.updateOne(
      {
        _id: user._id,
        'demoMode.startedAt': { $ne: null },
        $or: [{ [fields.claimedAt]: null }, { [fields.claimedAt]: { $exists: false } }],
      },
      { $set: { [fields.claimedAt]: claimedAt } },
    );
    if (!claim?.modifiedCount) return { allowed: false, slot, limitReached: true };

    const claimFilter = { _id: user._id, [fields.claimedAt]: claimedAt };
    const release = () => UserModel.updateOne(claimFilter, { $unset: { [fields.claimedAt]: '' } }).catch(() => undefined);
    let settled = false;
    const originalJson = res.json.bind(res);
    // Persist the outcome before responding so the exam's follow-up requests see the demo session.
    res.json = (body) => {
      if (settled) return originalJson(body);
      settled = true;
      const sessionId = res.statusCode < 400 ? String(body?.session?.id || '') : '';
      const persist = sessionId
        ? UserModel.updateOne(claimFilter, { $set: { [fields.sessionId]: sessionId } }).catch(() => undefined)
        : release();
      persist.finally(() => {
        if (res.headersSent) return;
        try {
          originalJson(body);
        } catch {
          // Response already closed by the client.
        }
      });
      return res;
    };
    res.once('close', () => {
      if (settled) return;
      settled = true;
      void release();
    });
    return { allowed: true, slot };
  }

  if (fullPath.startsWith('/api/tests/attempts')) {
    return { allowed: Boolean(demo.testsSessionId || demo.preparationSessionId), slot: 'tests' };
  }

  const sessionId = String(req.params?.sessionId || '').trim();
  const demoSessions = [demo.testsSessionId, demo.preparationSessionId].map((id) => String(id || '')).filter(Boolean);
  return { allowed: Boolean(sessionId && demoSessions.includes(sessionId)), slot: 'tests' };
}
