import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Clock, FileText, Flag, MapPin, Play, Target, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { Difficulty, SubjectKey, getSubjectLabel } from '../lib/mcq';

const subjects: SubjectKey[] = ['mathematics', 'physics', 'english'];
const difficulties: Difficulty[] = ['Easy', 'Medium', 'Hard'];

interface TestsProps {
  onNavigate?: (section: string) => void;
}

interface SessionQuestion {
  id: string;
  subject: SubjectKey;
  topic: string;
  question: string;
  options: string[];
  difficulty: Difficulty;
}

interface RunningSession {
  id: string;
  subject: SubjectKey;
  difficulty: Difficulty;
  topic: string;
  mode: 'topic' | 'mock' | 'adaptive';
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  questions: SessionQuestion[];
}

export function Tests({ onNavigate }: TestsProps) {
  const { mcqsBySubjectAndDifficulty, attempts, startTestSession, submitTestSession } = useAppData();

  const [activeSession, setActiveSession] = useState<RunningSession | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    if (!activeSession || remainingSeconds !== 0 || isSubmitting) {
      return;
    }

    void handleSubmitTest(true);
  }, [activeSession, remainingSeconds, isSubmitting]);

  const difficultyTone: Record<Difficulty, string> = {
    Easy: 'bg-indigo-100 text-indigo-700',
    Medium: 'bg-slate-200 text-slate-700',
    Hard: 'bg-rose-100 text-rose-700',
  };

  const topicTests = useMemo(() => {
    return subjects.flatMap((subject) => {
      return difficulties.map((difficulty) => {
        const subjectPool = mcqsBySubjectAndDifficulty[subject][difficulty];
        const topic = subjectPool[0]?.topic ?? 'All Topics';
        const topicPool = subjectPool.filter((item) => item.topic === topic);
        const questions = Math.min(25, Math.max(10, topicPool.length || subjectPool.length || 10));
        const latest = attempts.find(
          (attempt) =>
            attempt.subject === subject &&
            attempt.difficulty === difficulty &&
            attempt.mode === 'topic' &&
            attempt.topic === topic,
        );

        return {
          id: `${subject}-${difficulty}-${topic}`,
          subject,
          topic,
          difficulty,
          questions,
          duration: Math.max(10, Math.round(questions * 1.2)),
          latest,
        };
      });
    });
  }, [attempts, mcqsBySubjectAndDifficulty]);

  const mockTests = useMemo(() => {
    return [1, 2, 3, 4].map((number) => {
      const latest = attempts.find((attempt) => attempt.mode === 'mock' && attempt.topic === 'Full Mock');
      return {
        number,
        name: `Full NET Engineering Mock #${number}`,
        questions: 200,
        duration: 180,
        latest,
        subjects: ['Math: 100', 'Physics: 60', 'English: 40'],
      };
    });
  }, [attempts]);

  const activeQuestion = activeSession?.questions[currentIndex] || null;

  const answeredCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.questions.filter((question) => answers[question.id]).length;
  }, [activeSession, answers]);

  const reviewCount = useMemo(() => {
    if (!activeSession) return 0;
    return activeSession.questions.filter((question) => markedForReview[question.id]).length;
  }, [activeSession, markedForReview]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const beginSession = async (params: {
    subject: SubjectKey;
    difficulty: Difficulty;
    topic: string;
    mode: 'topic' | 'mock' | 'adaptive';
    questionCount: number;
  }) => {
    try {
      const session = await startTestSession(params);
      setActiveSession({
        id: session.id,
        subject: session.subject,
        difficulty: session.difficulty,
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
      toast.success('Test session started.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start test session.');
    }
  };

  const startTopicTest = async (subject: SubjectKey, difficulty: Difficulty, topic: string, questionCount: number) => {
    await beginSession({ subject, difficulty, topic, mode: 'topic', questionCount });
  };

  const startMockTest = async () => {
    await beginSession({
      subject: 'mathematics',
      difficulty: 'Medium',
      topic: 'Full Mock',
      mode: 'mock',
      questionCount: 200,
    });
  };

  const startAdaptive = async (subject: SubjectKey) => {
    const subjectAttempts = attempts.filter((attempt) => attempt.subject === subject);
    const average = subjectAttempts.length
      ? subjectAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / subjectAttempts.length
      : 60;

    const targetDifficulty: Difficulty = average >= 80 ? 'Hard' : average >= 65 ? 'Medium' : 'Easy';
    await beginSession({
      subject,
      difficulty: targetDifficulty,
      topic: 'All Topics',
      mode: 'adaptive',
      questionCount: 20,
    });
  };

  const handleSubmitTest = async (autoSubmitted = false) => {
    if (!activeSession || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const elapsedSeconds = Math.max(1, activeSession.durationMinutes * 60 - remainingSeconds);
      const payload = activeSession.questions.map((question) => ({
        questionId: question.id,
        selectedOption: answers[question.id] ?? null,
      }));

      const attempt = await submitTestSession({
        sessionId: activeSession.id,
        answers: payload,
        elapsedSeconds,
      });

      setActiveSession(null);
      setCurrentIndex(0);
      setAnswers({});
      setMarkedForReview({});
      setRemainingSeconds(0);
      setIsSubmitting(false);

      if (autoSubmitted) {
        toast.message(`Time up. Auto-submitted with score ${attempt.score}%.`);
      } else {
        toast.success(`Test submitted. Score: ${attempt.score}%`);
      }

      onNavigate?.('analytics');
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : 'Could not submit test.');
    }
  };

  if (activeSession && activeQuestion) {
    return (
      <div className="space-y-4">
        <Card className="rounded-2xl border-indigo-100 bg-white/95">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-indigo-950">{activeSession.mode === 'mock' ? 'Mock Test Runner' : 'Test Runner'}</CardTitle>
                <CardDescription>
                  {activeSession.questionCount} Questions • {activeSession.durationMinutes} Minutes • Negative Marking: 0
                </CardDescription>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-700">
                <Clock className="h-4 w-4" />
                <span className="font-semibold">{formatTime(remainingSeconds)}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_290px]">
              <div className="space-y-4">
                <Card className="border-indigo-100">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-3">
                      <Badge variant="outline">Question {currentIndex + 1} / {activeSession.questionCount}</Badge>
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant={markedForReview[activeQuestion.id] ? 'default' : 'outline'}
                          className="h-8"
                          onClick={() => {
                            setMarkedForReview((prev) => ({
                              ...prev,
                              [activeQuestion.id]: !prev[activeQuestion.id],
                            }));
                          }}
                        >
                          <Flag className="mr-1 h-3.5 w-3.5" />
                          {markedForReview[activeQuestion.id] ? 'Marked' : 'Mark Review'}
                        </Button>
                      </div>
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
                          onClick={() => {
                            setAnswers((prev) => ({ ...prev, [activeQuestion.id]: option }));
                          }}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                            selected
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                              : 'border-indigo-100 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <span className="mr-2 text-slate-500">{String.fromCharCode(65 + idx)}.</span>
                          {option}
                        </button>
                      );
                    })}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    disabled={currentIndex === 0}
                    onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  >
                    Previous
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => void handleSubmitTest(false)} disabled={isSubmitting}>
                      Submit Test
                    </Button>
                    <Button
                      onClick={() => setCurrentIndex((prev) => Math.min(activeSession.questionCount - 1, prev + 1))}
                      disabled={currentIndex >= activeSession.questionCount - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>

              <Card className="h-fit border-indigo-100 bg-white">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Question Palette</CardTitle>
                  <CardDescription>
                    Answered: {answeredCount} • Review: {reviewCount}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {activeSession.questions.map((question, index) => {
                      const answered = Boolean(answers[question.id]);
                      const review = Boolean(markedForReview[question.id]);
                      const active = index === currentIndex;

                      const tone = active
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : review
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : answered
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : 'bg-white text-slate-700 border-slate-200';

                      return (
                        <button
                          key={question.id}
                          type="button"
                          onClick={() => setCurrentIndex(index)}
                          className={`h-8 rounded-md border text-xs ${tone}`}
                        >
                          {index + 1}
                        </button>
                      );
                    })}
                  </div>
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>Green: answered</p>
                    <p>Yellow: marked for review</p>
                    <p>Blue: current</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">Run timed, server-backed sessions with saved results and analytics sync</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <TopMetaChip text="Topic-Wise Tests" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="Mock Tests" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="Adaptive" tone="from-indigo-100 to-violet-100" />
        <TopMetaChip text="200 Questions" subtext="180 Minutes" icon={Clock} />
        <TopMetaChip text="NUST Centers" subtext="Computer-Based" icon={MapPin} />
      </div>

      <Tabs defaultValue="topic" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 !bg-white/80 !border-indigo-100">
          <TabsTrigger value="topic">Topic-Wise Tests</TabsTrigger>
          <TabsTrigger value="mock">Mock Tests</TabsTrigger>
          <TabsTrigger value="adaptive">Adaptive</TabsTrigger>
        </TabsList>

        <TabsContent value="topic" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Topic-Wise Tests
              </CardTitle>
              <CardDescription>Run timed tests from your MCQ bank and save every attempt</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {topicTests.map((test) => (
                  <div key={test.id} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <h4 className="text-lg text-indigo-950">{test.topic}</h4>
                        <p className="text-slate-500">{getSubjectLabel(test.subject)}</p>
                      </div>
                      <div className="flex gap-1">
                        <span className={`rounded-md px-2 py-0.5 text-xs ${difficultyTone[test.difficulty]}`}>{test.difficulty}</span>
                        {test.latest ? <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Done</span> : null}
                      </div>
                    </div>

                    <div className="mb-4 flex items-center gap-4 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1"><FileText className="h-4 w-4" />{test.questions} Questions</span>
                      <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{test.duration} minute</span>
                    </div>

                    <Button
                      className="w-full rounded-lg bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                      onClick={() => void startTopicTest(test.subject, test.difficulty, test.topic, test.questions)}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Start Test
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mock" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Full-Length Mock Tests
              </CardTitle>
              <CardDescription>Simulate full exam pacing with real timer and answer submission</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {mockTests.map((test) => (
                  <div key={test.number} className="rounded-xl border border-indigo-100 bg-white p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="mb-2">{test.name}</h4>
                        <div className="mb-2 flex flex-wrap gap-2">
                          {test.subjects.map((subject) => (
                            <Badge key={subject} variant="outline" className="text-xs">
                              {subject}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {test.latest ? (
                        <div className="text-right">
                          <div className="mb-1 text-2xl">{test.latest.score}%</div>
                          <p className="text-xs text-muted-foreground">Latest Score</p>
                        </div>
                      ) : null}
                    </div>

                    <div className="mb-3 flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        {test.questions} Questions
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {test.duration} mins
                      </span>
                    </div>

                    {test.latest ? (
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            onNavigate?.('analytics');
                            toast.message(`${test.name} report opened in Analytics.`);
                          }}
                        >
                          View Report
                        </Button>
                        <Button onClick={() => void startMockTest()}>Retake Test</Button>
                      </div>
                    ) : (
                      <Button className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white" onClick={() => void startMockTest()}>
                        <Play className="mr-2 h-4 w-4" />
                        Start Mock Test
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-6">
              <h4 className="mb-2 flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-500" />
                Mock Test Rules
              </h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Total Questions: 200</li>
                <li>• Total Duration: 180 minutes</li>
                <li>• Negative Marking: 0</li>
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adaptive" className="space-y-4">
          <Card className="rounded-2xl border-indigo-100 bg-white/92">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Adaptive Practice
              </CardTitle>
              <CardDescription>Difficulty adjusts based on your historical performance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {subjects.map((subject) => {
                  const subjectAttempts = attempts.filter((attempt) => attempt.subject === subject);
                  const average = subjectAttempts.length
                    ? Math.round(subjectAttempts.reduce((sum, attempt) => sum + attempt.score, 0) / subjectAttempts.length)
                    : 0;

                  return (
                    <div key={subject} className="rounded-lg border border-indigo-100 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <h4>{getSubjectLabel(subject)} Adaptive Set</h4>
                          <p className="text-sm text-muted-foreground">20 Questions • Dynamic Difficulty</p>
                        </div>
                        <Badge className="bg-orange-500">Recommended</Badge>
                      </div>
                      <div className="mb-3 text-sm text-muted-foreground">
                        Current average: {average ? `${average}%` : 'No attempts yet'}
                      </div>
                      <Button className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white" onClick={() => void startAdaptive(subject)}>
                        <Play className="mr-2 h-4 w-4" />
                        Start Adaptive Test
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TopMetaChip({
  text,
  subtext,
  tone,
  icon: Icon,
}: {
  text: string;
  subtext?: string;
  tone?: string;
  icon?: typeof Clock;
}) {
  return (
    <div className={`inline-flex h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-gradient-to-r px-3 ${tone || 'from-white to-white'}`}>
      {Icon ? <Icon className="h-4 w-4 text-indigo-500" /> : null}
      <span className="text-sm font-medium text-slate-700">{text}</span>
      {subtext ? <span className="text-xs text-slate-400">{subtext}</span> : null}
    </div>
  );
}
