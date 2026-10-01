import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { apiRequest } from './api';
import { decideAndroidUpdate, type AndroidUpdateDecision } from './androidReleasePolicy';

export { decideAndroidUpdate };
export type { AndroidUpdateDecision };

type UpdateBridge = {
  requireUpdate?: () => void;
};

export async function runAndroidReleaseGate(): Promise<AndroidUpdateDecision> {
  if (Capacitor.getPlatform() !== 'android') return 'allow';
  let installed = 0;
  let remote: number | null = null;
  let succeeded = false;
  try {
    const info = await App.getInfo();
    installed = Number(info.build);
    const payload = await apiRequest<{ minVersionCode?: number }>('/api/public/android-release', {
      timeoutMs: 4000,
      retryCount: 0,
      cache: 'no-store',
    });
    remote = Number(payload?.minVersionCode);
    succeeded = true;
  } catch {
    succeeded = false;
  }
  const decision = decideAndroidUpdate(installed, remote, succeeded);
  if (decision === 'update') {
    const bridge = (window as Window & { NET360Update?: UpdateBridge }).NET360Update;
    bridge?.requireUpdate?.();
  }
  return decision;
}

let gatePromise: Promise<AndroidUpdateDecision> | null = null;

export function startAndroidReleaseGate(): Promise<AndroidUpdateDecision> {
  if (Capacitor.getPlatform() !== 'android') return Promise.resolve('allow');
  if (!gatePromise) gatePromise = runAndroidReleaseGate();
  return gatePromise;
}
