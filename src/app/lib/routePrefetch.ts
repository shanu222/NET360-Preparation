/**
 * Warm Vite lazy chunks before navigation (hover/focus) to reduce route transition delay.
 */
const loaders: Record<string, () => Promise<unknown>> = {
  home: () => import('../components/Dashboard'),
  guide: () => import('../components/NUSTGuide'),
  programs: () => import('../components/ProgramExplorer'),
  'schools-campuses': () => import('../components/NUSTSchoolsCampuses'),
  'net-types': () => import('../components/NETTypes'),
  'practice-board': () => import('../components/PracticeBoard'),
  'question-contribution': () => import('../components/QuestionContribution'),
  preparation: () => import('../components/Preparation'),
  tests: () => import('../components/Tests'),
  analytics: () => import('../components/Analytics'),
  'merit-calculator': () => import('../components/MeritCalculator'),
  community: () => import('../components/Community'),
  profile: () => import('../components/Profile'),
  subscription: () => import('../components/SubscriptionPage'),
  'physics-mcqs-net': () => import('../components/SeoLandingPage'),
  'math-mcqs-net': () => import('../components/SeoLandingPage'),
  'net-preparation-pakistan': () => import('../components/SeoLandingPage'),
  'nust-entry-test-preparation': () => import('../components/SeoLandingPage'),
};

function isNativeRuntime() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** @param section Route section id (matches sidebar `SectionId`). */
export function prefetchStudentSection(section: string): void {
  if (isNativeRuntime()) return;
  const load = loaders[section];
  if (load) {
    void load().catch(() => undefined);
  }
}

/** Sidebar order (student app) — used to prefetch previous/next likely routes. */
const NEIGHBOR_PREFETCH_ORDER: string[] = [
  'home',
  'guide',
  'programs',
  'schools-campuses',
  'net-types',
  'practice-board',
  'question-contribution',
  'smart-mentor',
  'preparation',
  'tests',
  'analytics',
  'merit-calculator',
  'community',
  'subscription',
  'profile',
];

/** Prefetch adjacent sections after navigation (mobile: next tap is often a neighbor). */
export function prefetchNeighborStudentSections(activeSection: string): void {
  const idx = NEIGHBOR_PREFETCH_ORDER.indexOf(activeSection);
  if (idx === -1) return;
  if (idx > 0) prefetchStudentSection(NEIGHBOR_PREFETCH_ORDER[idx - 1]!);
  if (idx < NEIGHBOR_PREFETCH_ORDER.length - 1) {
    prefetchStudentSection(NEIGHBOR_PREFETCH_ORDER[idx + 1]!);
  }
}

/** Warm dashboard + neighbors on idle — improves perceived “home” speed without blocking paint. */
export function scheduleIdleStudentPrefetch(activeSection: string): void {
  if (isNativeRuntime()) return;
  const run = () => {
    prefetchStudentSection('home');
    prefetchNeighborStudentSections(activeSection);
  };
  if (typeof window === 'undefined') return;
  const ric = window.requestIdleCallback;
  if (typeof ric === 'function') {
    ric(run, { timeout: 2500 });
    return;
  }
  window.setTimeout(run, 400);
}
