import { Capacitor } from '@capacitor/core';

type NativeLogLevel = 'info' | 'warn' | 'error';

const ENABLED = String((import.meta as ImportMeta & { env?: { VITE_ANDROID_DEBUG_LOGS?: string; DEV?: boolean } }).env?.VITE_ANDROID_DEBUG_LOGS || '').toLowerCase() === 'true'
  || Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

export function isNativeRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function shouldLogNativeDiagnostics(): boolean {
  return ENABLED && isNativeRuntime();
}

export function logNativeEvent(
  category: string,
  event: string,
  details: Record<string, unknown> = {},
  level: NativeLogLevel = 'info',
): void {
  if (!shouldLogNativeDiagnostics()) return;

  const payload = {
    category,
    event,
    platform: (() => {
      try {
        return Capacitor.getPlatform();
      } catch {
        return 'unknown';
      }
    })(),
    ts: new Date().toISOString(),
    ...details,
  };

  if (level === 'error') {
    console.error('[net360/native]', payload);
    return;
  }
  if (level === 'warn') {
    console.warn('[net360/native]', payload);
    return;
  }
  console.info('[net360/native]', payload);
}

