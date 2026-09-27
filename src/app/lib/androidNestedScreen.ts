import { useEffect, useRef } from 'react';
import { isNativeAndroidRuntime } from './nativeForeground';

/** Tells the Android header when a feature has a screen to go back to. */
export function useAndroidNestedScreen(source: string, active: boolean, onBack: () => void) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!isNativeAndroidRuntime()) return;
    window.dispatchEvent(new CustomEvent('net360:android-nested', { detail: { source, active } }));
    return () => {
      window.dispatchEvent(new CustomEvent('net360:android-nested', { detail: { source, active: false } }));
    };
  }, [source, active]);

  useEffect(() => {
    if (!isNativeAndroidRuntime()) return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string }>).detail;
      if (detail?.source !== source) return;
      onBackRef.current();
    };
    window.addEventListener('net360:android-back', handler);
    return () => window.removeEventListener('net360:android-back', handler);
  }, [source]);
}
