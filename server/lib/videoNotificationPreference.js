import { notificationAllowed } from './unifiedNotificationPreferences.js';

export function wantsVideoNotification(preferences) {
  return notificationAllowed(preferences, 'newVideos');
}
