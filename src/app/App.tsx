import { Component, Suspense, lazy, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import { ScrollArea } from './components/ui/scroll-area';
import { Dashboard } from './components/Dashboard';
import { NUSTGuide } from './components/NUSTGuide';
import { NUSTSchoolsCampuses } from './components/NUSTSchoolsCampuses';
import { PracticeBoard } from './components/PracticeBoard';
import { QuestionContribution } from './components/QuestionContribution';
import { Preparation } from './components/Preparation';
import { Tests } from './components/Tests';
import { Analytics } from './components/Analytics';
import { MeritCalculator } from './components/MeritCalculator';
import { Profile } from './components/Profile';
import { Community } from './components/Community';
import { SupportChatWidget } from './components/SupportChatWidget';
import { FirstTimeSetup, isTermsAccepted } from './components/FirstTimeSetup';
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
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider } from './context/AuthContext';
import { Toaster, toast } from 'sonner';
import { App as CapacitorApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';

const BRAND_LOGO_SRC = '/net360-logo.png';
const THEME_STORAGE_KEY = 'net360-theme-mode';

type ThemeMode = 'light' | 'dark';

function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const ProgramExplorer = lazy(async () => {
  try {
    const module = await import('./components/ProgramExplorer');
    return { default: module.ProgramExplorer };
  } catch (error) {
    console.error('Failed to load Programs section bundle:', error);
    return {
      default: () => (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load Programs right now. Please try again.
        </div>
      ),
    };
  }
});

const NETTypes = lazy(async () => {
  try {
    const module = await import('./components/NETTypes');
    return { default: module.NETTypes };
  } catch (error) {
    console.error('Failed to load NET Types section bundle:', error);
    return {
      default: () => (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          Could not load NET Types right now. Please try again.
        </div>
      ),
    };
  }
});

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
  | 'profile';

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
};

function resolveSectionFromPath(pathname: string): SectionId | null {
  const normalized = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
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
    console.error(`Section render failed (${this.props.sectionName}):`, error, errorInfo);
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

function SectionLoadingFallback({ sectionName }: { sectionName: string }) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white/80 p-4 text-sm text-slate-600">
      Loading {sectionName}...
    </div>
  );
}

export default function App() {
  const smartMentorTabId = 'smart-mentor';
  const [setupCompleted, setSetupCompleted] = useState(() => isTermsAccepted());
  const [sidebarMenuOpen, setSidebarMenuOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialThemeMode);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(() => resolveSectionFromLocation(location.pathname, location.hash), [location.hash, location.pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = themeMode === 'dark';
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab') as SectionId | null;
    if (!tab || !(tab in PATH_BY_SECTION)) return;
    navigate(PATH_BY_SECTION[tab], { replace: true });
  }, [navigate]);

  useEffect(() => {
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    if (!isNativeRuntime) return;

    const listenerPromise = CapacitorApp.addListener('backButton', () => {
      if (activeTab !== 'home') {
        navigate(-1);
        return;
      }

      // Stay in app on root instead of closing process abruptly.
      toast.message('You are already on Home');
    });

    return () => {
      void listenerPromise.then((listener) => listener.remove());
    };
  }, [activeTab, navigate]);

  if (!setupCompleted) {
    return <FirstTimeSetup onComplete={() => setSetupCompleted(true)} />;
  }

  const navigationItems: Array<{ id: SectionId; label: string; icon: typeof Home }> = [
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
    { id: 'profile', label: 'Profile', icon: User }
  ];

  const activeNavigationItem = navigationItems.find((item) => item.id === activeTab);
  const activeTitle = activeNavigationItem?.label || 'Dashboard';

  const handleSmartMentorComingSoon = () => {
    toast.message('Coming Soon');
  };

  const NavigationContent = () => (
    <nav className="space-y-1.5">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === smartMentorTabId) {
                handleSmartMentorComingSoon();
                return;
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

  return (
    <AuthProvider>
      <AppDataProvider>
      <div className="min-h-dvh p-1 sm:p-3 md:p-5 xl:p-6">
        <div className="net360-shell mx-auto flex w-full max-w-[1600px] flex-col gap-2 rounded-[20px] border border-white/70 bg-white/65 p-1.5 shadow-[0_30px_70px_rgba(59,67,146,0.16)] backdrop-blur-xl sm:gap-3 sm:rounded-[24px] sm:p-2 xl:rounded-[28px]">
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white/85 to-[#f2f4ff]/80 backdrop-blur sm:rounded-3xl">
            {/* Header */}
            <header className="sticky top-0 z-40 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-indigo-100/70 bg-white/65 px-2 py-1.5 backdrop-blur-xl sm:min-h-16 sm:flex-nowrap sm:px-5 sm:py-0 sm:rounded-t-3xl">
              <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <Sheet open={sidebarMenuOpen} onOpenChange={setSidebarMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="rounded-xl">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="h-dvh w-[290px] max-w-[88vw] overflow-hidden border-white/20 bg-gradient-to-b from-[#5f4ee6] via-[#5b40d7] to-[#5e3ae0] p-0 dark:border-slate-700/70 dark:bg-gradient-to-b dark:from-[#111827] dark:via-[#1e1b4b] dark:to-[#0f172a]">
                    <div className="flex h-full min-h-0 flex-col">
                    <div className="shrink-0 border-b border-white/20 p-5 dark:border-slate-600/50">
                      <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg border border-white/25 bg-transparent shadow-sm dark:border-slate-500/55 dark:bg-slate-900/35">
                          <img src={BRAND_LOGO_SRC} alt="NET360 logo" className="h-full w-full scale-[1.3] object-contain" loading="lazy" />
                        </div>
                        <div>
                          <h2 className="text-lg font-semibold text-white dark:text-slate-100">NET360</h2>
                          <p className="text-xs text-indigo-100 dark:text-slate-300">Your Smart NET Preparation</p>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8 [scrollbar-gutter:stable]">
                      <NavigationContent />
                    </div>
                    </div>
                  </SheetContent>
                </Sheet>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-indigo-100 bg-transparent shadow-[0_6px_12px_rgba(76,93,172,0.14)]">
                    <img src={BRAND_LOGO_SRC} alt="NET360 logo" className="h-full w-full scale-[1.3] object-contain" loading="lazy" />
                  </div>
                  <div className="min-w-0">
                  <h1 className="max-w-[42vw] truncate text-base text-indigo-950 sm:max-w-none sm:text-xl">{activeTitle}</h1>
                  <p className="hidden text-xs text-slate-500 sm:block">My page</p>
                  </div>
                </div>
              </div>
              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl px-1.5 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 sm:px-2"
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
                  className="rounded-xl text-slate-600 hover:bg-indigo-50"
                  onClick={() => toast.success('You will receive updates here.')}
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-xl text-slate-600 hover:bg-indigo-50"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('net360:open-support-chat'));
                  }}
                  aria-label="Open chat"
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => navigate(PATH_BY_SECTION.profile)}
                  className="ml-1 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-slate-700 transition hover:bg-indigo-50"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
                  <span className="hidden text-sm sm:inline">Login / Sign Up</span>
                  <ChevronDown className="hidden w-4 h-4 sm:inline" />
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-clip px-2 py-2.5 sm:px-5 sm:py-5">
              {activeTab === 'home' ? (
                <div className="mt-0 net360-page">
                  <Dashboard onNavigate={(section) => navigate(PATH_BY_SECTION[(section as SectionId) || 'home'])} />
                </div>
              ) : null}
              {activeTab === 'guide' ? <div className="mt-0 net360-page"><NUSTGuide /></div> : null}
              {activeTab === 'programs' ? (
                <div className="mt-0 net360-page">
                  <SectionErrorBoundary sectionName="Programs" resetKey={activeTab}>
                    <Suspense fallback={<SectionLoadingFallback sectionName="Programs" />}>
                      <ProgramExplorer />
                    </Suspense>
                  </SectionErrorBoundary>
                </div>
              ) : null}
              {activeTab === 'schools-campuses' ? <div className="mt-0 net360-page"><NUSTSchoolsCampuses /></div> : null}
              {activeTab === 'net-types' ? (
                <div className="mt-0 net360-page">
                  <SectionErrorBoundary sectionName="NET Types" resetKey={activeTab}>
                    <Suspense fallback={<SectionLoadingFallback sectionName="NET Types" />}>
                      <NETTypes />
                    </Suspense>
                  </SectionErrorBoundary>
                </div>
              ) : null}
              {activeTab === 'practice-board' ? <div className="mt-0 net360-page"><PracticeBoard /></div> : null}
              {activeTab === 'question-contribution' ? <div className="mt-0 net360-page"><QuestionContribution /></div> : null}
              {activeTab === 'smart-mentor' ? (
                <div className="mt-0 net360-page">
                  <div className="rounded-2xl border border-indigo-100 bg-white/90 p-8 text-center shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
                    <p className="text-xl font-semibold text-indigo-950">Coming Soon for Smart Study Mentor</p>
                    <p className="mt-2 text-sm text-slate-600">This feature is currently unavailable.</p>
                  </div>
                </div>
              ) : null}
              {activeTab === 'preparation' ? <div className="mt-0 net360-page"><Preparation /></div> : null}
              {activeTab === 'tests' ? <div className="mt-0 net360-page"><Tests onNavigate={(section) => navigate(PATH_BY_SECTION[(section as SectionId) || 'home'])} /></div> : null}
              {activeTab === 'analytics' ? <div className="mt-0 net360-page"><Analytics /></div> : null}
              {activeTab === 'merit-calculator' ? <div className="mt-0 net360-page"><MeritCalculator /></div> : null}
              {activeTab === 'profile' ? <div className="mt-0 net360-page"><Profile onNavigate={(section) => navigate(PATH_BY_SECTION[(section as SectionId) || 'home'])} /></div> : null}
              {activeTab === 'community' ? <div className="mt-0 net360-page"><Community /></div> : null}
            </main>
          </section>
        </div>
      </div>

      <Toaster richColors position="top-right" />
      <SupportChatWidget />
    </AppDataProvider>
    </AuthProvider>
  );
}
