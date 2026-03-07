import { useEffect, useMemo, useState } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import {
  ArrowRight,
  Brain,
  Building2,
  CheckCircle2,
  Clock,
  FlaskConical,
  Flag,
  Layers,
  Play,
  Ruler,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { SubjectKey } from '../lib/mcq';

interface TestsProps {
  onNavigate?: (section: string) => void;
}

type TestKind = 'subject-wise' | 'full-mock' | 'adaptive';

interface NetDistributionItem {
  label: string;
  percentage: number;
  mcqs: number;
  sourceSubjects: SubjectKey[];
}

interface NetTypeProfile {
  id: string;
  name: string;
  description: string;
  short: string;
  icon: typeof Building2;
  gradient: string;
  distribution: NetDistributionItem[];
  totalQuestions: number;
  durationMinutes: number;
}

interface SessionQuestion {
  id: string;
  subject: SubjectKey;
  topic: string;
  question: string;
  options: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface RunningSession {
  id: string;
  topic: string;
  mode: 'topic' | 'mock' | 'adaptive';
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  questions: SessionQuestion[];
}

const NET_PROFILES: NetTypeProfile[] = [
  {
    id: 'net-engineering',
    name: 'NET Engineering',
    short: 'Engineering + Computing',
    description: 'For engineering and computing applicants with mathematics-heavy distribution.',
    icon: Building2,
    gradient: 'from-violet-600 to-indigo-500',
    totalQuestions: 200,
    durationMinutes: 180,
    distribution: [
      { label: 'Mathematics', percentage: 50, mcqs: 100, sourceSubjects: ['mathematics'] },
      { label: 'Physics', percentage: 30, mcqs: 60, sourceSubjects: ['physics'] },
      { label: 'English', percentage: 20, mcqs: 40, sourceSubjects: ['english'] },
    ],
  },
  {
    id: 'net-applied-sciences',
    name: 'NET Applied Sciences',
    short: 'Pre-Medical Track',
    description: 'For applied sciences aspirants with biology and chemistry focus.',
    icon: FlaskConical,
    gradient: 'from-emerald-600 to-teal-500',
    totalQuestions: 200,
    durationMinutes: 180,
    distribution: [
      { label: 'Biology', percentage: 50, mcqs: 100, sourceSubjects: ['biology'] },
      { label: 'Chemistry', percentage: 30, mcqs: 60, sourceSubjects: ['chemistry'] },
      { label: 'English', percentage: 20, mcqs: 40, sourceSubjects: ['english'] },
    ],
  },
  {
    id: 'net-business-social-sciences',
    name: 'NET Business & Social Sciences',
    short: 'Business + Social Sciences',
    description: 'Balanced quantitative and language profile for business/social admissions.',
    icon: TrendingUp,
    gradient: 'from-pink-600 to-rose-500',
    totalQuestions: 200,
    durationMinutes: 180,
    distribution: [
      { label: 'Quantitative Mathematics', percentage: 50, mcqs: 100, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, mcqs: 100, sourceSubjects: ['english'] },
    ],
  },
  {
    id: 'net-architecture',
    name: 'NET Architecture',
    short: 'Design Aptitude + Math',
    description: 'Architecture stream with design aptitude emphasis and mathematical foundation.',
    icon: Ruler,
    gradient: 'from-amber-500 to-orange-500',
    totalQuestions: 200,
    durationMinutes: 180,
    distribution: [
      { label: 'Design Aptitude', percentage: 50, mcqs: 100, sourceSubjects: ['mathematics', 'physics', 'english'] },
      { label: 'Mathematics', percentage: 30, mcqs: 60, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 20, mcqs: 40, sourceSubjects: ['english'] },
    ],
  },
  {
    id: 'net-natural-sciences',
    name: 'NET Natural Sciences',
    short: 'Alternative Academic Stream',
    description: 'For candidates whose academic background does not match standard streams.',
    icon: Sparkles,
    gradient: 'from-cyan-600 to-sky-500',
    totalQuestions: 200,
    durationMinutes: 180,
    distribution: [
      { label: 'Mathematics', percentage: 50, mcqs: 100, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, mcqs: 100, sourceSubjects: ['english'] },
    ],
  },
];

const TEST_TYPE_CARDS: Array<{
  id: TestKind;
  title: string;
  icon: typeof Layers;
  description: string;
  bullets: string[];
  buttonLabel: string;
}> = [
  {
    id: 'subject-wise',
    title: 'Subject-Wise Test',
    icon: Layers,
    description: 'Practice a single subject with profile-based question count.',
    bullets: [
      'Single-subject precision practice',
      'Aligned to selected NET type distribution',
      'Best for focused revision sessions',
    ],
    buttonLabel: 'Start Subject-Wise',
  },
  {
    id: 'full-mock',
    title: 'Full Mock Test',
    icon: Target,
    description: 'Simulate the complete NUST NET with exact duration and distribution.',
    bullets: [
      '200 questions and 180 minutes',
      'Real exam-style pacing and navigation',
      'Auto-submit on timer completion',
    ],
    buttonLabel: 'Start Full Mock',
  },
  {
    id: 'adaptive',
    title: 'Adaptive Test',
    icon: Brain,
    description: 'Dynamic question flow emphasizing weak areas and progressive difficulty.',
    bullets: [
      '40% weak-area focus',
      '40% medium reinforcement',
      '20% advanced challenge set',
    ],
    buttonLabel: 'Start Adaptive',
  },
];

export function Tests({ onNavigate }: TestsProps) {
  const { attempts, startTestSession, submitTestSession } = useAppData();

  const [selectedNetTypeId, setSelectedNetTypeId] = useState<string | null>(null);
  const [selectedTestKind, setSelectedTestKind] = useState<TestKind | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('mathematics');

  const [activeSession, setActiveSession] = useState<RunningSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedNetType = useMemo(
    () => NET_PROFILES.find((profile) => profile.id === selectedNetTypeId) || null,
    [selectedNetTypeId],
  );

  const step = useMemo(() => {
    if (!selectedNetType) return 1;
    if (!selectedTestKind) return 2;
    return 3;
  }, [selectedNetType, selectedTestKind]);

  useEffect(() => {
    if (!activeSession || remainingSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [activeSession, remainingSeconds]);

  useEffect(() => {
    if (!activeSession || remainingSeconds !== 0 || isSubmitting) return;
    void handleSubmit(true);
  }, [activeSession, remainingSeconds, isSubmitting]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const activeQuestion = activeSession?.questions[currentIndex] || null;

  const answeredCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.questions.filter((q) => answers[q.id]).length;
  }, [activeSession, answers]);

  const reviewCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.questions.filter((q) => markedForReview[q.id]).length;
  }, [activeSession, markedForReview]);

  const recentAverage = useMemo(() => {
    if (!attempts.length) return 0;
    return Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length);
  }, [attempts]);

  const subjectOptions = useMemo(() => {
    if (!selectedNetType) return [];
    const map = new Map<SubjectKey, string>();
    selectedNetType.distribution.forEach((item) => {
      if (item.sourceSubjects.length === 1) {
        map.set(item.sourceSubjects[0], item.label);
      }
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [selectedNetType]);

  useEffect(() => {
    if (subjectOptions.length) {
      setSelectedSubject(subjectOptions[0].key);
    }
  }, [subjectOptions]);

  const beginTest = async (kind: TestKind) => {
    if (!selectedNetType) {
      toast.error('Select a NET type first.');
      return;
    }

    try {
      const mode = kind === 'full-mock' ? 'mock' : kind === 'adaptive' ? 'adaptive' : 'topic';
      const defaultDifficulty = kind === 'adaptive' ? 'Medium' : 'Medium';
      const directSubjectDistribution = selectedNetType.distribution.find(
        (item) => item.sourceSubjects.length === 1 && item.sourceSubjects[0] === selectedSubject,
      );
      const questionCount = kind === 'full-mock'
        ? selectedNetType.totalQuestions
        : kind === 'subject-wise'
          ? (directSubjectDistribution?.mcqs || 60)
          : 60;

      const session = await startTestSession({
        subject: selectedSubject,
        difficulty: defaultDifficulty,
        topic: kind === 'full-mock' ? `${selectedNetType.name} Full Mock` : kind === 'adaptive' ? 'Adaptive Flow' : 'Subject Focus',
        mode,
        questionCount,
        netType: selectedNetType.id,
        testType: kind,
        selectedSubject,
      });

      setActiveSession({
        id: session.id,
        topic: session.topic,
        mode: session.mode,
        questionCount: session.questionCount,
        durationMinutes: session.durationMinutes,
        startedAt: session.startedAt,
        questions: session.questions,
      });
      setCurrentIndex(0);
      setAnswers({});
      setMarkedForReview({});
      setRemainingSeconds(session.durationMinutes * 60);
      toast.success('Test started successfully.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start test.');
    }
  };

  const handleSubmit = async (auto = false) => {
    if (!activeSession || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload = activeSession.questions.map((question) => ({
        questionId: question.id,
        selectedOption: answers[question.id] ?? null,
      }));

      const attempt = await submitTestSession({
        sessionId: activeSession.id,
        answers: payload,
        elapsedSeconds: Math.max(1, activeSession.durationMinutes * 60 - remainingSeconds),
      });

      setIsSubmitting(false);
      setActiveSession(null);
      setCurrentIndex(0);
      setAnswers({});
      setMarkedForReview({});
      setRemainingSeconds(0);

      if (auto) {
        toast.message(`Time ended. Auto-submitted with ${attempt.score}% score.`);
      } else {
        toast.success(`Submitted successfully. Score: ${attempt.score}%`);
      }

      onNavigate?.('analytics');
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : 'Submission failed.');
    }
  };

  if (activeSession && activeQuestion) {
    const progress = Math.round(((currentIndex + 1) / activeSession.questionCount) * 100);

    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_14px_30px_rgba(94,109,201,0.12)]">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-indigo-950">Real Exam Simulator</CardTitle>
                <CardDescription>{activeSession.topic} • {activeSession.questionCount} questions • Negative Marking: 0</CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">{formatTime(remainingSeconds)}</span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-indigo-100">
              <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${progress}%` }} />
            </div>
          </CardHeader>

          <CardContent className="grid gap-4 xl:grid-cols-[260px_1fr]">
            <Card className="h-fit border-indigo-100 bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Question Palette</CardTitle>
                <CardDescription>Answered {answeredCount} • Review {reviewCount}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-5 gap-2">
                  {activeSession.questions.map((question, index) => {
                    const isActive = index === currentIndex;
                    const isAnswered = Boolean(answers[question.id]);
                    const isReview = Boolean(markedForReview[question.id]);
                    const tone = isActive
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : isReview
                        ? 'bg-amber-100 border-amber-200 text-amber-800'
                        : isAnswered
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
                          : 'bg-white border-slate-200 text-slate-700';

                    return (
                      <button
                        key={question.id}
                        type="button"
                        onClick={() => setCurrentIndex(index)}
                        className={`h-8 rounded-md border text-xs transition ${tone}`}
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-1 text-xs text-slate-500">
                  <p>Green: Answered</p>
                  <p>Yellow: Marked for Review</p>
                  <p>Blue: Current Question</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-100 bg-white">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">Question {currentIndex + 1} / {activeSession.questionCount}</Badge>
                  <Button
                    variant={markedForReview[activeQuestion.id] ? 'default' : 'outline'}
                    className="h-8"
                    onClick={() => {
                      setMarkedForReview((prev) => ({ ...prev, [activeQuestion.id]: !prev[activeQuestion.id] }));
                    }}
                  >
                    <Flag className="mr-1 h-3.5 w-3.5" />
                    {markedForReview[activeQuestion.id] ? 'Marked' : 'Mark for review'}
                  </Button>
                </div>
                <CardTitle className="text-base leading-relaxed text-slate-800">{activeQuestion.question}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {activeQuestion.options.map((option, idx) => {
                  const selected = answers[activeQuestion.id] === option;
                  return (
                    <button
                      key={`${activeQuestion.id}-${idx}`}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [activeQuestion.id]: option }))}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-indigo-100 bg-white hover:bg-slate-50'}`}
                    >
                      <span className="mr-2 text-slate-500">{String.fromCharCode(65 + idx)}.</span>
                      {option}
                    </button>
                  );
                })}

                <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
                  <Button variant="outline" disabled={currentIndex === 0} onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}>
                    Previous
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void handleSubmit(false)} disabled={isSubmitting}>Submit Test</Button>
                    <Button
                      onClick={() => setCurrentIndex((prev) => Math.min(activeSession.questionCount - 1, prev + 1))}
                      disabled={currentIndex >= activeSession.questionCount - 1}
                      className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">A step-based professional simulator for NUST NET preparation</p>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/90 shadow-[0_14px_30px_rgba(94,109,201,0.10)]">
        <CardContent className="pt-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <StepPill active={step >= 1} done={step > 1} title="Step 1" subtitle="Select NET Type" />
            <StepPill active={step >= 2} done={step > 2} title="Step 2" subtitle="Subjects & Distribution" />
            <StepPill active={step >= 3} done={false} title="Step 3" subtitle="Choose Test Type" />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-md bg-indigo-50 px-2 py-1">Recent Avg: {recentAverage || 0}%</span>
            <span className="rounded-md bg-indigo-50 px-2 py-1">Questions: 200</span>
            <span className="rounded-md bg-indigo-50 px-2 py-1">Duration: 180 mins</span>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg text-indigo-950">Step 1: NET Type Selection</h2>
          {selectedNetType ? <Badge className="bg-emerald-500">Selected: {selectedNetType.name}</Badge> : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NET_PROFILES.map((profile) => {
            const Icon = profile.icon;
            const selected = selectedNetTypeId === profile.id;
            return (
              <Card
                key={profile.id}
                className={`group rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(93,109,201,0.14)] ${selected ? 'border-indigo-300 bg-indigo-50/40' : 'border-indigo-100 bg-white/95'}`}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r text-white ${profile.gradient}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <Badge variant="outline">{profile.totalQuestions} Q</Badge>
                  </div>
                  <CardTitle className="text-indigo-950">{profile.name}</CardTitle>
                  <CardDescription>{profile.short}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-slate-600">{profile.description}</p>
                  <Button
                    className={`w-full ${selected ? 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white' : ''}`}
                    variant={selected ? 'default' : 'outline'}
                    onClick={() => {
                      setSelectedNetTypeId(profile.id);
                      setSelectedTestKind(null);
                    }}
                  >
                    {selected ? 'Selected' : 'Select'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {selectedNetType ? (
        <section className="space-y-3">
          <h2 className="text-lg text-indigo-950">Step 2: Subjects & Distribution</h2>
          <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_12px_26px_rgba(93,109,201,0.10)]">
            <CardHeader>
              <CardTitle>{selectedNetType.name} Distribution</CardTitle>
              <CardDescription>{selectedNetType.totalQuestions} Questions • {selectedNetType.durationMinutes} Minutes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {selectedNetType.distribution.map((item) => (
                  <div key={`${selectedNetType.id}-${item.label}`} className="rounded-xl border border-indigo-100 bg-slate-50/60 p-3">
                    <div className="mb-1 flex items-center justify-between text-sm text-slate-700">
                      <span>{item.label}</span>
                      <span>{item.percentage}% • {item.mcqs} MCQs</span>
                    </div>
                    <div className="h-2 rounded-full bg-indigo-100">
                      <div className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${item.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <StatCard title="Total Questions" value={String(selectedNetType.totalQuestions)} />
                <StatCard title="Time Limit" value={`${selectedNetType.durationMinutes} Minutes`} />
                <StatCard title="Negative Marking" value="0" />
              </div>

              <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-sm text-indigo-900">
                <ArrowRight className="h-4 w-4" />
                Continue to Step 3 to select your test mode.
              </div>
            </CardContent>
          </Card>
        </section>
      ) : null}

      {selectedNetType ? (
        <section className="space-y-3">
          <h2 className="text-lg text-indigo-950">Step 3: Test Type Selection</h2>

          {selectedTestKind === 'subject-wise' ? (
            <Card className="rounded-xl border-indigo-100 bg-white">
              <CardContent className="pt-4">
                <p className="mb-2 text-sm text-slate-600">Choose subject for subject-wise generation:</p>
                <div className="flex flex-wrap gap-2">
                  {subjectOptions.map((item) => (
                    <Button
                      key={item.key}
                      variant={selectedSubject === item.key ? 'default' : 'outline'}
                      className={selectedSubject === item.key ? 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white' : ''}
                      onClick={() => setSelectedSubject(item.key)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            {TEST_TYPE_CARDS.map((card) => {
              const Icon = card.icon;
              const selected = selectedTestKind === card.id;
              return (
                <Card
                  key={card.id}
                  className={`rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${selected ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_14px_26px_rgba(93,109,201,0.14)]' : 'border-indigo-100 bg-white/95 hover:shadow-[0_14px_26px_rgba(93,109,201,0.10)]'}`}
                >
                  <CardHeader className="pb-2">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 text-white">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-indigo-950">{card.title}</CardTitle>
                    <CardDescription>{card.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <ul className="space-y-1.5 text-sm text-slate-600">
                      {card.bullets.map((line) => (
                        <li key={line} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setSelectedTestKind(card.id)}>Select</Button>
                      <Button
                        className="flex-1 bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                        onClick={() => {
                          setSelectedTestKind(card.id);
                          void beginTest(card.id);
                        }}
                      >
                        <Play className="mr-1.5 h-4 w-4" />
                        {card.buttonLabel}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function StepPill({ active, done, title, subtitle }: { active: boolean; done: boolean; title: string; subtitle: string }) {
  return (
    <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 ${active ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-indigo-100 bg-white text-slate-500'}`}>
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-600'}`}>
        {done ? '✓' : title.replace('Step ', '')}
      </span>
      <span>
        <span className="block text-xs font-semibold">{title}</span>
        <span className="block text-xs">{subtitle}</span>
      </span>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-indigo-100 bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-indigo-950">{value}</p>
    </div>
  );
}
