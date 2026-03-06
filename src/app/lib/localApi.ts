import { parseMcqs, type Difficulty, type MCQ, type SubjectKey } from './mcq';

type TestMode = 'topic' | 'mock' | 'adaptive';

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
  preferences: {
    emailNotifications: boolean;
    dailyReminders: boolean;
    performanceReports: boolean;
  };
}

interface LocalSession {
  id: string;
  userId: string;
  subject: SubjectKey;
  difficulty: Difficulty;
  topic: string;
  mode: TestMode;
  questionIds: string[];
  questionCount: number;
  startedAt: string;
  finishedAt: string | null;
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
  durationMinutes: number;
  attemptedAt: string;
}

interface LocalDb {
  users: LocalUser[];
  sessions: LocalSession[];
  attempts: LocalAttempt[];
}

const DB_STORAGE_KEY = 'net360-local-db-v1';
const MCQ_DATA_PATH = '/MCQS/NET_10000_MCQs_Dataset.csv';
let cachedMcqs: MCQ[] = [];

function defaultPreferences() {
  return {
    emailNotifications: true,
    dailyReminders: true,
    performanceReports: true,
  };
}

function readDb(): LocalDb {
  const raw = localStorage.getItem(DB_STORAGE_KEY);
  if (!raw) {
    return { users: [], sessions: [], attempts: [] };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    return {
      users: parsed.users || [],
      sessions: parsed.sessions || [],
      attempts: parsed.attempts || [],
    };
  } catch {
    return { users: [], sessions: [], attempts: [] };
  }
}

function writeDb(db: LocalDb) {
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
}

function toPublicUser(user: LocalUser) {
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
    preferences: user.preferences || defaultPreferences(),
  };
}

function parseToken(token?: string | null) {
  if (!token) return null;
  if (!token.startsWith('local:')) return null;
  return token.slice('local:'.length);
}

function requireAuth(token?: string | null) {
  const userId = parseToken(token);
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

async function loadMcqs() {
  if (cachedMcqs.length) return cachedMcqs;

  const response = await fetch(MCQ_DATA_PATH);
  if (!response.ok) {
    throw new Error('Failed to load MCQ dataset.');
  }

  const csvText = await response.text();
  cachedMcqs = parseMcqs(csvText);
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

    const db = readDb();
    const exists = db.users.some((user) => user.email === email);
    if (exists) {
      throw new Error('Email is already registered.');
    }

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
      preferences: defaultPreferences(),
    };

    db.users.push(user);
    writeDb(db);

    return {
      token: `local:${user.id}`,
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

    return {
      token: `local:${user.id}`,
      user: toPublicUser(user),
    } as T;
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

    const max = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 10000, 10000));
    return {
      mcqs: results.slice(0, max),
      total: results.length,
    } as T;
  }

  if (url.pathname === '/api/tests/start' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const subject = String(body.subject || '').toLowerCase() as SubjectKey;
    const difficulty = String(body.difficulty || '') as Difficulty;
    const topic = String(body.topic || 'All Topics');
    const mode = String(body.mode || '') as TestMode;
    const questionCount = Math.max(1, Number(body.questionCount) || 20);

    if (!subject || !difficulty || !mode) {
      throw new Error('subject, difficulty, and mode are required.');
    }

    const mcqs = await loadMcqs();
    let pool = mcqs.filter(
      (item) => item.subject === subject && item.difficulty.toLowerCase() === difficulty.toLowerCase(),
    );

    if (topic && topic !== 'All Topics') {
      const byTopic = pool.filter((item) => item.topic.toLowerCase().includes(topic.toLowerCase()));
      if (byTopic.length) {
        pool = byTopic;
      }
    }

    if (!pool.length) {
      throw new Error('No questions available for this configuration.');
    }

    const selected = pool.slice(0, Math.min(questionCount, pool.length));
    const session: LocalSession = {
      id: `session-${Date.now()}`,
      userId: user.id,
      subject,
      difficulty,
      topic,
      mode,
      questionIds: selected.map((item) => item.id),
      questionCount: selected.length,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };

    db.sessions.push(session);
    writeDb(db);

    return { session } as T;
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

    session.finishedAt = new Date().toISOString();

    const attempt: LocalAttempt = {
      id: `attempt-${Date.now()}`,
      sessionId: session.id,
      userId: user.id,
      subject: session.subject,
      topic: session.topic,
      difficulty: session.difficulty,
      mode: session.mode,
      score: Math.max(0, Math.min(100, Number(body.score) || 0)),
      totalQuestions: session.questionCount,
      durationMinutes: Math.max(1, Number(body.durationMinutes) || Math.round(session.questionCount * 1.2)),
      attemptedAt: session.finishedAt,
    };

    db.attempts.unshift(attempt);
    writeDb(db);
    return { attempt } as T;
  }

  if (url.pathname === '/api/tests/attempts' && method === 'GET') {
    const { db, user } = requireAuth(token);
    return {
      attempts: db.attempts.filter((item) => item.userId === user.id),
    } as T;
  }

  throw new Error('Endpoint not available in local mode.');
}

export async function localDownloadReport(format: 'csv' | 'json', token?: string | null) {
  const { db, user } = requireAuth(token);
  const attempts = db.attempts.filter((item) => item.userId === user.id);

  if (format === 'csv') {
    const header = 'id,subject,topic,difficulty,mode,score,totalQuestions,durationMinutes,attemptedAt';
    const lines = attempts.map((item) => {
      const escapedTopic = `"${String(item.topic).replace(/"/g, '""')}"`;
      return [
        item.id,
        item.subject,
        escapedTopic,
        item.difficulty,
        item.mode,
        item.score,
        item.totalQuestions,
        item.durationMinutes,
        item.attemptedAt,
      ].join(',');
    });

    return {
      filename: 'net360-report.csv',
      blob: new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }),
    };
  }

  return {
    filename: 'net360-report.json',
    blob: new Blob([
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          attempts,
        },
        null,
        2,
      ),
    ], { type: 'application/json;charset=utf-8' }),
  };
}
