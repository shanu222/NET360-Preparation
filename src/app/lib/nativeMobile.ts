import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { Camera } from '@capacitor/camera';
import { Filesystem } from '@capacitor/filesystem';

const isNative = () => Capacitor.isNativePlatform();
const isPushEnabled = () => String((import.meta as any).env?.VITE_ENABLE_PUSH_NOTIFICATIONS || '').toLowerCase() === 'true';

export type PermissionResolution = {
  granted: boolean;
  status: 'granted' | 'denied' | 'not-required' | 'error';
  message: string;
};

export async function initializeNativeExperience() {
  if (!isNative()) {
    return;
  }

  await Promise.allSettled([
    configureStatusBar(),
    configureSplashScreen(),
  ]);
}

async function configureStatusBar() {
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#EEF0FF' });
  } catch (error) {
    console.warn('StatusBar setup skipped:', error);
  }
}

async function configureSplashScreen() {
  try {
    await SplashScreen.hide();
  } catch (error) {
    console.warn('SplashScreen hide skipped:', error);
  }
}

async function registerPushNotificationsIfEnabled() {
  if (!isPushEnabled()) {
    return;
  }

  try {
    const permissionResult = await PushNotifications.requestPermissions();
    if (permissionResult.receive !== 'granted') {
      return;
    }

    await PushNotifications.register();

    PushNotifications.addListener('registration', (token) => {
      // Hook for sending token to backend user profile when endpoint is ready.
      console.info('Push token received:', token.value);
    });

    PushNotifications.addListener('registrationError', (error) => {
      console.error('Push registration error:', error);
    });

    PushNotifications.addListener('pushNotificationReceived', (notification) => {
      console.info('Push received in foreground:', notification);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
      console.info('Push action performed:', event.notification?.data || {});
    });
  } catch (error) {
    console.warn('PushNotifications setup skipped:', error);
  }
}

export async function requestCameraAccessPermission(): Promise<PermissionResolution> {
  if (!isNative()) {
    return {
      granted: true,
      status: 'not-required',
      message: 'Browser mode uses file picker permission flow when you upload an image.',
    };
  }

  try {
    const result = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
    const granted = result.camera === 'granted' || result.photos === 'granted';
    return {
      granted,
      status: granted ? 'granted' : 'denied',
      message: granted
        ? 'Camera/media permission granted. You can upload or capture question images.'
        : 'Camera/media permission denied. You can still use text-based features.',
    };
  } catch {
    return {
      granted: false,
      status: 'error',
      message: 'Camera permission request failed. Try again from device settings.',
    };
  }
}

export async function requestFileAccessPermission(): Promise<PermissionResolution> {
  if (!isNative()) {
    return {
      granted: true,
      status: 'not-required',
      message: 'Browser mode allows selecting documents via file picker when needed.',
    };
  }

  try {
    const result = await Filesystem.requestPermissions();
    const granted = result.publicStorage === 'granted';
    return {
      granted,
      status: granted ? 'granted' : 'denied',
      message: granted
        ? 'File access granted. You can upload PDFs, screenshots, and documents.'
        : 'File access denied. Upload actions may be limited until enabled.',
    };
  } catch {
    return {
      granted: false,
      status: 'error',
      message: 'File access request failed. Try again from device settings.',
    };
  }
}

export async function requestNotificationAccessPermission(): Promise<PermissionResolution> {
  try {
    if (isNative()) {
      const permission = await PushNotifications.requestPermissions();
      const granted = permission.receive === 'granted';
      if (granted) {
        await registerPushNotificationsIfEnabled();
      }
      return {
        granted,
        status: granted ? 'granted' : 'denied',
        message: granted
          ? 'Notification permission granted for reminders and platform updates.'
          : 'Notification permission denied. You can enable it later from settings.',
      };
    }

    if (typeof Notification === 'undefined') {
      return {
        granted: false,
        status: 'not-required',
        message: 'Notification API is unavailable in this browser.',
      };
    }

    const permission = await Notification.requestPermission();
    const granted = permission === 'granted';
    return {
      granted,
      status: granted ? 'granted' : 'denied',
      message: granted
        ? 'Notification permission granted.'
        : 'Notification permission denied. You can still use all core study modules.',
    };
  } catch {
    return {
      granted: false,
      status: 'error',
      message: 'Notification permission request failed. Try again from settings.',
    };
  }
}

export async function hapticTap() {
  if (!isNative()) {
    return;
  }
  await Haptics.impact({ style: ImpactStyle.Light });
}

export async function hapticConfirm() {
  if (!isNative()) {
    return;
  }
  await Haptics.notification({ type: NotificationType.Success });
}

export async function hapticWarning() {
  if (!isNative()) {
    return;
  }
  await Haptics.notification({ type: NotificationType.Warning });
}

export async function hapticError() {
  if (!isNative()) {
    return;
  }
  await Haptics.notification({ type: NotificationType.Error });
}
