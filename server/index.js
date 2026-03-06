import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import OpenAI from 'openai';
import { connectMongo } from './lib/mongo.js';
import { loadMcqsFromCsv } from './lib/mcqLoader.js';
import { UserModel } from './models/User.js';
import { MCQModel } from './models/MCQ.js';
import { TestSessionModel } from './models/TestSession.js';
import { AttemptModel } from './models/Attempt.js';
import { AIUsageModel } from './models/AIUsage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.API_PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const MCQ_CSV_PATH = path.join(__dirname, '..', 'public', 'MCQS', 'NET_10000_MCQs_Dataset.csv');

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const app = express();
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 800,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
  }),
);

app.use(
  '/api/auth',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 80,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many auth attempts. Please try again shortly.' },
  }),
);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function hashToken(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function makeAccessToken(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      email: user.email,
      role: user.role || 'student',
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function makeRefreshToken(user) {
  return jwt.sign(
    {
      userId: String(user._id),
      type: 'refresh',
    },
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

function defaultPreferences() {
  return {
    emailNotifications: true,
    dailyReminders: true,
    performanceReports: true,
  };
}

function defaultProgress() {
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

function userPublic(user) {
  const progress = { ...defaultProgress(), ...(user.progress || {}) };
  return {
    id: String(user._id),
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || '',
    city: user.city || '',
    targetProgram: user.targetProgram || '',
    testSeries: user.testSeries || '',
    sscPercentage: user.sscPercentage || '',
    hsscPercentage: user.hsscPercentage || '',
    testDate: user.testDate || '',
    role: user.role || 'student',
    preferences: { ...defaultPreferences(), ...(user.preferences || {}) },
    progress,
    test_history: progress.completedTests || [],
    scores: progress.scores || [],
    study_hours: progress.studyHours || 0,
    weak_topics: progress.weakTopics || [],
  };
}

function serializeSession(session) {
  return {
    id: String(session._id),
    userId: String(session.userId),
    subject: session.subject,
    difficulty: session.difficulty,
    topic: session.topic,
    mode: session.mode,
    questionCount: session.questionCount,
    durationMinutes: session.durationMinutes,
    startedAt: new Date(session.startedAt).toISOString(),
    finishedAt: session.finishedAt ? new Date(session.finishedAt).toISOString() : null,
    questions: session.questions || [],
  };
}

function serializeAttempt(attempt) {
  return {
    id: String(attempt._id),
    sessionId: String(attempt.sessionId),
    userId: String(attempt.userId),
    subject: attempt.subject,
    topic: attempt.topic,
    difficulty: attempt.difficulty,
    mode: attempt.mode,
    score: attempt.score,
    totalQuestions: attempt.totalQuestions,
    correctAnswers: attempt.correctAnswers,
    wrongAnswers: attempt.wrongAnswers,
    unanswered: attempt.unanswered,
    submittedAnswers: attempt.submittedAnswers,
    durationMinutes: attempt.durationMinutes,
    attemptedAt: new Date(attempt.attemptedAt).toISOString(),
    submittedAt: new Date(attempt.submittedAt).toISOString(),
    metadata: attempt.metadata || {},
  };
}

async function issueAuthPayload(user, req) {
  const accessToken = makeAccessToken(user);
  const refreshToken = makeRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  user.refreshTokens = (user.refreshTokens || []).filter((item) => new Date(item.expiresAt).getTime() > Date.now());
  user.refreshTokens.unshift({
    tokenHash: refreshTokenHash,
    expiresAt,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 250),
    ipAddress: String(req.ip || ''),
  });
  user.refreshTokens = user.refreshTokens.slice(0, 5);
  await user.save();

  return {
    token: accessToken,
    refreshToken,
    user: userPublic(user),
  };
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing authentication token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await UserModel.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required.' });
    return;
  }
  next();
}

function buildMockQuestionSet(mcqs, requestedCount) {
  const targets = [
    { subject: 'mathematics', count: 100 },
    { subject: 'physics', count: 60 },
    { subject: 'english', count: 40 },
  ];

  const desired = clamp(Number(requestedCount) || 200, 1, 200);
  const picks = [];
  const usedIds = new Set();

  targets.forEach((target) => {
    const pool = shuffle(mcqs.filter((item) => item.subject === target.subject));
    for (const question of pool) {
      const key = String(question._id);
      if (usedIds.has(key)) continue;
      picks.push(question);
      usedIds.add(key);
      if (picks.length >= desired || picks.filter((q) => q.subject === target.subject).length >= target.count) {
        break;
      }
    }
  });

  if (picks.length < desired) {
    const remaining = shuffle(mcqs.filter((item) => !usedIds.has(String(item._id))));
    for (const question of remaining) {
      picks.push(question);
      if (picks.length >= desired) break;
    }
  }

  return picks;
}

function generateStudyPlan({ targetDate, preparationLevel, weakSubjects, dailyStudyHours }) {
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

  const dailySchedule = [
    { block: 'Session 1', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.4)), activity: 'Concept learning + notes' },
    { block: 'Session 2', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.35)), activity: 'Topic MCQs + review' },
    { block: 'Session 3', durationHours: Math.max(1, Math.round(dailyStudyHours * 0.25)), activity: 'Revision + weak topic drilling' },
  ];

  return {
    generatedAt: new Date().toISOString(),
    targetDate: examDate.toISOString().slice(0, 10),
    daysLeft,
    preparationLevel,
    weakSubjects,
    dailyStudyHours,
    weeklyTargets,
    dailySchedule,
    roadmap: [
      'Foundation and formula consolidation',
      'Topic-wise practice and adaptive drills',
      'Full mock tests and revision',
    ],
  };
}

async function refreshUserProgress(userId) {
  const attempts = await AttemptModel.find({ userId }).sort({ attemptedAt: -1 }).lean();

  const totalQuestions = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);
  const totalMinutes = attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0);
  const scores = attempts.map((item) => Number(item.score) || 0);
  const averageScore = scores.length ? Math.round(scores.reduce((sum, v) => sum + v, 0) / scores.length) : 0;

  const bySubject = new Map();
  attempts.forEach((item) => {
    const current = bySubject.get(item.subject) || { total: 0, count: 0 };
    current.total += Number(item.score) || 0;
    current.count += 1;
    bySubject.set(item.subject, current);
  });

  const weakTopics = [];
  for (const [subject, aggregate] of bySubject.entries()) {
    const avg = aggregate.count ? aggregate.total / aggregate.count : 0;
    if (avg < 60) weakTopics.push(subject);
  }

  await UserModel.findByIdAndUpdate(userId, {
    $set: {
      'progress.questionsSolved': totalQuestions,
      'progress.testsCompleted': attempts.length,
      'progress.averageScore': averageScore,
      'progress.completedTests': attempts.map((item) => String(item._id)),
      'progress.scores': scores,
      'progress.studyHours': Number((totalMinutes / 60).toFixed(1)),
      'progress.weakTopics': weakTopics,
      'progress.practiceHistory': attempts.slice(0, 200),
      'progress.analytics.weeklyProgress': attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, score: item.score })),
      'progress.analytics.accuracyTrend': attempts.slice(0, 12).map((item) => ({ date: item.attemptedAt, accuracy: item.score })),
    },
  });
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', service: 'net360-api', mongo: 'connected' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName = '', lastName = '' } = req.body || {};

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (String(password).length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await UserModel.findOne({ email: normalizedEmail });
    if (existing) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(String(password), 12);
    const role = ADMIN_EMAILS.includes(normalizedEmail) ? 'admin' : 'student';

    const user = await UserModel.create({
      email: normalizedEmail,
      passwordHash,
      firstName: String(firstName),
      lastName: String(lastName),
      role,
      preferences: defaultPreferences(),
      progress: defaultProgress(),
    });

    const payload = await issueAuthPayload(user, req);
    res.status(201).json(payload);
  } catch {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await UserModel.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const isValid = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const payload = await issueAuthPayload(user, req);
    res.json(payload);
  } catch {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();
  if (!refreshToken) {
    res.status(400).json({ error: 'Refresh token is required.' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    if (payload?.type !== 'refresh') {
      res.status(401).json({ error: 'Invalid refresh token.' });
      return;
    }

    const user = await UserModel.findById(payload.userId);
    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    const tokenHash = hashToken(refreshToken);
    const found = (user.refreshTokens || []).find((item) => item.tokenHash === tokenHash && new Date(item.expiresAt).getTime() > Date.now());

    if (!found) {
      res.status(401).json({ error: 'Refresh token revoked or expired.' });
      return;
    }

    user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
    await user.save();

    const newPayload = await issueAuthPayload(user, req);
    res.json(newPayload);
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token.' });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const refreshToken = String(req.body?.refreshToken || '').trim();

  if (!refreshToken) {
    res.json({ message: 'Logged out.' });
    return;
  }

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const user = await UserModel.findById(payload.userId);
    if (user) {
      const tokenHash = hashToken(refreshToken);
      user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
      await user.save();
    }
  } catch {
    // Ignore invalid token on logout.
  }

  res.json({ message: 'Logged out.' });
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  if (user) {
    const resetToken = crypto.randomBytes(24).toString('hex');
    user.resetPasswordTokenHash = hashToken(resetToken);
    user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    if (process.env.NODE_ENV !== 'production') {
      res.json({ message: 'Reset link generated.', resetToken });
      return;
    }
  }

  res.json({ message: 'If this email exists, a password reset link has been sent.' });
});

app.post('/api/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const newPassword = String(req.body?.newPassword || '');

  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token and new password are required.' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const tokenHash = hashToken(token);
  const user = await UserModel.findOne({
    resetPasswordTokenHash: tokenHash,
    resetPasswordExpiresAt: { $gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ error: 'Invalid or expired reset token.' });
    return;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  user.resetPasswordTokenHash = null;
  user.resetPasswordExpiresAt = null;
  user.refreshTokens = [];
  await user.save();

  res.json({ message: 'Password reset successful.' });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: userPublic(req.user) });
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'city', 'targetProgram', 'testSeries', 'sscPercentage', 'hsscPercentage', 'testDate'];
  allowed.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      req.user[field] = String(req.body[field] ?? '');
    }
  });

  await req.user.save();
  res.json({ user: userPublic(req.user) });
});

app.put('/api/auth/preferences', authMiddleware, async (req, res) => {
  const current = req.user.preferences || defaultPreferences();
  req.user.preferences = {
    emailNotifications: typeof req.body?.emailNotifications === 'boolean' ? req.body.emailNotifications : current.emailNotifications,
    dailyReminders: typeof req.body?.dailyReminders === 'boolean' ? req.body.dailyReminders : current.dailyReminders,
    performanceReports: typeof req.body?.performanceReports === 'boolean' ? req.body.performanceReports : current.performanceReports,
  };

  await req.user.save();
  res.json({ user: userPublic(req.user) });
});

app.get('/api/mcqs', async (req, res) => {
  try {
    const { subject, difficulty, topic, limit = '10000' } = req.query;
    const filter = {};

    if (subject) {
      filter.subject = String(subject).toLowerCase();
    }
    if (difficulty) {
      const normalized = String(difficulty).toLowerCase();
      const title = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      filter.difficulty = title;
    }
    if (topic) {
      filter.topic = { $regex: String(topic), $options: 'i' };
    }

    const max = clamp(Number(limit) || 10000, 1, 10000);
    const mcqs = await MCQModel.find(filter).limit(max).lean();

    res.json({
      mcqs: mcqs.map((item) => ({
        id: String(item._id),
        subject: item.subject,
        topic: item.topic,
        question: item.question,
        options: item.options,
        answer: item.answer,
        tip: item.tip,
        difficulty: item.difficulty,
      })),
      total: mcqs.length,
    });
  } catch {
    res.status(500).json({ error: 'Failed to load MCQs.' });
  }
});

app.post('/api/practice/analyze', authMiddleware, async (req, res) => {
  const questionText = String(req.body?.question || '').trim();
  const stepsRaw = String(req.body?.steps || '').trim();
  const subject = String(req.body?.subject || '').toLowerCase();

  if (!stepsRaw) {
    res.status(400).json({ error: 'Solution steps are required.' });
    return;
  }

  const steps = stepsRaw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const analysis = steps.map((step, index) => {
    const normalized = step.toLowerCase();
    const hasEquationToken = /[a-z0-9]/i.test(step) && /[=+\-*/]/.test(step);
    const maybeFinal = /(^|\s)x\s*=/.test(normalized) || normalized.includes('answer');

    const correct = hasEquationToken || maybeFinal;
    return {
      step: index + 1,
      correct,
      message: correct
        ? 'Step is structurally valid. Keep equations explicit for maximum accuracy.'
        : 'Step seems incomplete. Add the transformed equation and operation used.',
    };
  });

  const similarFilter = {};
  if (subject) similarFilter.subject = subject;
  if (questionText) similarFilter.question = { $regex: questionText.slice(0, 40), $options: 'i' };

  let similar = await MCQModel.find(similarFilter).limit(5).lean();
  if (!similar.length) {
    similar = await MCQModel.find(subject ? { subject } : {}).limit(5).lean();
  }

  res.json({
    analysis,
    correctSteps: analysis.filter((item) => item.correct).length,
    totalSteps: analysis.length,
    suggestedSolution: [
      'Isolate variable terms on one side of the equation.',
      'Simplify constants step-by-step.',
      'Apply inverse operation to solve for the unknown.',
      'Substitute result into original equation to verify.',
    ],
    similarQuestions: similar.map((item) => ({
      id: String(item._id),
      subject: item.subject,
      topic: item.topic,
      question: item.question,
      difficulty: item.difficulty,
    })),
  });
});

app.post('/api/ai/mentor/chat', authMiddleware, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const context = String(req.body?.context || '').trim();

  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  const usage = await AIUsageModel.findOneAndUpdate(
    { userId: req.user._id, day },
    { $inc: { chatCount: 1 } },
    { upsert: true, new: true },
  );

  if ((usage.chatCount || 0) > AI_DAILY_LIMIT) {
    res.status(429).json({ error: `Daily AI limit reached (${AI_DAILY_LIMIT}). Please continue tomorrow.` });
    return;
  }

  let answer = '';

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'You are NET360 AI Mentor. Provide concise, accurate educational guidance for NET prep in mathematics, physics, chemistry, english, intelligence and GK. If uncertain, state assumptions and suggest next steps.',
          },
          {
            role: 'user',
            content: context ? `Context: ${context}\n\nQuestion: ${message}` : message,
          },
        ],
      });
      answer = completion.choices?.[0]?.message?.content?.trim() || '';
    } catch {
      answer = '';
    }
  }

  if (!answer) {
    const normalized = message.toLowerCase();
    if (normalized.includes('integration')) {
      answer = 'Try LIATE for integration by parts, and test substitution first when an inner derivative appears. Solve 2 timed examples and compare with answer key steps.';
    } else if (normalized.includes('physics') || normalized.includes('newton') || normalized.includes('force')) {
      answer = 'For numericals: draw FBD, define knowns, select equation, solve, then unit-check. In NET, free-body setup usually decides the correct option fastest.';
    } else if (normalized.includes('chemistry')) {
      answer = 'Use concept buckets: periodic trends, bonding, stoichiometry, and equilibrium. Solve 15 topic MCQs, then review incorrect options to find recurring mistakes.';
    } else {
      answer = 'Break the topic into concept summary, solved examples, and timed MCQs. Share one exact question and I will provide a step-by-step solution path.';
    }
  }

  res.json({
    answer,
    usage: {
      usedToday: usage.chatCount,
      remainingToday: Math.max(0, AI_DAILY_LIMIT - usage.chatCount),
    },
  });
});

app.post('/api/study-plans/generate', authMiddleware, async (req, res) => {
  const targetDate = String(req.body?.targetDate || '').trim();
  const preparationLevel = String(req.body?.preparationLevel || '').trim() || 'intermediate';
  const weakSubjects = Array.isArray(req.body?.weakSubjects)
    ? req.body.weakSubjects.map((item) => String(item).toLowerCase().trim()).filter(Boolean)
    : [];
  const dailyStudyHours = clamp(Number(req.body?.dailyStudyHours) || 3, 1, 14);

  const plan = generateStudyPlan({
    targetDate,
    preparationLevel,
    weakSubjects,
    dailyStudyHours,
  });

  req.user.progress = { ...defaultProgress(), ...(req.user.progress || {}), studyPlan: plan };
  await req.user.save();

  res.status(201).json({ studyPlan: plan });
});

app.get('/api/study-plans/latest', authMiddleware, async (req, res) => {
  const studyPlan = req.user.progress?.studyPlan || null;
  res.json({ studyPlan });
});

app.post('/api/tests/start', authMiddleware, async (req, res) => {
  const { subject, difficulty, topic, mode, questionCount = 20 } = req.body || {};

  if (!mode) {
    res.status(400).json({ error: 'mode is required.' });
    return;
  }

  const normalizedMode = String(mode);
  const normalizedSubject = String(subject || 'mathematics').toLowerCase();
  const normalizedDifficulty = String(difficulty || 'Medium');
  const desiredQuestions = clamp(Number(questionCount) || (normalizedMode === 'mock' ? 200 : 20), 1, 200);

  let selected = [];

  if (normalizedMode === 'mock') {
    const all = await MCQModel.find({ subject: { $in: ['mathematics', 'physics', 'english'] } }).lean();
    selected = buildMockQuestionSet(all, desiredQuestions);
  } else {
    const filter = {
      subject: normalizedSubject,
      difficulty: normalizedDifficulty,
    };

    if (topic && topic !== 'All Topics') {
      filter.topic = { $regex: String(topic), $options: 'i' };
    }

    const pool = await MCQModel.find(filter).lean();
    selected = shuffle(pool).slice(0, Math.min(desiredQuestions, pool.length));
  }

  if (!selected.length) {
    res.status(404).json({ error: 'No questions available for this configuration.' });
    return;
  }

  const questions = selected.map((question) => ({
    id: String(question._id),
    subject: question.subject,
    topic: question.topic,
    question: question.question,
    options: question.options,
    difficulty: question.difficulty,
    explanation: question.tip || '',
  }));

  const answerKey = {};
  selected.forEach((question) => {
    answerKey[String(question._id)] = String(question.answer || '').trim();
  });

  const session = await TestSessionModel.create({
    userId: req.user._id,
    subject: normalizedMode === 'mock' ? 'mathematics' : normalizedSubject,
    difficulty: normalizedDifficulty,
    topic: String(topic || (normalizedMode === 'mock' ? 'Full Mock' : 'All Topics')),
    mode: normalizedMode,
    questions,
    answerKey,
    questionIds: questions.map((item) => item.id),
    questionCount: questions.length,
    durationMinutes: normalizedMode === 'mock' ? 180 : Math.max(10, Math.round(questions.length * 1.2)),
    startedAt: new Date(),
    finishedAt: null,
  });

  res.status(201).json({ session: serializeSession(session) });
});

app.get('/api/tests/:sessionId', authMiddleware, async (req, res) => {
  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  res.json({ session: serializeSession(session) });
});

app.post('/api/tests/:sessionId/finish', authMiddleware, async (req, res) => {
  const answers = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const elapsedSeconds = Math.max(1, Number(req.body?.elapsedSeconds) || 60);

  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  const existingAttempt = await AttemptModel.findOne({ sessionId: session._id, userId: req.user._id });
  if (existingAttempt) {
    res.json({ attempt: serializeAttempt(existingAttempt) });
    return;
  }

  const answerMap = new Map();
  answers.forEach((entry) => {
    if (!entry || !entry.questionId) return;
    answerMap.set(String(entry.questionId), entry.selectedOption == null ? null : String(entry.selectedOption));
  });

  let correctAnswers = 0;
  let wrongAnswers = 0;
  let unanswered = 0;

  const questionIds = Array.isArray(session.questionIds) ? session.questionIds : [];
  questionIds.forEach((questionId) => {
    const selectedOption = answerMap.has(questionId) ? answerMap.get(questionId) : null;
    const expected = String(session.answerKey?.get?.(questionId) || session.answerKey?.[questionId] || '').trim().toLowerCase();

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

  const totalQuestions = questionIds.length || session.questionCount || 0;
  const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
  const submittedAt = new Date();

  session.finishedAt = submittedAt;
  await session.save();

  const attempt = await AttemptModel.create({
    sessionId: session._id,
    userId: req.user._id,
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
  });

  await refreshUserProgress(req.user._id);
  res.status(201).json({ attempt: serializeAttempt(attempt) });
});

app.get('/api/tests/attempts', authMiddleware, async (req, res) => {
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();
  res.json({ attempts: attempts.map((item) => serializeAttempt(item)) });
});

app.get('/api/analytics/summary', authMiddleware, async (req, res) => {
  const attempts = await AttemptModel.find({ userId: req.user._id }).lean();
  const testsAttempted = attempts.length;
  const averageScore = testsAttempted
    ? Math.round(attempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / testsAttempted)
    : 0;
  const studyHours = Number((attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0) / 60).toFixed(1));
  const questionsSolved = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);

  res.json({
    testsAttempted,
    averageScore,
    studyHours,
    questionsSolved,
    weakTopics: req.user.progress?.weakTopics || [],
  });
});

app.get('/api/reports/export', authMiddleware, async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();

  if (format === 'csv') {
    const header = 'id,subject,topic,difficulty,mode,score,totalQuestions,correctAnswers,wrongAnswers,unanswered,durationMinutes,attemptedAt';
    const lines = attempts.map((item) => {
      const escapedTopic = `"${String(item.topic).replace(/"/g, '""')}"`;
      return [
        String(item._id),
        item.subject,
        escapedTopic,
        item.difficulty,
        item.mode,
        item.score,
        item.totalQuestions,
        item.correctAnswers ?? '',
        item.wrongAnswers ?? '',
        item.unanswered ?? '',
        item.durationMinutes,
        item.attemptedAt,
      ].join(',');
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="net360-report.csv"');
    res.send([header, ...lines].join('\n'));
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="net360-report.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), attempts: attempts.map((item) => serializeAttempt(item)) }, null, 2));
});

app.get('/api/admin/overview', authMiddleware, requireAdmin, async (req, res) => {
  const [usersCount, mcqCount, attemptsCount, latestAttempts] = await Promise.all([
    UserModel.countDocuments(),
    MCQModel.countDocuments(),
    AttemptModel.countDocuments(),
    AttemptModel.find().sort({ attemptedAt: -1 }).limit(12).lean(),
  ]);

  const averageScore = latestAttempts.length
    ? Math.round(latestAttempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / latestAttempts.length)
    : 0;

  res.json({
    usersCount,
    mcqCount,
    attemptsCount,
    averageScore,
    recentAttempts: latestAttempts.map((item) => serializeAttempt(item)),
  });
});

app.get('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const topic = String(req.query.topic || '').trim();
  const difficulty = String(req.query.difficulty || '').trim();

  const filter = {};
  if (subject) filter.subject = subject;
  if (topic) filter.topic = { $regex: topic, $options: 'i' };
  if (difficulty) filter.difficulty = difficulty;

  const mcqs = await MCQModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({
    mcqs: mcqs.map((item) => ({
      id: String(item._id),
      subject: item.subject,
      topic: item.topic,
      question: item.question,
      options: item.options,
      answer: item.answer,
      tip: item.tip,
      difficulty: item.difficulty,
    })),
  });
});

app.post('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  const { question, options, answer, subject, topic, difficulty = 'Medium', tip = '' } = req.body || {};
  if (!question || !Array.isArray(options) || options.length < 2 || !answer || !subject || !topic) {
    res.status(400).json({ error: 'question, options, answer, subject, and topic are required.' });
    return;
  }

  const mcq = await MCQModel.create({
    question: String(question),
    options: options.map((item) => String(item)),
    answer: String(answer),
    subject: String(subject).toLowerCase(),
    topic: String(topic),
    difficulty: String(difficulty),
    tip: String(tip),
    source: 'Admin',
  });

  res.status(201).json({
    mcq: {
      id: String(mcq._id),
      subject: mcq.subject,
      topic: mcq.topic,
      question: mcq.question,
      options: mcq.options,
      answer: mcq.answer,
      tip: mcq.tip,
      difficulty: mcq.difficulty,
    },
  });
});

app.put('/api/admin/mcqs/:mcqId', authMiddleware, requireAdmin, async (req, res) => {
  const payload = {};
  ['question', 'answer', 'subject', 'topic', 'difficulty', 'tip'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      payload[field] = String(req.body[field] ?? '');
    }
  });
  if (Array.isArray(req.body?.options)) {
    payload.options = req.body.options.map((item) => String(item));
  }

  const mcq = await MCQModel.findByIdAndUpdate(req.params.mcqId, { $set: payload }, { new: true });
  if (!mcq) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  res.json({
    mcq: {
      id: String(mcq._id),
      subject: mcq.subject,
      topic: mcq.topic,
      question: mcq.question,
      options: mcq.options,
      answer: mcq.answer,
      tip: mcq.tip,
      difficulty: mcq.difficulty,
    },
  });
});

async function bootstrap() {
  await connectMongo(MONGODB_URI);

  const mcqCount = await MCQModel.countDocuments();
  if (!mcqCount) {
    const rows = await loadMcqsFromCsv(MCQ_CSV_PATH);
    if (rows.length) {
      await MCQModel.insertMany(rows, { ordered: false });
      console.log(`Seeded ${rows.length} MCQs into MongoDB.`);
    }
  }

  app.listen(PORT, () => {
    console.log(`NET360 API running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start server:', error?.message || error);
  process.exit(1);
});
