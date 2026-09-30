import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  memo,
  useLayoutEffect,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { PageRouteFallback, FullViewportRouteFallback } from './components/PageRouteFallback';
import { GlobalFreeAccessAnnouncement } from './components/GlobalFreeAccessAnnouncement';
import { StudentPresenceHeartbeat } from './components/StudentPresenceHeartbeat';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { isChunkLoadFailure, lazyWithRetry, scheduleStaleChunkReload } from './lib/chunkLoadRecovery';

import { 
  Home, 
  BookOpen, 
  GraduationCap, 
  Building2,
  FlaskConical,
  Pencil,
  Upload,
  Brain,
  FileText,
  TrendingUp,
  Calculator,
  User,
  Menu,
  Bell,
  MessageSquare,
  Users,
  ChevronDown,
  Moon,
  Sun,
  Crown,
  LogOut,
  Video,
  ChevronLeft,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './components/ui/sheet';
import { AppDataProvider } from './context/AppDataContext';
import { useAuth } from './context/AuthContext';
import { preloadCommunityCache } from './lib/communityPreload';
import { prefetchStudentSection, scheduleIdleStudentPrefetch } from './lib/routePrefetch';
import { showNeutralToast } from './lib/userToast';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { brandLogoUrl } from './lib/publicMedia';
import { fetchAndApplyPublicMediaConfig } from './lib/publicMediaRuntime';
import { PremiumCountdownBadge } from './components/subscription/PremiumCountdownBadge';
import { AndroidDemoModeButton } from './components/subscription/DemoModeButton';
import { logNativeEvent } from './lib/nativeDiagnostics';
import { isNativeAndroidRuntime } from './lib/nativeForeground';
import { hideNativeSplashAfterPaint, syncNativeChrome } from './lib/nativeMobile';

const SubscriptionPageLazy = lazyWithRetry(() => import('./components/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const Dashboard = lazyWithRetry(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })));
const NUSTGuide = lazyWithRetry(() => import('./components/NUSTGuide').then((m) => ({ default: m.NUSTGuide })));
const NUSTSchoolsCampuses = lazyWithRetry(() => import('./components/NUSTSchoolsCampuses').then((m) => ({ default: m.NUSTSchoolsCampuses })));
const PracticeBoard = lazyWithRetry(() => import('./components/PracticeBoard').then((m) => ({ default: m.PracticeBoard })));
const QuestionContribution = lazyWithRetry(() => import('./components/QuestionContribution').then((m) => ({ default: m.QuestionContribution })));
const Preparation = lazyWithRetry(() => import('./components/Preparation').then((m) => ({ default: m.Preparation })));
const Videos = lazyWithRetry(() => import('./components/Videos').then((m) => ({ default: m.Videos })));
const Tests = lazyWithRetry(() => import('./components/Tests').then((m) => ({ default: m.Tests })));
const Analytics = lazyWithRetry(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const MeritCalculator = lazyWithRetry(() => import('./components/MeritCalculator').then((m) => ({ default: m.MeritCalculator })));
const Profile = lazyWithRetry(() => import('./components/Profile').then((m) => ({ default: m.Profile })));
const Community = lazyWithRetry(() => import('./components/Community').then((m) => ({ default: m.Community })));
const ProgramExplorer = lazyWithRetry(() => import('./components/ProgramExplorer').then((m) => ({ default: m.ProgramExplorer })));
const NETTypes = lazyWithRetry(() => import('./components/NETTypes').then((m) => ({ default: m.NETTypes })));
const SeoLandingPage = lazyWithRetry(() => import('./components/SeoLandingPage').then((m) => ({ default: m.SeoLandingPage })));
const PrivacyPolicyPage = lazyWithRetry(() => import('./components/LegalPages').then((m) => ({ default: m.PrivacyPolicyPage })));
const TermsPage = lazyWithRetry(() => import('./components/LegalPages').then((m) => ({ default: m.TermsPage })));
const DeleteAccountHelpPage = lazyWithRetry(() =>
  import('./components/LegalPages').then((m) => ({ default: m.DeleteAccountHelpPage })),
);
const ConfirmAccountDeletionPageLazy = lazyWithRetry(() =>
  import('./components/ConfirmAccountDeletionPage').then((m) => ({ default: m.ConfirmAccountDeletionPage })),
);
const VerifyEmailPageLazy = lazyWithRetry(() =>
  import('./components/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const SupportChatWidgetLazy = lazyWithRetry(() =>
  import('./components/SupportChatWidget').then((m) => ({ default: m.SupportChatWidget })),
);

function SessionReady({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  const hasBeenReadyRef = useRef(false);
  if (!loading) {
    hasBeenReadyRef.current = true;
  }
  useEffect(() => {
    if (!loading) void hideNativeSplashAfterPaint();
  }, [loading]);
  // After the first successful session, never replace the student tree with a
  // skeleton. Resume/focus restores must stay silent so Profile is not remounted.
  if (loading && !hasBeenReadyRef.current) {
    return <FullViewportRouteFallback />;
  }
  return <>{children}</>;
}

/** Defer support chat chunk until idle so initial route + vendors load first (mobile / slow networks). */
function DeferredSupportChat() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) setReady(true);
    };
    if (typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(start, { timeout: 2000 });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }
    const timeoutId = window.setTimeout(start, 900);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <SupportChatWidgetLazy />
    </Suspense>
  );
}

const THEME_STORAGE_KEY = 'net360-theme-mode';

type ThemeMode = 'light' | 'dark';

function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return 'dark';
}

type SectionId =
  | 'home'
  | 'guide'
  | 'programs'
  | 'schools-campuses'
  | 'net-types'
  | 'practice-board'
  | 'question-contribution'
  | 'smart-mentor'
  | 'preparation'
  | 'videos'
  | 'tests'
  | 'analytics'
  | 'merit-calculator'
  | 'community'
  | 'profile'
  | 'subscription'
  | 'privacy-policy'
  | 'terms'
  | 'delete-account'
  | 'physics-mcqs-net'
  | 'math-mcqs-net'
  | 'net-preparation-pakistan'
  | 'nust-entry-test-preparation';

const PATH_BY_SECTION: Record<SectionId, string> = {
  home: '/',
  guide: '/guide',
  programs: '/programs',
  'schools-campuses': '/schools-campuses',
  'net-types': '/net-types',
  'practice-board': '/practice-board',
  'question-contribution': '/question-contribution',
  'smart-mentor': '/smart-mentor',
  preparation: '/preparation',
  videos: '/videos',
  tests: '/tests',
  analytics: '/analytics',
  'merit-calculator': '/merit-calculator',
  community: '/community',
  profile: '/profile',
  subscription: '/subscription',
  'privacy-policy': '/privacy-policy',
  terms: '/terms',
  'delete-account': '/delete-account',
  'physics-mcqs-net': '/physics-mcqs-net',
  'math-mcqs-net': '/math-mcqs-net',
  'net-preparation-pakistan': '/net-preparation-pakistan',
  'nust-entry-test-preparation': '/nust-entry-test-preparation',
};

const ANDROID_LAST_ROUTE_KEY = 'net360-android-last-route';

function isStandaloneAuthPath(pathname: string) {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  return normalized === '/confirm-account-deletion' || normalized === '/verify-email';
}

function isRestorableAndroidRoute(route: string) {
  try {
    const parsed = new URL(route, 'https://net360preparation.com');
    if (isStandaloneAuthPath(parsed.pathname)) return false;
    if (resolveSectionFromPath(parsed.pathname)) return true;
    return /^\/(test|exam|community|guide|analytics|practice-board)/.test(parsed.pathname);
  } catch {
    return false;
  }
}

const ANDROID_PRIMARY_NAV: Array<{ id: SectionId; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'tests', label: 'Tests', icon: FileText },
  { id: 'preparation', label: 'Preparation', icon: BookOpen },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'profile', label: 'Profile', icon: User },
];

const ANDROID_FOOTER_IDS = new Set(ANDROID_PRIMARY_NAV.map((item) => item.id));

const STUDENT_NAVIGATION_ITEMS: Array<{ id: SectionId; label: string; icon: typeof Home }> = [
  { id: 'home', label: 'Dashboard', icon: Home },
  { id: 'guide', label: 'NUST Guide', icon: BookOpen },
  { id: 'programs', label: 'Programs', icon: GraduationCap },
  { id: 'schools-campuses', label: 'NUST Schools & Campuses', icon: Building2 },
  { id: 'net-types', label: 'NET Types', icon: FlaskConical },
  { id: 'practice-board', label: 'Practice Board', icon: Pencil },
  { id: 'question-contribution', label: 'Question Contribution', icon: Upload },
  { id: 'smart-mentor', label: 'Smart Study Mentor', icon: Brain },
  { id: 'preparation', label: 'Preparation Materials', icon: BookOpen },
  { id: 'videos', label: 'Videos', icon: Video },
  { id: 'tests', label: 'Tests', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'merit-calculator', label: 'Merit Calculator', icon: Calculator },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: Crown },
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'delete-account', label: 'How To Delete Your Account', icon: FileText },
];

const SidebarNavigation = memo(function SidebarNavigation({
  navigationItems,
  activeTab,
  smartMentorTabId,
  navigate,
  setSidebarMenuOpen,
  onSmartMentorClick,
  androidApp = false,
}: {
  navigationItems: Array<{ id: SectionId; label: string; icon: typeof Home }>;
  activeTab: SectionId;
  smartMentorTabId: SectionId;
  navigate: (to: string) => void;
  setSidebarMenuOpen: (open: boolean) => void;
  onSmartMentorClick: () => void;
  androidApp?: boolean;
}) {
  const { token } = useAuth();

  return (
    <nav className="space-y-1.5" aria-label="Student portal sections">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.id === smartMentorTabId ? `${item.label}, coming soon` : `Go to ${item.label}`}
            aria-current={activeTab === item.id && item.id !== smartMentorTabId ? 'page' : undefined}
            onPointerEnter={() => {
              if (item.id !== smartMentorTabId) prefetchStudentSection(item.id);
            }}
            onFocus={() => {
              if (item.id !== smartMentorTabId) prefetchStudentSection(item.id);
            }}
            onClick={() => {
              if (item.id === smartMentorTabId) {
                onSmartMentorClick();
                return;
              }
              if (item.id === 'community') {
                preloadCommunityCache(token);
              }
              navigate(PATH_BY_SECTION[item.id]);
              setSidebarMenuOpen(false);
            }}
            aria-disabled={item.id === smartMentorTabId}
            className={`net360-drawer-item w-full grid grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
              androidApp
                ? item.id === smartMentorTabId
                  ? 'cursor-not-allowed opacity-60 text-slate-400'
                  : activeTab === item.id
                    ? 'is-current bg-[#e7e9ff] text-[#312e81] dark:bg-[#312e81] dark:text-white'
                    : 'text-slate-800 active:bg-slate-100 dark:text-slate-100 dark:active:bg-white/10'
                : item.id === smartMentorTabId
                  ? 'cursor-not-allowed opacity-70 text-indigo-100/85 hover:bg-white/8 dark:text-slate-400 dark:hover:bg-slate-100/5'
                  : activeTab === item.id
                    ? 'bg-white/22 text-white shadow-[0_8px_20px_rgba(26,24,89,0.38)] dark:bg-slate-100/12 dark:text-slate-50 dark:shadow-[0_10px_22px_rgba(2,6,23,0.55)]'
                    : 'text-indigo-100 hover:bg-white/12 dark:text-slate-200 dark:hover:bg-slate-100/8'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="min-w-0 text-sm font-medium leading-5 break-words">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
});

function resolveSectionFromPath(pathname: string): SectionId | null {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const aliasMap: Record<string, SectionId> = {
    '/preparation-material': 'preparation',
    '/mock-test': 'tests',
  };
  if (aliasMap[normalized]) return aliasMap[normalized];
  const entry = (Object.entries(PATH_BY_SECTION) as Array<[SectionId, string]>).find(([, path]) => path === normalized);
  return entry?.[0] || null;
}

function resolveSectionFromLocation(pathname: string, hash: string): SectionId {
  const fromPath = resolveSectionFromPath(pathname);
  if (fromPath) return fromPath;

  const hashPath = String(hash || '')
    .replace(/^#/, '')
    .split('?')[0]
    .split('&')[0]
    .trim();
  if (hashPath.startsWith('/')) {
    const fromHashPath = resolveSectionFromPath(hashPath);
    if (fromHashPath) return fromHashPath;
  }

  return 'home';
}

class SectionErrorBoundary extends Component<{ children: ReactNode; sectionName: string; resetKey: string }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; sectionName: string }) {
    super(props);
    this.state = { hasError: false };
  }

  componentDidUpdate(prevProps: { resetKey: string }) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(`Section render failed (${this.props.sectionName}):`, error, errorInfo);
    }
    if (isChunkLoadFailure(error)) {
      scheduleStaleChunkReload(`SectionErrorBoundary:${this.props.sectionName}`);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load {this.props.sectionName}. Please go back and try again.
        </div>
      );
    }

    return this.props.children;
  }
}

function HeaderAuthControl({ onOpenProfile }: { onOpenProfile: () => void }) {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuContentRef = useRef<HTMLDivElement | null>(null);

  const recomputeMenuPosition = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    recomputeMenuPosition();
  }, [menuOpen, recomputeMenuPosition]);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuContentRef.current?.contains(target)) return;
      setMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    const handleViewportChange = () => setMenuOpen(false);

    window.addEventListener('mousedown', handlePointerDown, { passive: true });
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', handleViewportChange, { passive: true });
    window.addEventListener('orientationchange', handleViewportChange, { passive: true });
    window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('orientationchange', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, { capture: true });
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!user) {
      setMenuOpen(false);
    }
  }, [user]);

  const displayName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || 'User';

  if (!user) {
    return (
      <button
        type="button"
        onClick={onOpenProfile}
        aria-label="Login or sign up"
        className="touch-manipulation inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-indigo-200 bg-indigo-50 text-indigo-700 transition hover:bg-indigo-100 active:scale-95 sm:ml-1 sm:h-auto sm:w-auto sm:gap-2 sm:rounded-xl sm:border-0 sm:bg-transparent sm:px-2 sm:py-1.5 sm:text-slate-700 sm:hover:bg-indigo-50"
      >
        <User className="h-4 w-4 sm:hidden" />
        <div className="hidden h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 sm:block" />
        <span className="hidden text-sm sm:inline">Login / Sign Up</span>
        <ChevronDown className="hidden w-4 h-4 sm:inline" />
      </button>
    );
  }

  return (
    <div className="relative ml-1">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setMenuOpen((current) => !current)}
        className="touch-manipulation inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-slate-700 transition hover:bg-indigo-50 dark:text-slate-100 dark:hover:bg-white/10 sm:min-h-9 sm:py-1.5"
        aria-label={`Account menu, signed in as ${displayName}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-300 to-cyan-500" />
        <span className="hidden max-w-[210px] truncate text-sm sm:inline">Logged in as {displayName}</span>
        <ChevronDown className={`hidden h-4 w-4 transition-transform sm:inline ${menuOpen ? 'rotate-180' : ''}`} />
      </button>

      {menuOpen && menuPos
        ? createPortal(
            <div
              ref={menuContentRef}
              className="fixed z-[1000] min-w-[190px] max-w-[calc(100vw-16px)] rounded-xl border border-indigo-100 bg-white p-1.5 text-slate-800 shadow-[0_16px_30px_rgba(15,23,42,0.22)] dark:border-white/15 dark:bg-slate-900 dark:text-slate-100"
              style={{ top: menuPos.top, right: menuPos.right }}
              role="menu"
            >
              <div className="truncate px-3 py-2 text-xs font-medium text-slate-400 dark:text-slate-500 sm:hidden">
                Signed in as {displayName}
              </div>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-700 transition hover:bg-indigo-50 dark:text-slate-100 dark:hover:bg-white/10"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenProfile();
                }}
              >
                <User className="h-4 w-4 shrink-0" />
                Profile
              </button>
              <button
                type="button"
                className="flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50/90 dark:text-rose-300 dark:hover:bg-rose-500/15"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  logout();
                }}
              >
                <LogOut className="h-4 w-4 shrink-0" />
                Logout
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export default function App() {
  const smartMentorTabId = 'smart-mentor';
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialThemeMode);
  /** Bumps when `/api/public/media-config` is applied so media URLs re-resolve. */
  const [, setPublicMediaEpoch] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const [, startRouteTransition] = useTransition();
  const { user, token, loading: authLoading } = useAuth();
  const [androidApp, setAndroidApp] = useState(() => isNativeAndroidRuntime());
  const [androidNestedSources, setAndroidNestedSources] = useState<Record<string, boolean>>({});
  const activeTab = useMemo(() => resolveSectionFromLocation(location.pathname, location.hash), [location.hash, location.pathname]);
  const androidNested = Boolean(androidNestedSources[activeTab]);

  useEffect(() => {
    const onNested = (event: Event) => {
      const detail = (event as CustomEvent<{ source?: string; active?: boolean }>).detail;
      if (!detail?.source) return;
      const source = detail.source;
      const active = Boolean(detail.active);
      setAndroidNestedSources((prev) => (Boolean(prev[source]) === active ? prev : { ...prev, [source]: active }));
    };
    window.addEventListener('net360:android-nested', onNested);
    return () => window.removeEventListener('net360:android-nested', onNested);
  }, []);
  const [profileVisited, setProfileVisited] = useState(
    () => resolveSectionFromLocation(
      typeof window !== 'undefined' ? window.location.pathname : '/',
      typeof window !== 'undefined' ? window.location.hash : '',
    ) === 'profile',
  );
  const isConfirmAccountDeletionRoute = useMemo(() => {
    const normalized = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
    return normalized === '/confirm-account-deletion';
  }, [location.pathname]);
  const isVerifyEmailRoute = useMemo(() => {
    const normalized = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
    return normalized === '/verify-email';
  }, [location.pathname]);
  const isStandaloneAuthRoute = isConfirmAccountDeletionRoute || isVerifyEmailRoute;
  const androidRouteRestoredRef = useRef(false);
  const lastAndroidBackAtRef = useRef(0);

  /** Native: unauthenticated users always land on Login (Profile), never Dashboard first. */
  useEffect(() => {
    if (authLoading || isStandaloneAuthRoute) return;
    const isNativeRuntime = Boolean(
      (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
    );
    if (!isNativeRuntime) return;
    if (!user && activeTab === 'home') {
      navigate(PATH_BY_SECTION.profile, { replace: true });
    }
  }, [authLoading, user, activeTab, navigate, isStandaloneAuthRoute]);

  useEffect(() => {
    if (!isNativeAndroidRuntime() || isStandaloneAuthRoute || !user) return;
    const route = `${location.pathname}${location.search || ''}${location.hash || ''}`;
    if (!isRestorableAndroidRoute(route)) return;
    try {
      window.localStorage.setItem(ANDROID_LAST_ROUTE_KEY, route);
    } catch {
      /* ignore quota / private mode */
    }
  }, [isStandaloneAuthRoute, location.hash, location.pathname, location.search, user]);

  useEffect(() => {
    if (authLoading || isStandaloneAuthRoute || !user) return;
    if (!isNativeAndroidRuntime() || androidRouteRestoredRef.current) return;
    androidRouteRestoredRef.current = true;
    if (location.pathname !== '/' && location.pathname !== '') return;
    let last = '';
    try {
      last = String(window.localStorage.getItem(ANDROID_LAST_ROUTE_KEY) || '').trim();
    } catch {
      return;
    }
    if (!last || last === '/' || !isRestorableAndroidRoute(last)) return;
    navigate(last, { replace: true });
  }, [authLoading, isStandaloneAuthRoute, location.pathname, navigate, user]);

  useEffect(() => {
    if (activeTab === 'profile') {
      setProfileVisited(true);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isNativeAndroidRuntime()) setAndroidApp(true);
  }, []);

  const navigateWithTransition = useCallback(
    (to: string) => {
      startRouteTransition(() => {
        navigate(to);
      });
    },
    [navigate, startRouteTransition],
  );

  useEffect(() => {
    const root = document.documentElement;
    const isDark = themeMode === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#0c1222' : '#f3f5fb');
    void syncNativeChrome(themeMode);
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await fetchAndApplyPublicMediaConfig();
      if (!cancelled) setPublicMediaEpoch((n) => n + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') as SectionId | null;
    if (!tab || !(tab in PATH_BY_SECTION)) return;
    navigate(PATH_BY_SECTION[tab], { replace: true });
  }, [navigate]);

  useEffect(() => {
    scheduleIdleStudentPrefetch(activeTab);
  }, [activeTab]);

  useEffect(() => {
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    if (!isNativeRuntime) return;

    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (sidebarMenuOpen) {
        setSidebarMenuOpen(false);
        return;
      }
      const runtime = window as Window & { __net360SupportChatOpen?: boolean };
      if (runtime.__net360SupportChatOpen) {
        window.dispatchEvent(new CustomEvent('net360:close-support-chat'));
        return;
      }
      if (androidNestedSources[activeTab]) {
        window.dispatchEvent(new CustomEvent('net360:android-back', { detail: { source: activeTab } }));
        return;
      }
      if (activeTab !== 'home') {
        navigate(PATH_BY_SECTION.home);
        return;
      }
      const now = Date.now();
      if (now - lastAndroidBackAtRef.current < 2000) {
        void CapacitorApp.exitApp();
        return;
      }
      lastAndroidBackAtRef.current = now;
      showNeutralToast('Press back again to leave NET360.');
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [activeTab, androidNestedSources, navigate, sidebarMenuOpen]);

  useEffect(() => {
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    if (!isNativeRuntime) return;

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const incoming = String(url || '').trim();
      if (!incoming) return;
      logNativeEvent('runtime', 'deep-link-open', { url: incoming });
      try {
        const parsed = new URL(incoming);
        const path = parsed.pathname || '/';
        const target = `${path}${parsed.search || ''}${parsed.hash || ''}`;
        navigateWithTransition(target);
      } catch {
        // Ignore malformed deep-link payloads.
        logNativeEvent('runtime', 'deep-link-malformed', { url: incoming }, 'warn');
      }
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [navigateWithTransition]);

  useEffect(() => {
    if (!document.documentElement.classList.contains('native-android')) return;
    const header = document.querySelector<HTMLElement>('.net360-header');
    if (!header) return;

    const applyHeaderHeight = () => {
      const height = Math.max(0, Math.round(header.getBoundingClientRect().height));
      document.documentElement.style.setProperty('--net360-header-height', `${height}px`);
    };

    applyHeaderHeight();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(applyHeaderHeight) : null;
    observer?.observe(header);
    window.addEventListener('orientationchange', applyHeaderHeight, { passive: true });
    window.addEventListener('resize', applyHeaderHeight, { passive: true });

    return () => {
      observer?.disconnect();
      window.removeEventListener('orientationchange', applyHeaderHeight);
      window.removeEventListener('resize', applyHeaderHeight);
    };
  }, [activeTab]);

  useEffect(() => {
    const pressableSelector = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [data-slot="tabs-trigger"], [data-slot="switch"], summary, label[for]';
    let clearTimer = 0;
    let pressedAt = 0;

    const removePressed = () => {
      document.querySelectorAll('.net360-pressed').forEach((element) => {
        element.classList.remove('net360-pressed');
      });
    };

    const clearPressed = () => {
      window.clearTimeout(clearTimer);
      const wait = Math.max(0, 140 - (Date.now() - pressedAt));
      clearTimer = window.setTimeout(removePressed, wait);
    };

    const onPressStart = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(pressableSelector);
      if (!(control instanceof HTMLElement)) return;
      if (control.matches(':disabled') || control.getAttribute('aria-disabled') === 'true') return;
      window.clearTimeout(clearTimer);
      removePressed();
      pressedAt = Date.now();
      control.classList.add('net360-pressed');
    };

    document.addEventListener('pointerdown', onPressStart, true);
    document.addEventListener('touchstart', onPressStart, true);
    document.addEventListener('pointerup', clearPressed, true);
    document.addEventListener('pointercancel', clearPressed, true);
    document.addEventListener('touchend', clearPressed, true);
    document.addEventListener('touchcancel', clearPressed, true);
    return () => {
      clearPressed();
      document.removeEventListener('pointerdown', onPressStart, true);
      document.removeEventListener('touchstart', onPressStart, true);
      document.removeEventListener('pointerup', clearPressed, true);
      document.removeEventListener('pointercancel', clearPressed, true);
      document.removeEventListener('touchend', clearPressed, true);
      document.removeEventListener('touchcancel', clearPressed, true);
    };
  }, []);

  useEffect(() => {
    const updateRowScrollState = (row: HTMLElement) => {
      const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
      const canScroll = maxScrollLeft > 1;
      const current = Math.max(0, Math.min(row.scrollLeft, maxScrollLeft));
      row.dataset.scrollable = canScroll ? 'true' : 'false';
      row.dataset.scrollLeftActive = canScroll && current > 2 ? 'true' : 'false';
      row.dataset.scrollRightActive = canScroll && current < maxScrollLeft - 2 ? 'true' : 'false';
    };

    const syncRowLayout = () => {
      document.querySelectorAll<HTMLElement>('.net360-swipe-row').forEach((row) => {
        const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
        if (row.scrollLeft > maxScrollLeft) row.scrollLeft = maxScrollLeft;
        updateRowScrollState(row);
      });
    };

    const rowFromTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const found = target.closest('.net360-swipe-row');
      return found instanceof HTMLElement ? found : null;
    };

    let row: HTMLElement | null = null;
    let pointerActive = false;
    let touchActive = false;
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let lastX = 0;
    let lastTime = 0;
    let velocity = 0;
    let suppressClickUntil = 0;
    let flingFrame = 0;
    let dragResetTimer = 0;

    const maxScrollLeft = () => (row ? Math.max(0, row.scrollWidth - row.clientWidth) : 0);

    const stopFling = () => {
      if (!flingFrame) return;
      window.cancelAnimationFrame(flingFrame);
      flingFrame = 0;
    };

    const releasePressed = () => {
      document.querySelectorAll('.net360-pressed').forEach((element) => {
        element.classList.remove('net360-pressed');
      });
    };

    const finishDrag = () => {
      if (row) {
        row.dataset.dragging = 'false';
        row.style.scrollBehavior = '';
        updateRowScrollState(row);
      }
    };

    const markDrag = () => {
      if (!row || isDragging) return;
      isDragging = true;
      row.dataset.dragging = 'true';
      row.style.scrollBehavior = 'auto';
      suppressClickUntil = Date.now() + 500;
      releasePressed();
    };

    const startFling = () => {
      const activeRow = row;
      if (!activeRow) return;
      stopFling();
      let speed = Math.max(-48, Math.min(48, velocity));
      const step = () => {
        const max = Math.max(0, activeRow.scrollWidth - activeRow.clientWidth);
        const next = activeRow.scrollLeft + speed;
        const clamped = Math.max(0, Math.min(max, next));
        activeRow.scrollLeft = clamped;
        updateRowScrollState(activeRow);
        speed *= 0.92;
        if (clamped !== next || Math.abs(speed) < 0.12) {
          flingFrame = 0;
          activeRow.dataset.dragging = 'false';
          activeRow.style.scrollBehavior = '';
          updateRowScrollState(activeRow);
          return;
        }
        flingFrame = window.requestAnimationFrame(step);
      };
      flingFrame = window.requestAnimationFrame(step);
    };

    const endGesture = () => {
      if (!pointerActive && !touchActive) return;
      const wasDragging = isDragging;
      const releaseSpeed = velocity;
      pointerActive = false;
      touchActive = false;
      document.removeEventListener('touchmove', onTouchMove);
      if (wasDragging) suppressClickUntil = Date.now() + 500;
      window.clearTimeout(dragResetTimer);
      dragResetTimer = window.setTimeout(() => {
        isDragging = false;
      }, 420);
      if (wasDragging && Math.abs(releaseSpeed) > 0.4) {
        velocity = releaseSpeed;
        startFling();
        return;
      }
      finishDrag();
    };

    const trackVelocity = (clientX: number) => {
      const now = performance.now();
      const elapsed = Math.max(8, now - lastTime);
      const instant = ((lastX - clientX) / elapsed) * 16;
      velocity = Math.max(-56, Math.min(56, velocity * 0.6 + instant * 0.4));
      lastX = clientX;
      lastTime = now;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const found = rowFromTarget(event.target);
      if (!found) return;
      if (event.target instanceof Element && event.target.closest('button, a, input, textarea, select, [role="button"], [data-no-drag-scroll]')) return;
      stopFling();
      row = found;
      if (maxScrollLeft() <= 1) return;
      pointerActive = true;
      isDragging = false;
      velocity = 0;
      startX = event.clientX;
      lastX = event.clientX;
      lastTime = performance.now();
      startScrollLeft = found.scrollLeft;
      found.dataset.dragging = 'false';
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerActive || !row) return;
      const deltaX = event.clientX - startX;
      if (!isDragging && Math.abs(deltaX) > 3) markDrag();
      if (!isDragging) return;
      trackVelocity(event.clientX);
      const max = maxScrollLeft();
      row.scrollLeft = Math.max(0, Math.min(max, startScrollLeft - deltaX));
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const found = rowFromTarget(event.target);
      if (!found) return;
      stopFling();
      row = found;
      if (maxScrollLeft() <= 1) {
        row = null;
        return;
      }
      const touch = event.touches[0];
      touchActive = true;
      isDragging = false;
      velocity = 0;
      startX = touch.clientX;
      startY = touch.clientY;
      lastX = touch.clientX;
      lastTime = performance.now();
      startScrollLeft = found.scrollLeft;
      found.style.scrollBehavior = 'auto';
      found.dataset.dragging = 'false';
      document.addEventListener('touchmove', onTouchMove, { passive: false });
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!touchActive || !row || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;
      if (!isDragging) {
        if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
        if (Math.abs(deltaY) > Math.abs(deltaX) + 6) {
          touchActive = false;
          row.style.scrollBehavior = '';
          document.removeEventListener('touchmove', onTouchMove);
          return;
        }
        markDrag();
      }
      trackVelocity(touch.clientX);
      const max = maxScrollLeft();
      row.scrollLeft = Math.max(0, Math.min(max, startScrollLeft - deltaX));
      if (event.cancelable) event.preventDefault();
    };

    const onClickCapture = (event: MouseEvent) => {
      if (!isDragging && Date.now() > suppressClickUntil) return;
      if (!rowFromTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.classList.contains('net360-swipe-row')) return;
      if (isDragging || flingFrame) return;
      updateRowScrollState(target);
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', endGesture, true);
    document.addEventListener('pointercancel', endGesture, true);
    document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', endGesture, true);
    document.addEventListener('touchcancel', endGesture, true);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('scroll', onScroll, true);

    const onResize = () => syncRowLayout();
    const onOrientationChange = () => {
      syncRowLayout();
      window.setTimeout(syncRowLayout, 120);
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onOrientationChange, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize);

    syncRowLayout();

    const layoutTimers = [window.setTimeout(syncRowLayout, 80), window.setTimeout(syncRowLayout, 400)];

    return () => {
      stopFling();
      layoutTimers.forEach((timer) => window.clearTimeout(timer));
      window.clearTimeout(dragResetTimer);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', endGesture, true);
      document.removeEventListener('pointercancel', endGesture, true);
      document.removeEventListener('touchstart', onTouchStart, true);
      document.removeEventListener('touchend', endGesture, true);
      document.removeEventListener('touchcancel', endGesture, true);
      document.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [activeTab]);

  const onNavigateSection = useCallback(
    (section: string) => {
      startRouteTransition(() => {
        navigate(PATH_BY_SECTION[(section as SectionId) || 'home']);
      });
    },
    [navigate, startRouteTransition],
  );

  const activeNavigationItem = STUDENT_NAVIGATION_ITEMS.find((item) => item.id === activeTab);
  const seoTitle = (() => {
    if (activeTab === 'physics-mcqs-net') return 'Physics MCQs NET';
    if (activeTab === 'math-mcqs-net') return 'Math MCQs NET';
    if (activeTab === 'net-preparation-pakistan') return 'NET Preparation Pakistan';
    if (activeTab === 'nust-entry-test-preparation') return 'NUST Entry Test Preparation';
    return null;
  })();
  const activeTitle = activeNavigationItem?.label || seoTitle || 'Dashboard';

  const handleSmartMentorComingSoon = () => {
    showNeutralToast('Coming soon.');
  };

  const mainSection = useMemo(() => {
    switch (activeTab) {
      case 'home':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Dashboard onNavigate={onNavigateSection} />
          </div>
        );
      case 'physics-mcqs-net':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SeoLandingPage page="physics-mcqs-net" />
          </div>
        );
      case 'math-mcqs-net':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SeoLandingPage page="math-mcqs-net" />
          </div>
        );
      case 'net-preparation-pakistan':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SeoLandingPage page="net-preparation-pakistan" />
          </div>
        );
      case 'nust-entry-test-preparation':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SeoLandingPage page="nust-entry-test-preparation" />
          </div>
        );
      case 'guide':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <NUSTGuide />
          </div>
        );
      case 'programs':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SectionErrorBoundary sectionName="Programs" resetKey={activeTab}>
              <ProgramExplorer />
            </SectionErrorBoundary>
          </div>
        );
      case 'schools-campuses':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <NUSTSchoolsCampuses />
          </div>
        );
      case 'net-types':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SectionErrorBoundary sectionName="NET Types" resetKey={activeTab}>
              <NETTypes />
            </SectionErrorBoundary>
          </div>
        );
      case 'practice-board':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <PracticeBoard />
          </div>
        );
      case 'question-contribution':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <QuestionContribution />
          </div>
        );
      case 'smart-mentor':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-8 text-center shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
              <p className="text-xl font-semibold text-indigo-950">Coming Soon for Smart Study Mentor</p>
              <p className="mt-2 text-sm text-slate-600">This feature is currently unavailable.</p>
            </div>
          </div>
        );
      case 'preparation':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Preparation />
          </div>
        );
      case 'videos':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Videos />
          </div>
        );
      case 'tests':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Tests onNavigate={onNavigateSection} />
          </div>
        );
      case 'analytics':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Analytics />
          </div>
        );
      case 'merit-calculator':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <MeritCalculator />
          </div>
        );
      case 'profile':
        return null;
      case 'subscription':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SubscriptionPageLazy />
          </div>
        );
      case 'privacy-policy':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <PrivacyPolicyPage />
          </div>
        );
      case 'terms':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <TermsPage />
          </div>
        );
      case 'delete-account':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <DeleteAccountHelpPage />
          </div>
        );
      case 'community':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Community />
          </div>
        );
      default:
        return null;
    }
  }, [activeTab, onNavigateSection]);

  const shareImageUrl = useMemo(() => {
    if (typeof window === 'undefined') return 'https://net360preparation.com/net360-logo.png';
    return `${window.location.origin}/net360-logo.png`;
  }, []);

  const canonicalUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://net360preparation.com';
    const path = location.pathname && location.pathname.startsWith('/') ? location.pathname : '/';
    return `${origin}${path}`;
  }, [location.pathname]);

  const pageTitleFull = `${activeTitle} | NUST Entry Test Preparation`;
  const pageDescription =
    'Practice MCQs and prepare for NUST entry test with high-quality questions, mock tests, analytics, and community features.';

  // AuthProvider lives in main.tsx StudentAuthLayout so exam ↔ app navigations
  // keep the session warm (no SessionReady flash / remount delay).
  return (
      <SessionReady>
      {isConfirmAccountDeletionRoute || isVerifyEmailRoute ? (
        <>
          <Helmet>
            <link rel="canonical" href={canonicalUrl} />
            <title>
              {isVerifyEmailRoute
                ? 'Verify email | NET360 Preparation'
                : 'Confirm account deletion | NET360 Preparation'}
            </title>
            <meta name="robots" content="noindex, nofollow" />
          </Helmet>
          <div className="net360-viewport flex min-h-dvh min-h-screen flex-col bg-[#f1f5f9] p-3 text-[#0f172a]" style={{ colorScheme: 'light' }}>
            <Suspense fallback={<PageRouteFallback />}>
              {isVerifyEmailRoute ? <VerifyEmailPageLazy /> : <ConfirmAccountDeletionPageLazy />}
            </Suspense>
          </div>
        </>
      ) : (
      <SubscriptionProvider>
      <AppDataProvider>
      <Helmet>
        <link rel="canonical" href={canonicalUrl} />
        <title>{pageTitleFull}</title>
        <meta name="description" content={pageDescription} />
        <meta name="keywords" content="NUST, NET, MCQs, Entry Test, Physics MCQs, Math MCQs, Pakistan, NET360" />
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
        <meta property="og:title" content={pageTitleFull} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:site_name" content="NET360 Preparation" />
        <meta property="og:locale" content="en_PK" />
        <meta property="og:image" content={shareImageUrl} />
        <meta property="og:image:alt" content="NET360 Preparation" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitleFull} />
        <meta name="twitter:description" content={pageDescription} />
        <meta name="twitter:image" content={shareImageUrl} />
      </Helmet>
      <div className={`net360-viewport flex min-h-dvh min-h-screen min-w-0 max-w-full flex-1 flex-col overflow-x-clip p-0${androidApp ? ' net360-has-tabbar' : ''}`}>
        <div className="net360-shell mx-auto flex w-full min-w-0 max-w-[min(100%,1600px)] flex-1 flex-col">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden">
            {/* Header */}
            <header className="net360-header sticky top-0 z-40 flex min-h-[4.5rem] items-center gap-2 border-b border-indigo-100/80 bg-[#f7f8ff] px-3 py-2 dark:border-slate-700/80 dark:bg-[#12182e] sm:min-h-[4.75rem] sm:gap-3 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-3">
                {androidApp && androidNested ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="touch-manipulation shrink-0 rounded-xl min-h-11 min-w-11"
                    aria-label="Go back"
                    onClick={() => window.dispatchEvent(new CustomEvent('net360:android-back', { detail: { source: activeTab } }))}
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                ) : null}
                <Sheet open={sidebarMenuOpen} onOpenChange={setSidebarMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className={`touch-manipulation shrink-0 rounded-xl min-h-11 min-w-11${androidApp && androidNested ? ' net360-android-chrome-hide' : ''}`} aria-label="Open navigation menu">
                      <Menu className="h-5 w-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    aria-label="Main navigation"
                    className={androidApp
                      ? 'net360-drawer h-dvh w-[min(88vw,320px)] max-w-[88vw] overflow-hidden border-0 bg-[#f7f8fb] p-0 text-slate-900 shadow-2xl dark:bg-[#12182b] dark:text-slate-100'
                      : 'h-dvh w-[290px] max-w-[88vw] overflow-hidden border-white/20 bg-gradient-to-b from-[#5f4ee6] via-[#5b40d7] to-[#5e3ae0] p-0 dark:border-slate-700/70 dark:bg-gradient-to-b dark:from-[#111827] dark:via-[#1e1b4b] dark:to-[#0f172a]'}
                  >
                    <SheetTitle className="sr-only">Main navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                      Browse NET360 sections and open pages from the menu.
                    </SheetDescription>
                    <div className="flex h-full min-h-0 flex-col">
                    <div className={androidApp ? 'shrink-0 border-b border-[#e6eaf2] px-5 pb-4 pt-6 dark:border-white/10' : 'shrink-0 border-b border-white/20 p-5 dark:border-slate-600/50'}>
                      <div className="flex items-center gap-2">
                        <div className={androidApp ? 'flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-sm dark:bg-[#1a2238]' : 'flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/25 bg-transparent shadow-sm dark:border-slate-500/55 dark:bg-slate-900/35'}>
                          <img
                            src={brandLogoUrl()}
                            alt="NET360 logo"
                            className="h-full w-full scale-[1.3] object-contain"
                            width={36}
                            height={36}
                            decoding="async"
                            loading="lazy"
                          />
                        </div>
                        <div>
                          <p className={androidApp ? 'text-lg font-semibold text-slate-900 dark:text-slate-100' : 'text-lg font-semibold text-white dark:text-slate-100'}>NET360</p>
                          <p className={androidApp ? 'text-xs text-slate-500 dark:text-slate-400' : 'text-xs text-indigo-100 dark:text-slate-300'}>Your Smart NET Preparation</p>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8 [scrollbar-gutter:stable]">
                      {androidApp ? (
                        <div className="mb-3 space-y-1 border-b border-[#e6eaf2] pb-3 dark:border-white/10">
                          <button
                            type="button"
                            className="net360-drawer-item flex min-h-12 w-full items-center rounded-2xl px-3 text-left text-sm font-semibold text-slate-800 active:bg-slate-100 dark:text-slate-100 dark:active:bg-white/10"
                            onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
                          >
                            {themeMode === 'dark' ? 'Light mode' : 'Dark mode'}
                          </button>
                          <button
                            type="button"
                            className="net360-drawer-item flex min-h-12 w-full items-center rounded-2xl px-3 text-left text-sm font-semibold text-slate-800 active:bg-slate-100 dark:text-slate-100 dark:active:bg-white/10"
                            onClick={() => {
                              sessionStorage.setItem('net360-open-notification-preferences', '1');
                              setSidebarMenuOpen(false);
                              navigate(PATH_BY_SECTION.profile);
                            }}
                          >
                            Notifications
                          </button>
                          <button
                            type="button"
                            className="net360-drawer-item flex min-h-12 w-full items-center rounded-2xl px-3 text-left text-sm font-semibold text-slate-800 active:bg-slate-100 dark:text-slate-100 dark:active:bg-white/10"
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent('net360:open-support-chat'));
                              setSidebarMenuOpen(false);
                            }}
                          >
                            Support chat
                          </button>
                        </div>
                      ) : null}
                      <SidebarNavigation
                        navigationItems={androidApp ? STUDENT_NAVIGATION_ITEMS.filter((item) => !ANDROID_FOOTER_IDS.has(item.id)) : STUDENT_NAVIGATION_ITEMS}
                        activeTab={activeTab}
                        smartMentorTabId={smartMentorTabId}
                        navigate={navigateWithTransition}
                        setSidebarMenuOpen={setSidebarMenuOpen}
                        onSmartMentorClick={handleSmartMentorComingSoon}
                        androidApp={androidApp}
                      />
                    </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <div className="net360-header-mark flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-indigo-100 bg-transparent shadow-[0_6px_12px_rgba(76,93,172,0.14)]">
                    <img
                      src={brandLogoUrl()}
                      alt="NET360 logo"
                      className="h-full w-full scale-[1.3] object-contain"
                      width={32}
                      height={32}
                      decoding="async"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="net360-header-title text-lg font-semibold leading-none text-indigo-950 sm:text-xl">
                      <span className="sr-only">Current page: </span>
                      {activeTitle}
                    </p>
                  </div>
                </div>
              </div>
              <div className="net360-header-actions ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
                <div className={`flex items-center gap-1 sm:gap-2${androidApp ? ' net360-android-chrome-hide' : ''}`}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="inline-flex min-h-11 min-w-11 touch-manipulation items-center justify-center rounded-xl text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-100 dark:hover:bg-slate-800 dark:hover:text-white sm:w-auto sm:px-2.5"
                  onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
                  aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {themeMode === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                  <span className="ml-1 hidden text-xs font-medium sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-manipulation min-h-11 min-w-11 rounded-xl text-slate-700 hover:bg-indigo-50 dark:text-slate-100"
                  onClick={() => {
                    sessionStorage.setItem('net360-open-notification-preferences', '1');
                    navigate(PATH_BY_SECTION.profile);
                  }}
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                </Button>
                <div className="hidden sm:block">
                  <PremiumCountdownBadge compact />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-manipulation min-h-11 min-w-11 rounded-xl text-slate-700 hover:bg-indigo-50 dark:text-slate-100"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('net360:open-support-chat'));
                  }}
                  aria-label="Open chat"
                >
                  <MessageSquare className="h-5 w-5" />
                </Button>
                </div>
                {androidApp ? <AndroidDemoModeButton /> : null}
                <HeaderAuthControl onOpenProfile={() => navigate(PATH_BY_SECTION.profile)} />
              </div>
            </header>

            {/* Main Content — lazy routes + Suspense avoid blank flash while chunks load.
                Profile stays mounted after first visit so returning to it is not a remount. */}
            <main id="main-content" className="net360-main min-h-0 min-w-0 flex-1 overflow-y-auto px-0 py-2.5 sm:py-5">
              {profileVisited ? (
                <div
                  hidden={activeTab !== 'profile'}
                  className={activeTab === 'profile' ? 'mt-0 net360-page' : 'hidden'}
                  aria-hidden={activeTab !== 'profile'}
                >
                  <Suspense fallback={activeTab === 'profile' ? <PageRouteFallback /> : null}>
                    <Profile onNavigate={onNavigateSection} />
                  </Suspense>
                </div>
              ) : null}
              {activeTab !== 'profile' ? (
                <Suspense fallback={<PageRouteFallback />}>{mainSection}</Suspense>
              ) : null}
            </main>
            {androidApp ? (
              <nav className="net360-tabbar" aria-label="Primary">
                {ANDROID_PRIMARY_NAV.map((item) => {
                  const Icon = item.icon;
                  const selected = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={selected ? 'is-selected' : undefined}
                      aria-current={selected ? 'page' : undefined}
                      aria-label={`Go to ${item.label}`}
                      onClick={() => {
                        if (item.id === 'community') preloadCommunityCache(token);
                        navigateWithTransition(PATH_BY_SECTION[item.id]);
                      }}
                    >
                      <span className="net360-tab-icon"><Icon aria-hidden="true" /></span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            ) : null}
          </section>
        </div>
      </div>

      <GlobalFreeAccessAnnouncement onStartLearning={() => navigate(PATH_BY_SECTION.tests)} />
      <DeferredSupportChat />
      <StudentPresenceHeartbeat />
    </AppDataProvider>
      </SubscriptionProvider>
      )}
      </SessionReady>
  );
}
