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
