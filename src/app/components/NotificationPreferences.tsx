import { useState } from 'react';
import { Switch } from './ui/switch';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { showErrorToast } from '../lib/userToast';

type PreferenceReader = {
  emailNotifications?: boolean;
  dailyReminders?: boolean;
  performanceReports?: boolean;
  notificationPreferences?: Record<string, boolean>;
};

type PreferenceControl = {
  id: string;
  label: string;
  description: string;
  read: (preferences: PreferenceReader) => boolean;
  patch: (next: boolean) => {
    emailNotifications?: boolean;
    notificationPreferences?: Record<string, boolean>;
  };
};

function nestedFlag(preferences: PreferenceReader, key: string, fallback = true) {
  const value = preferences.notificationPreferences?.[key];
  return typeof value === 'boolean' ? value : fallback;
}

export const NOTIFICATION_CONTROLS: PreferenceControl[] = [
  {
    id: 'emailNotifications',
    label: 'Email Notifications',
    description: 'Optional NET360 emails. Sign-in verification, password reset, and account deletion emails still send.',
    read: (preferences) => preferences.emailNotifications !== false,
    patch: (next) => ({ emailNotifications: next, notificationPreferences: { enabled: next } }),
  },
  {
    id: 'nustNotices',
    label: 'NUST Updates',
    description: 'Email when official NUST admission dates or notices change.',
    read: (preferences) => nestedFlag(preferences, 'nustNotices', true) && nestedFlag(preferences, 'netUpdates', true),
    patch: (next) => ({ notificationPreferences: { nustNotices: next, netUpdates: next, nustUpdates: next } }),
  },
  {
    id: 'communityMessages',
    label: 'Community Messages',
    description: 'Email when you receive a community message.',
    read: (preferences) => nestedFlag(preferences, 'communityMessages'),
    patch: (next) => ({ notificationPreferences: { communityMessages: next } }),
  },
  {
    id: 'connectionRequests',
    label: 'Connection Requests',
    description: 'Email when someone sends you a connection request.',
    read: (preferences) => nestedFlag(preferences, 'connectionRequests'),
    patch: (next) => ({ notificationPreferences: { connectionRequests: next } }),
  },
  {
    id: 'connectionResponses',
    label: 'Connection Responses',
    description: 'Email when someone accepts or declines your connection request.',
    read: (preferences) => nestedFlag(preferences, 'connectionResponses'),
    patch: (next) => ({ notificationPreferences: { connectionResponses: next } }),
  },
  {
    id: 'quizChallenges',
    label: 'Quiz Challenges',
    description: 'Email when you are invited to a quiz challenge.',
    read: (preferences) => nestedFlag(preferences, 'quizChallenges'),
    patch: (next) => ({ notificationPreferences: { quizChallenges: next } }),
  },
  {
    id: 'quizResponses',
    label: 'Quiz Responses',
    description: 'Email when someone responds to your quiz challenge.',
    read: (preferences) => nestedFlag(preferences, 'quizResponses'),
    patch: (next) => ({ notificationPreferences: { quizResponses: next } }),
  },
  {
    id: 'quizResults',
    label: 'Quiz Results',
    description: 'Email when a quiz challenge result is ready.',
    read: (preferences) => nestedFlag(preferences, 'quizResults'),
    patch: (next) => ({ notificationPreferences: { quizResults: next } }),
  },
  {
    id: 'achievementUnlocks',
    label: 'Achievement Unlocks',
    description: 'Email when you unlock an achievement.',
    read: (preferences) => nestedFlag(preferences, 'achievementUnlocks'),
    patch: (next) => ({ notificationPreferences: { achievementUnlocks: next } }),
  },
  {
    id: 'supportReplies',
    label: 'Support Replies',
    description: 'Email when support replies in your chat.',
    read: (preferences) => nestedFlag(preferences, 'supportReplies'),
    patch: (next) => ({ notificationPreferences: { supportReplies: next } }),
  },
];

export function NotificationPreferencesList({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth();
  const { preferences, savePreferences } = useAppData();
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (!user) {
    return <p className="text-sm text-slate-500">Log in to manage notification preferences.</p>;
  }

  const change = async (control: PreferenceControl, next: boolean) => {
    if (savingId) return;
    setDraft((current) => ({ ...current, [control.id]: next }));
    setSavingId(control.id);
    try {
      await savePreferences(control.patch(next));
      setDraft((current) => {
        const rest = { ...current };
        delete rest[control.id];
        return rest;
      });
    } catch {
      setDraft((current) => {
        const rest = { ...current };
        delete rest[control.id];
        return rest;
      });
      showErrorToast('Unable to update notification preference.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {NOTIFICATION_CONTROLS.map((control) => {
        const enabled = control.id in draft ? draft[control.id] : control.read(preferences);
        return (
          <div key={control.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className={compact ? 'text-sm font-medium text-indigo-950 dark:text-indigo-100' : 'text-indigo-950 dark:text-indigo-100'}>{control.label}</h4>
              <p className="text-sm text-muted-foreground">{control.description}</p>
            </div>
            <label className="inline-flex shrink-0 items-center gap-2">
              <span className={`w-8 text-right text-xs font-semibold ${enabled ? 'text-indigo-700 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
              <Switch
                checked={enabled}
                disabled={savingId === control.id}
                aria-label={`${control.label} ${enabled ? 'on' : 'off'}`}
                onCheckedChange={(checked) => { void change(control, checked); }}
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
