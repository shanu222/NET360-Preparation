export const NOTIFICATION_PREFERENCE_SECTIONS = [
  {
    id: 'Messages',
    items: [
      {
        key: 'communityMessages',
        label: 'New messages',
        description: 'Email when a study partner sends you a Community message.',
      },
    ],
  },
  {
    id: 'Quiz Battles',
    items: [
      {
        key: 'quizChallenges',
        label: 'Quiz challenges',
        description: 'Email when someone challenges you to a Quiz Battle.',
      },
      {
        key: 'quizResponses',
        label: 'Quiz responses',
        description: 'Email when someone accepts or declines your Quiz Battle.',
      },
      {
        key: 'quizResults',
        label: 'Quiz results',
        description: 'Email when a Quiz Battle you played is completed.',
      },
    ],
  },
  {
    id: 'Community',
    items: [
      {
        key: 'achievementUnlocks',
        label: 'Achievement unlocks',
        description: 'Email when you unlock a Community achievement badge.',
      },
    ],
  },
  {
    id: 'Study partners',
    items: [
      {
        key: 'connectionRequests',
        label: 'Connection requests',
        description: 'Email when someone sends you a connection request.',
      },
      {
        key: 'connectionResponses',
        label: 'Connection responses',
        description: 'Email when someone accepts or declines your connection request.',
      },
    ],
  },
  {
    id: 'Tests and preparation',
    items: [
      {
        key: 'nustUpdates',
        label: 'NUST Notices / Schedule',
        description: 'Email when official NUST notices or schedules change.',
      },
      {
        key: 'videoUploads',
        label: 'New Video Uploads',
        description: 'Email when an admin publishes a new video.',
      },
    ],
  },
  {
    id: 'Account',
    items: [
      {
        key: 'supportReplies',
        label: 'Support replies',
        description: 'Email and device alert when an admin replies in Support Chat.',
      },
    ],
  },
] as const;

export type NotificationPreferenceKey = (typeof NOTIFICATION_PREFERENCE_SECTIONS)[number]['items'][number]['key'];

export const DELIVERY_PREFERENCE_SECTIONS = [
  {
    id: 'Email',
    items: [
      {
        key: 'emailNotifications',
        label: 'Email notifications',
        description: 'Send optional NET360 emails. When this is off, no optional email is sent.',
      },
    ],
  },
  {
    id: 'Reminders',
    items: [
      {
        key: 'dailyReminders',
        label: 'Daily practice reminders',
        description: 'Email a daily reminder to continue practice.',
      },
      {
        key: 'performanceReports',
        label: 'Weekly performance reports',
        description: 'Email a weekly summary of your practice.',
      },
    ],
  },
] as const;

export type DeliveryPreferenceKey = (typeof DELIVERY_PREFERENCE_SECTIONS)[number]['items'][number]['key'];

export type NotificationPreferenceMap = Record<NotificationPreferenceKey, boolean>;

export function defaultNotificationPreferences(): NotificationPreferenceMap {
  return {
    communityMessages: true,
    connectionRequests: true,
    connectionResponses: true,
    quizChallenges: true,
    quizResponses: true,
    quizResults: true,
    achievementUnlocks: true,
    supportReplies: true,
    nustUpdates: true,
    videoUploads: true,
  };
}

export function resolveNotificationPreferences(stored: Partial<NotificationPreferenceMap> | null | undefined): NotificationPreferenceMap {
  const defaults = defaultNotificationPreferences();
  const next = { ...defaults };
  if (!stored) return next;
  (Object.keys(defaults) as NotificationPreferenceKey[]).forEach((key) => {
    if (typeof stored[key] === 'boolean') next[key] = stored[key];
  });
  return next;
}
