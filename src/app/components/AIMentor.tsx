import { type ChangeEvent } from 'react';
import { useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
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

export function AIMentor({ onNavigate }: AIMentorProps) {
  const [question, setQuestion] = useState('');
  const [studyDays, setStudyDays] = useState('60');
  const [currentLevel, setCurrentLevel] = useState('');
  const [targetProgram, setTargetProgram] = useState('');
  const [planGenerated, setPlanGenerated] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'ai'; message: string }>>([
    { role: 'ai', message: "Hi! I'm your AI tutor for NET preparation. How can I help you today?" },
  ]);

  const generateTutorResponse = (query: string) => {
    const normalized = query.toLowerCase();
    if (normalized.includes('integration')) {
      return 'For integration, first identify the function type: substitution, parts, or partial fractions. Start by trying substitution when you see a composite function. If that fails, use integration by parts with the LIATE rule.';
    }
    if (normalized.includes('physics') || normalized.includes('force') || normalized.includes('newton')) {
      return 'Use this sequence for Physics numericals: define knowns, write governing equation, isolate unknown, then check units. For Newton laws, always draw a free-body diagram first.';
    }
    if (normalized.includes('english') || normalized.includes('grammar')) {
      return 'For English correction, scan tense consistency, subject-verb agreement, pronoun reference, and parallel structure. Eliminate choices with grammar breaks before checking style.';
    }
    return 'Break each problem into three passes: concept check, formula selection, and quick verification. If you share one specific question, I can walk you through it step by step.';
  };

  const askQuestion = () => {
    if (!question.trim()) return;

    const userMessage = { role: 'user' as const, message: question };
    const aiResponse = {
      role: 'ai' as const,
      message: generateTutorResponse(question),
    };

    setChatMessages((previous) => [...previous, userMessage, aiResponse]);
    setQuestion('');
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
        message: `I received "${file.name}". OCR solving is not yet wired, but you can paste the question in Ask Doubt and I will solve it step by step.`,
      },
    ]);
    toast.success(`Selected file: ${file.name}`);
  };

  const generateStudyPlan = () => {
    if (!studyDays || !currentLevel || !targetProgram) {
      toast.error('Please fill days, level, and target program first.');
      return;
    }
    setPlanGenerated(true);
    toast.success('Study plan generated successfully.');
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
          <p className="text-slate-600">Your personal AI tutor for NET preparation</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatPill icon={MessageSquare} label="Smart Doubt Support" />
            <StatPill icon={Upload} label="Question Image Solver" />
            <StatPill icon={Calendar} label="Personal Study Planner" />
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
                  <MessageSquare className="w-5 h-5 text-indigo-500" />
                  Chat with AI Tutor
                </CardTitle>
                <CardDescription>Ask any question about your preparation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[360px] rounded-xl border border-indigo-100 bg-[#fafbff] p-3 pr-4">
                  <div className="space-y-4">
                    {chatMessages.map((msg, index) => (
                      <div
                        key={index}
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

                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ask your question here... e.g., Explain integration by parts"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="min-h-[70px] rounded-xl border-indigo-100 bg-white/95"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        askQuestion();
                      }
                    }}
                  />
                  <Button onClick={askQuestion} className="h-[70px] w-14 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-500 text-white">
                    <Send className="w-4 h-4" />
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
                  <FileQuestion className="w-5 h-5 text-indigo-500" />
                  Question Solver
                </CardTitle>
                <CardDescription>Upload a question image and get step-by-step solution</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border-2 border-dashed border-indigo-200 bg-gradient-to-r from-[#f8f9ff] to-[#eef3ff] p-8 text-center">
                  <Upload className="w-11 h-11 mx-auto mb-3 text-indigo-400" />
                  <p className="mb-1 text-indigo-950">Upload a question image</p>
                  <p className="text-sm text-slate-500 mb-4">Supports JPG, PNG (Max 5MB)</p>
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
                  {uploadedFileName ? <p className="text-xs text-slate-500 mt-3">Selected: {uploadedFileName}</p> : null}
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
                <h3 className="mb-2 text-white">Premium Feature</h3>
                <p className="mb-4 text-emerald-100">
                  Upload unlimited questions and get detailed AI solutions. Upgrade to premium for instant access.
                </p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onNavigate?.('profile');
                    toast.message('Opened Profile so you can manage your plan and account settings.');
                  }}
                >
                  Upgrade to Premium
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
                  <Calendar className="w-5 h-5 text-indigo-500" />
                  Smart Study Planner
                </CardTitle>
                <CardDescription>Generate a personalized plan from your current level</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="test-date">Days Until NET</Label>
                  <Input
                    id="test-date"
                    type="number"
                    placeholder="60"
                    value={studyDays}
                    onChange={(e) => setStudyDays(e.target.value)}
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
                  <Label htmlFor="target-program">Target Program</Label>
                  <Select value={targetProgram} onValueChange={setTargetProgram}>
                    <SelectTrigger id="target-program" className="border-indigo-100">
                      <SelectValue placeholder="Select program" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="engineering">Engineering</SelectItem>
                      <SelectItem value="computing">Computing</SelectItem>
                      <SelectItem value="business">Business Studies</SelectItem>
                      <SelectItem value="applied">Applied Sciences</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button onClick={generateStudyPlan} className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white">
                  Generate Study Plan
                </Button>
              </CardContent>
            </Card>

            {planGenerated && currentLevel && studyDays ? (
              <Card className="rounded-2xl border-indigo-100 bg-white/92">
                <CardHeader className="pb-3">
                  <CardTitle className="text-2xl text-indigo-950">Your {studyDays}-Day Study Plan</CardTitle>
                  <CardDescription>Customized plan based on your selected level and target</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <PlanBlock title="Week 1-2: Foundation" days="Days 1-14" lines={[
                      'Mathematics: Algebra & Functions (4 hours/day)',
                      'Physics: Mechanics (3 hours/day)',
                      'English: Vocabulary building (1 hour/day)',
                    ]} />
                    <PlanBlock title="Week 3-4: Core Topics" days="Days 15-28" lines={[
                      'Mathematics: Calculus & Trigonometry (4 hours/day)',
                      'Physics: Electricity & Waves (3 hours/day)',
                      'English: Grammar & Comprehension (1 hour/day)',
                    ]} />
                    <PlanBlock title="Week 5-6: Advanced & Practice" days="Days 29-42" lines={[
                      'Complete remaining topics (3 hours/day)',
                      'Start topic-wise tests (3 hours/day)',
                      'Review weak areas (2 hours/day)',
                    ]} />
                    <PlanBlock title="Week 7-8: Mock Tests & Revision" days="Days 43-60" lines={[
                      'Full-length mock tests (2 per week)',
                      'Formula revision (2 hours/day)',
                      'Solve previous papers (3 hours/day)',
                    ]} />
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="rounded-2xl border-indigo-100 bg-gradient-to-r from-[#f4f6ff] to-[#eceffd]">
                <CardContent className="flex h-full min-h-[290px] items-center justify-center text-center">
                  <div>
                    <Clock3 className="mx-auto mb-3 h-8 w-8 text-indigo-400" />
                    <p className="text-indigo-950">Complete the form and generate your study plan.</p>
                    <p className="text-sm text-slate-500">Your week-wise roadmap will appear here.</p>
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
        <Badge variant="secondary">{days}</Badge>
      </div>
      <ul className="space-y-1 text-sm text-slate-500">
        {lines.map((line) => (
          <li key={line}>• {line}</li>
        ))}
      </ul>
    </div>
  );
}
