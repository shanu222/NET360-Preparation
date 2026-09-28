/**
 * Video alerts follow the toggle the user actually saved.
 * Web stores contentUpdates. Android stores notificationPreferences.videoUploads.
 * A missing value stays ON. An explicit false stays OFF and never backfills old videos.
 */
export function wantsVideoNotification(preferences) {
  const prefs = preferences && typeof preferences === 'object' ? preferences : {};
  if (prefs.emailNotifications === false) return false;
  if (prefs.contentUpdates === false) return false;
  const nested = prefs.notificationPreferences;
  if (nested && typeof nested === 'object' && nested.videoUploads === false) return false;
  return true;
}

export function mergeNotificationPreferencePatch(current, patch) {
  const base = current && typeof current === 'object' ? { ...current } : {};
  if (!patch || typeof patch !== 'object') return base;
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value === 'boolean' && /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(key)) {
      base[key] = value;
    }
  }
  return base;
}
