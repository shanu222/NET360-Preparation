/**
 * One notification record for Web and Android.
 * Canonical keys live on preferences.notificationPreferences.
 * Older fields are read so existing choices stay in effect, and they are written
 * back to the same value so both clients show the same switch.
 */

const CATEGORY_KEYS = [
  'communityMessages',
  'connectionRequests',
  'connectionResponses',
  'quizChallenges',
  'quizResponses',
  'quizResults',
  'achievementUnlocks',
  'supportReplies',
];

const EMAIL_TYPE_TO_KEY = {
  'video-published': 'newVideos',
  videoUploads: 'newVideos',
  contentUpdates: 'newVideos',
  newVideos: 'newVideos',
  nust: 'nustNotices',
  nustNotices: 'nustNotices',
  nustUpdates: 'nustNotices',
  'net-updates': 'netUpdates',
  netUpdates: 'netUpdates',
  'daily-reminder': 'dailyReminders',
  dailyReminders: 'dailyReminders',
  'weekly-report': 'performanceReports',
  performanceReports: 'performanceReports',
};

for (const key of CATEGORY_KEYS) EMAIL_TYPE_TO_KEY[key] = key;

function asObject(value) {
  return value && typeof value === 'object' ? value : {};
}

/**
 * An explicit canonical value wins. Otherwise any saved false stays off.
 * A missing value stays on and is not treated as a reset.
 */
function preferExplicit(canonical, legacyValues) {
  if (typeof canonical === 'boolean') return canonical;
  for (const value of legacyValues) {
    if (value === false) return false;
  }
  for (const value of legacyValues) {
    if (value === true) return true;
  }
  return true;
}

export function resolveSharedNotificationPreferences(preferences) {
  const root = asObject(preferences);
  const nested = asObject(root.notificationPreferences);
  const enabled = preferExplicit(nested.enabled, [root.emailNotifications, nested.emailNotifications]);
  const newVideos = preferExplicit(nested.newVideos, [nested.videoUploads, root.contentUpdates]);
  const nustNotices = preferExplicit(nested.nustNotices, [nested.nustUpdates]);
  const netUpdates = preferExplicit(nested.netUpdates, [nested.nustUpdates]);
  const dailyReminders = preferExplicit(nested.dailyReminders, [root.dailyReminders]);
  const performanceReports = preferExplicit(nested.performanceReports, [root.performanceReports]);
  const notificationPreferences = {
    enabled,
    newVideos,
    nustNotices,
    netUpdates,
    dailyReminders,
    performanceReports,
    videoUploads: newVideos,
    nustUpdates: Boolean(nustNotices && netUpdates),
  };
  for (const key of CATEGORY_KEYS) {
    notificationPreferences[key] = typeof nested[key] === 'boolean' ? nested[key] : true;
  }
  return {
    emailNotifications: enabled,
    dailyReminders,
    performanceReports,
    contentUpdates: newVideos,
    notificationPreferences,
  };
}

export function notificationAllowed(preferences, emailType) {
  const shared = resolveSharedNotificationPreferences(preferences);
  if (shared.notificationPreferences.enabled === false) return false;
  const key = EMAIL_TYPE_TO_KEY[String(emailType || '')];
  if (!key) return true;
  return shared.notificationPreferences[key] !== false;
}

function assignPreference(notes, key, value) {
  if (typeof value !== 'boolean') return;
  if (key === 'enabled' || key === 'emailNotifications') {
    notes.enabled = value;
    return;
  }
  if (key === 'newVideos' || key === 'videoUploads' || key === 'contentUpdates') {
    notes.newVideos = value;
    return;
  }
  if (key === 'nustNotices' || key === 'nustUpdates') {
    notes.nustNotices = value;
    notes.netUpdates = value;
    return;
  }
  if (key === 'netUpdates' || key === 'dailyReminders' || key === 'performanceReports' || CATEGORY_KEYS.includes(key)) {
    notes[key] = value;
  }
}

export function applySharedNotificationPreferences(current, patch) {
  const notes = { ...resolveSharedNotificationPreferences(current).notificationPreferences };
  const body = asObject(patch);
  const nestedPatch = asObject(body.notificationPreferences);
  for (const [key, value] of Object.entries(body)) {
    if (key === 'notificationPreferences') continue;
    assignPreference(notes, key, value);
  }
  for (const [key, value] of Object.entries(nestedPatch)) {
    assignPreference(notes, key, value);
  }
  notes.videoUploads = notes.newVideos;
  notes.nustUpdates = Boolean(notes.nustNotices && notes.netUpdates);
  return {
    emailNotifications: notes.enabled,
    dailyReminders: notes.dailyReminders,
    performanceReports: notes.performanceReports,
    contentUpdates: notes.newVideos,
    notificationPreferences: notes,
  };
}
