/**
 * Navigate a tab opened synchronously (e.g. `about:blank`) to a same-origin exam URL.
 * Uses an absolute URL so navigation from `about:blank` is reliable across browsers.
 */
export function assignExamPopupLocation(examWindow: Window, pathWithSearch: string): void {
  const target = new URL(pathWithSearch, window.location.origin).toString();
  try {
    examWindow.location.replace(target);
  } catch {
    examWindow.location.href = target;
  }
}

/** Desktop exam popup: size to viewport so small screens / Android Chrome are not clipped. */
export function openExamBlankPopup(): Window | null {
  try {
    const sw = typeof window !== 'undefined' && window.screen?.availWidth ? window.screen.availWidth : 1200;
    const sh = typeof window !== 'undefined' && window.screen?.availHeight ? window.screen.availHeight : 800;
    const width = Math.min(1400, Math.max(360, Math.floor(sw * 0.94)));
    const height = Math.min(900, Math.max(480, Math.floor(sh * 0.9)));
    const left = Math.max(0, Math.floor((sw - width) / 2));
    const top = Math.max(0, Math.floor((sh - height) / 8));
    return window.open('about:blank', '_blank', `width=${width},height=${height},left=${left},top=${top}`);
  } catch {
    return window.open('about:blank', '_blank');
  }
}
