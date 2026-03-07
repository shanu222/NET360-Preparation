import { parseMcqs, type Difficulty, type MCQ, type SubjectKey } from './mcq';

type TestMode = 'topic' | 'mock' | 'adaptive';
type TestType = 'subject-wise' | 'full-mock' | 'adaptive';

type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  targetProgram: string;
  testSeries: string;
  sscPercentage: string;
  hsscPercentage: string;
  testDate: string;
  role: 'student' | 'admin';
  preferences: {
    emailNotifications: boolean;
    dailyReminders: boolean;
    performanceReports: boolean;
  };
  progress: {
    questionsSolved: number;
    testsCompleted: number;
    averageScore: number;
    completedTests: string[];
    scores: number[];
    studyHours: number;
    weakTopics: string[];
    practiceHistory: LocalAttempt[];
    analytics: {
      weeklyProgress: Array<Record<string, unknown>>;
      accuracyTrend: Array<Record<string, unknown>>;
    };
    studyPlan: Record<string, unknown> | null;
  };
  test_history: string[];
  scores: number[];
  study_hours: number;
  weak_topics: string[];
};

interface LocalUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  city: string;
  targetProgram: string;
  testSeries: string;
  sscPercentage: string;
  hsscPercentage: string;
  testDate: string;
  role: 'student' | 'admin';
  preferences: PublicUser['preferences'];
  progress: PublicUser['progress'];
  refreshTokens: string[];
  resetPasswordToken: string | null;
  resetPasswordExpiresAt: string | null;
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

interface LocalSession {
  id: string;
  userId: string;
  subject: SubjectKey;
  difficulty: Difficulty;
  topic: string;
  mode: TestMode;
  questions: SessionQuestion[];
  answerKey: Record<string, string>;
  questionIds: string[];
  questionCount: number;
  durationMinutes: number;
  startedAt: string;
  finishedAt: string | null;
  netType?: string;
  testType?: TestType | TestMode;
  config?: {
    profile: string;
    requestedTestType: string;
    distribution: Array<{ label: string; percentage: number; sourceSubjects: SubjectKey[] }>;
    selectedSubject: SubjectKey | null;
  };
}

interface LocalAttempt {
  id: string;
  sessionId: string;
  userId: string;
  subject: SubjectKey;
  topic: string;
  difficulty: Difficulty;
  mode: TestMode;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  wrongAnswers: number;
  unanswered: number;
  submittedAnswers: number;
  durationMinutes: number;
  attemptedAt: string;
  submittedAt: string;
  metadata: Record<string, unknown>;
}

interface LocalAIUsage {
  userId: string;
  day: string;
  chatCount: number;
}

interface LocalDb {
  users: LocalUser[];
  sessions: LocalSession[];
  attempts: LocalAttempt[];
  aiUsage: LocalAIUsage[];
}

const DB_STORAGE_KEY = 'net360-local-db-v3';
const MCQ_DATA_PATH = '/MCQS/NET_10000_MCQs_Dataset.csv';
let cachedMcqs: MCQ[] = [];

function defaultPreferences(): PublicUser['preferences'] {
  return {
    emailNotifications: true,
    dailyReminders: true,
    performanceReports: true,
  };
}

function defaultProgress(): PublicUser['progress'] {
  return {
    questionsSolved: 0,
    testsCompleted: 0,
    averageScore: 0,
    completedTests: [],
    scores: [],
    studyHours: 0,
    weakTopics: [],
    practiceHistory: [],
    analytics: {
      weeklyProgress: [],
      accuracyTrend: [],
    },
    studyPlan: null,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeAnswer(answer: string, options: string[]) {
  const trimmed = String(answer || '').trim();
  if (!trimmed) return '';
  const labels = ['A', 'B', 'C', 'D'];
  const upper = trimmed.toUpperCase();
  const index = labels.indexOf(upper);
  if (index >= 0 && options[index]) {
    return options[index];
  }
  const exact = options.find((option) => option.trim().toLowerCase() === trimmed.toLowerCase());
  return exact || trimmed;
}

function toPublicUser(user: LocalUser): PublicUser {
  const progress = user.progress || defaultProgress();
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    city: user.city,
    targetProgram: user.targetProgram,
    testSeries: user.testSeries,
    sscPercentage: user.sscPercentage,
    hsscPercentage: user.hsscPercentage,
    testDate: user.testDate,
    role: user.role || 'student',
    preferences: user.preferences || defaultPreferences(),
    progress,
    test_history: progress.completedTests,
    scores: progress.scores,
    study_hours: progress.studyHours,
    weak_topics: progress.weakTopics,
  };
}

function toPublicSession(session: LocalSession) {
  return {
    id: session.id,
    userId: session.userId,
    subject: session.subject,
    difficulty: session.difficulty,
    topic: session.topic,
    mode: session.mode,
    questionCount: session.questionCount,
    durationMinutes: session.durationMinutes,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    questions: session.questions,
    netType: session.netType,
    testType: session.testType,
    config: session.config,
  };
}

const NET_TEST_PROFILES: Record<string, {
  label: string;
  durationMinutes: number;
  totalQuestions: number;
  distribution: Array<{ label: string; percentage: number; sourceSubjects: SubjectKey[] }>;
  subjectWiseQuestions: Partial<Record<SubjectKey, number>>;
}> = {
  'net-engineering': {
    label: 'NET Engineering',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'Physics', percentage: 30, sourceSubjects: ['physics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: { mathematics: 100, physics: 60, english: 40 },
  },
  'net-applied-sciences': {
    label: 'NET Applied Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Biology', percentage: 50, sourceSubjects: ['biology'] },
      { label: 'Chemistry', percentage: 30, sourceSubjects: ['chemistry'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: { biology: 100, chemistry: 60, english: 40 },
  },
  'net-business-social-sciences': {
    label: 'NET Business & Social Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Quantitative Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: { mathematics: 100, english: 100 },
  },
  'net-architecture': {
    label: 'NET Architecture',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Design Aptitude', percentage: 50, sourceSubjects: ['english', 'physics', 'mathematics'] },
      { label: 'Mathematics', percentage: 30, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: { mathematics: 100, english: 60, physics: 40 },
  },
  'net-natural-sciences': {
    label: 'NET Natural Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: { mathematics: 100, english: 100 },
  },
};

function normalizeNetType(raw: unknown) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'net-engineering';

  const aliases: Record<string, string> = {
    engineering: 'net-engineering',
    'net engineering': 'net-engineering',
    'net-engineering': 'net-engineering',
    applied: 'net-applied-sciences',
    'applied sciences': 'net-applied-sciences',
    'net applied sciences': 'net-applied-sciences',
    'net-applied-sciences': 'net-applied-sciences',
    business: 'net-business-social-sciences',
    'business & social sciences': 'net-business-social-sciences',
    'business and social sciences': 'net-business-social-sciences',
    'net-business-social-sciences': 'net-business-social-sciences',
    architecture: 'net-architecture',
    'net-architecture': 'net-architecture',
    'natural sciences': 'net-natural-sciences',
    'net-natural-sciences': 'net-natural-sciences',
  };

  return aliases[value] || value;
}

function allocateDistributionCounts(
  distribution: Array<{ label: string; percentage: number; sourceSubjects: SubjectKey[] }>,
  totalQuestions: number,
) {
  const base = distribution.map((item) => ({
    ...item,
    count: Math.floor((item.percentage / 100) * totalQuestions),
  }));

  let assigned = base.reduce((sum, item) => sum + item.count, 0);
  let cursor = 0;
  while (assigned < totalQuestions && base.length) {
    base[cursor % base.length].count += 1;
    assigned += 1;
    cursor += 1;
  }

  return base;
}

function pickFromPoolsByDistribution(params: {
  distribution: Array<{ label: string; percentage: number; sourceSubjects: SubjectKey[] }>;
  pool: MCQ[];
  totalQuestions: number;
  usedIds?: Set<string>;
}) {
  const { distribution, pool, totalQuestions, usedIds = new Set<string>() } = params;
  const counts = allocateDistributionCounts(distribution, totalQuestions);
  const selected: MCQ[] = [];

  counts.forEach((entry) => {
    const candidates = shuffle(
      pool.filter((item) => !usedIds.has(item.id) && entry.sourceSubjects.includes(item.subject)),
    );
    let pickedForEntry = 0;
    for (const question of candidates) {
      selected.push(question);
      usedIds.add(question.id);
      pickedForEntry += 1;
      if (pickedForEntry >= entry.count || selected.length >= totalQuestions) break;
    }
  });

  if (selected.length < totalQuestions) {
    const fallback = shuffle(pool.filter((item) => !usedIds.has(item.id)));
    for (const question of fallback) {
      selected.push(question);
      usedIds.add(question.id);
      if (selected.length >= totalQuestions) break;
    }
  }

  return selected.slice(0, totalQuestions);
}

function generateAdaptiveSet(params: {
  profile: {
    distribution: Array<{ label: string; percentage: number; sourceSubjects: SubjectKey[] }>;
  };
  allQuestions: MCQ[];
  weakTopics: string[];
  questionCount: number;
}) {
  const { profile, allQuestions, weakTopics, questionCount } = params;
  const profileSubjects = Array.from(new Set(profile.distribution.flatMap((item) => item.sourceSubjects)));
  const inScope = allQuestions.filter((item) => profileSubjects.includes(item.subject));
  const weakSet = new Set((weakTopics || []).map((item) => String(item).toLowerCase()));

  const weakPool = inScope.filter(
    (item) => weakSet.has(String(item.subject).toLowerCase()) || weakSet.has(String(item.topic).toLowerCase()),
  );
  const mediumPool = inScope.filter((item) => item.difficulty === 'Medium');
  const hardPool = inScope.filter((item) => item.difficulty === 'Hard');

  const weakCount = Math.max(1, Math.round(questionCount * 0.4));
  const mediumCount = Math.max(1, Math.round(questionCount * 0.4));
  const hardCount = Math.max(1, questionCount - weakCount - mediumCount);

  const selected: MCQ[] = [];
  const usedIds = new Set<string>();

  for (const question of shuffle(weakPool)) {
    if (usedIds.has(question.id)) continue;
    selected.push(question);
    usedIds.add(question.id);
    if (selected.length >= weakCount) break;
  }

  for (const question of shuffle(mediumPool)) {
    if (usedIds.has(question.id)) continue;
    selected.push(question);
    usedIds.add(question.id);
    if (selected.length >= weakCount + mediumCount) break;
  }

  for (const question of shuffle(hardPool)) {
    if (usedIds.has(question.id)) continue;
    selected.push(question);
    usedIds.add(question.id);
    if (selected.length >= weakCount + mediumCount + hardCount) break;
  }

  if (selected.length < questionCount) {
    for (const question of shuffle(inScope.filter((item) => !usedIds.has(item.id)))) {
      selected.push(question);
      usedIds.add(question.id);
      if (selected.length >= questionCount) break;
    }
  }

  const difficultyRank: Record<Difficulty, number> = { Easy: 1, Medium: 2, Hard: 3 };
  selected.sort((a, b) => (difficultyRank[a.difficulty] || 2) - (difficultyRank[b.difficulty] || 2));

  return selected.slice(0, questionCount);
}

function readDb(): LocalDb {
  const raw = localStorage.getItem(DB_STORAGE_KEY);
  if (!raw) {
    return { users: [], sessions: [], attempts: [], aiUsage: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    return {
      users: parsed.users || [],
      sessions: parsed.sessions || [],
      attempts: parsed.attempts || [],
      aiUsage: parsed.aiUsage || [],
    };
  } catch {
    return { users: [], sessions: [], attempts: [], aiUsage: [] };
  }
}

function writeDb(db: LocalDb) {
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
}

function parseAccessToken(token?: string | null) {
  if (!token) return null;
  if (!token.startsWith('local:')) return null;
  return token.slice('local:'.length);
}

function requireAuth(token?: string | null) {
  const userId = parseAccessToken(token);
  if (!userId) {
    throw new Error('Missing authentication token.');
  }

  const db = readDb();
  const user = db.users.find((item) => item.id === userId);
  if (!user) {
    throw new Error('User not found.');
  }

  return { db, user };
}

function requireAdmin(token?: string | null) {
  const { db, user } = requireAuth(token);
  if (user.role !== 'admin') {
    throw new Error('Admin access required.');
  }
  return { db, user };
}

async function loadMcqs() {
  if (cachedMcqs.length) return cachedMcqs;

  const response = await fetch(MCQ_DATA_PATH);
  if (!response.ok) {
    throw new Error('Failed to load MCQ dataset.');
  }

  const csvText = await response.text();
  cachedMcqs = parseMcqs(csvText).map((item) => ({
    ...item,
    answer: normalizeAnswer(item.answer, item.options),
  }));
  return cachedMcqs;
}

function parseBody(options: RequestInit) {
  if (!options.body) return {};
  if (typeof options.body === 'string') {
    try {
      return JSON.parse(options.body);
    } catch {
      return {};
    }
  }
  return {};
}

function updateProgress(db: LocalDb, user: LocalUser) {
  const attempts = db.attempts.filter((item) => item.userId === user.id);
  const scores = attempts.map((item) => item.score);
  const totalQuestions = attempts.reduce((sum, item) => sum + item.totalQuestions, 0);
  const totalMinutes = attempts.reduce((sum, item) => sum + item.durationMinutes, 0);
  const averageScore = scores.length
    ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
    : 0;

  const subjectStats = new Map<string, { total: number; count: number }>();
  attempts.forEach((item) => {
    const current = subjectStats.get(item.subject) || { total: 0, count: 0 };
    current.total += item.score;
    current.count += 1;
    subjectStats.set(item.subject, current);
  });

  const weakTopics = Array.from(subjectStats.entries())
    .filter(([, value]) => value.count > 0 && value.total / value.count < 60)
    .map(([subject]) => subject);

  user.progress = {
    ...defaultProgress(),
    ...user.progress,
    questionsSolved: totalQuestions,
    testsCompleted: attempts.length,
    averageScore,
    completedTests: attempts.map((item) => item.id),
    scores,
    studyHours: Number((totalMinutes / 60).toFixed(1)),
    weakTopics,
    practiceHistory: attempts.slice(0, 200),
    analytics: {
      weeklyProgress: attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, score: item.score })),
      accuracyTrend: attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, accuracy: item.score })),
    },
  };
}

function buildMockQuestionSet(mcqs: MCQ[], desiredCount: number) {
  const targets: Array<{ subject: SubjectKey; count: number }> = [
    { subject: 'mathematics', count: 100 },
    { subject: 'physics', count: 60 },
    { subject: 'english', count: 40 },
  ];

  const selected: MCQ[] = [];
  const usedIds = new Set<string>();

  targets.forEach((target) => {
    const pool = shuffle(mcqs.filter((item) => item.subject === target.subject));
    for (const question of pool) {
      if (usedIds.has(question.id)) continue;
      selected.push(question);
      usedIds.add(question.id);
      if (selected.length >= desiredCount || selected.filter((item) => item.subject === target.subject).length >= target.count) {
        break;
      }
    }
  });

  if (selected.length < desiredCount) {
    const remainder = shuffle(mcqs.filter((item) => !usedIds.has(item.id)));
    for (const question of remainder) {
      selected.push(question);
      if (selected.length >= desiredCount) break;
    }
  }

  return selected;
}

function generateStudyPlan(params: {
  targetDate: string;
  preparationLevel: string;
  weakSubjects: string[];
  dailyStudyHours: number;
}) {
  const { targetDate, preparationLevel, weakSubjects, dailyStudyHours } = params;
  const now = new Date();
  const examDate = targetDate ? new Date(targetDate) : new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  const daysLeft = Math.max(1, Math.ceil((examDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  const weeks = Math.max(1, Math.ceil(daysLeft / 7));
  const focusSubjects = weakSubjects.length ? weakSubjects : ['mathematics', 'physics', 'chemistry', 'english'];

  const weeklyTargets = Array.from({ length: weeks }, (_, index) => {
    const subject = focusSubjects[index % focusSubjects.length];
    return {
      week: index + 1,
      focus: subject,
      target: `Complete ${subject} modules and one timed test`,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    targetDate: examDate.toISOString().slice(0, 10),
    daysLeft,
    preparationLevel,
    weakSubjects,
    dailyStudyHours,
    weeklyTargets,
    dailySchedule: [
      { block: 'Session 1', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.4)), activity: 'Concept learning + notes' },
      { block: 'Session 2', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.35)), activity: 'Topic MCQs + review' },
      { block: 'Session 3', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.25)), activity: 'Revision + weak topic drilling' },
    ],
    roadmap: [
      'Foundation and formula consolidation',
      'Topic-wise practice and adaptive drills',
      'Full mock tests and revision',
    ],
  };
}

function createRefreshToken(userId: string) {
  return `localr:${userId}:${Math.random().toString(36).slice(2)}`;
}

export async function localApiRequest<T>(path: string, options: RequestInit = {}, token?: string | null): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const url = new URL(path, window.location.origin);
  const body = parseBody(options);

  if (url.pathname === '/api/health' && method === 'GET') {
    return { status: 'ok', service: 'net360-local-api' } as T;
  }

  if (url.pathname === '/api/auth/register' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const db = readDb();
    const exists = db.users.some((user) => user.email === email);
    if (exists) {
      throw new Error('Email is already registered.');
    }

    const role: 'student' | 'admin' = email.includes('admin') ? 'admin' : 'student';
    const user: LocalUser = {
      id: `user-${Date.now()}`,
      email,
      password,
      firstName: String(body.firstName || ''),
      lastName: String(body.lastName || ''),
      phone: '',
      city: '',
      targetProgram: '',
      testSeries: '',
      sscPercentage: '',
      hsscPercentage: '',
      testDate: '',
      role,
      preferences: defaultPreferences(),
      progress: defaultProgress(),
      refreshTokens: [],
      resetPasswordToken: null,
      resetPasswordExpiresAt: null,
    };

    const refreshToken = createRefreshToken(user.id);
    user.refreshTokens.push(refreshToken);

    db.users.push(user);
    writeDb(db);

    return {
      token: `local:${user.id}`,
      refreshToken,
      user: toPublicUser(user),
    } as T;
  }

  if (url.pathname === '/api/auth/login' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const db = readDb();
    const user = db.users.find((item) => item.email === email);
    if (!user || user.password !== password) {
      throw new Error('Invalid credentials.');
    }

    const refreshToken = createRefreshToken(user.id);
    user.refreshTokens.unshift(refreshToken);
    user.refreshTokens = user.refreshTokens.slice(0, 5);
    writeDb(db);

    return {
      token: `local:${user.id}`,
      refreshToken,
      user: toPublicUser(user),
    } as T;
  }

  if (url.pathname === '/api/auth/refresh' && method === 'POST') {
    const refreshToken = String(body.refreshToken || '').trim();
    if (!refreshToken) {
      throw new Error('Refresh token is required.');
    }

    const db = readDb();
    const user = db.users.find((item) => item.refreshTokens.includes(refreshToken));
    if (!user) {
      throw new Error('Refresh token revoked or expired.');
    }

    user.refreshTokens = user.refreshTokens.filter((item) => item !== refreshToken);
    const nextRefreshToken = createRefreshToken(user.id);
    user.refreshTokens.unshift(nextRefreshToken);
    writeDb(db);

    return {
      token: `local:${user.id}`,
      refreshToken: nextRefreshToken,
      user: toPublicUser(user),
    } as T;
  }

  if (url.pathname === '/api/auth/logout' && method === 'POST') {
    const refreshToken = String(body.refreshToken || '').trim();
    if (!refreshToken) {
      return { message: 'Logged out.' } as T;
    }

    const db = readDb();
    const user = db.users.find((item) => item.refreshTokens.includes(refreshToken));
    if (user) {
      user.refreshTokens = user.refreshTokens.filter((item) => item !== refreshToken);
      writeDb(db);
    }

    return { message: 'Logged out.' } as T;
  }

  if (url.pathname === '/api/auth/forgot-password' && method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) {
      throw new Error('Email is required.');
    }

    const db = readDb();
    const user = db.users.find((item) => item.email === email);
    if (user) {
      user.resetPasswordToken = `local-reset-${Date.now()}`;
      user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      writeDb(db);
      return { message: 'Reset link generated.', resetToken: user.resetPasswordToken } as T;
    }

    return { message: 'If this email exists, a password reset link has been sent.' } as T;
  }

  if (url.pathname === '/api/auth/reset-password' && method === 'POST') {
    const tokenValue = String(body.token || '').trim();
    const newPassword = String(body.newPassword || '');
    if (!tokenValue || !newPassword) {
      throw new Error('Token and new password are required.');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const db = readDb();
    const user = db.users.find(
      (item) =>
        item.resetPasswordToken === tokenValue &&
        item.resetPasswordExpiresAt &&
        new Date(item.resetPasswordExpiresAt).getTime() > Date.now(),
    );

    if (!user) {
      throw new Error('Invalid or expired reset token.');
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpiresAt = null;
    user.refreshTokens = [];
    writeDb(db);
    return { message: 'Password reset successful.' } as T;
  }

  if (url.pathname === '/api/auth/me' && method === 'GET') {
    const { user } = requireAuth(token);
    return { user: toPublicUser(user) } as T;
  }

  if (url.pathname === '/api/auth/profile' && method === 'PUT') {
    const { db, user } = requireAuth(token);
    const allowed = ['firstName', 'lastName', 'phone', 'city', 'targetProgram', 'testSeries', 'sscPercentage', 'hsscPercentage', 'testDate'] as const;
    allowed.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(body, key)) {
        user[key] = String(body[key] ?? '');
      }
    });
    writeDb(db);
    return { user: toPublicUser(user) } as T;
  }

  if (url.pathname === '/api/auth/preferences' && method === 'PUT') {
    const { db, user } = requireAuth(token);
    const current = user.preferences || defaultPreferences();
    user.preferences = {
      emailNotifications: typeof body.emailNotifications === 'boolean' ? body.emailNotifications : current.emailNotifications,
      dailyReminders: typeof body.dailyReminders === 'boolean' ? body.dailyReminders : current.dailyReminders,
      performanceReports: typeof body.performanceReports === 'boolean' ? body.performanceReports : current.performanceReports,
    };
    writeDb(db);
    return { user: toPublicUser(user) } as T;
  }

  if (url.pathname === '/api/mcqs' && method === 'GET') {
    const mcqs = await loadMcqs();
    const subject = url.searchParams.get('subject');
    const difficulty = url.searchParams.get('difficulty');
    const topic = url.searchParams.get('topic');
    const limit = Number(url.searchParams.get('limit') || '10000');

    let results = [...mcqs];
    if (subject) {
      results = results.filter((item) => item.subject === subject.toLowerCase());
    }
    if (difficulty) {
      const expected = difficulty.toLowerCase();
      results = results.filter((item) => item.difficulty.toLowerCase() === expected);
    }
    if (topic) {
      const expected = topic.toLowerCase();
      results = results.filter((item) => item.topic.toLowerCase().includes(expected));
    }

    const max = clamp(Number.isFinite(limit) ? limit : 10000, 1, 10000);
    return {
      mcqs: results.slice(0, max),
      total: results.length,
    } as T;
  }

  if (url.pathname === '/api/practice/analyze' && method === 'POST') {
    requireAuth(token);

    const stepsRaw = String(body.steps || '').trim();
    if (!stepsRaw) {
      throw new Error('Solution steps are required.');
    }

    const steps = stepsRaw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const analysis = steps.map((step, index) => {
      const lower = step.toLowerCase();
      const correct = (/[=+\-*/]/.test(step) && /[a-z0-9]/i.test(step)) || lower.includes('answer');
      return {
        step: index + 1,
        correct,
        message: correct
          ? 'Step is structurally valid. Keep equations explicit for maximum accuracy.'
          : 'Step seems incomplete. Add the transformed equation and operation used.',
      };
    });

    const mcqs = await loadMcqs();
    const similarQuestions = mcqs.slice(0, 5).map((item) => ({
      id: item.id,
      subject: item.subject,
      topic: item.topic,
      question: item.question,
      difficulty: item.difficulty,
    }));

    return {
      analysis,
      correctSteps: analysis.filter((item) => item.correct).length,
      totalSteps: analysis.length,
      suggestedSolution: [
        'Isolate variable terms on one side of the equation.',
        'Simplify constants step-by-step.',
        'Apply inverse operation to solve for the unknown.',
        'Substitute result into original equation to verify.',
      ],
      similarQuestions,
    } as T;
  }

  if (url.pathname === '/api/ai/mentor/chat' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const message = String(body.message || '').trim();
    if (!message) {
      throw new Error('Message is required.');
    }

    const day = new Date().toISOString().slice(0, 10);
    const key = `${user.id}-${day}`;
    const usage = db.aiUsage.find((item) => `${item.userId}-${item.day}` === key);
    if (!usage) {
      db.aiUsage.push({ userId: user.id, day, chatCount: 1 });
    } else {
      usage.chatCount += 1;
    }

    const currentUsage = db.aiUsage.find((item) => `${item.userId}-${item.day}` === key)!;
    const dailyLimit = 50;
    if (currentUsage.chatCount > dailyLimit) {
      throw new Error(`Daily AI limit reached (${dailyLimit}). Please continue tomorrow.`);
    }

    let answer = 'Break the topic into concept summary, solved examples, and timed MCQs. Share one exact question and I will provide a step-by-step solution path.';
    const normalized = message.toLowerCase();
    if (normalized.includes('integration')) {
      answer = 'Try LIATE for integration by parts, and test substitution first when an inner derivative appears. Solve 2 timed examples and compare with answer key steps.';
    } else if (normalized.includes('physics') || normalized.includes('newton')) {
      answer = 'For numericals: draw FBD, define knowns, select equation, solve, then unit-check. In NET, free-body setup usually decides the correct option fastest.';
    } else if (normalized.includes('chemistry')) {
      answer = 'Use concept buckets: periodic trends, bonding, stoichiometry, and equilibrium. Solve 15 topic MCQs, then review incorrect options to find recurring mistakes.';
    }

    writeDb(db);

    return {
      answer,
      usage: {
        usedToday: currentUsage.chatCount,
        remainingToday: Math.max(0, dailyLimit - currentUsage.chatCount),
      },
    } as T;
  }

  if (url.pathname === '/api/study-plans/generate' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const targetDate = String(body.targetDate || '');
    const preparationLevel = String(body.preparationLevel || 'intermediate');
    const weakSubjects = Array.isArray(body.weakSubjects) ? body.weakSubjects.map((item: unknown) => String(item)) : [];
    const dailyStudyHours = clamp(Number(body.dailyStudyHours) || 3, 1, 14);

    const plan = generateStudyPlan({
      targetDate,
      preparationLevel,
      weakSubjects,
      dailyStudyHours,
    });

    user.progress = {
      ...defaultProgress(),
      ...user.progress,
      studyPlan: plan,
    };

    writeDb(db);
    return { studyPlan: plan } as T;
  }

  if (url.pathname === '/api/study-plans/latest' && method === 'GET') {
    const { user } = requireAuth(token);
    return { studyPlan: user.progress?.studyPlan || null } as T;
  }

  if (url.pathname === '/api/tests/start' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const subject = String(body.subject || 'mathematics').toLowerCase() as SubjectKey;
    const difficulty = String(body.difficulty || 'Medium') as Difficulty;
    const topic = String(body.topic || 'All Topics');
    const mode = String(body.mode || '') as TestMode;
    const netType = normalizeNetType(body.netType);
    const testType = String(body.testType || '').toLowerCase() as TestType | '';
    const selectedSubject = String(body.selectedSubject || subject).toLowerCase() as SubjectKey;
    const profile = NET_TEST_PROFILES[netType] || NET_TEST_PROFILES['net-engineering'];
    const requested = Number(body.questionCount) || (mode === 'mock' ? profile.totalQuestions : 20);
    const questionCount = clamp(requested, 1, 200);

    if (!mode) {
      throw new Error('mode is required.');
    }

    const mcqs = await loadMcqs();
    let selected: MCQ[] = [];

    const profileSubjects = Array.from(new Set(profile.distribution.flatMap((item) => item.sourceSubjects)));
    const scoped = mcqs.filter((item) => profileSubjects.includes(item.subject));

    if (testType === 'full-mock' || mode === 'mock') {
      selected = pickFromPoolsByDistribution({
        distribution: profile.distribution,
        pool: scoped,
        totalQuestions: profile.totalQuestions,
      });
    } else if (testType === 'subject-wise') {
      const subjectCount = profile.subjectWiseQuestions[selectedSubject] || questionCount;
      const subjectPool = mcqs.filter((item) => item.subject === selectedSubject);
      selected = shuffle(subjectPool).slice(0, Math.min(subjectCount, subjectPool.length));
    } else if (testType === 'adaptive' || mode === 'adaptive') {
      selected = generateAdaptiveSet({
        profile,
        allQuestions: scoped,
        weakTopics: user.progress?.weakTopics || [],
        questionCount,
      });
    } else {
      let pool = mcqs.filter(
        (item) => item.subject === subject && item.difficulty.toLowerCase() === difficulty.toLowerCase(),
      );

      if (topic && topic !== 'All Topics') {
        const byTopic = pool.filter((item) => item.topic.toLowerCase().includes(topic.toLowerCase()));
        if (byTopic.length) {
          pool = byTopic;
        }
      }

      selected = shuffle(pool).slice(0, Math.min(questionCount, pool.length));
    }

    if (!selected.length) {
      throw new Error('No questions available for this configuration.');
    }

    const questions: SessionQuestion[] = selected.map((item) => ({
      id: item.id,
      subject: item.subject,
      topic: item.topic,
      question: item.question,
      options: item.options,
      difficulty: item.difficulty,
      explanation: item.tip,
    }));

    const answerKey: Record<string, string> = {};
    selected.forEach((item) => {
      answerKey[item.id] = item.answer;
    });

    const session: LocalSession = {
      id: `session-${Date.now()}`,
      userId: user.id,
      subject: testType === 'subject-wise' ? selectedSubject : subject,
      difficulty,
      topic: mode === 'mock' || testType === 'full-mock' ? `${profile.label} Full Mock` : topic,
      mode,
      questions,
      answerKey,
      questionIds: questions.map((item) => item.id),
      questionCount: questions.length,
      durationMinutes:
        mode === 'mock' || testType === 'full-mock'
          ? profile.durationMinutes
          : Math.max(10, Math.round(questions.length * 1.2)),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      netType,
      testType: testType || mode,
      config: {
        profile: profile.label,
        requestedTestType: testType || mode,
        distribution: profile.distribution,
        selectedSubject: testType === 'subject-wise' ? selectedSubject : null,
      },
    };

    db.sessions.push(session);
    writeDb(db);
    return { session: toPublicSession(session) } as T;
  }

  if (/^\/api\/tests\/[^/]+$/.test(url.pathname) && method === 'GET') {
    const { db, user } = requireAuth(token);
    const sessionId = url.pathname.split('/')[3];
    const session = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
    if (!session) {
      throw new Error('Session not found.');
    }

    return { session: toPublicSession(session) } as T;
  }

  if (/^\/api\/tests\/[^/]+\/finish$/.test(url.pathname) && method === 'POST') {
    const { db, user } = requireAuth(token);
    const sessionId = url.pathname.split('/')[3];
    const session = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
    if (!session) {
      throw new Error('Session not found.');
    }

    const existingAttempt = db.attempts.find((item) => item.sessionId === session.id && item.userId === user.id);
    if (existingAttempt) {
      return { attempt: existingAttempt } as T;
    }

    const answers = Array.isArray(body.answers) ? body.answers : [];
    const answerMap = new Map<string, string | null>();
    answers.forEach((entry: { questionId?: string; selectedOption?: string | null } | null) => {
      if (!entry || !entry.questionId) return;
      answerMap.set(String(entry.questionId), entry.selectedOption == null ? null : String(entry.selectedOption));
    });

    let correctAnswers = 0;
    let wrongAnswers = 0;
    let unanswered = 0;

    session.questionIds.forEach((questionId) => {
      const selectedOption = answerMap.has(questionId) ? answerMap.get(questionId) : null;
      const expected = String(session.answerKey[questionId] || '').trim().toLowerCase();

      if (!selectedOption || String(selectedOption).trim().length === 0) {
        unanswered += 1;
        return;
      }

      if (String(selectedOption).trim().toLowerCase() === expected) {
        correctAnswers += 1;
      } else {
        wrongAnswers += 1;
      }
    });

    const totalQuestions = session.questionCount;
    const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
    const elapsedSeconds = Math.max(1, Number(body.elapsedSeconds) || 60);
    const submittedAt = new Date().toISOString();

    session.finishedAt = submittedAt;

    const attempt: LocalAttempt = {
      id: `attempt-${Date.now()}`,
      sessionId: session.id,
      userId: user.id,
      subject: session.subject,
      topic: session.topic,
      difficulty: session.difficulty,
      mode: session.mode,
      score,
      totalQuestions,
      correctAnswers,
      wrongAnswers,
      unanswered,
      submittedAnswers: totalQuestions - unanswered,
      durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
      attemptedAt: submittedAt,
      submittedAt,
      metadata: {
        elapsedSeconds,
      },
    };

    db.attempts.unshift(attempt);
    updateProgress(db, user);
    writeDb(db);

    return { attempt } as T;
  }

  if (url.pathname === '/api/tests/attempts' && method === 'GET') {
    const { db, user } = requireAuth(token);
    return {
      attempts: db.attempts.filter((item) => item.userId === user.id),
    } as T;
  }

  if (url.pathname === '/api/analytics/summary' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const attempts = db.attempts.filter((item) => item.userId === user.id);
    const testsAttempted = attempts.length;
    const averageScore = testsAttempted
      ? Math.round(attempts.reduce((sum, item) => sum + item.score, 0) / testsAttempted)
      : 0;
    const studyHours = Number((attempts.reduce((sum, item) => sum + item.durationMinutes, 0) / 60).toFixed(1));
    const questionsSolved = attempts.reduce((sum, item) => sum + item.totalQuestions, 0);

    return {
      testsAttempted,
      averageScore,
      studyHours,
      questionsSolved,
      weakTopics: user.progress?.weakTopics || [],
    } as T;
  }

  if (url.pathname === '/api/admin/overview' && method === 'GET') {
    const { db } = requireAdmin(token);
    const usersCount = db.users.length;
    const mcqs = await loadMcqs();
    const mcqCount = mcqs.length;
    const attemptsCount = db.attempts.length;
    const recentAttempts = db.attempts.slice(0, 12);
    const averageScore = recentAttempts.length
      ? Math.round(recentAttempts.reduce((sum, item) => sum + item.score, 0) / recentAttempts.length)
      : 0;

    return {
      usersCount,
      mcqCount,
      attemptsCount,
      averageScore,
      recentAttempts,
    } as T;
  }

  if (url.pathname === '/api/admin/mcqs' && method === 'GET') {
    requireAdmin(token);
    const subject = String(url.searchParams.get('subject') || '').toLowerCase();
    const topic = String(url.searchParams.get('topic') || '').toLowerCase();
    const difficulty = String(url.searchParams.get('difficulty') || '');

    const mcqs = await loadMcqs();
    const filtered = mcqs.filter((item) => {
      if (subject && item.subject !== subject) return false;
      if (topic && !item.topic.toLowerCase().includes(topic)) return false;
      if (difficulty && item.difficulty !== difficulty) return false;
      return true;
    });

    return {
      mcqs: filtered.slice(0, 200).map((item) => ({
        id: item.id,
        subject: item.subject,
        topic: item.topic,
        question: item.question,
        options: item.options,
        answer: item.answer,
        tip: item.tip,
        difficulty: item.difficulty,
      })),
    } as T;
  }

  if (url.pathname === '/api/admin/mcqs' && method === 'POST') {
    requireAdmin(token);
    const mcqs = await loadMcqs();
    const payload = {
      id: `admin-${Date.now()}`,
      subject: String(body.subject || 'mathematics') as SubjectKey,
      topic: String(body.topic || 'General'),
      question: String(body.question || ''),
      options: Array.isArray(body.options) ? body.options.map((item: unknown) => String(item)) : [],
      answer: String(body.answer || ''),
      tip: String(body.tip || ''),
      difficulty: String(body.difficulty || 'Medium') as Difficulty,
    };

    if (!payload.question || payload.options.length < 2 || !payload.answer) {
      throw new Error('question, options, and answer are required.');
    }

    cachedMcqs = [payload as MCQ, ...mcqs];

    return { mcq: payload } as T;
  }

  if (/^\/api\/admin\/mcqs\/[^/]+$/.test(url.pathname) && method === 'PUT') {
    requireAdmin(token);
    const mcqId = url.pathname.split('/')[4];
    const mcqs = await loadMcqs();
    const index = mcqs.findIndex((item) => item.id === mcqId);
    if (index < 0) {
      throw new Error('MCQ not found.');
    }

    const target = mcqs[index];
    const updated: MCQ = {
      ...target,
      subject: Object.prototype.hasOwnProperty.call(body, 'subject') ? String(body.subject) as SubjectKey : target.subject,
      topic: Object.prototype.hasOwnProperty.call(body, 'topic') ? String(body.topic) : target.topic,
      question: Object.prototype.hasOwnProperty.call(body, 'question') ? String(body.question) : target.question,
      answer: Object.prototype.hasOwnProperty.call(body, 'answer') ? String(body.answer) : target.answer,
      tip: Object.prototype.hasOwnProperty.call(body, 'tip') ? String(body.tip) : target.tip,
      difficulty: Object.prototype.hasOwnProperty.call(body, 'difficulty') ? String(body.difficulty) as Difficulty : target.difficulty,
      options: Array.isArray(body.options) ? body.options.map((item: unknown) => String(item)) : target.options,
    };

    mcqs[index] = updated;
    cachedMcqs = [...mcqs];
    return { mcq: updated } as T;
  }

  throw new Error('Endpoint not available in local mode.');
}

function pdfEscape(value: string) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildAnalyticsPdf(attempts: LocalAttempt[], user: LocalUser) {
  const testsAttempted = attempts.length;
  const averageScore = testsAttempted
    ? Math.round(attempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / testsAttempted)
    : 0;
  const totalQuestions = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);
  const studyHours = Number((attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0) / 60).toFixed(1));

  const bySubject = new Map<string, { total: number; count: number }>();
  attempts.forEach((item) => {
    const current = bySubject.get(item.subject) || { total: 0, count: 0 };
    current.total += Number(item.score) || 0;
    current.count += 1;
    bySubject.set(item.subject, current);
  });

  const lines: Array<{ text: string; size?: number; color?: string; gap?: number }> = [];
  lines.push({ text: 'NET360 Performance Analytics', size: 24, color: '1 1 1', gap: 18 });
  lines.push({ text: `Student: ${user.firstName || ''} ${user.lastName || ''} (${user.email})`, size: 11, color: '1 1 1' });
  lines.push({ text: `Generated: ${new Date().toLocaleString()}`, size: 10, color: '1 1 1', gap: 20 });
  lines.push({ text: 'Summary', size: 14, color: '0.2 0.24 0.55', gap: 16 });
  lines.push({ text: `Tests Attempted: ${testsAttempted}`, size: 11 });
  lines.push({ text: `Average Score: ${averageScore}%`, size: 11 });
  lines.push({ text: `Study Hours: ${studyHours}`, size: 11 });
  lines.push({ text: `Questions Solved: ${totalQuestions}`, size: 11, gap: 14 });

  lines.push({ text: 'Subject Performance', size: 14, color: '0.2 0.24 0.55', gap: 16 });
  if (!bySubject.size) {
    lines.push({ text: 'No attempts available yet.', size: 11, gap: 10 });
  } else {
    Array.from(bySubject.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([subject, aggregate]) => {
        const avg = aggregate.count ? Math.round(aggregate.total / aggregate.count) : 0;
        lines.push({ text: `${subject.toUpperCase()}: ${avg}% average across ${aggregate.count} attempt(s)`, size: 11 });
      });
    lines.push({ text: '', size: 10, gap: 6 });
  }

  lines.push({ text: 'Recent Attempts', size: 14, color: '0.2 0.24 0.55', gap: 16 });
  attempts.slice(0, 10).forEach((item, index) => {
    const row = `${index + 1}. ${item.subject.toUpperCase()} | ${item.topic} | ${item.score}% | ${new Date(item.attemptedAt).toLocaleDateString()}`;
    lines.push({ text: row, size: 10 });
  });

  let y = 792 - 58;
  const content: string[] = [];
  content.push('q');
  content.push('0.2 0.24 0.65 rg');
  content.push('0 720 612 72 re f');
  content.push('Q');

  for (const line of lines) {
    const size = line.size || 11;
    const color = line.color || '0.12 0.14 0.2';
    const drawY = line.color === '1 1 1' ? y : y - 2;
    content.push('BT');
    content.push(`/F1 ${size} Tf`);
    content.push(`${color} rg`);
    content.push(`40 ${Math.max(drawY, 42)} Td`);
    content.push(`(${pdfEscape(line.text)}) Tj`);
    content.push('ET');
    y -= line.gap || (size + 6);
    if (y < 48) break;
  }

  const stream = content.join('\n');

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

export async function localDownloadReport(format: 'pdf', token?: string | null) {
  const { db, user } = requireAuth(token);
  const attempts = db.attempts
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.attemptedAt).getTime() - new Date(a.attemptedAt).getTime());

  if (format !== 'pdf') {
    throw new Error('Only PDF export is supported.');
  }

  const bytes = buildAnalyticsPdf(attempts, user);
  return {
    filename: `net360-analytics-${new Date().toISOString().slice(0, 10)}.pdf`,
    blob: new Blob([bytes], { type: 'application/pdf' }),
  };
}
