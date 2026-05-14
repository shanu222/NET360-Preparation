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
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { PageRouteFallback } from './components/PageRouteFallback';
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
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from './components/ui/sheet';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { preloadCommunityCache } from './lib/communityPreload';
import { prefetchStudentSection, scheduleIdleStudentPrefetch } from './lib/routePrefetch';
import { showNeutralToast, showSuccessToast } from './lib/userToast';
import { Toaster } from 'sonner';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { brandLogoUrl } from './lib/publicMedia';
import { fetchAndApplyPublicMediaConfig } from './lib/publicMediaRuntime';
import { PremiumCountdownBadge } from './components/subscription/PremiumCountdownBadge';
import { logNativeEvent } from './lib/nativeDiagnostics';
import { resolveCapacitorAndroidWebViewUrl } from './lib/nativeDeepLink';

const SubscriptionPageLazy = lazyWithRetry(() => import('./components/SubscriptionPage').then((m) => ({ default: m.SubscriptionPage })));
const Dashboard = lazyWithRetry(() => import('./components/Dashboard').then((m) => ({ default: m.Dashboard })));
const NUSTGuide = lazyWithRetry(() => import('./components/NUSTGuide').then((m) => ({ default: m.NUSTGuide })));
const NUSTSchoolsCampuses = lazyWithRetry(() => import('./components/NUSTSchoolsCampuses').then((m) => ({ default: m.NUSTSchoolsCampuses })));
const PracticeBoard = lazyWithRetry(() => import('./components/PracticeBoard').then((m) => ({ default: m.PracticeBoard })));
const QuestionContribution = lazyWithRetry(() => import('./components/QuestionContribution').then((m) => ({ default: m.QuestionContribution })));
const Preparation = lazyWithRetry(() => import('./components/Preparation').then((m) => ({ default: m.Preparation })));
const Tests = lazyWithRetry(() => import('./components/Tests').then((m) => ({ default: m.Tests })));
const Analytics = lazyWithRetry(() => import('./components/Analytics').then((m) => ({ default: m.Analytics })));
const MeritCalculator = lazyWithRetry(() => import('./components/MeritCalculator').then((m) => ({ default: m.MeritCalculator })));
const Profile = lazyWithRetry(() => import('./components/Profile').then((m) => ({ default: m.Profile })));
const Community = lazyWithRetry(() => import('./components/Community').then((m) => ({ default: m.Community })));
const ProgramExplorer = lazyWithRetry(() => import('./components/ProgramExplorer').then((m) => ({ default: m.ProgramExplorer })));
const NETTypes = lazyWithRetry(() => import('./components/NETTypes').then((m) => ({ default: m.NETTypes })));
const SeoLandingPage = lazyWithRetry(() => import('./components/SeoLandingPage').then((m) => ({ default: m.SeoLandingPage })));
const SupportChatWidgetLazy = lazyWithRetry(() =>
  import('./components/SupportChatWidget').then((m) => ({ default: m.SupportChatWidget })),
);

function SessionReady({ children }: { children: ReactNode }) {
  const { loading } = useAuth();
  if (loading) {
    return <PageRouteFallback />;
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
  | 'tests'
  | 'analytics'
  | 'merit-calculator'
  | 'community'
  | 'profile'
  | 'subscription'
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
  tests: '/tests',
  analytics: '/analytics',
  'merit-calculator': '/merit-calculator',
  community: '/community',
  profile: '/profile',
  subscription: '/subscription',
  'physics-mcqs-net': '/physics-mcqs-net',
  'math-mcqs-net': '/math-mcqs-net',
  'net-preparation-pakistan': '/net-preparation-pakistan',
  'nust-entry-test-preparation': '/nust-entry-test-preparation',
};

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
  { id: 'tests', label: 'Tests', icon: FileText },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
  { id: 'merit-calculator', label: 'Merit Calculator', icon: Calculator },
  { id: 'community', label: 'Community', icon: Users },
  { id: 'subscription', label: 'Subscription', icon: Crown },
  { id: 'profile', label: 'Profile', icon: User },
];

const SidebarNavigation = memo(function SidebarNavigation({
  navigationItems,
  activeTab,
  smartMentorTabId,
  navigate,
  setSidebarMenuOpen,
  onSmartMentorClick,
}: {
  navigationItems: Array<{ id: SectionId; label: string; icon: typeof Home }>;
  activeTab: SectionId;
  smartMentorTabId: SectionId;
  navigate: (to: string) => void;
  setSidebarMenuOpen: (open: boolean) => void;
  onSmartMentorClick: () => void;
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
            className={`w-full grid grid-cols-[18px_minmax(0,1fr)] items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 ${
              item.id === smartMentorTabId
                ? 'cursor-not-allowed opacity-70 text-indigo-100/85 hover:bg-white/8 dark:text-slate-400 dark:hover:bg-slate-100/5'
                : ''
            } ${
              activeTab === item.id
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
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    window.addEventListener('mousedown', handlePointerDown, { passive: true });
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
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
        className="touch-manipulation ml-1 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 py-2 text-slate-700 transition hover:bg-indigo-50 sm:min-h-9 sm:py-1.5"
      >
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
        <span className="hidden text-sm sm:inline">Login / Sign Up</span>
        <ChevronDown className="hidden w-4 h-4 sm:inline" />
      </button>
    );
  }

  return (
    <div className="relative ml-1" ref={menuRef}>
      <button
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

      <div
        className={`absolute right-0 top-[calc(100%+8px)] z-50 min-w-[180px] rounded-xl border border-indigo-100 bg-white/95 p-1.5 text-slate-800 shadow-[0_16px_30px_rgba(15,23,42,0.18)] backdrop-blur-md transition-all duration-150 dark:border-white/15 dark:bg-slate-900/95 dark:text-slate-100 ${menuOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-1 opacity-0'}`}
        role="menu"
      >
        <button
          type="button"
          className="min-h-11 w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50/90 dark:text-rose-300 dark:hover:bg-rose-500/15"
          role="menuitem"
          onClick={() => {
            logout();
            setMenuOpen(false);
          }}
        >
          Logout
        </button>
      </div>
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
  const activeTab = useMemo(() => resolveSectionFromLocation(location.pathname, location.hash), [location.hash, location.pathname]);

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
      if (activeTab !== 'home') {
        navigate(-1);
        return;
      }

      // Stay in app on root instead of closing process abruptly.
      showNeutralToast('You are already on the home page.');
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [activeTab, navigate]);

  useEffect(() => {
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    if (!isNativeRuntime) return;

    const listenerPromise = CapacitorApp.addListener('appUrlOpen', ({ url }) => {
      const incoming = String(url || '').trim();
      if (!incoming) return;
      logNativeEvent('runtime', 'deep-link-open', { url: incoming });
      try {
        const capacitorLocal = resolveCapacitorAndroidWebViewUrl(incoming);
        if (capacitorLocal) {
          logNativeEvent('runtime', 'deep-link-webview-location', { incoming, capacitorLocal });
          window.location.replace(capacitorLocal);
          return;
        }
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
    const rows = Array.from(document.querySelectorAll<HTMLElement>('.net360-swipe-row'));
    if (!rows.length) return;

    const cleanupFns: Array<() => void> = [];

    const updateRowScrollState = (row: HTMLElement) => {
      const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
      const canScroll = maxScrollLeft > 1;
      const current = Math.max(0, Math.min(row.scrollLeft, maxScrollLeft));
      row.dataset.scrollable = canScroll ? 'true' : 'false';
      row.dataset.scrollLeftActive = canScroll && current > 2 ? 'true' : 'false';
      row.dataset.scrollRightActive = canScroll && current < maxScrollLeft - 2 ? 'true' : 'false';
    };

    const syncRowLayout = () => {
      rows.forEach((row) => {
        const maxScrollLeft = Math.max(0, row.scrollWidth - row.clientWidth);
        if (row.scrollLeft > maxScrollLeft) {
          row.scrollLeft = maxScrollLeft;
        }
        updateRowScrollState(row);
      });
    };

    const enableDragFallback = (row: HTMLElement) => {
      let isPointerDown = false;
      let isDragging = false;
      let startX = 0;
      let startScrollLeft = 0;

      const shouldSkipTarget = (target: EventTarget | null) => {
        if (!(target instanceof Element)) return false;
        /* Tab triggers are <button>; allow horizontal drag from the strip (small movement still fires tap). */
        if (target.closest('[data-slot="tabs-list"]')) {
          return Boolean(target.closest('input, textarea, select, [data-no-drag-scroll]'));
        }
        return Boolean(target.closest('button, a, input, textarea, select, [role="button"], [data-no-drag-scroll]'));
      };

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        if (shouldSkipTarget(event.target)) return;
        isPointerDown = true;
        isDragging = false;
        startX = event.clientX;
        startScrollLeft = row.scrollLeft;
        row.dataset.dragging = 'false';
        row.setPointerCapture?.(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!isPointerDown) return;
        const deltaX = event.clientX - startX;
        if (!isDragging && Math.abs(deltaX) > 6) {
          isDragging = true;
          row.dataset.dragging = 'true';
        }
        if (!isDragging) return;
        row.scrollLeft = startScrollLeft - deltaX;
        updateRowScrollState(row);
      };

      const onPointerUp = (event: PointerEvent) => {
        if (isPointerDown) {
          row.releasePointerCapture?.(event.pointerId);
        }
        isPointerDown = false;
        row.dataset.dragging = 'false';
        window.setTimeout(() => {
          isDragging = false;
        }, 0);
      };

      const onScroll = () => {
        updateRowScrollState(row);
      };

      const onClickCapture = (event: MouseEvent) => {
        if (!isDragging) return;
        event.preventDefault();
        event.stopPropagation();
      };

      row.addEventListener('pointerdown', onPointerDown, { passive: true });
      row.addEventListener('pointermove', onPointerMove, { passive: true });
      row.addEventListener('pointerup', onPointerUp, { passive: true });
      row.addEventListener('pointercancel', onPointerUp, { passive: true });
      row.addEventListener('scroll', onScroll, { passive: true });
      row.addEventListener('click', onClickCapture, true);
      updateRowScrollState(row);

      return () => {
        row.removeEventListener('pointerdown', onPointerDown);
        row.removeEventListener('pointermove', onPointerMove);
        row.removeEventListener('pointerup', onPointerUp);
        row.removeEventListener('pointercancel', onPointerUp);
        row.removeEventListener('scroll', onScroll);
        row.removeEventListener('click', onClickCapture, true);
      };
    };

    rows.forEach((row) => {
      cleanupFns.push(enableDragFallback(row));
    });

    const onResize = () => syncRowLayout();
    const onOrientationChange = () => {
      syncRowLayout();
      window.setTimeout(syncRowLayout, 120);
    };

    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onOrientationChange, { passive: true });
    window.visualViewport?.addEventListener('resize', onResize);

    syncRowLayout();
    window.setTimeout(syncRowLayout, 80);

    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onOrientationChange);
      window.visualViewport?.removeEventListener('resize', onResize);
      cleanupFns.forEach((fn) => fn());
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
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <Profile onNavigate={onNavigateSection} />
          </div>
        );
      case 'subscription':
        return (
          <div className="mt-0 net360-page net360-page-enter">
            <SubscriptionPageLazy />
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

  return (
    <AuthProvider>
      <SessionReady>
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
      <div className="net360-viewport flex min-h-dvh min-h-screen flex-col p-1 sm:p-3 md:p-5 xl:p-6">
        <div className="net360-shell mx-auto flex w-full max-w-[min(100%,1600px)] flex-col gap-2 rounded-[20px] border border-white/70 bg-white/65 p-1.5 shadow-[0_30px_70px_rgba(59,67,146,0.16)] backdrop-blur-xl sm:gap-3 sm:rounded-[24px] sm:p-2 xl:rounded-[28px]">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white/85 to-[#f2f4ff]/80 backdrop-blur sm:rounded-3xl">
            {/* Header */}
            <header className="net360-header sticky top-0 z-40 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-indigo-100/70 bg-white/65 px-2 py-1.5 backdrop-blur-xl sm:min-h-16 sm:flex-nowrap sm:px-5 sm:py-0 sm:rounded-t-3xl">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Sheet open={sidebarMenuOpen} onOpenChange={setSidebarMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="touch-manipulation rounded-xl min-h-11 min-w-11" aria-label="Open navigation menu">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="left"
                    aria-label="Main navigation"
                    className="h-dvh w-[290px] max-w-[88vw] overflow-hidden border-white/20 bg-gradient-to-b from-[#5f4ee6] via-[#5b40d7] to-[#5e3ae0] p-0 dark:border-slate-700/70 dark:bg-gradient-to-b dark:from-[#111827] dark:via-[#1e1b4b] dark:to-[#0f172a]"
                  >
                    <SheetTitle className="sr-only">Main navigation</SheetTitle>
                    <SheetDescription className="sr-only">
                      Browse NET360 sections and open pages from the menu.
                    </SheetDescription>
                    <div className="flex h-full min-h-0 flex-col">
                    <div className="shrink-0 border-b border-white/20 p-5 dark:border-slate-600/50">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/25 bg-transparent shadow-sm dark:border-slate-500/55 dark:bg-slate-900/35">
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
                          <p className="text-lg font-semibold text-white dark:text-slate-100">NET360</p>
                          <p className="text-xs text-indigo-100 dark:text-slate-300">Your Smart NET Preparation</p>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8 [scrollbar-gutter:stable]">
                      <SidebarNavigation
                        navigationItems={STUDENT_NAVIGATION_ITEMS}
                        activeTab={activeTab}
                        smartMentorTabId={smartMentorTabId}
                        navigate={navigateWithTransition}
                        setSidebarMenuOpen={setSidebarMenuOpen}
                        onSmartMentorClick={handleSmartMentorComingSoon}
                      />
                    </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-indigo-100 bg-transparent shadow-[0_6px_12px_rgba(76,93,172,0.14)]">
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
                  <div className="min-w-0">
                    <p className="min-w-0 max-w-full text-base leading-snug text-indigo-950 line-clamp-2 sm:line-clamp-1 sm:text-lg md:line-clamp-none md:text-xl">
                      <span className="sr-only">Current page: </span>
                      {activeTitle}
                    </p>
                    <p className="hidden text-xs text-slate-500 sm:block">My page</p>
                  </div>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="touch-manipulation min-h-11 rounded-xl px-2.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 sm:min-h-9 sm:px-2"
                  onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
                  aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span className="ml-1 hidden text-xs font-medium sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-manipulation min-h-11 min-w-11 rounded-xl text-slate-600 hover:bg-indigo-50"
                  onClick={() => showSuccessToast('We will show your updates here.')}
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                </Button>
                <div className="hidden sm:block">
                  <PremiumCountdownBadge compact />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="touch-manipulation min-h-11 min-w-11 rounded-xl text-slate-600 hover:bg-indigo-50"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('net360:open-support-chat'));
                  }}
                  aria-label="Open chat"
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <HeaderAuthControl onOpenProfile={() => navigate(PATH_BY_SECTION.profile)} />
              </div>
            </header>

            {/* Main Content — lazy routes + Suspense avoid blank flash while chunks load */}
            <main id="main-content" className="net360-main min-h-0 min-w-0 flex-1 overflow-y-auto px-0 py-2.5 sm:py-5">
              <Suspense fallback={<PageRouteFallback />}>{mainSection}</Suspense>
            </main>
          </section>
        </div>
      </div>

      <Toaster richColors position="top-right" closeButton visibleToasts={4} expand={false} offset={16} />
      <DeferredSupportChat />
    </AppDataProvider>
      </SubscriptionProvider>
      </SessionReady>
    </AuthProvider>
  );
}
