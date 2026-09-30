/**
 * Web Demo Mode: one test, one preparation item (topic/section test), one video, and 24 hours of Community.
 * Each allowance is independent. State lives on the user document so it survives refreshes,
 * logouts, and new devices, and it never resets.
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
    videos: { used: Boolean(demo.videoId), videoId: String(demo.videoId || '') || null },
    community: {
      started: Boolean(communityEndsMs),
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

/**
 * Turns on Demo Mode (once per account). Each service's allowance is independent:
 * the Community day only starts when the user starts the Community demo.
 */
export async function startDemoMode(UserModel, userId, { service = '', now = new Date() } = {}) {
  await UserModel.updateOne(
    { _id: userId, $or: [{ 'demoMode.startedAt': null }, { 'demoMode.startedAt': { $exists: false } }] },
    { $set: { 'demoMode.startedAt': now } },
  );
  if (service === 'community') {
    await UserModel.updateOne(
      { _id: userId, $or: [{ 'demoMode.communityEndsAt': null }, { 'demoMode.communityEndsAt': { $exists: false } }] },
      { $set: { 'demoMode.communityEndsAt': new Date(now.getTime() + DEMO_COMMUNITY_MS) } },
    );
  }
  return UserModel.findById(userId).select('demoMode').lean();
}

/**
 * Keeps a demo claim only if the route responds successfully; otherwise releases it.
 * The database update finishes before the response is sent, so the client's follow-up
 * requests (e.g. loading the exam session) already see the saved demo state.
 */
function holdClaimUntilResponse({ res, release, onSuccess }) {
  let settled = false;
  const safe = (fn) => Promise.resolve().then(fn).catch(() => undefined);
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (settled) return originalJson(body);
    settled = true;
    const persist = res.statusCode < 400 ? safe(() => onSuccess(body)) : safe(release);
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
    void safe(release);
  });
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
  if (serviceType === 'videos') {
    const playMatch = /^\/api\/videos\/([^/?#]+)\/play(?:[/?#]|$)/.exec(fullPath);
    if (!playMatch) return { allowed: true, slot: 'videos' };
    const videoId = String(req.params?.id || decodeURIComponent(playMatch[1])).trim();
    const claimedVideo = String(demo.videoId || '');
    if (claimedVideo) {
      return claimedVideo === videoId ? { allowed: true, slot: 'videos' } : { allowed: false, slot: 'videos', limitReached: true };
    }
    const claimedAt = new Date();
    const claim = await UserModel.updateOne(
      {
        _id: user._id,
        'demoMode.startedAt': { $ne: null },
        $or: [{ 'demoMode.videoId': null }, { 'demoMode.videoId': '' }, { 'demoMode.videoId': { $exists: false } }],
      },
      { $set: { 'demoMode.videoId': videoId, 'demoMode.videosClaimedAt': claimedAt } },
    );
    if (!claim?.modifiedCount) return { allowed: false, slot: 'videos', limitReached: true };
    holdClaimUntilResponse({
      res,
      release: () => UserModel.updateOne(
        { _id: user._id, 'demoMode.videosClaimedAt': claimedAt },
        { $unset: { 'demoMode.videoId': '', 'demoMode.videosClaimedAt': '' } },
      ),
      onSuccess: () => null,
    });
    return { allowed: true, slot: 'videos' };
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
    holdClaimUntilResponse({
      res,
      release: () => UserModel.updateOne(claimFilter, { $unset: { [fields.claimedAt]: '' } }),
      onSuccess: (body) => {
        const sessionId = String(body?.session?.id || '');
        return sessionId
          ? UserModel.updateOne(claimFilter, { $set: { [fields.sessionId]: sessionId } })
          : UserModel.updateOne(claimFilter, { $unset: { [fields.claimedAt]: '' } });
      },
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
