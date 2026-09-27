import { Capacitor } from '@capacitor/core';

/** Screenshot / recents peek typically hides the WebView for well under 2s. */
const BRIEF_NATIVE_HIDE_MS = 1800;
const TRAILING_FOCUS_MS = 400;

let hiddenAt = 0;
let ignoreUntil = 0;

export function isNativeAndroidRuntime(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

export function markNativeDocumentHidden(): void {
  if (!isNativeAndroidRuntime()) return;
  if (typeof document === 'undefined' || !document.hidden) return;
  hiddenAt = Date.now();
}

/**
 * True when Android just returned from a brief hide (screenshot, notification shade peek).
 * Call only after the document is visible again or window focuses.
 */
export function consumeBriefNativeHide(): boolean {
  if (!isNativeAndroidRuntime()) return false;
  const now = Date.now();
  if (now < ignoreUntil) return true;
  if (!hiddenAt) return false;
  const elapsed = now - hiddenAt;
  hiddenAt = 0;
  if (elapsed > 0 && elapsed < BRIEF_NATIVE_HIDE_MS) {
    ignoreUntil = now + TRAILING_FOCUS_MS;
    return true;
  }
  return false;
}
