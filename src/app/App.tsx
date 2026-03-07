import { useState } from 'react';
import { Tabs, TabsContent } from './components/ui/tabs';
import { ScrollArea } from './components/ui/scroll-area';
import { Dashboard } from './components/Dashboard';
import { NUSTGuide } from './components/NUSTGuide';
import { ProgramExplorer } from './components/ProgramExplorer';
import { NETTypes } from './components/NETTypes';
import { Preparation } from './components/Preparation';
import { PracticeBoard } from './components/PracticeBoard';
import { AIMentor } from './components/AIMentor';
import { Tests } from './components/Tests';
import { Analytics } from './components/Analytics';
import { MeritCalculator } from './components/MeritCalculator';
import { Profile } from './components/Profile';
import { 
  Home, 
  BookOpen, 
  GraduationCap, 
  FlaskConical,
  BookMarked,
  Pencil,
  Brain,
  FileText,
  TrendingUp,
  Calculator,
  User,
  Menu,
  Bell,
  MessageSquare,
  ChevronDown,
  Sparkles,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    const allowed = new Set([
      'home',
      'guide',
      'programs',
      'net-types',
      'preparation',
      'practice-board',
      'smart-mentor',
      'tests',
      'analytics',
      'merit-calculator',
      'profile',
    ]);
    return tab && allowed.has(tab) ? tab : 'home';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigationItems = [
    { id: 'home', label: 'Dashboard', icon: Home },
    { id: 'guide', label: 'NUST Guide', icon: BookOpen },
    { id: 'programs', label: 'Programs', icon: GraduationCap },
    { id: 'net-types', label: 'NET Types', icon: FlaskConical },
    { id: 'preparation', label: 'Preparation', icon: BookMarked },
    { id: 'practice-board', label: 'Practice Board', icon: Pencil },
    { id: 'smart-mentor', label: 'Smart Study Mentor', icon: Brain },
    { id: 'tests', label: 'Tests', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'merit-calculator', label: 'Merit Calculator', icon: Calculator },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  const NavigationContent = () => (
    <nav className="space-y-1.5">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
              activeTab === item.id
                ? 'bg-white/22 text-white shadow-[0_8px_20px_rgba(26,24,89,0.38)]'
                : 'text-indigo-100 hover:bg-white/12'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="text-sm font-medium">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <AuthProvider>
      <AppDataProvider>
      <div className="min-h-screen p-2 sm:p-4 md:p-5 xl:p-6">
        <div className="net360-shell mx-auto flex w-full max-w-[1600px] flex-col gap-3 rounded-[24px] border border-white/70 bg-white/65 p-2 shadow-[0_30px_70px_rgba(59,67,146,0.16)] backdrop-blur-xl xl:flex-row xl:rounded-[28px]">
          {/* Desktop Sidebar */}
          <aside className="relative hidden xl:flex w-64 shrink-0 flex-col overflow-hidden rounded-3xl border border-indigo-300/30 bg-gradient-to-b from-[#5f4ee6] via-[#5b40d7] to-[#5e3ae0] p-4">
            <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-72 rounded-full bg-fuchsia-400/25 blur-3xl" />
            <div className="pointer-events-none absolute bottom-8 right-3 h-36 w-36 rounded-full bg-cyan-300/20 blur-3xl" />
            <div className="mb-5 rounded-2xl border border-white/20 bg-white/12 px-3 py-3 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20 text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-semibold leading-none tracking-tight text-white">NET360</p>
                  <p className="text-[11px] text-indigo-100/90">Your Smart NET Preparation</p>
                </div>
              </div>
            </div>
            <ScrollArea className="relative h-[calc(100vh-170px)] pr-2">
              <NavigationContent />
            </ScrollArea>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/80 bg-gradient-to-br from-white/85 to-[#f2f4ff]/80 backdrop-blur sm:rounded-3xl">
            {/* Header */}
            <header className="sticky top-0 z-40 flex h-16 items-center justify-between rounded-t-2xl border-b border-indigo-100/70 bg-white/65 px-3 backdrop-blur-xl sm:px-5 sm:rounded-t-3xl">
              <div className="flex items-center gap-3">
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild className="xl:hidden">
                    <Button variant="ghost" size="icon" className="rounded-xl">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[290px] p-0 border-white/20 bg-gradient-to-b from-[#5f4ee6] via-[#5b40d7] to-[#5e3ae0]">
                    <div className="p-5 border-b border-white/20">
                      <h2 className="text-lg font-semibold text-white">NET360</h2>
                      <p className="text-xs text-indigo-100">Your Smart NET Preparation</p>
                    </div>
                    <ScrollArea className="h-[calc(100vh-100px)] p-4">
                      <NavigationContent />
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
                <div>
                  <h1 className="text-xl text-indigo-950">Dashboard</h1>
                  <p className="hidden text-xs text-slate-500 sm:block">My page</p>
                </div>
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <Button variant="ghost" size="icon" className="rounded-xl text-slate-600 hover:bg-indigo-50">
                  <Bell className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="rounded-xl text-slate-600 hover:bg-indigo-50">
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  onClick={() => setActiveTab('profile')}
                  className="ml-1 inline-flex items-center gap-2 rounded-xl px-2 py-1.5 text-slate-700 transition hover:bg-indigo-50"
                >
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-300 to-orange-500" />
                  <span className="hidden text-sm sm:inline">Inter</span>
                  <ChevronDown className="hidden w-4 h-4 sm:inline" />
                </button>
              </div>
            </header>

            {/* Main Content */}
            <main className="overflow-x-clip px-3 py-4 sm:px-5 sm:py-5">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
                <TabsContent value="home" className="mt-0">
                  <Dashboard onNavigate={setActiveTab} />
                </TabsContent>

                <TabsContent value="guide" className="mt-0 net360-page">
                  <NUSTGuide />
                </TabsContent>

                <TabsContent value="programs" className="mt-0 net360-page">
                  <ProgramExplorer />
                </TabsContent>

                <TabsContent value="net-types" className="mt-0 net360-page">
                  <NETTypes />
                </TabsContent>

                <TabsContent value="preparation" className="mt-0 net360-page">
                  <Preparation />
                </TabsContent>

                <TabsContent value="practice-board" className="mt-0 net360-page">
                  <PracticeBoard />
                </TabsContent>

                <TabsContent value="smart-mentor" className="mt-0 net360-page">
                  <AIMentor onNavigate={setActiveTab} />
                </TabsContent>

                <TabsContent value="tests" className="mt-0 net360-page">
                  <Tests onNavigate={setActiveTab} />
                </TabsContent>

                <TabsContent value="analytics" className="mt-0 net360-page">
                  <Analytics />
                </TabsContent>

                <TabsContent value="merit-calculator" className="mt-0 net360-page">
                  <MeritCalculator />
                </TabsContent>

                <TabsContent value="profile" className="mt-0 net360-page">
                  <Profile onNavigate={setActiveTab} />
                </TabsContent>
              </Tabs>
            </main>
          </section>
        </div>
      </div>

      <Toaster richColors position="top-right" />
    </AppDataProvider>
    </AuthProvider>
  );
}
