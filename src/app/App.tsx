import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
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
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from './components/ui/sheet';
import { AppDataProvider } from './context/AppDataContext';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'sonner';

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigationItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'guide', label: 'NUST Guide', icon: BookOpen },
    { id: 'programs', label: 'Programs', icon: GraduationCap },
    { id: 'net-types', label: 'NET Types', icon: FlaskConical },
    { id: 'preparation', label: 'Preparation', icon: BookMarked },
    { id: 'practice-board', label: 'Practice Board', icon: Pencil },
    { id: 'ai-mentor', label: 'AI Mentor', icon: Brain },
    { id: 'tests', label: 'Tests', icon: FileText },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'merit-calculator', label: 'Merit Calculator', icon: Calculator },
    { id: 'profile', label: 'Profile', icon: User }
  ];

  const NavigationContent = () => (
    <nav className="space-y-2">
      {navigationItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            onClick={() => {
              setActiveTab(item.id);
              setMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
              activeTab === item.id
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <AuthProvider>
      <AppDataProvider>
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild className="lg:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <div className="p-6 border-b">
                  <h2 className="text-xl">NET360 Preparation</h2>
                  <p className="text-sm text-muted-foreground">NUST Entry Test Prep</p>
                </div>
                <ScrollArea className="h-[calc(100vh-100px)] p-4">
                  <NavigationContent />
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <div>
              <h1 className="text-xl">NET360 Preparation</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">NUST Entry Test Preparation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setActiveTab('profile')}>
              <User className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container px-4 py-6">
        <div className="flex gap-6">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-20">
              <ScrollArea className="h-[calc(100vh-120px)]">
                <NavigationContent />
              </ScrollArea>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-0">
              <TabsContent value="home" className="mt-0">
                <Dashboard onNavigate={setActiveTab} />
              </TabsContent>

              <TabsContent value="guide" className="mt-0">
                <NUSTGuide />
              </TabsContent>

              <TabsContent value="programs" className="mt-0">
                <ProgramExplorer />
              </TabsContent>

              <TabsContent value="net-types" className="mt-0">
                <NETTypes />
              </TabsContent>

              <TabsContent value="preparation" className="mt-0">
                <Preparation />
              </TabsContent>

              <TabsContent value="practice-board" className="mt-0">
                <PracticeBoard />
              </TabsContent>

              <TabsContent value="ai-mentor" className="mt-0">
                <AIMentor />
              </TabsContent>

              <TabsContent value="tests" className="mt-0">
                <Tests />
              </TabsContent>

              <TabsContent value="analytics" className="mt-0">
                <Analytics />
              </TabsContent>

              <TabsContent value="merit-calculator" className="mt-0">
                <MeritCalculator />
              </TabsContent>

              <TabsContent value="profile" className="mt-0">
                <Profile />
              </TabsContent>
            </Tabs>
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-12">
        <div className="container px-4 py-6 text-center text-sm text-muted-foreground">
          <p>© 2026 NET360 Preparation. All rights reserved.</p>
          <p className="mt-1">Your complete solution for NUST Entry Test preparation</p>
        </div>
      </footer>
      <Toaster richColors position="top-right" />
    </div>
    </AppDataProvider>
    </AuthProvider>
  );
}
