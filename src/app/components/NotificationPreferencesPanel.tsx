import { useEffect, useState } from 'react';
import { DELIVERY_PREFERENCE_SECTIONS, NOTIFICATION_PREFERENCE_SECTIONS, resolveNotificationPreferences, type DeliveryPreferenceKey, type NotificationPreferenceKey } from '../lib/notificationPreferences';
import { handleApiError } from '../lib/userToast';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { Switch } from './ui/switch';

function PreferenceSwitchRow({
  label,
  description,
  enabled,
  onChange,
}: {
  label: string;
  description: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 active:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:active:bg-slate-800">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">{label}</p>
        <p className="text-xs text-slate-500 dark:text-slate-300">{description}</p>
        <p className="mt-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{enabled ? 'ON' : 'OFF'}</p>
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={(checked) => onChange(checked)}
        aria-label={`${label} notifications`}
        className="active:scale-95"
      />
    </div>
  );
}

export function NotificationPreferencesPanel() {
  const { user } = useAuth();
  const { preferences, savePreferences } = useAppData();
  const serverNotificationPreferences = resolveNotificationPreferences(preferences.notificationPreferences);
  const [notificationPreferences, setNotificationPreferences] = useState(serverNotificationPreferences);
  const [deliveryPreferences, setDeliveryPreferences] = useState({
    emailNotifications: preferences.emailNotifications !== false,
    dailyReminders: preferences.dailyReminders !== false,
    performanceReports: preferences.performanceReports !== false,
  });

  useEffect(() => {
    setNotificationPreferences(resolveNotificationPreferences(preferences.notificationPreferences));
    setDeliveryPreferences({
      emailNotifications: preferences.emailNotifications !== false,
      dailyReminders: preferences.dailyReminders !== false,
      performanceReports: preferences.performanceReports !== false,
    });
  }, [preferences]);

  const toggleNotificationPreference = async (key: NotificationPreferenceKey, enabled: boolean) => {
    const previous = notificationPreferences[key];
    setNotificationPreferences((current) => ({ ...current, [key]: enabled }));
    try {
      await savePreferences({ notificationPreferences: { [key]: enabled } });
    } catch (error) {
      setNotificationPreferences((current) => ({ ...current, [key]: previous }));
      handleApiError(error, 'Could not save notification preference.');
    }
  };

  const toggleDeliveryPreference = async (key: DeliveryPreferenceKey, enabled: boolean) => {
    const previous = deliveryPreferences[key];
    setDeliveryPreferences((current) => ({ ...current, [key]: enabled }));
    try {
      await savePreferences({ [key]: enabled });
    } catch (error) {
      setDeliveryPreferences((current) => ({ ...current, [key]: previous }));
      handleApiError(error, 'Could not save notification preference.');
    }
  };

  if (!user) {
    return <p className="text-sm text-slate-600 dark:text-slate-300">Sign in to manage notification preferences.</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-50">Notification Preferences</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
          Choose which NET360 notifications you want to receive. You can change these settings at any time.
        </p>
      </div>
      {DELIVERY_PREFERENCE_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.id}</h3>
          {section.items.map((item) => (
            <PreferenceSwitchRow
              key={item.key}
              label={item.label}
              description={item.description}
              enabled={deliveryPreferences[item.key] !== false}
              onChange={(enabled) => void toggleDeliveryPreference(item.key, enabled)}
            />
          ))}
        </div>
      ))}
      {NOTIFICATION_PREFERENCE_SECTIONS.map((section) => (
        <div key={section.id} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{section.id}</h3>
          {section.items.map((item) => (
            <PreferenceSwitchRow
              key={item.key}
              label={item.label}
              description={item.description}
              enabled={notificationPreferences[item.key] !== false}
              onChange={(enabled) => void toggleNotificationPreference(item.key, enabled)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
