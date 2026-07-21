/**
 * Same-origin navigation into the exam experience.
 * Production policy: never open about:blank popups / new windows for tests.
 */
export function navigateToExamSameTab(pathWithSearch: string): void {
  const target = new URL(pathWithSearch, window.location.origin).toString();
  window.location.assign(target);
}

/**
 * @deprecated Prefer navigateToExamSameTab — popups are no longer used for student tests.
 */
export function assignExamPopupLocation(examWindow: Window, pathWithSearch: string): void {
  const target = new URL(pathWithSearch, window.location.origin).toString();
  try {
    examWindow.location.replace(target);
  } catch {
    examWindow.location.href = target;
  }
}

/**
 * @deprecated Prefer navigateToExamSameTab — popups are no longer used for student tests.
 */
export function openExamBlankPopup(): Window | null {
  return null;
}
