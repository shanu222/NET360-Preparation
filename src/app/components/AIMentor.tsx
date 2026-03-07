import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ScrollArea } from './ui/scroll-area';
import {
  Brain,
  Calendar,
  Clock3,
  FileQuestion,
  MessageSquare,
  Rocket,
  Send,
  Sparkles,
  Upload,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

interface AIMentorProps {
  onNavigate?: (section: string) => void;
}

const quickPrompts = [
  'Explain integration techniques for NET.',
  'How do I solve electromagnetism MCQs faster?',
  'Give me a quick organic chemistry revision strategy.',
  'Revise trigonometric identities with common mistakes.',
  'How should I approach Newton laws questions?',
  'Give me top grammar rules for sentence correction.',
];

interface StudyPlan {
  generatedAt: string;
  targetDate: string;
  daysLeft: number;
  preparationLevel: string;
  weakSubjects: string[];
  dailyStudyHours: number;
  weeklyTargets: Array<{ week: number; focus: string; target: string }>;
  dailySchedule: Array<{ block: string; durationHours: number; activity: string }>;
  roadmap: string[];
}

export function AIMentor({ onNavigate }: AIMentorProps) {
  const { token, user } = useAuth();
  const [question, setQuestion] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [dailyHours, setDailyHours] = useState('4');
  const [currentLevel, setCurrentLevel] = useState('');
  const [weakSubjectsText, setWeakSubjectsText] = useState('mathematics, physics');
  const [planData, setPlanData] = useState<StudyPlan | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isAskingAI, setIsAskingAI] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [aiUsage, setAiUsage] = useState<{ usedToday: number; remainingToday: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([
    { role: 'ai', message: "Hi! I'm your AI tutor for NET preparation. Ask me any concept or past-paper question." },
  ]);

  useEffect(() => {
    if (!token || !user) {
      setPlanData(null);
      return;
    }

    let cancelled = false;

    async function loadLatestPlan() {
      try {
        const payload = await apiRequest<{ studyPlan: StudyPlan | null }>('/api/study-plans/latest', {}, token);
        if (!cancelled && payload.studyPlan) {
          setPlanData(payload.studyPlan);
          setTargetDate(payload.studyPlan.targetDate || '');
          setCurrentLevel(payload.studyPlan.preparationLevel || '');
          setDailyHours(String(payload.studyPlan.dailyStudyHours || 4));
          setWeakSubjectsText((payload.studyPlan.weakSubjects || []).join(', '));
        }
      } catch {
        // Ignore fetch errors for planner bootstrapping.
      }
    }

    void loadLatestPlan();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const askQuestion = async () => {
    if (!question.trim()) return;

    if (!token || !user) {
      toast.error('Login required to use AI Mentor.');
      return;
    }

    const userMessage = { role: 'user' as const, message: question.trim() };
    setChatMessages((previous) => [...previous, userMessage]);
    setQuestion('');
    setIsAskingAI(true);

    try {
      const payload = await apiRequest<{ answer: string; usage?: { usedToday: number; remainingToday: number } }>(
        '/api/ai/mentor/chat',
        {
          method: 'POST',
          body: JSON.stringify({
            message: userMessage.message,
            context: 'NET prep assistant mode',
          }),
        },
        token,
      );

      setChatMessages((previous) => [...previous, { role: 'ai', message: payload.answer }]);
      if (payload.usage) {
        setAiUsage(payload.usage);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reach AI mentor.');
      setChatMessages((previous) => [
        ...previous,
        {
          role: 'ai',
          message: 'AI response failed right now. Please retry or simplify your query.',
        },
      ]);
    } finally {
      setIsAskingAI(false);
    }
  };

  const handleChooseFile = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setChatMessages((previous) => [
      ...previous,
      {
        role: 'ai',
        message: `I received "${file.name}". OCR upload solving can be added with external vision API if you want; for now paste the extracted text for full solving.`,
      },
    ]);
    toast.success(`Selected file: ${file.name}`);
  };

  const generateStudyPlan = async () => {
    if (!token || !user) {
      toast.error('Login required to save a study plan.');
      return;
    }

    if (!targetDate || !currentLevel || !dailyHours) {
      toast.error('Please set target date, level, and daily hours first.');
      return;
    }

    setIsGeneratingPlan(true);
    try {
      const weakSubjects = weakSubjectsText
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      const payload = await apiRequest<{ studyPlan: StudyPlan }>(
        '/api/study-plans/generate',
        {
          method: 'POST',
          body: JSON.stringify({
            targetDate,
            preparationLevel: currentLevel,
            dailyStudyHours: Number(dailyHours),
            weakSubjects,
          }),
        },
        token,
      );

      setPlanData(payload.studyPlan);
      toast.success('Study plan generated and saved to your account.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not generate study plan.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#ecefff] via-[#ece8ff] to-[#f5e6f8] p-5 sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(172,149,255,0.26),transparent_35%),radial-gradient(circle_at_16%_80%,rgba(129,180,255,0.18),transparent_30%)]" />
        <div className="relative">
          <h1 className="inline-flex items-center gap-2 text-indigo-950">
            <Brain className="h-7 w-7" />
            AI Mentor
          </h1>
          <p className="text-slate-600">AI tutoring, planner generation, and focused NET guidance</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatPill icon={MessageSquare} label="Live AI Tutor" />
            <StatPill icon={Upload} label="Question Image Intake" />
            <StatPill icon={Calendar} label="Persistent Study Planner" />
          </div>
        </div>
      </section>

      <Tabs defaultValue="chat" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 !bg-white/80 !border-indigo-100">
          <TabsTrigger value="chat">Ask Doubt</TabsTrigger>
          <TabsTrigger value="solver">Question Solver</TabsTrigger>
          <TabsTrigger value="planner">Study Planner</TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.9fr_1fr]">
            <Card className="rounded-2xl border-indigo-100 bg-white/92">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                  <MessageSquare className="h-5 w-5 text-indigo-500" />
                  Chat with AI Tutor
                </CardTitle>
                <CardDescription>Backed by server AI endpoint with daily usage limit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {aiUsage ? (
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-xs text-slate-600">
                    AI usage today: {aiUsage.usedToday} used • {aiUsage.remainingToday} remaining
                  </div>
                ) : null}

                <ScrollArea className="h-[320px] rounded-xl border border-indigo-100 bg-[#fafbff] p-3 pr-4 sm:h-[360px]">
                  <div className="space-y-4">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={`${msg.role}-${index}`}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[82%] rounded-xl px-4 py-3 text-sm ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-sm'
                              : 'border border-indigo-100 bg-white text-slate-700'
                          }`}
                        >
                          <p>{msg.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Textarea
                    placeholder="Ask your question here... e.g., Explain integration by parts"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="min-h-[70px] rounded-xl border-indigo-100 bg-white/95"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void askQuestion();
                      }
                    }}
                  />
                  <Button
                    onClick={() => void askQuestion()}
                    disabled={isAskingAI}
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:h-[70px] sm:w-14"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-indigo-100 bg-white/92">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl text-indigo-950">Popular Topics</CardTitle>
                <CardDescription>One-tap prompts to start faster</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => setQuestion(prompt)}
                      className="w-full rounded-xl border border-indigo-100 bg-white px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-indigo-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="solver" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
            <Card className="rounded-2xl border-indigo-100 bg-white/92">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                  <FileQuestion className="h-5 w-5 text-indigo-500" />
                  Question Solver
                </CardTitle>
                <CardDescription>Image upload intake for manual or OCR-assisted solving</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-gradient-to-r from-[#f8f9ff] to-[#eef3ff] p-8 text-center">
                  <Upload className="mx-auto mb-3 h-11 w-11 text-indigo-400" />
                  <p className="mb-1 text-indigo-950">Upload a question image</p>
                  <p className="mb-4 text-sm text-slate-500">Supports JPG, PNG (Max 5MB)</p>
                  <Button variant="outline" onClick={handleChooseFile} className="rounded-xl border-indigo-200 bg-white">
                    Choose File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {uploadedFileName ? <p className="mt-3 text-xs text-slate-500">Selected: {uploadedFileName}</p> : null}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <MiniInfo icon={Brain} title="Concept Explanation" subtitle="Understand what the problem asks" />
                  <MiniInfo icon={Wand2} title="Step-by-Step Solution" subtitle="Clear solving sequence" />
                  <MiniInfo icon={Rocket} title="Final Answer" subtitle="Quick and verified conclusion" />
                  <MiniInfo icon={Sparkles} title="Related Concepts" subtitle="What to revise next" />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-[0_14px_28px_rgba(56,164,140,0.32)]">
              <CardContent className="pt-6">
                <h3 className="mb-2 text-white">Premium OCR Add-on</h3>
                <p className="mb-4 text-emerald-100">
                  OCR solving requires a vision service integration key. Backend endpoint is ready for extension.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onNavigate?.('profile');
                    toast.message('Opened Profile so you can manage your plan and account settings.');
                  }}
                >
                  Manage Plan
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="planner" className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1.8fr]">
            <Card className="rounded-2xl border-indigo-100 bg-white/92">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-2xl text-indigo-950">
                  <Calendar className="h-5 w-5 text-indigo-500" />
                  Smart Study Planner
                </CardTitle>
                <CardDescription>Generate and persist your personalized plan</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="planner-target-date">Target NET Date</Label>
                  <Input
                    id="planner-target-date"
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="border-indigo-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="planner-daily-hours">Daily Study Hours</Label>
                  <Input
                    id="planner-daily-hours"
                    type="number"
                    min={1}
                    max={14}
                    value={dailyHours}
                    onChange={(e) => setDailyHours(e.target.value)}
                    className="border-indigo-100"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="prep-level">Current Preparation Level</Label>
                  <Select value={currentLevel} onValueChange={setCurrentLevel}>
                    <SelectTrigger id="prep-level" className="border-indigo-100">
                      <SelectValue placeholder="Select your level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="beginner">Beginner - Just started</SelectItem>
                      <SelectItem value="intermediate">Intermediate - 30-50% done</SelectItem>
                      <SelectItem value="advanced">Advanced - 60-80% done</SelectItem>
                      <SelectItem value="revision">Revision - Final preparation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weak-subjects">Weak Subjects (comma separated)</Label>
                  <Input
                    id="weak-subjects"
                    value={weakSubjectsText}
                    onChange={(e) => setWeakSubjectsText(e.target.value)}
                    placeholder="mathematics, physics"
                    className="border-indigo-100"
                  />
                </div>

                <Button
                  onClick={() => void generateStudyPlan()}
                  disabled={isGeneratingPlan}
                  className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                >
                  {isGeneratingPlan ? 'Generating...' : 'Generate Study Plan'}
                </Button>
              </CardContent>
            </Card>

            {planData ? (
              <Card className="rounded-2xl border-indigo-100 bg-white/92">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-indigo-950">Your Study Plan ({planData.daysLeft} Days Left)</CardTitle>
                  <CardDescription>Saved to your account and synced across sessions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {planData.weeklyTargets.map((item) => (
                    <PlanBlock
                      key={`${item.week}-${item.focus}`}
                      title={`Week ${item.week}: ${item.focus}`}
                      days={item.target}
                      lines={planData.roadmap}
                    />
                  ))}
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl border-indigo-100 bg-gradient-to-r from-[#f4f6ff] to-[#eceffd]">
                <CardContent className="flex h-full min-h-[290px] items-center justify-center text-center">
                  <div>
                    <Clock3 className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
                    <p className="text-indigo-950">Generate your study plan to see roadmap here.</p>
                    <p className="text-sm text-slate-500">Planner is persisted per account.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatPill({
  icon: Icon,
  label,
}: {
  icon: typeof Brain;
  label: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-white/70 bg-white/80 px-3 py-2 text-sm text-indigo-900">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
        <Icon className="h-4 w-4" />
      </span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function MiniInfo({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Brain;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-3">
      <p className="mb-1 inline-flex items-center gap-2 text-sm font-medium text-indigo-950">
        <Icon className="h-4 w-4 text-indigo-400" />
        {title}
      </p>
      <p className="text-xs text-slate-500">{subtitle}</p>
    </div>
  );
}

function PlanBlock({
  title,
  days,
  lines,
}: {
  title: string;
  days: string;
  lines: string[];
}) {
  return (
    <div className="rounded-xl border border-indigo-100 bg-white p-4">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-indigo-950">{title}</h4>
        <span className="text-xs text-slate-500">{days}</span>
      </div>
      <ul className="space-y-1 text-sm text-slate-600">
        {lines.map((line, index) => (
          <li key={`${line}-${index}`}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}
