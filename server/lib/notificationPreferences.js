/**
 * Optional notifications that NET360 actually sends.
 * Keys stay stable so existing saved values are never rewritten.
 */
export const OPTIONAL_NOTIFICATIONS = [
  {
    key: 'communityMessages',
    section: 'Messages',
    label: 'New messages',
    description: 'Email when a study partner sends you a Community message.',
    trigger: 'Community chat message, at most once per 30-minute window until you reply',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'connectionRequests',
    section: 'Study partners',
    label: 'Connection requests',
    description: 'Email when someone sends you a connection request.',
    trigger: 'Community connection request created',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'connectionResponses',
    section: 'Study partners',
    label: 'Connection responses',
    description: 'Email when someone accepts or declines your connection request.',
    trigger: 'Community connection accepted or declined',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'quizChallenges',
    section: 'Quiz Battles',
    label: 'Quiz challenges',
    description: 'Email when someone challenges you to a Quiz Battle.',
    trigger: 'Quiz Battle invite created',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'quizResponses',
    section: 'Quiz Battles',
    label: 'Quiz responses',
    description: 'Email when someone accepts or declines your Quiz Battle.',
    trigger: 'Quiz Battle accepted or declined',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'quizResults',
    section: 'Quiz Battles',
    label: 'Quiz results',
    description: 'Email when a Quiz Battle you played is completed.',
    trigger: 'Quiz Battle completed',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'achievementUnlocks',
    section: 'Community',
    label: 'Achievement unlocks',
    description: 'Email when you unlock a Community achievement badge.',
    trigger: 'Community badge newly unlocked',
    channel: 'email',
    schedule: 'event',
  },
  {
    key: 'supportReplies',
    section: 'Account',
    label: 'Support replies',
    description: 'Email and device alert when an admin replies in Support Chat.',
    trigger: 'Admin Support Chat reply, at most once per 30-minute window until you reply',
    channel: 'email-and-device',
    schedule: 'event',
  },
  {
    key: 'nustUpdates',
    section: 'Tests and preparation',
    label: 'NUST Notices / Schedule',
    description: 'Email when official NUST notices or schedules change.',
    trigger: 'Scheduled NUST portal check finds a new public update',
    channel: 'email',
    schedule: 'scheduled',
  },
  {
    key: 'videoUploads',
    section: 'Tests and preparation',
    label: 'New Video Uploads',
    description: 'Email when an admin publishes a new video.',
    trigger: 'Admin publishes a video for the first time',
    channel: 'email',
    schedule: 'event',
  },
];

export const MANDATORY_NOTIFICATIONS = [
  {
    key: 'emailVerification',
    label: 'Email verification',
    reason: 'Required before a new account can sign in.',
  },
  {
    key: 'passwordReset',
    label: 'Password reset',
    reason: 'Required to recover an account. Sent by Firebase when you request a reset.',
  },
  {
    key: 'accountDeletion',
    label: 'Account deletion confirmation',
    reason: 'Required to confirm a permanent deletion request.',
  },
];

const OPTIONAL_KEYS = new Set(OPTIONAL_NOTIFICATIONS.map((item) => item.key));

export function isOptionalNotificationKey(key) {
  return OPTIONAL_KEYS.has(String(key || ''));
}

/**
 * Fill missing optional keys with ON. Never changes a key that is already true or false.
 */
export function resolveNotificationPreferences(stored) {
  const current = stored && typeof stored === 'object' ? stored : {};
  const preferences = {};
  let changed = false;
  for (const item of OPTIONAL_NOTIFICATIONS) {
    if (typeof current[item.key] === 'boolean') {
      preferences[item.key] = current[item.key];
    } else {
      preferences[item.key] = true;
      changed = true;
    }
  }
  return { preferences, changed };
}

export function isOptionalNotificationEnabled(preferencesRoot, key) {
  if (!isOptionalNotificationKey(key)) return false;
  const stored = preferencesRoot?.notificationPreferences || preferencesRoot;
  const { preferences } = resolveNotificationPreferences(stored);
  return preferences[key] !== false;
}

export function mergeNotificationPreferencePatch(stored, patch) {
  const { preferences } = resolveNotificationPreferences(stored);
  const source = patch && typeof patch === 'object' ? patch : {};
  for (const item of OPTIONAL_NOTIFICATIONS) {
    if (typeof source[item.key] === 'boolean') {
      preferences[item.key] = source[item.key];
    }
  }
  return preferences;
}
