import { useEffect, useMemo, useState, useRef } from 'react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import {
  Brain,
  Building2,
  CheckCircle2,
  FlaskConical,
  Layers,
  Loader2,
  Play,
  Ruler,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { apiRequest, resolveLaunchAuthToken } from '../lib/api';
import { bearerForLaunchUrl, readPersistedStudentAccessToken } from '../lib/authSession';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';

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

interface AdaptiveRecommendationPayload {
  recommendation: {
    level: string;
    strengths: string[];
    weaknesses: string[];
    averageScore: number;
    averageSecondsPerQuestion: number;
  };
  mcqs: Array<{
    id: string;
    subject: SubjectKey;
    topic: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
  }>;
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
      { label: 'Quantitative Mathematics & Intelligence', percentage: 50, mcqs: 100, sourceSubjects: ['quantitative-mathematics', 'intelligence'] },
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
      { label: 'Design Aptitude', percentage: 50, mcqs: 100, sourceSubjects: ['design-aptitude'] },
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
}> = [
  {
    id: 'subject-wise',
    title: 'Subject-Wise Test',
    icon: Layers,
    description: 'Practice a single subject with profile-based question count.',
    bullets: [
      'Single-subject precision practice',
      'Aligned to selected NET type distribution',
      'Uses question bank for targeted revision',
    ],
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
  },
  {
    id: 'adaptive',
    title: 'Adaptive Test',
    icon: Brain,
    description: 'Dynamic question flow emphasizing weak areas and progressive difficulty.',
    bullets: [
      '40% weak-topic focus',
      '40% medium reinforcement',
      '20% advanced challenge set',
    ],
  },
];

export function Tests({ onNavigate }: TestsProps) {
  const { attempts, startTestSession } = useAppData();
  const { token } = useAuth();

  const [selectedNetTypeId, setSelectedNetTypeId] = useState<string | null>(null);
  const [selectedTestKind, setSelectedTestKind] = useState<TestKind | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('mathematics');
  const [launchingKind, setLaunchingKind] = useState<TestKind | null>(null);
  const [subjectPickerOpen, setSubjectPickerOpen] = useState(false);
  const [adaptiveRecommendation, setAdaptiveRecommendation] = useState<AdaptiveRecommendationPayload | null>(null);
  const [adaptiveLoading, setAdaptiveLoading] = useState(false);

  const launchingRef = useRef(false);

  const resolveLaunchToken = async () => resolveLaunchAuthToken(token);

  const selectedNetType = useMemo(
    () => NET_PROFILES.find((profile) => profile.id === selectedNetTypeId) || null,
    [selectedNetTypeId],
  );

  const recentAverage = useMemo(() => {
    if (!attempts.length) return 0;
    return Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / attempts.length);
  }, [attempts]);

  const subjectOptions = useMemo(() => {
    if (!selectedNetType) return [];
    const map = new Map<SubjectKey, string>();
    selectedNetType.distribution.forEach((item) => {
      item.sourceSubjects.forEach((subject) => {
        map.set(subject, getSubjectLabel(subject));
      });
    });
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [selectedNetType]);

  useEffect(() => {
    if (subjectOptions.length) {
      setSelectedSubject(subjectOptions[0].key);
    }
  }, [subjectOptions]);

  const openExamWindow = (params: { sessionId: string; testType: TestKind; token: string; examWindow: Window | null }) => {
    const { sessionId, testType, token: authToken, examWindow } = params;
    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const urlAuth = bearerForLaunchUrl(authToken);

    // Fallback handoff in case query params are stripped or navigation races in popup.
    localStorage.setItem(
      'net360-exam-launch',
      JSON.stringify({
        sessionId,
        testType,
        ...(urlAuth ? { authToken: urlAuth } : {}),
        launchedAt: Date.now(),
      }),
    );

    const url = urlAuth
      ? `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=${encodeURIComponent(testType)}&authToken=${encodeURIComponent(urlAuth)}`
      : `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=${encodeURIComponent(testType)}`;

    if (isNativeRuntime) {
      // Android WebView commonly blocks popup windows, so navigate in the same view.
      window.location.href = url;
      return;
    }

    if (!examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      return;
    }

    examWindow.location.href = url;
  };

  const beginTest = async (
    kind: TestKind,
    subjectOverride?: SubjectKey,
    questionCountOverride?: number,
    topicOverride?: string,
  ) => {
    if (!selectedNetType) {
      toast.error('Select a NET type first.');
      launchingRef.current = false;
      return;
    }

    launchingRef.current = true;

    const authToken = await resolveLaunchToken();
    if (!authToken) {
      toast.error('Please login first to start a test. Redirecting to login...');
      onNavigate?.('profile');
      launchingRef.current = false;
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

    // Open a blank window first so /exam-interface never loads without sessionId (avoids missing-ID flash).
    const examWindow = isNativeRuntime ? null : window.open('about:blank', '_blank', 'width=1400,height=900');
    if (!isNativeRuntime && !examWindow) {
      toast.error('Popup blocked. Please allow popups and try again.');
      launchingRef.current = false;
      return;
    }

    try {
      setLaunchingKind(kind);
      const mode = kind === 'full-mock' ? 'mock' : kind === 'adaptive' ? 'adaptive' : 'topic';
      const subjectToUse = subjectOverride || selectedSubject;
      const directSubjectDistribution = selectedNetType.distribution.find(
        (item) => item.sourceSubjects.length === 1 && item.sourceSubjects[0] === subjectToUse,
      );

      const questionCount =
        typeof questionCountOverride === 'number' && questionCountOverride > 0
          ? questionCountOverride
          : kind === 'full-mock'
          ? selectedNetType.totalQuestions
          : kind === 'subject-wise'
            ? (directSubjectDistribution?.mcqs || 60)
            : 60;

      const session = await startTestSession({
        subject: subjectToUse,
        difficulty: 'Medium',
        topic:
          topicOverride || (kind === 'full-mock'
            ? `${selectedNetType.name} Full Mock`
            : kind === 'adaptive'
              ? 'Adaptive Flow'
              : 'Subject Focus'),
        mode,
        questionCount,
        netType: selectedNetType.id,
        testType: kind,
        selectedSubject: subjectToUse,
      });

      openExamWindow({ sessionId: session.id, testType: kind, token: authToken, examWindow });
      toast.success(isNativeRuntime ? 'Test launched.' : 'Test launched in a new window.');
    } catch (error) {
      examWindow?.close();
      console.error('Test start error:', error);
      const msg = error instanceof Error ? error.message : '';
      if (/login|authentication|Missing authentication|sign in/i.test(msg)) {
        toast.error('Please sign in to start a test.');
        onNavigate?.('profile');
      } else {
        toast.error('Could not start your test. Please try again.');
      }
    } finally {
      setLaunchingKind(null);
      launchingRef.current = false;
    }
  };

  const handleStartTestClick = (kind: TestKind) => {
    if (launchingRef.current) return;
    launchingRef.current = true;
    setSelectedTestKind(kind);
    if (kind === 'subject-wise') {
      setSubjectPickerOpen(true);
      launchingRef.current = false;
      return;
    }
    void beginTest(kind);
  };

  useEffect(() => {
    if (!selectedNetType) {
      setAdaptiveRecommendation(null);
      return;
    }

    const authToken = token || readPersistedStudentAccessToken();
    if (!authToken) {
      setAdaptiveRecommendation(null);
      return;
    }

    const preferredSubject = subjectOptions[0]?.key || selectedSubject;
    let cancelled = false;

    const loadAdaptiveRecommendation = async () => {
      setAdaptiveLoading(true);
      try {
        const payload = await apiRequest<AdaptiveRecommendationPayload>(
          `/api/recommendations/adaptive?questionCount=24&subject=${encodeURIComponent(preferredSubject)}`,
          {},
          authToken,
        );
        if (!cancelled) {
          setAdaptiveRecommendation(payload);
        }
      } catch {
        if (!cancelled) {
          setAdaptiveRecommendation(null);
        }
      } finally {
        if (!cancelled) {
          setAdaptiveLoading(false);
        }
      }
    };

    void loadAdaptiveRecommendation();

    return () => {
      cancelled = true;
    };
  }, [selectedNetType, selectedSubject, subjectOptions, token]);

  const recommendedSubjectBreakdown = useMemo(() => {
    if (!adaptiveRecommendation?.mcqs?.length) return [];
    const map = new Map<SubjectKey, number>();
    adaptiveRecommendation.mcqs.forEach((item) => {
      map.set(item.subject, Number(map.get(item.subject) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([subject, count]) => ({ subject, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [adaptiveRecommendation]);

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <h1>Practice & Mock Tests</h1>
        <p className="text-muted-foreground">A step-based professional simulator for NUST NET preparation</p>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/90 shadow-[0_14px_30px_rgba(94,109,201,0.10)]">
        <CardContent className="pt-5">
          <div className="grid gap-2 sm:grid-cols-3">
            <StepPill active title="Step 1" subtitle="Select NET Type" done={Boolean(selectedNetType)} />
            <StepPill active={Boolean(selectedNetType)} title="Step 2" subtitle="Subjects & Distribution" done={Boolean(selectedNetType)} />
            <StepPill active={Boolean(selectedNetType)} title="Step 3" subtitle="Choose Test Type" done={false} />
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

        {!selectedNetType ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {NET_PROFILES.map((profile) => {
              const Icon = profile.icon;
              return (
                <Card
                  key={profile.id}
                  className="group rounded-2xl border border-indigo-100 bg-white/95 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_28px_rgba(93,109,201,0.14)]"
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
                      className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                      onClick={() => {
                        setSelectedNetTypeId(profile.id);
                        setSelectedTestKind(null);
                      }}
                    >
                      Select
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="w-full max-w-2xl rounded-2xl border-indigo-200 bg-indigo-50/40 shadow-[0_12px_26px_rgba(93,109,201,0.12)]">
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <CardTitle className="text-indigo-950">{selectedNetType.name}</CardTitle>
                <Button
                  variant="outline"
                  className="w-full shrink-0 sm:w-auto"
                  onClick={() => {
                    setSelectedNetTypeId(null);
                    setSelectedTestKind(null);
                  }}
                >
                  Change NET Type
                </Button>
              </div>
              <CardDescription>{selectedNetType.description}</CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      {selectedNetType ? (
        <section className="space-y-3 opacity-100 translate-y-0 transition-all duration-300">
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
            </CardContent>
          </Card>
        </section>
      ) : null}

      {selectedNetType ? (
        <section className="space-y-3 opacity-100 translate-y-0 transition-all duration-300">
          <h2 className="text-lg text-indigo-950">Step 3: Test Type Selection</h2>

          <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_12px_26px_rgba(93,109,201,0.10)]">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-indigo-950">
                <Brain className="h-5 w-5 text-indigo-600" />
                Recommended Adaptive Set
              </CardTitle>
              <CardDescription>
                Personalized from your latest accuracy and solving speed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {adaptiveLoading ? (
                <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-3 py-2 text-sm text-indigo-800">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Preparing adaptive recommendation...
                </div>
              ) : adaptiveRecommendation ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Adaptive Level" value={adaptiveRecommendation.recommendation.level} />
                    <StatCard title="Avg Score" value={`${Math.round(adaptiveRecommendation.recommendation.averageScore || 0)}%`} />
                    <StatCard title="Avg Speed" value={`${Math.round(adaptiveRecommendation.recommendation.averageSecondsPerQuestion || 0)} sec/q`} />
                    <StatCard title="Set Size" value={`${adaptiveRecommendation.mcqs.length} MCQs`} />
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs">
                    {recommendedSubjectBreakdown.map((item) => (
                      <span key={item.subject} className="rounded-md bg-indigo-50 px-2 py-1 text-indigo-800">
                        {getSubjectLabel(item.subject)}: {item.count}
                      </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(adaptiveRecommendation.recommendation.weaknesses || []).slice(0, 4).map((weak) => (
                      <Badge key={`weak-${weak}`} variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
                        Improve: {weak}
                      </Badge>
                    ))}
                    {(adaptiveRecommendation.recommendation.strengths || []).slice(0, 3).map((strong) => (
                      <Badge key={`strong-${strong}`} variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">
                        Strength: {strong}
                      </Badge>
                    ))}
                  </div>

                  <Button
                    className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                    onClick={() => {
                      const topSubject = recommendedSubjectBreakdown[0]?.subject || selectedSubject;
                      void beginTest(
                        'adaptive',
                        topSubject,
                        adaptiveRecommendation.mcqs.length || 24,
                        'Adaptive Recommendation Set',
                      );
                    }}
                    disabled={Boolean(launchingKind)}
                  >
                    {launchingKind === 'adaptive' ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                    Start Recommended Adaptive Test
                  </Button>
                </>
              ) : (
                <p className="text-sm text-slate-600">Complete a few tests to unlock personalized adaptive recommendations.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {TEST_TYPE_CARDS.map((card) => {
              const Icon = card.icon;
              const selected = selectedTestKind === card.id;
              const isLaunchingThis = launchingKind === card.id;
              const isAnotherLaunching = Boolean(launchingKind && launchingKind !== card.id);
              return (
                <Card
                  key={card.id}
                  className={`min-w-0 rounded-2xl border transition-all duration-200 hover:-translate-y-0.5 ${selected ? 'border-indigo-300 bg-indigo-50/40 shadow-[0_14px_26px_rgba(93,109,201,0.14)]' : 'border-indigo-100 bg-white/95 hover:shadow-[0_14px_26px_rgba(93,109,201,0.10)]'}`}
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

                    <Button
                      className={`w-full transition-all ${
                        isLaunchingThis
                          ? 'bg-indigo-700 text-white'
                          : isAnotherLaunching
                            ? 'bg-slate-300 text-slate-500'
                            : 'bg-gradient-to-r from-indigo-600 to-violet-500 text-white hover:-translate-y-0.5'
                      }`}
                      onClick={() => handleStartTestClick(card.id)}
                      disabled={Boolean(launchingKind)}
                    >
                      {isLaunchingThis ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Play className="mr-1.5 h-4 w-4" />}
                      {isLaunchingThis ? 'Launching...' : 'Start Test'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}

      <Dialog open={subjectPickerOpen} onOpenChange={setSubjectPickerOpen}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl border-indigo-100 bg-white/98 p-0 sm:max-w-lg">
          <DialogHeader className="border-b border-indigo-100 px-5 py-4">
            <DialogTitle className="text-indigo-950">Choose Subject</DialogTitle>
            <DialogDescription>
              Select a subject to start your subject-wise test instantly.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {subjectOptions.map((item) => (
              <Button
                key={item.key}
                variant="outline"
                className="h-auto min-h-11 justify-start rounded-xl border-indigo-200 bg-white px-3 py-2 text-indigo-900 hover:bg-indigo-50"
                disabled={Boolean(launchingKind)}
                onClick={() => {
                  setSelectedSubject(item.key);
                  setSubjectPickerOpen(false);
                  void beginTest('subject-wise', item.key);
                }}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <div className="pt-1 text-xs text-slate-500">
        <button
          type="button"
          className="underline-offset-2 hover:underline"
          onClick={() => onNavigate?.('analytics')}
        >
          View previous attempts and reports in Analytics
        </button>
      </div>
    </div>
  );
}

function StepPill({
  active,
  done,
  title,
  subtitle,
}: {
  active: boolean;
  done: boolean;
  title: string;
  subtitle: string;
}) {
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
