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

/** @param section Route section id (matches sidebar `SectionId`). */
export function prefetchStudentSection(section: string): void {
  const load = loaders[section];
  if (load) {
    void load().catch(() => undefined);
  }
}
