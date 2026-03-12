import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, CircleHelp, FastForward, Rewind, Save, Send, SkipBack, SkipForward } from 'lucide-react';
import { App as CapacitorApp } from '@capacitor/app';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { apiRequest } from '../lib/api';

type Difficulty = 'Easy' | 'Medium' | 'Hard';
type SubjectKey = 'mathematics' | 'physics' | 'english' | 'biology' | 'chemistry';

interface SessionQuestion {
  id: string;
  subject: SubjectKey;
  topic: string;
  question: string;
  options: string[];
  optionMedia?: Array<{
    key: string;
    text: string;
    image?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    } | null;
  }>;
  questionImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  difficulty: Difficulty;
}

interface ReviewRow {
  questionId: string;
  question: string;
  questionImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  optionMedia?: Array<{
    key: string;
    text: string;
    image?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    } | null;
  }>;
  selectedKey: string | null;
  correctKey: string;
  selectedText?: string;
  correctText?: string;
  isCorrect: boolean;
  explanationText?: string;
  explanationImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  shortTrickText?: string;
  shortTrickImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
}

interface TestSession {
  id: string;
  topic: string;
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  cancelledAt?: string | null;
  cancelReason?: string;
  cancelTrigger?: string;
  questions: SessionQuestion[];
}

interface ChallengeAnswerRow {
  questionId: string;
  selectedOption: string;
}

interface ChallengeResultPayload {
  submitted: boolean;
  completedAt: string | null;
  elapsedSeconds: number;
  answers?: ChallengeAnswerRow[];
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  accuracyScore: number;
  speedScore: number;
  totalScore: number;
}

interface ChallengePayload {
  id: string;
  challengeType: 'async' | 'live' | string;
  subject: string;
  topic: string;
  questionCount: number;
  durationSeconds: number;
  status: string;
  startedAt: string | null;
  myResult: ChallengeResultPayload;
  questions: Array<{
    questionId: string;
    subject: string;
    topic: string;
    question: string;
    options: string[];
    difficulty: Difficulty;
  }>;
}

interface ResultState {
  score: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
}

function buildOptionMedia(question: SessionQuestion) {
  const rows = Array.isArray(question.optionMedia) ? question.optionMedia : [];
  if (rows.length) {
    return rows.map((item, idx) => ({
      key: String(item.key || String.fromCharCode(65 + idx)).toUpperCase(),
      text: String(item.text || ''),
      image: item.image || null,
    }));
  }

  return (Array.isArray(question.options) ? question.options : []).map((text, idx) => ({
    key: String.fromCharCode(65 + idx),
    text: String(text || ''),
    image: null,
  }));
}

function formatSubject(value: SubjectKey) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function TestInterfacePage() {
  const { user } = useAuth();

  const [session, setSession] = useState<TestSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [markedForReview, setMarkedForReview] = useState<Record<string, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [result, setResult] = useState<ResultState | null>(null);
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);

  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null);
  const [resolvedChallengeId, setResolvedChallengeId] = useState<string | null>(null);
  const [isChallengeMode, setIsChallengeMode] = useState(false);
  const [challengeType, setChallengeType] = useState<'async' | 'live' | string>('async');
  const [challengeStartedAtMs, setChallengeStartedAtMs] = useState<number | null>(null);
  const [challengeLockedAnswers, setChallengeLockedAnswers] = useState<Record<string, string>>({});
  const [launchResolved, setLaunchResolved] = useState(false);

  const violationCountRef = useRef(0);
  const violationDebounceAtRef = useRef(0);
  const hasAutoCancelledRef = useRef(false);

  const getLaunchFallback = () => {
    try {
      const raw = localStorage.getItem('net360-exam-launch');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        sessionId?: string;
        challengeId?: string;
        testType?: string;
        authToken?: string;
        launchedAt?: number;
      };
      // Keep launch fallback short-lived.
      if (parsed.launchedAt && Date.now() - parsed.launchedAt > 15 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    setError(null);
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('authToken');
    const launchFallback = getLaunchFallback();
    const fromLaunchPayload = launchFallback?.authToken || null;
    const fromStorage = localStorage.getItem('net360-auth-token');
    const token = fromQuery || fromLaunchPayload || fromStorage;

    const queryTestType = String(params.get('testType') || '').trim().toLowerCase();
    const queryChallengeId = String(params.get('challengeId') || '').trim();
    const fallbackChallengeId = String(launchFallback?.challengeId || '').trim();
    const challengeId = queryChallengeId || fallbackChallengeId || null;

    const querySessionId = params.get('sessionId');
    const fallbackSessionId = launchFallback?.sessionId || null;
    const sessionId = querySessionId || fallbackSessionId || null;

    const challengeLaunch = queryTestType === 'challenge' || String(launchFallback?.testType || '') === 'challenge' || Boolean(challengeId);

    setIsChallengeMode(challengeLaunch);
    setResolvedSessionId(sessionId);
    setResolvedChallengeId(challengeId);

    if (!token) {
      setError('Missing authentication token. Redirecting to login page...');
      setLoading(false);
      window.setTimeout(() => {
        window.location.href = '/?tab=profile';
      }, 900);
      return;
    }

    if (challengeLaunch && !challengeId) {
      setError('Missing challenge id. Redirecting to community page...');
      setLoading(false);
      window.setTimeout(() => {
        window.location.href = '/?tab=community';
      }, 900);
      return;
    }

    if (!challengeLaunch && !sessionId) {
      setError('Missing session id. Redirecting to tests page...');
      setLoading(false);
      window.setTimeout(() => {
        window.location.href = '/?tab=tests';
      }, 900);
      return;
    }

    // Always persist query token so follow-up API calls and refresh flow use the launched token.
    if (fromQuery) {
      localStorage.setItem('net360-auth-token', fromQuery);
    }

    setResolvedToken(token);
    setLaunchResolved(true);
  }, []);

  const getChallengeAttemptStorageKey = (challengeId: string) => `net360-challenge-attempt-${challengeId}`;

  const cancelActiveExam = async (trigger: string) => {
    if (!resolvedToken || result || isSubmitting || hasAutoCancelledRef.current) return;

    hasAutoCancelledRef.current = true;
    const reason = 'Left secured test environment after warning.';

    try {
      if (isChallengeMode) {
        if (resolvedChallengeId) {
          await apiRequest(`/api/community/quiz-challenges/${resolvedChallengeId}/forfeit`, {
            method: 'POST',
            body: JSON.stringify({
              reason,
              trigger,
              elapsedSeconds: challengeStartedAtMs ? Math.max(0, Math.floor((Date.now() - challengeStartedAtMs) / 1000)) : 0,
            }),
          }, resolvedToken);
        }
      } else if (resolvedSessionId) {
        await apiRequest(`/api/tests/${resolvedSessionId}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason, trigger }),
        }, resolvedToken);
      }
    } catch {
      // Best effort: redirect even if request fails.
    } finally {
      toast.error(
        isChallengeMode
          ? 'Challenge cancelled. You lost this challenge because you left the test environment.'
          : 'Test cancelled because you left the secured test environment.',
      );
      window.setTimeout(() => {
        window.location.href = isChallengeMode ? '/?tab=community' : '/?tab=tests';
      }, 700);
    }
  };

  const handleEnvironmentViolation = (trigger: string) => {
    if (!resolvedToken || result || isSubmitting || hasAutoCancelledRef.current) return;
    if (!isChallengeMode && !resolvedSessionId) return;
    if (isChallengeMode && !resolvedChallengeId) return;

    const now = Date.now();
    if (now - violationDebounceAtRef.current < 600) return;
    violationDebounceAtRef.current = now;

    violationCountRef.current += 1;
    toast.warning(
      isChallengeMode
        ? 'Warning: Leaving the test environment will cancel this challenge and you will lose.'
        : 'Warning: Leaving the test environment will cancel this test.',
    );

    if (violationCountRef.current >= 2) {
      void cancelActiveExam(trigger);
    }
  };

  const startedAtLabel = useMemo(() => {
    if (!session?.startedAt) return '--:--';
    return new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [session]);

  useEffect(() => {
    async function loadSession() {
      try {
        if (!launchResolved || !resolvedToken) return;

        if (isChallengeMode) {
          if (!resolvedChallengeId) return;
          const response = await apiRequest<{ challenge: ChallengePayload }>(`/api/community/quiz-challenges/${resolvedChallengeId}`, {}, resolvedToken);
          const challenge = response.challenge;

          setChallengeType(String(challenge.challengeType || 'async'));

          const mappedSession: TestSession = {
            id: String(challenge.id || resolvedChallengeId),
            topic: challenge.topic || `${challenge.subject || 'Mixed'} Challenge`,
            questionCount: Number(challenge.questionCount || challenge.questions.length || 0),
            durationMinutes: Math.max(1, Math.ceil(Number(challenge.durationSeconds || 0) / 60)),
            startedAt: challenge.startedAt || new Date().toISOString(),
            questions: (challenge.questions || []).map((row) => ({
              id: String(row.questionId || ''),
              subject: (String(row.subject || 'mathematics').toLowerCase() as SubjectKey),
              topic: String(row.topic || challenge.topic || '').trim(),
              question: String(row.question || '').trim(),
              options: Array.isArray(row.options) ? row.options.map((item) => String(item || '').trim()) : [],
              optionMedia: Array.isArray(row.options)
                ? row.options.map((item, idx) => ({ key: String.fromCharCode(65 + idx), text: String(item || '').trim(), image: null }))
                : [],
              difficulty: (String(row.difficulty || 'Medium') as Difficulty),
            })),
          };

          const seededAnswers = (challenge.myResult?.answers || []).reduce((acc, row) => {
            acc[String(row.questionId || '')] = String(row.selectedOption || '');
            return acc;
          }, {} as Record<string, string | null>);
          setAnswers(seededAnswers);

          if (String(challenge.challengeType || '') === 'live') {
            const lockMap = (challenge.myResult?.answers || []).reduce((acc, row) => {
              acc[String(row.questionId || '')] = String(row.selectedOption || '');
              return acc;
            }, {} as Record<string, string>);
            setChallengeLockedAnswers(lockMap);
          } else {
            setChallengeLockedAnswers({});
          }

          setSession(mappedSession);

          const totalDurationSeconds = Math.max(1, Number(challenge.durationSeconds || mappedSession.durationMinutes * 60));
          if (String(challenge.challengeType || '') === 'live') {
            const startedAtMs = challenge.startedAt ? new Date(challenge.startedAt).getTime() : Date.now();
            setChallengeStartedAtMs(startedAtMs);
            const elapsed = Math.max(0, Math.floor((Date.now() - startedAtMs) / 1000));
            setRemainingSeconds(Math.max(0, totalDurationSeconds - elapsed));
          } else {
            const attemptKey = getChallengeAttemptStorageKey(String(challenge.id || resolvedChallengeId));
            let attemptStartedAtMs = Number(localStorage.getItem(attemptKey) || 0);
            if (!attemptStartedAtMs) {
              attemptStartedAtMs = Date.now();
              localStorage.setItem(attemptKey, String(attemptStartedAtMs));
            }
            setChallengeStartedAtMs(attemptStartedAtMs);
            const elapsed = Math.max(0, Math.floor((Date.now() - attemptStartedAtMs) / 1000));
            setRemainingSeconds(Math.max(0, totalDurationSeconds - elapsed));
          }
          return;
        }

        if (!resolvedSessionId) return;

        const response = await apiRequest<{ session: TestSession }>(`/api/tests/${resolvedSessionId}`, {}, resolvedToken);
        const payload = response.session;
        if (payload.cancelledAt) {
          throw new Error('This test session has already been cancelled.');
        }
        setSession(payload as unknown as TestSession);
        setRemainingSeconds(Math.max(1, payload.durationMinutes * 60));
        setChallengeStartedAtMs(null);
        setChallengeLockedAnswers({});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test session.');
      } finally {
        if (launchResolved && resolvedToken) {
          setLoading(false);
        }
      }
    }

    void loadSession();
  }, [isChallengeMode, launchResolved, resolvedChallengeId, resolvedSessionId, resolvedToken]);

  useEffect(() => {
    if (!session || result || remainingSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (isChallengeMode && challengeStartedAtMs) {
          const totalSeconds = Math.max(1, session.durationMinutes * 60);
          const elapsed = Math.max(0, Math.floor((Date.now() - challengeStartedAtMs) / 1000));
          const nextValue = Math.max(0, totalSeconds - elapsed);
          if (nextValue <= 0) {
            window.clearInterval(timer);
          }
          return nextValue;
        }

        if (prev <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [challengeStartedAtMs, isChallengeMode, session, remainingSeconds, result]);

  useEffect(() => {
    if (!session || result || isSubmitting || remainingSeconds !== 0) return;
    void handleSubmit(true);
  }, [session, result, isSubmitting, remainingSeconds]);

  const question = session?.questions[currentIndex] || null;

  const answeredCount = useMemo(() => {
    if (!session) return 0;
    return session.questions.filter((item) => answers[item.id]).length;
  }, [session, answers]);

  const reviewCount = useMemo(() => {
    if (!session) return 0;
    return session.questions.filter((item) => markedForReview[item.id]).length;
  }, [session, markedForReview]);

  const subjectSections = useMemo(() => {
    if (!session) return [] as Array<{ subject: SubjectKey; start: number; end: number }>;

    const sections: Array<{ subject: SubjectKey; start: number; end: number }> = [];
    session.questions.forEach((item, index) => {
      const last = sections[sections.length - 1];
      if (!last || last.subject !== item.subject) {
        sections.push({ subject: item.subject, start: index, end: index });
      } else {
        last.end = index;
      }
    });

    return sections;
  }, [session]);

  const goToNextSection = () => {
    const next = subjectSections.find((section) => section.start > currentIndex);
    if (next) setCurrentIndex(next.start);
  };

  const goToPreviousSection = () => {
    const previous = [...subjectSections].reverse().find((section) => section.start < currentIndex);
    if (previous) setCurrentIndex(previous.start);
  };

  const handleSubmit = async (auto = false) => {
    if (!session || isSubmitting || result || !resolvedToken) return;

    setIsSubmitting(true);
    try {
      const payload = session.questions.map((item) => ({
        questionId: item.id,
        selectedOption: answers[item.id] ?? null,
      }));

      if (isChallengeMode) {
        if (!resolvedChallengeId) throw new Error('Missing challenge id for challenge submission.');

        const elapsed = challengeStartedAtMs
          ? Math.max(0, Math.floor((Date.now() - challengeStartedAtMs) / 1000))
          : Math.max(1, session.durationMinutes * 60 - remainingSeconds);

        const response = await apiRequest<{ challenge: ChallengePayload }>(
          `/api/community/quiz-challenges/${resolvedChallengeId}/submit`,
          {
            method: 'POST',
            body: JSON.stringify({ answers: payload, elapsedSeconds: elapsed }),
          },
          resolvedToken,
        );

        const myResult = response.challenge?.myResult;
        setResult({
          score: Number(myResult?.totalScore || 0),
          correctAnswers: Number(myResult?.correctCount || 0),
          wrongAnswers: Number(myResult?.wrongCount || 0),
          unanswered: Number(myResult?.unansweredCount || 0),
        });

        localStorage.removeItem(getChallengeAttemptStorageKey(resolvedChallengeId));

        if (auto) {
          toast.message('Time is up. Challenge auto-submitted.');
        } else {
          toast.success('Challenge submitted successfully.');
        }
        return;
      }

      const response = await apiRequest<{
        attempt: { score: number; correctAnswers?: number; wrongAnswers?: number; unanswered?: number };
        review?: ReviewRow[];
      }>(
        `/api/tests/${session.id}/finish`,
        {
          method: 'POST',
          body: JSON.stringify({
            answers: payload,
            elapsedSeconds: Math.max(1, session.durationMinutes * 60 - remainingSeconds),
          }),
        },
        resolvedToken,
      );

      const attempt = response.attempt;

      setResult({
        score: attempt.score,
        correctAnswers: attempt.correctAnswers,
        wrongAnswers: attempt.wrongAnswers,
        unanswered: attempt.unanswered,
      });
      setReviewRows(Array.isArray(response.review) ? response.review : []);

      if (auto) {
        toast.message('Time is up. Test auto-submitted.');
      } else {
        toast.success('Test submitted successfully.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit test.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!session || !resolvedToken || result || hasAutoCancelledRef.current) return;
    if (isChallengeMode && !resolvedChallengeId) return;
    if (!isChallengeMode && !resolvedSessionId) return;

    const onVisibilityChange = () => {
      if (document.hidden) {
        handleEnvironmentViolation('visibilitychange');
      }
    };

    const onBlur = () => {
      handleEnvironmentViolation('blur');
    };

    const onPopState = () => {
      handleEnvironmentViolation('popstate');
      window.history.pushState({ challengeGuard: true }, '', window.location.href);
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      handleEnvironmentViolation('beforeunload');
      event.preventDefault();
      event.returnValue = '';
    };

    window.history.pushState({ challengeGuard: true }, '', window.location.href);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onBlur);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    let appStateListener: { remove: () => void } | null = null;
    let backButtonListener: { remove: () => void } | null = null;

    const attachNativeListeners = async () => {
      if (!isNativeRuntime) return;
      try {
        appStateListener = await CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            handleEnvironmentViolation('appStateChange');
          }
        });
        backButtonListener = await CapacitorApp.addListener('backButton', () => {
          handleEnvironmentViolation('hardwareBackButton');
        });
      } catch {
        // Non-native runtime or listener attach failure.
      }
    };

    void attachNativeListeners();

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      appStateListener?.remove();
      backButtonListener?.remove();
    };
  }, [isChallengeMode, resolvedChallengeId, resolvedSessionId, resolvedToken, result, session]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f6fb] p-2 sm:p-3 text-[#0d2c5a]">
        <div className="mx-auto max-w-[1600px] rounded border border-[#2b5f9f] bg-white p-4 sm:p-6">Loading test interface...</div>
      </div>
    );
  }

  if (error || !session || !question) {
    return (
      <div className="min-h-screen bg-[#f2f6fb] p-2 sm:p-3 text-[#0d2c5a]">
        <div className="mx-auto max-w-[1600px] rounded border border-[#2b5f9f] bg-white p-4 sm:p-6">
          <p className="mb-4 text-red-700">{error || 'Session could not be loaded.'}</p>
          <button
            type="button"
            className="rounded border border-[#2b5f9f] bg-[#d7e8ff] px-3 py-1.5 text-sm"
            onClick={() => window.close()}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const questionNumber = currentIndex + 1;
  const optionRows = buildOptionMedia(question);

  return (
    <div className="min-h-screen bg-[#f2f6fb] p-2 text-[#0d2c5a] sm:p-3">
      <div className="mx-auto max-w-[1900px] rounded border-2 border-[#2b5f9f] bg-[#eef4fb] shadow-[0_12px_30px_rgba(5,32,71,0.15)]">
        <header className="grid gap-1 border-b border-[#2b5f9f] bg-white px-2 py-1.5 text-xs sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-2 sm:py-1 sm:text-sm">
          <div className="font-semibold text-[#1f6b1f]">{formatSubject(question.subject)}</div>
          <div className="text-left text-base text-[#a11c12] sm:text-center sm:text-xl">{session.topic}</div>
          <div className="text-left text-lg text-[#b31212] sm:text-right sm:text-2xl">NUST05 <span className="text-xs sm:text-sm text-[#1f6b1f]">[{question.topic}]</span></div>
        </header>

        <div className="grid border-b border-[#2b5f9f] bg-[#d6e5f4] text-sm sm:grid-cols-[1fr_160px]">
          <div className="px-2 py-1">Question No : <span className="text-blue-700">{questionNumber} of {session.questionCount}</span></div>
          <div className="border-t border-[#2b5f9f] px-2 py-1 text-left sm:border-l sm:border-t-0 sm:text-right">Marks: <span className="text-blue-700">1</span></div>
        </div>

        <main className="grid gap-0 border-b border-[#2b5f9f] bg-[#c8d3df] sm:grid-cols-[1fr_160px]">
          <section className="order-2 border-b border-[#2b5f9f] p-2 sm:order-1 sm:border-b-0 sm:border-r">
            <p className="mb-2 font-semibold text-black">Question</p>
            <div className="min-h-[120px] rounded border border-[#1e3f6e] bg-white p-3 text-sm text-black sm:text-base">
              {question.question}
              {question.questionImage?.dataUrl ? (
                <img
                  src={question.questionImage.dataUrl}
                  alt="Question visual"
                  className="mt-3 max-h-60 w-full rounded border border-slate-200 object-contain"
                />
              ) : null}
            </div>
          </section>

          <aside className="order-1 grid grid-cols-1 gap-2 border-b border-[#2b5f9f] p-2 sm:order-2 sm:block sm:border-b-0">
            <p className="mb-1 text-xs text-black">Candidate</p>
            <div className="mb-2 rounded border border-[#d25555] bg-white p-2 text-center text-[13px] text-black">
              {user?.firstName || 'Candidate'} {user?.lastName || ''}
            </div>
            <div className="rounded border border-[#d25555] bg-white p-2 text-center text-xs text-black">Photo</div>
          </aside>
        </main>

        <section className="border-b border-[#2b5f9f] bg-[#a9c6df] px-2 py-1 text-sm">
          Answer ( <span className="text-blue-700">Please select your correct option</span> )
        </section>

        <section className="space-y-2 border-b border-[#2b5f9f] bg-[#d6dbe2] p-2">
          {optionRows.map((option, idx) => {
            const optionValue = isChallengeMode ? option.text : option.key;
            const isSelected = answers[question.id] === optionValue;
            const isLocked = isChallengeMode && String(challengeType) === 'live' && Boolean(challengeLockedAnswers[question.id]);
            return (
              <label key={`${question.id}-${idx}`} className="grid grid-cols-[24px_1fr] items-start gap-2 sm:grid-cols-[28px_1fr] sm:items-center">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={isSelected}
                  disabled={isLocked && !isSelected}
                  onChange={() => {
                    if (!isChallengeMode || String(challengeType) !== 'live') {
                      setAnswers((prev) => ({ ...prev, [question.id]: optionValue }));
                      return;
                    }

                    if (challengeLockedAnswers[question.id]) {
                      toast.message('Live challenge answers are locked after first selection.');
                      return;
                    }

                    if (!resolvedChallengeId || !resolvedToken) {
                      toast.error('Challenge context is missing. Reload and try again.');
                      return;
                    }

                    const elapsedSeconds = challengeStartedAtMs ? Math.max(0, Math.floor((Date.now() - challengeStartedAtMs) / 1000)) : 0;
                    void apiRequest<{ challenge: ChallengePayload }>(
                      `/api/community/quiz-challenges/${resolvedChallengeId}/progress`,
                      {
                        method: 'POST',
                        body: JSON.stringify({ questionId: question.id, selectedOption: optionValue, elapsedSeconds }),
                      },
                      resolvedToken,
                    )
                      .then(() => {
                        setChallengeLockedAnswers((prev) => ({ ...prev, [question.id]: optionValue }));
                        setAnswers((prev) => ({ ...prev, [question.id]: optionValue }));
                      })
                      .catch((error) => {
                        toast.error(error instanceof Error ? error.message : 'Could not lock answer for live challenge.');
                      });
                  }}
                />
                <div className="rounded border border-[#1e3f6e] bg-white px-2 py-2 text-sm text-black sm:text-base">
                  <p className="font-medium text-slate-700">{option.key}.</p>
                  {option.text ? <p>{option.text}</p> : null}
                  {option.image?.dataUrl ? (
                    <img
                      src={option.image.dataUrl}
                      alt={`Option ${option.key}`}
                      className="mt-2 max-h-40 w-full rounded border border-slate-200 object-contain"
                    />
                  ) : null}
                </div>
              </label>
            );
          })}
        </section>

        <section className="grid gap-2 border-b border-[#2b5f9f] bg-[#c8d3df] p-2 xl:grid-cols-[150px_1fr]">
          <div className="rounded border border-[#1e3f6e] bg-white p-2 text-xs text-black">
            <p>Start Time: <span className="text-blue-700">{startedAtLabel}</span></p>
            <p className="text-3xl leading-tight text-[#009c3f]">{Math.ceil(remainingSeconds / 60)}</p>
            <p>min Remaining</p>
            <p className="mt-1 text-lg text-blue-700">{formatTime(remainingSeconds)}</p>
          </div>

          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            <ExamButton label="Save" icon={Save} onClick={() => toast.success('Answer saved for this question.')} />
            <ExamButton label="Next" icon={ArrowRight} onClick={() => setCurrentIndex((prev) => Math.min(session.questionCount - 1, prev + 1))} />
            <ExamButton label="Prev" icon={ArrowLeft} onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))} />
            <ExamButton label="Review" icon={Bookmark} onClick={() => setMarkedForReview((prev) => ({ ...prev, [question.id]: !prev[question.id] }))} />
            <ExamButton label="Next Section" icon={SkipForward} onClick={goToNextSection} />
            <ExamButton label="Prev Section" icon={SkipBack} onClick={goToPreviousSection} />
            <ExamButton label="First" icon={Rewind} onClick={() => setCurrentIndex(0)} />
            <ExamButton label="Last" icon={FastForward} onClick={() => setCurrentIndex(session.questionCount - 1)} />
            <ExamButton label="Help" icon={CircleHelp} onClick={() => toast.message('Use Next/Prev, section controls, and Submit when done.')} />
          </div>
        </section>

        <footer className="flex flex-col items-stretch gap-2 border-t border-[#2b5f9f] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#10b981]" />Answered {answeredCount}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#ef4444]" />Unanswered {session.questionCount - answeredCount}</span>
            <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-[#facc15]" />Marked {reviewCount}</span>
          </div>

          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-1 rounded border border-[#1e3f6e] bg-[#d7e8ff] px-3 py-1 text-blue-700 hover:bg-[#c9deff] disabled:opacity-60 sm:w-auto"
            onClick={() => void handleSubmit(false)}
            disabled={isSubmitting || Boolean(result)}
          >
            <Send className="h-4 w-4" />
            Click here to FINISH Your Test
          </button>
        </footer>
      </div>

      <div className="mt-1 bg-white px-2 py-2 text-center text-xs text-red-600 sm:text-sm">
        NUST NET-style testing interface{' '}
        <button
          type="button"
          className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
          onClick={() => {
            window.location.href = '/';
          }}
        >
          Go to Main Page
        </button>
        {' | '}
        <button
          type="button"
          className="text-blue-600 underline underline-offset-2 hover:text-blue-800"
          onClick={() => {
            window.location.href = '/?tab=profile';
          }}
        >
          Go to Login Page
        </button>
      </div>

      {result ? (
        <div className="fixed inset-0 grid place-items-center bg-black/35 p-3">
          <div className="w-full max-w-md rounded border-2 border-[#2b5f9f] bg-white p-4">
            <h2 className="text-xl text-[#0d2c5a]">{isChallengeMode ? 'Challenge Submitted' : 'Test Submitted'}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {isChallengeMode ? 'Your challenge attempt has been recorded.' : 'Your attempt has been saved successfully.'}
            </p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>
                Score:{' '}
                <span className="font-semibold text-emerald-700">
                  {isChallengeMode ? result.score.toFixed(2) : `${result.score}%`}
                </span>
              </p>
              <p>Correct: {result.correctAnswers ?? '-'}</p>
              <p>Wrong: {result.wrongAnswers ?? '-'}</p>
              <p>Unanswered: {result.unanswered ?? '-'}</p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded border border-[#1e3f6e] bg-[#d7e8ff] px-3 py-1 text-blue-700"
                onClick={() => {
                  if (isChallengeMode) {
                    window.location.href = '/?tab=community';
                    return;
                  }
                  window.close();
                }}
              >
                {isChallengeMode ? 'Back to Community' : 'Close Window'}
              </button>
              <button
                type="button"
                className="rounded border border-emerald-700 bg-emerald-100 px-3 py-1 text-emerald-800"
                onClick={() => {
                  setResult(null);
                  setReviewRows([]);
                  window.location.href = '/';
                }}
              >
                Back to Dashboard
              </button>
            </div>

            {!isChallengeMode && reviewRows.length ? (
              <div className="mt-4 max-h-[48vh] space-y-2 overflow-auto rounded border border-slate-200 p-2">
                <p className="text-sm font-semibold text-slate-800">Review (shown after completion)</p>
                {reviewRows.map((row, idx) => (
                  <div key={`${row.questionId}-${idx}`} className="rounded border border-slate-200 p-2 text-xs sm:text-sm">
                    <p className="font-semibold">Q{idx + 1}. {row.question}</p>
                    {row.questionImage?.dataUrl ? (
                      <img src={row.questionImage.dataUrl} alt={`Review question ${idx + 1}`} className="mt-2 max-h-48 w-full rounded border object-contain" />
                    ) : null}
                    <p className={`mt-2 font-medium ${row.isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {row.isCorrect ? 'Correct' : 'Incorrect'} • Your answer: {row.selectedKey || 'Not answered'} • Correct: {row.correctKey || '-'}
                    </p>
                    {row.explanationText ? <p className="mt-1 whitespace-pre-wrap">Explanation: {row.explanationText}</p> : null}
                    {row.explanationImage?.dataUrl ? (
                      <img src={row.explanationImage.dataUrl} alt={`Explanation ${idx + 1}`} className="mt-2 max-h-40 w-full rounded border object-contain" />
                    ) : null}
                    {row.shortTrickText ? <p className="mt-1 whitespace-pre-wrap text-blue-700">Short Trick: {row.shortTrickText}</p> : null}
                    {row.shortTrickImage?.dataUrl ? (
                      <img src={row.shortTrickImage.dataUrl} alt={`Short trick ${idx + 1}`} className="mt-2 max-h-40 w-full rounded border object-contain" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExamButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string;
  icon: typeof Save;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center justify-center gap-1 rounded border border-[#3a5f8e] bg-gradient-to-b from-[#90b0d4] to-[#6f8eb8] px-2 text-[10px] text-white shadow hover:from-[#9db9d8] hover:to-[#7a99c0] sm:text-[11px]"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
