import assert from 'node:assert/strict';
import {
  ACHIEVEMENT_CATALOG,
  applyAchievementNotices,
  buildAchievementCertificatePdf,
  buildCommunityAchievementBadges,
} from '../server/lib/communityAchievements.js';

const mojibake = /ð|Ã|Â/;
for (const badge of Object.values(ACHIEVEMENT_CATALOG)) {
  assert.ok(!mojibake.test(badge.icon), `${badge.id} icon is corrupted`);
  assert.ok(badge.icon.length >= 1, `${badge.id} missing icon`);
}

const top10 = new Set(['user-a']);
const badges = buildCommunityAchievementBadges({
  userId: 'user-a',
  solved: 500,
  avg: 2,
  physicsAttemptsCount: 0,
  physicsAverage: 0,
  streak: 2,
  top10Ids: top10,
  contributorUpvotes: 0,
});
const practice = badges.find((item) => item.id === 'practice-master');
const leaderboard = badges.find((item) => item.id === 'leaderboard-top10');
assert.equal(practice.earned, false);
assert.equal(practice.progress, 500);
assert.equal(practice.target, 1000);
assert.equal(leaderboard.earned, true);
assert.equal(leaderboard.progress, 10);

const firstVisit = applyAchievementNotices({
  notices: [],
  trackingStartedAt: null,
  earnedBadgeIds: ['leaderboard-top10'],
  now: new Date('2026-09-27T00:00:00.000Z'),
});
assert.deepEqual(firstVisit.newlyUnlocked, []);
assert.equal(firstVisit.notices.length, 1);

const secondVisit = applyAchievementNotices({
  notices: firstVisit.notices,
  trackingStartedAt: firstVisit.trackingStartedAt,
  earnedBadgeIds: ['leaderboard-top10'],
  now: new Date('2026-09-28T00:00:00.000Z'),
});
assert.deepEqual(secondVisit.newlyUnlocked, []);
assert.equal(secondVisit.changed, false);

const laterUnlock = applyAchievementNotices({
  notices: firstVisit.notices,
  trackingStartedAt: firstVisit.trackingStartedAt,
  earnedBadgeIds: ['leaderboard-top10', 'practice-master'],
  now: new Date('2026-09-29T00:00:00.000Z'),
});
assert.deepEqual(laterUnlock.newlyUnlocked, ['practice-master']);

const pdf = await buildAchievementCertificatePdf({
  studentName: 'Test Student',
  badgeLabel: 'Top 10 Leaderboard',
  description: ACHIEVEMENT_CATALOG['leaderboard-top10'].description,
  unlockedAt: new Date('2026-09-27T00:00:00.000Z'),
  logoBuffer: null,
});
assert.ok(pdf.slice(0, 5).toString() === '%PDF-', 'certificate is not a PDF');
assert.ok(pdf.length > 800, 'certificate PDF is too small');

console.log('community achievements checks passed');
