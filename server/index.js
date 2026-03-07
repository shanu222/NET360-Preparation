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
import { SignupRequestModel } from './models/SignupRequest.js';
import { SignupTokenModel } from './models/SignupToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 50);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SIGNUP_TOKEN_TTL_HOURS = Number(process.env.SIGNUP_TOKEN_TTL_HOURS || 24);
const NUST_UPDATES_CACHE_MS = Number(process.env.NUST_UPDATES_CACHE_MS || 60 * 1000);
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

const nustUpdatesCache = {
  fetchedAt: 0,
  updates: [],
};

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
  const payload = {
    userId: String(user._id),
    email: user.email,
    role: user.role || 'student',
  };

  if ((user.role || 'student') === 'student' && user.activeSession?.sessionId) {
    payload.sessionId = user.activeSession.sessionId;
  }

  return jwt.sign(
    payload,
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL },
  );
}

function makeRefreshToken(user) {
  const payload = {
    userId: String(user._id),
    type: 'refresh',
    role: user.role || 'student',
  };

  if ((user.role || 'student') === 'student' && user.activeSession?.sessionId) {
    payload.sessionId = user.activeSession.sessionId;
  }

  return jwt.sign(
    payload,
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_TTL_DAYS}d` },
  );
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeMobileNumber(value) {
  return String(value || '').trim();
}

function isValidMobileNumber(value) {
  const cleaned = String(value || '').replace(/[\s()-]/g, '');
  return /^\+?[0-9]{8,18}$/.test(cleaned);
}

function sanitizeDeviceId(value) {
  const cleaned = String(value || '').trim();
  if (cleaned) return cleaned.slice(0, 200);
  return `ua:${hashToken(String(value || '')).slice(0, 16)}`;
}

function generateSignupTokenCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let block = 0; block < 3; block += 1) {
    let token = '';
    for (let i = 0; i < 4; i += 1) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    parts.push(token);
  }
  return `NET-${parts.join('-')}`;
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

async function bootstrapAdminAccounts() {
  if (!ADMIN_EMAILS.length) {
    console.log('Admin bootstrap skipped: ADMIN_EMAILS is empty.');
    return;
  }

  const now = new Date();
  const bootstrapPassword = String(process.env.ADMIN_BOOTSTRAP_PASSWORD || '').trim();

  // Always promote listed emails to admin if they already exist.
  const promoteResult = await UserModel.updateMany(
    { email: { $in: ADMIN_EMAILS } },
    { $set: { role: 'admin', updatedAt: now } },
  );

  let createdCount = 0;
  if (bootstrapPassword) {
    // If enabled, create missing admin accounts so first login can happen immediately.
    const passwordHash = await bcrypt.hash(bootstrapPassword, 12);
    for (const email of ADMIN_EMAILS) {
      const existing = await UserModel.findOne({ email }).lean();
      if (existing) continue;

      await UserModel.create({
        email,
        passwordHash,
        firstName: 'Admin',
        lastName: '',
        role: 'admin',
        preferences: defaultPreferences(),
        progress: defaultProgress(),
      });
      createdCount += 1;
    }
  }

  console.log(
    `Admin bootstrap complete: promoted ${promoteResult.modifiedCount || 0}, created ${createdCount}.`,
  );

  if (!bootstrapPassword) {
    console.log('Note: ADMIN_BOOTSTRAP_PASSWORD not set, so missing admin emails were not auto-created.');
  }
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

function decodeHtmlEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => {
      const value = Number(code);
      if (!Number.isFinite(value)) return '';
      return String.fromCharCode(value);
    });
}

function stripHtml(text) {
  return decodeHtmlEntities(String(text || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function sliceNoticeBlock(html) {
  const source = String(html || '');
  const lower = source.toLowerCase();
  const start = lower.indexOf('important notice');
  if (start < 0) return source;

  const ends = ['salients of net', 'nust entry test', 'act/sat basis', 'related links', '</footer>']
    .map((needle) => lower.indexOf(needle, start + 5))
    .filter((index) => index > start);
  const end = ends.length ? Math.min(...ends) : Math.min(source.length, start + 14000);
  return source.slice(start, end);
}

function toAbsoluteUrl(href) {
  try {
    return new URL(href, 'https://ugadmissions.nust.edu.pk/').toString();
  } catch {
    return 'https://ugadmissions.nust.edu.pk/';
  }
}

function parseNustUpdates(html) {
  const block = sliceNoticeBlock(html);
  const anchorRegex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const ignoredTitles = new Set([
    'home',
    'contact us',
    'nust home',
    'brochure',
    'sample test',
    'forgot password?',
    'new registration for net',
  ]);

  const items = [];
  const seen = new Set();

  for (const match of block.matchAll(anchorRegex)) {
    const href = String(match[1] || '').trim();
    const title = stripHtml(match[2] || '').slice(0, 180);
    if (!href || !title || title.length < 6) continue;
    if (ignoredTitles.has(title.toLowerCase())) continue;

    const absoluteUrl = toAbsoluteUrl(href);
    const key = `${title.toLowerCase()}|${absoluteUrl}`;
    if (seen.has(key)) continue;

    // Capture nearby sentence fragments for subtitle context.
    const index = Number(match.index || 0);
    const nearbyRaw = block.slice(Math.max(0, index - 180), Math.min(block.length, index + 360));
    const nearbyText = stripHtml(nearbyRaw).replace(title, '').trim();

    let subtitle = nearbyText.slice(0, 180);
    if (!subtitle) {
      subtitle = 'Tap to view full update on NUST admissions portal.';
    }

    items.push({
      title,
      subtitle,
      url: absoluteUrl,
    });
    seen.add(key);
    if (items.length >= 8) break;
  }

  return items;
}

function pdfEscape(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildAnalyticsPdfBuffer({ attempts, user }) {
  const testsAttempted = attempts.length;
  const averageScore = testsAttempted
    ? Math.round(attempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / testsAttempted)
    : 0;
  const totalQuestions = attempts.reduce((sum, item) => sum + (Number(item.totalQuestions) || 0), 0);
  const studyHours = Number((attempts.reduce((sum, item) => sum + (Number(item.durationMinutes) || 0), 0) / 60).toFixed(1));

  const bySubject = new Map();
  attempts.forEach((item) => {
    const current = bySubject.get(item.subject) || { total: 0, count: 0 };
    current.total += Number(item.score) || 0;
    current.count += 1;
    bySubject.set(item.subject, current);
  });

  const lines = [];
  lines.push({ text: 'NET360 Performance Analytics', size: 24, color: '1 1 1', gap: 18 });
  lines.push({ text: `Student: ${user.firstName || ''} ${user.lastName || ''} (${user.email || ''})`, size: 11, color: '1 1 1' });
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
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
      .forEach(([subject, aggregate]) => {
        const avg = aggregate.count ? Math.round(aggregate.total / aggregate.count) : 0;
        lines.push({ text: `${String(subject).toUpperCase()}: ${avg}% average across ${aggregate.count} attempt(s)`, size: 11 });
      });
    lines.push({ text: '', size: 10, gap: 6 });
  }

  lines.push({ text: 'Recent Attempts', size: 14, color: '0.2 0.24 0.55', gap: 16 });
  attempts.slice(0, 10).forEach((item, index) => {
    const row = `${index + 1}. ${String(item.subject || '').toUpperCase()} | ${item.topic || ''} | ${Number(item.score) || 0}% | ${new Date(item.attemptedAt).toLocaleDateString()}`;
    lines.push({ text: row, size: 10 });
  });

  let y = 792 - 58;
  const content = [];
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
  const offsets = [0];
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

  return Buffer.from(pdf, 'utf8');
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

    const role = user.role || 'student';

    if (role === 'student') {
      const tokenSessionId = String(payload.sessionId || '');
      const activeSessionId = String(user.activeSession?.sessionId || '');
      if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
        res.status(401).json({ error: 'Session is no longer active. Please log in again.' });
        return;
      }

      user.activeSession.lastSeenAt = new Date();
      await user.save();
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

const NET_TEST_PROFILES = {
  'net-engineering': {
    label: 'NET Engineering',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'Physics', percentage: 30, sourceSubjects: ['physics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      physics: 60,
      english: 40,
    },
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
    subjectWiseQuestions: {
      biology: 100,
      chemistry: 60,
      english: 40,
    },
  },
  'net-business-social-sciences': {
    label: 'NET Business & Social Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Quantitative Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      english: 100,
    },
  },
  'net-architecture': {
    label: 'NET Architecture',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      // Design aptitude is approximated from mixed conceptual pools.
      { label: 'Design Aptitude', percentage: 50, sourceSubjects: ['english', 'physics', 'mathematics'] },
      { label: 'Mathematics', percentage: 30, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 20, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      english: 60,
      physics: 40,
    },
  },
  'net-natural-sciences': {
    label: 'NET Natural Sciences',
    durationMinutes: 180,
    totalQuestions: 200,
    distribution: [
      { label: 'Mathematics', percentage: 50, sourceSubjects: ['mathematics'] },
      { label: 'English', percentage: 50, sourceSubjects: ['english'] },
    ],
    subjectWiseQuestions: {
      mathematics: 100,
      english: 100,
    },
  },
};

function normalizeNetType(raw) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return 'net-engineering';

  const aliases = {
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

function allocateDistributionCounts(distribution, totalQuestions) {
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

function pickFromPoolsByDistribution({ distribution, pool, totalQuestions, usedIds = new Set() }) {
  const counts = allocateDistributionCounts(distribution, totalQuestions);
  const selected = [];

  counts.forEach((entry) => {
    const candidates = shuffle(
      pool.filter((item) => {
        if (usedIds.has(String(item._id))) return false;
        return entry.sourceSubjects.includes(item.subject);
      }),
    );

    for (const question of candidates) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.filter((item) => entry.sourceSubjects.includes(item.subject)).length >= entry.count) {
        break;
      }
      if (selected.length >= totalQuestions) {
        break;
      }
    }
  });

  if (selected.length < totalQuestions) {
    const fallback = shuffle(pool.filter((item) => !usedIds.has(String(item._id))));
    for (const question of fallback) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.length >= totalQuestions) break;
    }
  }

  return selected.slice(0, totalQuestions);
}

function generateAdaptiveSet({ profile, allQuestions, weakTopics, questionCount }) {
  const profileSubjects = Array.from(
    new Set(profile.distribution.flatMap((item) => item.sourceSubjects)),
  );
  const inScope = allQuestions.filter((item) => profileSubjects.includes(item.subject));

  const weakSet = new Set((weakTopics || []).map((item) => String(item).toLowerCase()));

  const weakPool = inScope.filter((item) => weakSet.has(String(item.subject).toLowerCase()) || weakSet.has(String(item.topic).toLowerCase()));
  const mediumPool = inScope.filter((item) => item.difficulty === 'Medium');
  const hardPool = inScope.filter((item) => item.difficulty === 'Hard');

  const easyCount = Math.max(1, Math.round(questionCount * 0.4));
  const mediumCount = Math.max(1, Math.round(questionCount * 0.4));
  const hardCount = Math.max(1, questionCount - easyCount - mediumCount);

  const selected = [];
  const usedIds = new Set();

  const fromWeak = shuffle(weakPool);
  for (const question of fromWeak) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount) break;
  }

  const fromMedium = shuffle(mediumPool);
  for (const question of fromMedium) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount + mediumCount) break;
  }

  const fromHard = shuffle(hardPool);
  for (const question of fromHard) {
    if (usedIds.has(String(question._id))) continue;
    selected.push(question);
    usedIds.add(String(question._id));
    if (selected.length >= easyCount + mediumCount + hardCount) break;
  }

  if (selected.length < questionCount) {
    const fill = shuffle(inScope.filter((item) => !usedIds.has(String(item._id))));
    for (const question of fill) {
      selected.push(question);
      usedIds.add(String(question._id));
      if (selected.length >= questionCount) break;
    }
  }

  const difficultyRank = { Easy: 1, Medium: 2, Hard: 3 };
  selected.sort((a, b) => difficultyRank[a.difficulty] - difficultyRank[b.difficulty]);

  return selected.slice(0, questionCount);
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

app.get('/api/public/nust-updates', async (req, res) => {
  const now = Date.now();
  const hasFreshCache =
    nustUpdatesCache.fetchedAt > 0
    && (now - nustUpdatesCache.fetchedAt) < NUST_UPDATES_CACHE_MS
    && Array.isArray(nustUpdatesCache.updates)
    && nustUpdatesCache.updates.length > 0;

  if (hasFreshCache) {
    res.json({
      source: 'cache',
      fetchedAt: new Date(nustUpdatesCache.fetchedAt).toISOString(),
      updates: nustUpdatesCache.updates,
    });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('https://ugadmissions.nust.edu.pk/', {
      signal: controller.signal,
      headers: {
        'User-Agent': 'NET360-App/1.0 (+https://ugadmissions.nust.edu.pk)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`NUST source returned status ${response.status}.`);
    }

    const html = await response.text();
    const updates = parseNustUpdates(html);
    if (!updates.length) {
      throw new Error('No update items found on NUST page.');
    }

    nustUpdatesCache.fetchedAt = Date.now();
    nustUpdatesCache.updates = updates;

    res.json({
      source: 'live',
      fetchedAt: new Date(nustUpdatesCache.fetchedAt).toISOString(),
      updates,
    });
  } catch (error) {
    if (nustUpdatesCache.updates.length) {
      res.json({
        source: 'stale-cache',
        fetchedAt: new Date(nustUpdatesCache.fetchedAt).toISOString(),
        updates: nustUpdatesCache.updates,
        warning: 'Showing last cached updates because live fetch failed.',
      });
      return;
    }

    res.status(502).json({ error: 'Could not fetch live updates from NUST admissions website.' });
  }
});

app.post('/api/auth/signup-request', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);
    const paymentMethod = String(req.body?.paymentMethod || '').trim().toLowerCase();
    const paymentTransactionId = String(req.body?.paymentTransactionId || '').trim();

    if (!email || !mobileNumber || !paymentTransactionId || !paymentMethod) {
      res.status(400).json({ error: 'Email, mobile number, payment method, and transaction ID are required.' });
      return;
    }

    if (!isValidMobileNumber(mobileNumber)) {
      res.status(400).json({ error: 'Enter a valid mobile number.' });
      return;
    }

    if (!['easypaisa', 'jazzcash', 'hbl'].includes(paymentMethod)) {
      res.status(400).json({ error: 'Payment method must be one of: easypaisa, jazzcash, hbl.' });
      return;
    }

    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const existingPending = await SignupRequestModel.findOne({ email, status: 'pending' }).lean();
    if (existingPending) {
      res.status(409).json({ error: 'A pending signup request already exists for this email.' });
      return;
    }

    const request = await SignupRequestModel.create({
      email,
      firstName,
      lastName,
      mobileNumber,
      paymentMethod,
      paymentTransactionId,
      status: 'pending',
    });

    res.status(201).json({
      request: {
        id: String(request._id),
        email: request.email,
        status: request.status,
        createdAt: request.createdAt,
      },
      message: 'Signup request submitted. Wait for admin approval and token.',
    });
  } catch {
    res.status(500).json({ error: 'Could not submit signup request.' });
  }
});

app.post('/api/auth/register-with-token', async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const tokenCode = String(req.body?.tokenCode || '').trim().toUpperCase();
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');

    if (!email || !password || !tokenCode) {
      res.status(400).json({ error: 'Email, password, and token code are required.' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters.' });
      return;
    }

    const existingUser = await UserModel.findOne({ email }).lean();
    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const signupToken = await SignupTokenModel.findOne({ code: tokenCode });
    if (!signupToken) {
      res.status(400).json({ error: 'Invalid token code.' });
      return;
    }

    if (signupToken.status !== 'active') {
      res.status(400).json({ error: 'This token is no longer active.' });
      return;
    }

    if (new Date(signupToken.expiresAt).getTime() <= Date.now()) {
      signupToken.status = 'expired';
      await signupToken.save();
      res.status(400).json({ error: 'Token expired. Ask admin for a new token.' });
      return;
    }

    if (normalizeEmail(signupToken.email) !== email) {
      res.status(400).json({ error: 'Token was issued for a different email.' });
      return;
    }

    const signupRequest = await SignupRequestModel.findById(signupToken.signupRequestId);
    if (!signupRequest) {
      res.status(400).json({ error: 'Signup request not found for this token.' });
      return;
    }

    if (normalizeEmail(signupRequest.email) !== email) {
      res.status(400).json({ error: 'Signup request email mismatch for this token.' });
      return;
    }

    const mobileNumber = normalizeMobileNumber(signupRequest.mobileNumber);
    if (!mobileNumber) {
      res.status(400).json({ error: 'Mobile number is missing on signup request. Contact admin.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const activeSession = {
      sessionId: crypto.randomUUID(),
      deviceId,
      startedAt: new Date(),
      lastSeenAt: new Date(),
    };

    const user = await UserModel.create({
      email,
      passwordHash,
      firstName,
      lastName,
      phone: mobileNumber,
      role: ADMIN_EMAILS.includes(email) ? 'admin' : 'student',
      activeSession,
      preferences: defaultPreferences(),
      progress: defaultProgress(),
    });

    signupToken.status = 'used';
    signupToken.usedAt = new Date();
    signupToken.usedByUserId = user._id;
    await signupToken.save();

    signupRequest.status = 'completed';
    await signupRequest.save();

    const payload = await issueAuthPayload(user, req);
    res.status(201).json(payload);
  } catch {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  res.status(410).json({
    error: 'Direct signup is disabled. Submit payment proof, get approval, then register using your token.',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const user = await UserModel.findOne({ email: normalizeEmail(email) });
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const isValid = await bcrypt.compare(String(password), user.passwordHash || '');
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const role = user.role || 'student';
    if (role === 'student') {
      const activeSession = user.activeSession || null;
      if (activeSession && activeSession.deviceId && activeSession.deviceId !== deviceId && !forceLogoutOtherDevice) {
        res.status(409).json({
          error: 'You are already logged in on another device. Logout there first or confirm switch.',
          code: 'active_session_exists',
          activeSession: {
            deviceId: activeSession.deviceId,
            lastSeenAt: activeSession.lastSeenAt,
          },
        });
        return;
      }

      user.activeSession = {
        sessionId: crypto.randomUUID(),
        deviceId,
        startedAt: new Date(),
        lastSeenAt: new Date(),
      };
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

    if ((user.role || 'student') === 'student') {
      const tokenSessionId = String(payload.sessionId || '');
      const activeSessionId = String(user.activeSession?.sessionId || '');
      if (!tokenSessionId || !activeSessionId || tokenSessionId !== activeSessionId) {
        user.refreshTokens = (user.refreshTokens || []).filter((item) => item.tokenHash !== tokenHash);
        await user.save();
        res.status(401).json({ error: 'Session ended. Please log in again.' });
        return;
      }
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

      if ((user.role || 'student') === 'student') {
        const tokenSessionId = String(payload.sessionId || '');
        if (tokenSessionId && String(user.activeSession?.sessionId || '') === tokenSessionId) {
          user.activeSession = null;
        }
      }

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
  const {
    subject,
    difficulty,
    topic,
    mode,
    questionCount = 20,
    netType,
    testType,
    selectedSubject,
  } = req.body || {};

  if (!mode) {
    res.status(400).json({ error: 'mode is required.' });
    return;
  }

  const normalizedMode = String(mode);
  const normalizedSubject = String(subject || 'mathematics').toLowerCase();
  const normalizedDifficulty = String(difficulty || 'Medium');
  const normalizedNetType = normalizeNetType(netType);
  const profile = NET_TEST_PROFILES[normalizedNetType] || NET_TEST_PROFILES['net-engineering'];
  const normalizedTestType = String(testType || '').toLowerCase();
  const desiredQuestions = clamp(Number(questionCount) || (normalizedMode === 'mock' ? profile.totalQuestions : 20), 1, 200);

  let selected = [];
  const allInProfile = await MCQModel.find({
    subject: {
      $in: Array.from(new Set(profile.distribution.flatMap((item) => item.sourceSubjects))),
    },
  }).lean();

  if (normalizedTestType === 'full-mock' || normalizedMode === 'mock') {
    selected = pickFromPoolsByDistribution({
      distribution: profile.distribution,
      pool: allInProfile,
      totalQuestions: profile.totalQuestions,
    });
  } else if (normalizedTestType === 'subject-wise') {
    const pickedSubject = String(selectedSubject || normalizedSubject || '').toLowerCase();
    const subjectCount = profile.subjectWiseQuestions[pickedSubject] || desiredQuestions;
    const subjectPool = await MCQModel.find({ subject: pickedSubject }).lean();
    selected = shuffle(subjectPool).slice(0, Math.min(subjectCount, subjectPool.length));
  } else if (normalizedTestType === 'adaptive' || normalizedMode === 'adaptive') {
    const weakTopics = req.user.progress?.weakTopics || [];
    selected = generateAdaptiveSet({
      profile,
      allQuestions: allInProfile,
      weakTopics,
      questionCount: desiredQuestions,
    });
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
    subject: normalizedMode === 'mock' ? normalizedSubject : normalizedSubject,
    difficulty: normalizedDifficulty,
    topic: String(topic || (normalizedMode === 'mock' ? 'Full Mock' : 'All Topics')),
    mode: normalizedMode,
    questions,
    answerKey,
    questionIds: questions.map((item) => item.id),
    questionCount: questions.length,
    durationMinutes:
      normalizedMode === 'mock' || normalizedTestType === 'full-mock'
        ? profile.durationMinutes
        : Math.max(10, Math.round(questions.length * 1.2)),
    startedAt: new Date(),
    finishedAt: null,
  });

  const serialized = serializeSession(session);
  serialized.netType = normalizedNetType;
  serialized.testType = normalizedTestType || normalizedMode;
  serialized.config = {
    profile: profile.label,
    requestedTestType: normalizedTestType || normalizedMode,
    distribution: profile.distribution,
    selectedSubject: selectedSubject || null,
  };

  res.status(201).json({ session: serialized });
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
  const format = String(req.query.format || 'pdf').toLowerCase();
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();
  if (format !== 'pdf') {
    res.status(400).json({ error: 'Only PDF export is supported.' });
    return;
  }

  const bytes = buildAnalyticsPdfBuffer({ attempts, user: req.user });
  const dateTag = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="net360-analytics-${dateTag}.pdf"`);
  res.send(bytes);
});

app.get('/api/admin/overview', authMiddleware, requireAdmin, async (req, res) => {
  const [usersCount, mcqCount, attemptsCount, latestAttempts, pendingSignupRequests] = await Promise.all([
    UserModel.countDocuments(),
    MCQModel.countDocuments(),
    AttemptModel.countDocuments(),
    AttemptModel.find().sort({ attemptedAt: -1 }).limit(12).lean(),
    SignupRequestModel.countDocuments({ status: 'pending' }),
  ]);

  const averageScore = latestAttempts.length
    ? Math.round(latestAttempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / latestAttempts.length)
    : 0;

  res.json({
    usersCount,
    mcqCount,
    attemptsCount,
    pendingSignupRequests,
    averageScore,
    recentAttempts: latestAttempts.map((item) => serializeAttempt(item)),
  });
});

app.get('/api/admin/signup-requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const filter = status === 'all' ? {} : { status };

  const requests = await SignupRequestModel.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  res.json({
    requests: requests.map((item) => ({
      id: String(item._id),
      email: item.email,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      mobileNumber: item.mobileNumber || '',
      paymentMethod: item.paymentMethod,
      paymentTransactionId: item.paymentTransactionId,
      status: item.status,
      notes: item.notes || '',
      reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
      reviewedByEmail: item.reviewedByEmail || '',
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.post('/api/admin/signup-requests/:requestId/approve', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be approved.' });
    return;
  }

  const existingUser = await UserModel.findOne({ email: request.email }).lean();
  if (existingUser) {
    request.status = 'rejected';
    request.notes = 'Email already registered.';
    request.reviewedByAdminId = req.user._id;
    request.reviewedByEmail = req.user.email;
    request.reviewedAt = new Date();
    await request.save();
    res.status(409).json({ error: 'Email already registered. Request auto-rejected.' });
    return;
  }

  let code = '';
  for (let i = 0; i < 5; i += 1) {
    const candidate = generateSignupTokenCode();
    const exists = await SignupTokenModel.findOne({ code: candidate }).lean();
    if (!exists) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    res.status(500).json({ error: 'Could not generate unique signup token. Try again.' });
    return;
  }

  const expiresAt = new Date(Date.now() + SIGNUP_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const tokenDoc = await SignupTokenModel.create({
    code,
    email: request.email,
    signupRequestId: request._id,
    status: 'active',
    expiresAt,
  });

  request.status = 'approved';
  request.signupTokenId = tokenDoc._id;
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.status(201).json({
    requestId: String(request._id),
    token: {
      code,
      expiresAt: expiresAt.toISOString(),
    },
  });
});

app.post('/api/admin/signup-requests/:requestId/reject', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be rejected.' });
    return;
  }

  request.status = 'rejected';
  request.notes = String(req.body?.notes || '').trim();
  request.reviewedByAdminId = req.user._id;
  request.reviewedByEmail = req.user.email;
  request.reviewedAt = new Date();
  await request.save();

  res.json({ ok: true, requestId: String(request._id) });
});

app.get('/api/admin/users', authMiddleware, requireAdmin, async (req, res) => {
  const users = await UserModel.find({}, {
    email: 1,
    firstName: 1,
    lastName: 1,
    role: 1,
    createdAt: 1,
  })
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    users: users.map((item) => ({
      id: String(item._id),
      email: item.email,
      firstName: item.firstName || '',
      lastName: item.lastName || '',
      role: item.role || 'student',
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.delete('/api/admin/users/:userId', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'User id is required.' });
    return;
  }

  if (String(req.user._id) === userId) {
    res.status(400).json({ error: 'You cannot delete your own admin account.' });
    return;
  }

  const user = await UserModel.findById(userId).lean();
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  await Promise.all([
    UserModel.findByIdAndDelete(userId),
    AttemptModel.deleteMany({ userId }),
    TestSessionModel.deleteMany({ userId }),
    AIUsageModel.deleteMany({ userId }),
  ]);

  res.json({ ok: true, removedUserId: userId });
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
  await bootstrapAdminAccounts();

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
  console.error('Startup error details:', {
    name: error?.name,
    code: error?.code,
  });

  const message = String(error?.message || '').toLowerCase();
  if (message.includes('authentication failed')) {
    console.error('Hint: MongoDB credentials are invalid. Check DB username/password and URL-encoding of special password characters.');
  }
  if (message.includes('querysrv') || message.includes('enotfound') || message.includes('econnrefused')) {
    console.error('Hint: Atlas SRV/network resolution failed. Verify cluster hostname, Atlas network access (allowlist), and connection string format.');
  }
  if (message.includes('bad auth') || message.includes('not authorized')) {
    console.error('Hint: MongoDB user lacks required permissions. Ensure readWrite access on the target database.');
  }

  if (!MONGODB_URI) {
    console.error('Missing required env var: MONGODB_URI (or DATABASE_URL / MONGO_URI)');
  }
  process.exit(1);
});
