import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, CircleHelp, FastForward, Rewind, Save, Send, SkipBack, SkipForward } from 'lucide-react';
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
  difficulty: Difficulty;
}

interface TestSession {
  id: string;
  topic: string;
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  questions: SessionQuestion[];
}

interface ResultState {
  score: number;
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
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

  const [resolvedToken, setResolvedToken] = useState<string | null>(null);
  const [resolvedSessionId, setResolvedSessionId] = useState<string | null>(null);

  const getLaunchFallback = () => {
    try {
      const raw = localStorage.getItem('net360-exam-launch');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as {
        sessionId?: string;
        authToken?: string;
        launchedAt?: number;
      };
      if (!parsed?.sessionId) return null;
      // Keep launch fallback short-lived.
      if (parsed.launchedAt && Date.now() - parsed.launchedAt > 15 * 60 * 1000) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('authToken');
    const launchFallback = getLaunchFallback();
    const fromLaunchPayload = launchFallback?.authToken || null;
    const fromStorage = localStorage.getItem('net360-auth-token');
    const token = fromQuery || fromLaunchPayload || fromStorage;

    const querySessionId = params.get('sessionId');
    const fallbackSessionId = launchFallback?.sessionId || null;
    setResolvedSessionId(querySessionId || fallbackSessionId || null);

    if (!token) {
      setError('Missing authentication token. Redirecting to login page...');
      setLoading(false);
      window.setTimeout(() => {
        window.location.href = '/?tab=profile';
      }, 900);
      return;
    }

    if (fromQuery && !fromStorage) {
      localStorage.setItem('net360-auth-token', fromQuery);
    }

    setResolvedToken(token);
  }, []);

  const startedAtLabel = useMemo(() => {
    if (!session?.startedAt) return '--:--';
    return new Date(session.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }, [session]);

  useEffect(() => {
    async function loadSession() {
      try {
        if (!resolvedToken || !resolvedSessionId) return;

        if (!resolvedSessionId) {
          throw new Error('Missing sessionId. Please start a test from the Tests page.');
        }

        const response = await apiRequest<{ session: TestSession }>(`/api/tests/${resolvedSessionId}`, {}, resolvedToken);
        const payload = response.session;
        setSession(payload as unknown as TestSession);
        setRemainingSeconds(Math.max(1, payload.durationMinutes * 60));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test session.');
      } finally {
        setLoading(false);
      }
    }

    void loadSession();
  }, [resolvedToken, resolvedSessionId]);

  useEffect(() => {
    if (!session || result || remainingSeconds <= 0) return;

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
  }, [session, remainingSeconds, result]);

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

      const response = await apiRequest<{ attempt: { score: number; correctAnswers?: number; wrongAnswers?: number; unanswered?: number } }>(
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
          <section className="border-b border-[#2b5f9f] p-2 sm:border-b-0 sm:border-r">
            <p className="mb-2 font-semibold text-black">Question</p>
            <div className="min-h-[120px] rounded border border-[#1e3f6e] bg-white p-3 text-sm text-black sm:text-base">
              {question.question}
            </div>
          </section>

          <aside className="grid grid-cols-1 gap-2 p-2 sm:block">
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
          {question.options.map((option, idx) => {
            const isSelected = answers[question.id] === option;
            return (
              <label key={`${question.id}-${idx}`} className="grid grid-cols-[24px_1fr] items-start gap-2 sm:grid-cols-[28px_1fr] sm:items-center">
                <input
                  type="radio"
                  name={`question-${question.id}`}
                  checked={isSelected}
                  onChange={() => setAnswers((prev) => ({ ...prev, [question.id]: option }))}
                />
                <div className="rounded border border-[#1e3f6e] bg-white px-2 py-2 text-sm text-black sm:text-base">{option}</div>
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
        This is just a Sample of Computer Based NUST Entry Test (CBNET) .{' '}
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
            <h2 className="text-xl text-[#0d2c5a]">Test Submitted</h2>
            <p className="mt-1 text-sm text-slate-600">Your attempt has been saved successfully.</p>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              <p>Score: <span className="font-semibold text-emerald-700">{result.score}%</span></p>
              <p>Correct: {result.correctAnswers ?? '-'}</p>
              <p>Wrong: {result.wrongAnswers ?? '-'}</p>
              <p>Unanswered: {result.unanswered ?? '-'}</p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                className="rounded border border-[#1e3f6e] bg-[#d7e8ff] px-3 py-1 text-blue-700"
                onClick={() => window.close()}
              >
                Close Window
              </button>
              <button
                type="button"
                className="rounded border border-emerald-700 bg-emerald-100 px-3 py-1 text-emerald-800"
                onClick={() => {
                  setResult(null);
                  window.location.href = '/';
                }}
              >
                Back to Dashboard
              </button>
            </div>
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
