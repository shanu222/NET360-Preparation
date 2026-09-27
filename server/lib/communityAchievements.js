/**
 * Community achievement catalog and notice/certificate helpers.
 * Badge earned/progress rules stay identical to the existing /achievements endpoint.
 */
import PDFDocument from 'pdfkit';

export const ACHIEVEMENT_CATALOG = {
  'practice-master': {
    id: 'practice-master',
    label: 'Practice Master',
    icon: '\u{1F4DA}',
    description: 'Awarded for solving 1,000 practice questions on NET360.',
  },
  'accuracy-king': {
    id: 'accuracy-king',
    label: 'Accuracy King',
    icon: '\u{1F3AF}',
    description: 'Awarded for reaching a 90% average score across your NET360 practice.',
  },
  'physics-expert': {
    id: 'physics-expert',
    label: 'Physics Expert',
    icon: '\u{1F9E0}',
    description: 'Awarded for completing at least five Physics attempts with an 85%+ average.',
  },
  'study-streak-7': {
    id: 'study-streak-7',
    label: '7-Day Study Streak',
    icon: '\u{1F525}',
    description: 'Awarded for studying on NET360 for seven consecutive days.',
  },
  'leaderboard-top10': {
    id: 'leaderboard-top10',
    label: 'Top 10 Leaderboard',
    icon: '\u{1F3C6}',
    description: 'Awarded for ranking in the weekly NET360 top 10 leaderboard.',
  },
  'doubt-contributor': {
    id: 'doubt-contributor',
    label: 'Contributor Badge',
    icon: '\u{1F3C5}',
    description: 'Awarded for receiving 10 upvotes on your discussion-room answers.',
  },
};

export function catalogEntry(badgeId) {
  return ACHIEVEMENT_CATALOG[String(badgeId || '')] || null;
}

export function buildCommunityAchievementBadges({
  userId,
  solved,
  avg,
  physicsAttemptsCount,
  physicsAverage,
  streak,
  top10Ids,
  contributorUpvotes,
}) {
  const inTop10 = Boolean(top10Ids && top10Ids.has(String(userId)));
  const defs = [
    {
      ...ACHIEVEMENT_CATALOG['practice-master'],
      earned: solved >= 1000,
      progress: solved,
      target: 1000,
    },
    {
      ...ACHIEVEMENT_CATALOG['accuracy-king'],
      earned: avg >= 90,
      progress: Number(avg.toFixed(1)),
      target: 90,
    },
    {
      ...ACHIEVEMENT_CATALOG['physics-expert'],
      earned: physicsAttemptsCount >= 5 && physicsAverage >= 85,
      progress: Number(physicsAverage.toFixed(1)),
      target: 85,
    },
    {
      ...ACHIEVEMENT_CATALOG['study-streak-7'],
      earned: streak >= 7,
      progress: streak,
      target: 7,
    },
    {
      ...ACHIEVEMENT_CATALOG['leaderboard-top10'],
      earned: inTop10,
      progress: inTop10 ? 10 : 0,
      target: 10,
    },
    {
      ...ACHIEVEMENT_CATALOG['doubt-contributor'],
      earned: Number(contributorUpvotes || 0) >= 10,
      progress: Number(contributorUpvotes || 0),
      target: 10,
    },
  ];
  return defs;
}

export function applyAchievementNotices({ notices, trackingStartedAt, earnedBadgeIds, now }) {
  const started = Boolean(trackingStartedAt);
  const stamp = now instanceof Date ? now : new Date();
  const next = (Array.isArray(notices) ? notices : [])
    .filter((row) => row && row.badgeId)
    .map((row) => ({
      badgeId: String(row.badgeId),
      unlockedAt: row.unlockedAt || stamp,
      notifiedAt: row.notifiedAt || null,
    }));
  const known = new Set(next.map((row) => row.badgeId));
  const newlyUnlocked = [];

  for (const badgeId of earnedBadgeIds || []) {
    const id = String(badgeId || '');
    if (!id || known.has(id)) continue;
    next.push({
      badgeId: id,
      unlockedAt: stamp,
      notifiedAt: stamp,
    });
    known.add(id);
    if (started) newlyUnlocked.push(id);
  }

  return {
    notices: next,
    trackingStartedAt: trackingStartedAt || stamp,
    newlyUnlocked,
    changed: !started || newlyUnlocked.length > 0,
  };
}

export function unlockedAtForBadge(notices, badgeId) {
  const row = (Array.isArray(notices) ? notices : []).find((item) => String(item.badgeId) === String(badgeId));
  return row?.unlockedAt || null;
}

export function serializeAchievementBadges(badges, notices) {
  return (badges || []).map((badge) => ({
    id: badge.id,
    label: badge.label,
    icon: badge.icon,
    description: badge.description,
    earned: Boolean(badge.earned),
    progress: badge.progress,
    target: badge.target,
    unlockedAt: badge.earned ? (unlockedAtForBadge(notices, badge.id) || null) : null,
  }));
}

function cleanCertificateText(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildAchievementCertificatePdf({
  studentName,
  badgeLabel,
  description,
  unlockedAt,
  logoBuffer,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margins: { top: 36, bottom: 36, left: 42, right: 42 },
    });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const name = cleanCertificateText(studentName) || 'NET360 Student';
    const title = cleanCertificateText(badgeLabel) || 'Achievement';
    const detail = cleanCertificateText(description) || 'This badge was unlocked on NET360 Preparation.';
    const dateValue = unlockedAt instanceof Date ? unlockedAt : unlockedAt ? new Date(unlockedAt) : new Date();
    const dateLabel = Number.isFinite(dateValue.getTime())
      ? dateValue.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    doc.rect(0, 0, pageWidth, pageHeight).fill('#f4f6ff');
    doc.lineWidth(14).strokeColor('#312e81').rect(18, 18, pageWidth - 36, pageHeight - 36).stroke();
    doc.lineWidth(2).strokeColor('#818cf8').rect(32, 32, pageWidth - 64, pageHeight - 64).stroke();

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, pageWidth / 2 - 28, 48, { fit: [56, 56] });
      } catch {
        // Continue without logo if decode fails.
      }
    }

    doc.fillColor('#312e81').font('Helvetica-Bold').fontSize(13)
      .text('NET360 PREPARATION', 42, logoBuffer ? 112 : 56, { align: 'center', width: pageWidth - 84 });
    doc.fillColor('#4f46e5').font('Helvetica-Bold').fontSize(28)
      .text('Certificate of Achievement', 42, logoBuffer ? 134 : 78, { align: 'center', width: pageWidth - 84 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(12)
      .text('This certificate is proudly presented to', 42, logoBuffer ? 176 : 120, { align: 'center', width: pageWidth - 84 });
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(26)
      .text(name, 64, logoBuffer ? 202 : 146, { align: 'center', width: pageWidth - 128 });
    doc.fillColor('#334155').font('Helvetica').fontSize(13)
      .text('for unlocking the NET360 achievement', 42, logoBuffer ? 246 : 190, { align: 'center', width: pageWidth - 84 });
    doc.fillColor('#4338ca').font('Helvetica-Bold').fontSize(20)
      .text(title, 64, logoBuffer ? 270 : 214, { align: 'center', width: pageWidth - 128 });
    doc.fillColor('#475569').font('Helvetica').fontSize(12)
      .text(detail, 96, logoBuffer ? 308 : 252, { align: 'center', width: pageWidth - 192 });
    doc.fillColor('#1e1b4b').font('Helvetica-Bold').fontSize(12)
      .text(`Date unlocked: ${dateLabel}`, 42, pageHeight - 110, { align: 'center', width: pageWidth - 84 });
    doc.fillColor('#64748b').font('Helvetica').fontSize(10)
      .text('Open NET360 to continue your preparation. This certificate confirms an in-app achievement.', 64, pageHeight - 84, {
        align: 'center',
        width: pageWidth - 128,
      });

    doc.end();
  });
}
