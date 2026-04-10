import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Difficulty, MCQ, McqImageFile, McqOptionMedia, SubjectKey, SUBJECT_KEYS } from '../lib/mcq';
import { apiRequest, buildApiUrl } from '../lib/api';
import { useAuth } from './AuthContext';

interface TestAttempt {
  id: string;
  sessionId?: string;
  subject: SubjectKey;
  topic: string;
  difficulty: Difficulty;
  score: number;
  totalQuestions: number;
  durationMinutes: number;
  attemptedAt: string;
  mode: 'topic' | 'mock' | 'adaptive';
  correctAnswers?: number;
  wrongAnswers?: number;
  unanswered?: number;
  submittedAnswers?: number;
  submittedAt?: string;
  metadata?: Record<string, unknown>;
}

interface SessionQuestion {
  id: string;
  subject: SubjectKey;
  topic: string;
  question: string;
  options: string[];
  optionMedia?: McqOptionMedia[];
  questionImage?: McqImageFile | null;
  difficulty: Difficulty;
  explanation?: string;
  explanationImage?: McqImageFile | null;
  shortTrick?: string;
  shortTrickImage?: McqImageFile | null;
}

interface TestReviewRow {
  questionId: string;
  question: string;
  questionImage?: McqImageFile | null;
  optionMedia: McqOptionMedia[];
  selectedKey: string | null;
  correctKey: string;
  selectedText?: string;
  correctText?: string;
  isCorrect: boolean;
  explanationText?: string;
  explanationImage?: McqImageFile | null;
  shortTrickText?: string;
  shortTrickImage?: McqImageFile | null;
}

interface SubmitTestSessionResult {
  attempt: TestAttempt;
  review?: TestReviewRow[];
}

interface TestSession {
  id: string;
  userId?: string;
  subject: SubjectKey;
  difficulty: Difficulty;
  topic: string;
  mode: 'topic' | 'mock' | 'adaptive';
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  finishedAt: string | null;
  questions: SessionQuestion[];
  netType?: string;
  testType?: string;
  config?: Record<string, unknown>;
}

interface ProfileState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  targetProgram: string;
  testSeries: string;
  sscPercentage: string;
  hsscPercentage: string;
  testDate: string;
}

interface PreferencesState {
  emailNotifications: boolean;
  dailyReminders: boolean;
  performanceReports: boolean;
}

interface AppDataContextValue {
  loading: boolean;
  error: string | null;
  mcqs: MCQ[];
  mcqTotalsBySubject: Record<SubjectKey, number>;
  mcqsBySubject: Record<SubjectKey, MCQ[]>;
  mcqsBySubjectAndDifficulty: Record<SubjectKey, Record<Difficulty, MCQ[]>>;
  attempts: TestAttempt[];
  profile: ProfileState;
  preferences: PreferencesState;
  startPracticeTest: (params: {
    subject: SubjectKey;
    difficulty: Difficulty;
    topic: string;
    mode: 'topic' | 'mock' | 'adaptive';
    questionCount?: number;
  }) => Promise<TestAttempt | null>;
  startTestSession: (params: {
    subject: SubjectKey;
    difficulty: Difficulty;
    topic: string;
    mode: 'topic' | 'mock' | 'adaptive';
    questionCount?: number;
    part?: string;
    chapter?: string;
    section?: string;
    netType?: string;
    testType?: 'subject-wise' | 'full-mock' | 'adaptive';
    selectedSubject?: SubjectKey;
  }) => Promise<TestSession>;
  getTestSession: (sessionId: string) => Promise<TestSession>;
  submitTestSession: (params: {
    sessionId: string;
    answers: Array<{ questionId: string; selectedOption: string | null }>;
    elapsedSeconds: number;
  }) => Promise<SubmitTestSessionResult>;
  saveProfile: (partial: Partial<ProfileState>) => Promise<void>;
  savePreferences: (partial: Partial<PreferencesState>) => Promise<void>;
  refreshAttempts: () => Promise<void>;
}

const defaultProfile: ProfileState = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  city: '',
  targetProgram: '',
  testSeries: '',
  sscPercentage: '',
  hsscPercentage: '',
  testDate: '',
};

const defaultPreferences: PreferencesState = {
  emailNotifications: true,
  dailyReminders: true,
  performanceReports: true,
};

const AppDataContext = createContext<AppDataContextValue | undefined>(undefined);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mcqs, setMcqs] = useState<MCQ[]>([]);
  const [mcqTotalsBySubject, setMcqTotalsBySubject] = useState<Record<SubjectKey, number>>(
    Object.fromEntries(SUBJECT_KEYS.map((subject) => [subject, 0])) as Record<SubjectKey, number>,
  );
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);
  const syncInFlightRef = useRef(false);
  const syncQueuedRef = useRef(false);

  const applyUserPayload = useCallback((userData: ProfileState & { preferences: PreferencesState }) => {
    setProfile({
      firstName: userData.firstName || '',
      lastName: userData.lastName || '',
      email: userData.email || '',
      phone: userData.phone || '',
      city: userData.city || '',
      targetProgram: userData.targetProgram || '',
      testSeries: userData.testSeries || '',
      sscPercentage: userData.sscPercentage || '',
      hsscPercentage: userData.hsscPercentage || '',
      testDate: userData.testDate || '',
    });
    setPreferences(userData.preferences || defaultPreferences);
  }, []);

  const loadMcqData = useCallback(async () => {
    const refreshTag = Date.now();
    const [payload, countPayload] = await Promise.all([
      apiRequest<{ mcqs: MCQ[] }>(`/api/mcqs?t=${refreshTag}`, { cache: 'no-store' }),
      apiRequest<{ counts: Partial<Record<SubjectKey, number>> }>(`/api/mcqs/counts?t=${refreshTag}`, { cache: 'no-store' }),
    ]);
    setMcqs(payload.mcqs || []);
    setMcqTotalsBySubject(
      SUBJECT_KEYS.reduce((acc, subject) => {
        acc[subject] = Number(countPayload?.counts?.[subject] || 0);
        return acc;
      }, {} as Record<SubjectKey, number>),
    );
  }, []);

  const loadUserData = useCallback(async (authToken: string, silent = false) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const mePayload = await apiRequest<{ user: ProfileState & { preferences: PreferencesState } }>('/api/auth/me', {}, authToken);
      const attemptsPayload = await apiRequest<{ attempts: TestAttempt[] }>('/api/tests/attempts', {}, authToken);
      applyUserPayload(mePayload.user);
      setAttempts((attemptsPayload.attempts || []) as TestAttempt[]);
      if (!silent) {
        setError(null);
      }
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load user data');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [applyUserPayload]);

  const runForegroundSync = useCallback(async (authToken: string) => {
    if (!authToken) return;
    if (syncInFlightRef.current) {
      syncQueuedRef.current = true;
      return;
    }

    syncInFlightRef.current = true;
    try {
      await loadMcqData().catch(() => undefined);
      if (user) {
        await loadUserData(authToken, true).catch(() => undefined);
      }
    } finally {
      syncInFlightRef.current = false;
      if (syncQueuedRef.current) {
        syncQueuedRef.current = false;
        void runForegroundSync(authToken);
      }
    }
  }, [loadMcqData, loadUserData, user]);

  useEffect(() => {
    let cancelled = false;

    void loadMcqData().catch((err) => {
      if (!cancelled) {
        const message = err instanceof Error ? err.message : 'Could not load MCQ dataset';
        setError(message);
        setMcqs([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [loadMcqData]);

  useEffect(() => {
    if (!user) {
      setAttempts([]);
      setProfile(defaultProfile);
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    void loadUserData(token || localStorage.getItem('net360-auth-token') || '').catch(() => undefined);
  }, [token, user, loadUserData]);

  useEffect(() => {
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;
    let reconnectDelay = 1500;

    const closeCurrent = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (closed) return;
      closeCurrent();

      source = new EventSource(`${buildApiUrl('/api/stream')}?token=${encodeURIComponent(authToken)}`);

      source.onopen = () => {
        reconnectDelay = 1500;
      };

      const runSync = () => {
        if (document.hidden) return;
        void runForegroundSync(authToken);
      };

      source.addEventListener('sync', runSync);

      source.addEventListener('heartbeat', () => {
        // Keeps stream warm; no action required.
      });

      source.onerror = () => {
        closeCurrent();
        if (closed) return;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(Math.round(reconnectDelay * 1.65), 15000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      closeCurrent();
    };
  }, [token, runForegroundSync]);

  useEffect(() => {
    if (!user) return;
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) return;

    const onVisibility = () => {
      if (document.hidden) return;
      void runForegroundSync(authToken);
    };

    const onOnline = () => {
      void runForegroundSync(authToken);
    };

    const onFocus = () => {
      if (document.hidden) return;
      void runForegroundSync(authToken);
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
  }, [token, user, runForegroundSync]);

  const mcqsBySubject = useMemo(() => {
    const grouped = Object.fromEntries(SUBJECT_KEYS.map((subject) => [subject, [] as MCQ[]])) as Record<SubjectKey, MCQ[]>;

    mcqs.forEach((question) => {
      if (!Object.prototype.hasOwnProperty.call(grouped, question.subject)) return;
      grouped[question.subject].push(question);
    });

    return grouped;
  }, [mcqs]);

  const mcqsBySubjectAndDifficulty = useMemo(() => {
    const grouped = Object.fromEntries(
      SUBJECT_KEYS.map((subject) => [subject, { Easy: [] as MCQ[], Medium: [] as MCQ[], Hard: [] as MCQ[] }]),
    ) as Record<SubjectKey, Record<Difficulty, MCQ[]>>;

    mcqs.forEach((question) => {
      if (!Object.prototype.hasOwnProperty.call(grouped, question.subject)) return;
      const subjectBuckets = grouped[question.subject];
      const difficultyKey = String(question.difficulty || '').trim() as Difficulty;
      const targetBucket = subjectBuckets?.[difficultyKey];
      console.log('[MCQ Difficulty Bucket Check]', {
        subject: question.subject,
        difficulty: question.difficulty,
        hasBucket: Array.isArray(targetBucket),
      });
      if (!Array.isArray(targetBucket)) return;
      targetBucket.push(question);
    });

    return grouped;
  }, [mcqs]);

  const refreshAttempts = async () => {
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) return;
    const payload = await apiRequest<{ attempts: TestAttempt[] }>('/api/tests/attempts', {}, authToken);
    setAttempts((payload.attempts || []) as TestAttempt[]);
  };

  const startTestSession: AppDataContextValue['startTestSession'] = async ({
    subject,
    difficulty,
    topic,
    mode,
    questionCount = 20,
    part,
    chapter,
    section,
    netType,
    testType,
    selectedSubject,
  }) => {
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) {
      throw new Error('Please login first to start a server-backed test session.');
    }

    console.log('[MCQ Test Request]', { subject, chapter, topic, section, mode });
    const startPayload = await apiRequest<{ session: TestSession }>(
      '/api/tests/start',
      {
        method: 'POST',
        body: JSON.stringify({
          subject,
          difficulty,
          topic,
          mode,
          questionCount,
          part,
          chapter,
          section,
          netType,
          testType,
          selectedSubject,
        }),
      },
      authToken,
    );
    console.log('[MCQ Test Response]', {
      subject,
      chapter,
      topic,
      section,
      returnedMcqs: Array.isArray(startPayload?.session?.questions) ? startPayload.session.questions.length : 0,
    });

    return startPayload.session;
  };

  const getTestSession: AppDataContextValue['getTestSession'] = async (sessionId) => {
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) {
      throw new Error('Please login first to load a test session.');
    }

    const payload = await apiRequest<{ session: TestSession }>(`/api/tests/${sessionId}`, {}, authToken);
    return payload.session;
  };

  const submitTestSession: AppDataContextValue['submitTestSession'] = async ({ sessionId, answers, elapsedSeconds }) => {
    const authToken = token || localStorage.getItem('net360-auth-token');
    if (!authToken) {
      throw new Error('Please login first to submit a test session.');
    }

    const payload = await apiRequest<{ attempt: TestAttempt; review?: TestReviewRow[] }>(
      `/api/tests/${sessionId}/finish`,
      {
        method: 'POST',
        body: JSON.stringify({ answers, elapsedSeconds }),
      },
      authToken,
    );

    const attempt = payload.attempt;
    setAttempts((previous) => {
      const withoutSame = previous.filter((item) => item.id !== attempt.id);
      return [attempt, ...withoutSame];
    });
    return {
      attempt,
      review: Array.isArray(payload.review) ? payload.review : [],
    };
  };

  const startPracticeTest: AppDataContextValue['startPracticeTest'] = async ({
    subject,
    difficulty,
    topic,
    mode,
    questionCount = 20,
  }) => {
    const session = await startTestSession({ subject, difficulty, topic, mode, questionCount });

    // Backward-compatible quick mode for existing topic/adaptive cards: select first option per question.
    const answers = session.questions.map((question) => ({
      questionId: question.id,
      selectedOption: question.options[0] || null,
    }));

    const { attempt } = await submitTestSession({
      sessionId: session.id,
      answers,
      elapsedSeconds: Math.max(60, Math.round(session.durationMinutes * 60 * 0.6)),
    });

    return attempt;
  };

  const saveProfile = async (partial: Partial<ProfileState>) => {
    if (!token || !user) {
      throw new Error('Please login first to save profile.');
    }

    const payload = await apiRequest<{ user: ProfileState & { preferences: PreferencesState } }>(
      '/api/auth/profile',
      {
        method: 'PUT',
        body: JSON.stringify(partial),
      },
      token,
    );

    setProfile({
      firstName: payload.user.firstName || '',
      lastName: payload.user.lastName || '',
      email: payload.user.email || '',
      phone: payload.user.phone || '',
      city: payload.user.city || '',
      targetProgram: payload.user.targetProgram || '',
      testSeries: payload.user.testSeries || '',
      sscPercentage: payload.user.sscPercentage || '',
      hsscPercentage: payload.user.hsscPercentage || '',
      testDate: payload.user.testDate || '',
    });
  };

  const savePreferences = async (partial: Partial<PreferencesState>) => {
    if (!token || !user) {
      throw new Error('Please login first to save preferences.');
    }

    const payload = await apiRequest<{ user: ProfileState & { preferences: PreferencesState } }>(
      '/api/auth/preferences',
      {
        method: 'PUT',
        body: JSON.stringify(partial),
      },
      token,
    );

    setPreferences(payload.user.preferences || defaultPreferences);
  };

  return (
    <AppDataContext.Provider
      value={{
        loading,
        error,
        mcqs,
        mcqTotalsBySubject,
        mcqsBySubject,
        mcqsBySubjectAndDifficulty,
        attempts,
        profile,
        preferences,
        startPracticeTest,
        startTestSession,
        getTestSession,
        submitTestSession,
        saveProfile,
        savePreferences,
        refreshAttempts,
      }}
    >
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (!context) {
    throw new Error('useAppData must be used inside AppDataProvider');
  }
  return context;
}
