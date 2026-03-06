import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { Difficulty, MCQ, SubjectKey } from '../lib/mcq';
import { apiRequest, resolveApiUrl } from '../lib/api';
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
  difficulty: Difficulty;
  explanation?: string;
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
  }) => Promise<TestSession>;
  getTestSession: (sessionId: string) => Promise<TestSession>;
  submitTestSession: (params: {
    sessionId: string;
    answers: Array<{ questionId: string; selectedOption: string | null }>;
    elapsedSeconds: number;
  }) => Promise<TestAttempt>;
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
  const [attempts, setAttempts] = useState<TestAttempt[]>([]);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [preferences, setPreferences] = useState<PreferencesState>(defaultPreferences);

  useEffect(() => {
    let cancelled = false;

    async function loadMcqData() {
      try {
        const payload = await apiRequest<{ mcqs: MCQ[] }>('/api/mcqs');
        if (!cancelled) {
          setMcqs(payload.mcqs || []);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Could not load MCQ dataset';
          setError(message);
          setMcqs([]);
        }
      }
    }

    void loadMcqData();

    const stream = new EventSource(resolveApiUrl('/api/events'));
    const refreshOnUpdate = () => {
      void loadMcqData();
    };
    stream.addEventListener('mcqs.updated', refreshOnUpdate);

    return () => {
      cancelled = true;
      stream.removeEventListener('mcqs.updated', refreshOnUpdate);
      stream.close();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setAttempts([]);
      setProfile(defaultProfile);
      setPreferences(defaultPreferences);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function loadUserData() {
      setLoading(true);
      setError(null);
      try {
        const mePayload = await apiRequest<{ user: ProfileState & { preferences: PreferencesState } }>('/api/auth/me', {}, token);
        const attemptsPayload = await apiRequest<{ attempts: TestAttempt[] }>('/api/tests/attempts', {}, token);

        if (!cancelled) {
          const userData = mePayload.user;
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
          setAttempts((attemptsPayload.attempts || []) as TestAttempt[]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load user data');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadUserData();

    return () => {
      cancelled = true;
    };
  }, [token, user]);

  const mcqsBySubject = useMemo(() => {
    const grouped: Record<SubjectKey, MCQ[]> = {
      mathematics: [],
      physics: [],
      english: [],
      biology: [],
      chemistry: [],
    };

    mcqs.forEach((question) => {
      grouped[question.subject].push(question);
    });

    return grouped;
  }, [mcqs]);

  const mcqsBySubjectAndDifficulty = useMemo(() => {
    const grouped: Record<SubjectKey, Record<Difficulty, MCQ[]>> = {
      mathematics: { Easy: [], Medium: [], Hard: [] },
      physics: { Easy: [], Medium: [], Hard: [] },
      english: { Easy: [], Medium: [], Hard: [] },
      biology: { Easy: [], Medium: [], Hard: [] },
      chemistry: { Easy: [], Medium: [], Hard: [] },
    };

    mcqs.forEach((question) => {
      grouped[question.subject][question.difficulty].push(question);
    });

    return grouped;
  }, [mcqs]);

  const refreshAttempts = async () => {
    if (!token || !user) return;
    const payload = await apiRequest<{ attempts: TestAttempt[] }>('/api/tests/attempts', {}, token);
    setAttempts((payload.attempts || []) as TestAttempt[]);
  };

  const startTestSession: AppDataContextValue['startTestSession'] = async ({
    subject,
    difficulty,
    topic,
    mode,
    questionCount = 20,
  }) => {
    if (!token || !user) {
      throw new Error('Please login first to start a server-backed test session.');
    }

    const startPayload = await apiRequest<{ session: TestSession }>(
      '/api/tests/start',
      {
        method: 'POST',
        body: JSON.stringify({ subject, difficulty, topic, mode, questionCount }),
      },
      token,
    );

    return startPayload.session;
  };

  const getTestSession: AppDataContextValue['getTestSession'] = async (sessionId) => {
    if (!token || !user) {
      throw new Error('Please login first to load a test session.');
    }

    const payload = await apiRequest<{ session: TestSession }>(`/api/tests/${sessionId}`, {}, token);
    return payload.session;
  };

  const submitTestSession: AppDataContextValue['submitTestSession'] = async ({ sessionId, answers, elapsedSeconds }) => {
    if (!token || !user) {
      throw new Error('Please login first to submit a test session.');
    }

    const payload = await apiRequest<{ attempt: TestAttempt }>(
      `/api/tests/${sessionId}/finish`,
      {
        method: 'POST',
        body: JSON.stringify({ answers, elapsedSeconds }),
      },
      token,
    );

    const attempt = payload.attempt;
    setAttempts((previous) => {
      const withoutSame = previous.filter((item) => item.id !== attempt.id);
      return [attempt, ...withoutSame];
    });
    return attempt;
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

    const attempt = await submitTestSession({
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
