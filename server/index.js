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
import { UserModel } from './models/User.js';
import { MCQModel } from './models/MCQ.js';
import { TestSessionModel } from './models/TestSession.js';
import { AttemptModel } from './models/Attempt.js';
import { AIUsageModel } from './models/AIUsage.js';
import { PracticeBoardQuestionModel } from './models/PracticeBoardQuestion.js';
import { QuestionSubmissionModel } from './models/QuestionSubmission.js';
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
const AI_DAILY_LIMIT = Number(process.env.SMART_DAILY_LIMIT || process.env.AI_DAILY_LIMIT || 50);
const OPENAI_MODEL = process.env.MODEL_PROVIDER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SIGNUP_TOKEN_TTL_HOURS = Number(process.env.SIGNUP_TOKEN_TTL_HOURS || 24);
const NUST_UPDATES_CACHE_MS = Number(process.env.NUST_UPDATES_CACHE_MS || 60 * 1000);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const MODEL_PROVIDER_KEY = process.env.MODEL_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || '';

const openai = MODEL_PROVIDER_KEY
  ? new OpenAI({ apiKey: MODEL_PROVIDER_KEY })
  : null;

const SUBSCRIPTION_PLANS = {
  basic_monthly: {
    id: 'basic_monthly',
    name: 'Basic Plan',
    tier: 'basic',
    billingCycle: 'monthly',
    pricePkr: 500,
    dailyAiLimit: 50,
    features: ['Image upload solving', 'Structured concept + steps + final answer', 'Basic explanations'],
    expiresInDays: 30,
  },
  pro_monthly: {
    id: 'pro_monthly',
    name: 'Pro Plan',
    tier: 'pro',
    billingCycle: 'monthly',
    pricePkr: 900,
    dailyAiLimit: 200,
    features: ['Faster guided processing priority', 'Advanced step explanations', 'Shortcut solving tricks'],
    expiresInDays: 30,
  },
  basic_yearly: {
    id: 'basic_yearly',
    name: 'Basic Yearly',
    tier: 'basic',
    billingCycle: 'yearly',
    pricePkr: 5000,
    dailyAiLimit: 50,
    features: ['Image upload solving', 'Structured concept + steps + final answer', 'Yearly discounted billing'],
    expiresInDays: 365,
  },
  pro_yearly: {
    id: 'pro_yearly',
    name: 'Pro Yearly',
    tier: 'pro',
    billingCycle: 'yearly',
    pricePkr: 9000,
    dailyAiLimit: 200,
    features: ['Faster guided processing priority', 'Advanced explanations + tricks', 'Yearly discounted billing'],
    expiresInDays: 365,
  },
};

const app = express();
// Render sits behind a proxy and forwards client IP in X-Forwarded-For.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

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

function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
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

function defaultSubscription() {
  return {
    status: 'inactive',
    planId: '',
    billingCycle: '',
    startedAt: null,
    expiresAt: null,
    paymentReference: '',
    lastActivatedAt: null,
  };
}

function normalizeSubscription(user) {
  return { ...defaultSubscription(), ...(user?.subscription || {}) };
}

function resolveSubscriptionPlan(planId) {
  return SUBSCRIPTION_PLANS[String(planId || '').trim()] || null;
}

function isSubscriptionActive(subscription) {
  if (!subscription || subscription.status !== 'active') return false;
  if (!subscription.expiresAt) return false;
  return new Date(subscription.expiresAt).getTime() > Date.now();
}

function ensurePremiumAccess(user, res) {
  const subscription = normalizeSubscription(user);
  if (!isSubscriptionActive(subscription)) {
    res.status(402).json({
      error: 'Premium subscription required to access Smart Study Mentor features.',
      code: 'SUBSCRIPTION_REQUIRED',
      subscription,
      plans: Object.values(SUBSCRIPTION_PLANS),
    });
    return null;
  }

  const plan = resolveSubscriptionPlan(subscription.planId);
  if (!plan) {
    res.status(402).json({
      error: 'Your subscription plan is invalid. Please contact support.',
      code: 'PLAN_NOT_FOUND',
      subscription,
    });
    return null;
  }

  return { subscription, plan };
}

function estimateTokenUsage(text) {
  const chars = String(text || '').length;
  return Math.max(80, Math.ceil(chars / 4));
}

function inferSubject(questionText) {
  const text = String(questionText || '').toLowerCase();
  if (/(integration|derivative|matrix|algebra|trigon|vector|equation|limit|function)/.test(text)) return 'Mathematics';
  if (/(force|newton|velocity|acceleration|electric|magnetic|optics|thermo|wave|current)/.test(text)) return 'Physics';
  if (/(mole|reaction|bond|periodic|acid|base|organic|electrochem|hydrocarbon)/.test(text)) return 'Chemistry';
  if (/(grammar|sentence|synonym|antonym|vocabulary|comprehension)/.test(text)) return 'English';
  if (/(cell|genetics|enzyme|reproduction|ecology|respiration)/.test(text)) return 'Biology';
  return 'General';
}

function inferTopic(questionText, subject) {
  const text = String(questionText || '').toLowerCase();
  if (subject === 'Mathematics') {
    if (/integration|integral/.test(text)) return 'Integration';
    if (/derivative|differentiation/.test(text)) return 'Differentiation';
    if (/matrix|determinant/.test(text)) return 'Matrices';
    if (/trigon/.test(text)) return 'Trigonometry';
    return 'Mathematics Core';
  }
  if (subject === 'Physics') {
    if (/newton|force|motion/.test(text)) return 'Mechanics';
    if (/electric|current|voltage/.test(text)) return 'Electricity';
    if (/wave|optics/.test(text)) return 'Waves and Optics';
    return 'Physics Core';
  }
  if (subject === 'Chemistry') {
    if (/organic|hydrocarbon|alkane|alkene/.test(text)) return 'Organic Chemistry';
    if (/equilibrium|mole|stoichiometry/.test(text)) return 'Physical Chemistry';
    return 'Chemistry Core';
  }
  if (subject === 'English') return 'Language Skills';
  if (subject === 'Biology') return 'Biology Core';
  return 'General Problem Solving';
}

function fallbackStructuredSolver(questionText, subject, topic) {
  return {
    conceptExplanation: `This question belongs to ${subject} (${topic}). Start by identifying known values, target variable, and the governing rule/formula before solving.`,
    stepByStepSolution: [
      'Read the question carefully and list what is given and what is required.',
      'Select the correct concept/formula related to the target quantity.',
      'Substitute values with proper units/sign conventions.',
      'Simplify step-by-step and verify each transformation.',
      'Cross-check the result against constraints/options.',
    ],
    finalAnswer: 'Apply the final computed value/result after substitution and simplification.',
    shortestTrick: 'For NET speed, pre-identify the governing formula family and eliminate impossible options before full calculation.',
  };
}

function formatStructuredStudyResponse({ conceptExplanation, steps, finalAnswer, quickTrick }) {
  const stepLines = (steps || []).map((item, index) => `${index + 1}. ${item}`).join('\n');
  return [
    'Concept Explanation',
    conceptExplanation,
    '',
    'Step-by-Step Solution',
    stepLines,
    '',
    'Final Answer',
    finalAnswer,
    '',
    'Quick Trick or Shortcut Method',
    quickTrick,
  ].join('\n');
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
  const subscription = normalizeSubscription(user);
  const plan = resolveSubscriptionPlan(subscription.planId);
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
    subscription: {
      ...subscription,
      isActive: isSubscriptionActive(subscription),
      dailyAiLimit: plan?.dailyAiLimit || 0,
      planName: plan?.name || '',
    },
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

function serializeMcq(item) {
  const chapter = String(item.chapter || '').trim();
  const section = String(item.section || '').trim() || String(item.topic || '').trim();
  const topic = String(item.topic || '').trim() || section || chapter || 'General';
  return {
    id: String(item._id),
    subject: item.subject,
    part: String(item.part || '').trim(),
    chapter,
    section,
    topic,
    question: item.question,
    questionImageUrl: String(item.questionImageUrl || '').trim(),
    options: item.options,
    answer: item.answer,
    tip: item.tip,
    difficulty: item.difficulty,
  };
}

function serializePracticeBoardQuestion(item) {
  return {
    id: String(item._id),
    subject: String(item.subject || '').toLowerCase(),
    chapter: String(item.chapter || '').trim(),
    section: String(item.section || '').trim(),
    difficulty: String(item.difficulty || 'Medium'),
    questionText: String(item.questionText || '').trim(),
    questionImageUrl: String(item.questionImageUrl || '').trim(),
    solutionText: String(item.solutionText || '').trim(),
    solutionImageUrl: String(item.solutionImageUrl || '').trim(),
  };
}

function serializeQuestionSubmission(item) {
  const rawStatus = String(item.status || 'pending').toLowerCase();
  const normalizedStatus = rawStatus === 'converted' ? 'approved' : rawStatus;
  return {
    id: String(item._id),
    subject: String(item.subject || '').trim(),
    questionText: String(item.questionText || '').trim(),
    questionDescription: String(item.questionDescription || '').trim(),
    questionSource: String(item.questionSource || '').trim(),
    submissionReason: String(item.submissionReason || '').trim(),
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map((file) => ({
        name: String(file.name || '').trim(),
        mimeType: String(file.mimeType || '').trim(),
        size: Number(file.size || 0),
        dataUrl: String(file.dataUrl || '').trim(),
      }))
      : [],
    status: normalizedStatus,
    queuedForBank: Boolean(item.queuedForBank),
    submittedByName: String(item.submittedByName || '').trim(),
    submittedByEmail: String(item.submittedByEmail || '').trim(),
    submittedByUserId: String(item.submittedByUserId || '').trim(),
    reviewNotes: String(item.reviewNotes || '').trim(),
    reviewedByEmail: String(item.reviewedByEmail || '').trim(),
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
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
    const { subject, part, chapter, section, difficulty, topic, limit = '10000' } = req.query;
    const filter = {};

    if (subject) {
      filter.subject = String(subject).toLowerCase();
    }
    if (difficulty) {
      const normalized = String(difficulty).toLowerCase();
      const title = normalized.charAt(0).toUpperCase() + normalized.slice(1);
      filter.difficulty = title;
    }
    if (part) {
      filter.part = String(part).toLowerCase().trim();
    }
    if (chapter) {
      filter.chapter = { $regex: String(chapter), $options: 'i' };
    }
    if (section) {
      filter.section = { $regex: String(section), $options: 'i' };
    }
    if (topic) {
      filter.topic = { $regex: String(topic), $options: 'i' };
    }

    const max = clamp(Number(limit) || 10000, 1, 10000);
    const mcqs = await MCQModel.find(filter).limit(max).lean();

    res.json({
      mcqs: mcqs.map((item) => serializeMcq(item)),
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

app.get('/api/practice-board/questions', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim().toLowerCase();
    const chapter = String(req.query.chapter || '').trim();
    const section = String(req.query.section || '').trim();
    const difficulty = String(req.query.difficulty || '').trim();
    const limit = clamp(Number(req.query.limit) || 100, 1, 500);

    const filter = {};
    if (subject) filter.subject = subject;
    if (chapter) filter.chapter = { $regex: chapter, $options: 'i' };
    if (section) filter.section = { $regex: section, $options: 'i' };
    if (difficulty) filter.difficulty = difficulty;

    const questions = await PracticeBoardQuestionModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ questions: questions.map((item) => serializePracticeBoardQuestion(item)), total: questions.length });
  } catch {
    res.status(500).json({ error: 'Failed to load practice board questions.' });
  }
});

app.get('/api/practice-board/questions/random', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim().toLowerCase();
    const chapter = String(req.query.chapter || '').trim();
    const section = String(req.query.section || '').trim();
    const difficulty = String(req.query.difficulty || '').trim();
    const excludeId = String(req.query.excludeId || '').trim();

    const filter = {};
    if (subject) filter.subject = subject;
    if (chapter) filter.chapter = { $regex: chapter, $options: 'i' };
    if (section) filter.section = { $regex: section, $options: 'i' };
    if (difficulty) filter.difficulty = difficulty;
    if (excludeId && isValidObjectId(excludeId)) {
      filter._id = { $ne: excludeId };
    }

    const count = await PracticeBoardQuestionModel.countDocuments(filter);
    if (!count) {
      res.status(404).json({ error: 'No practice board questions found for this selection.' });
      return;
    }

    const randomIndex = Math.floor(Math.random() * count);
    const item = await PracticeBoardQuestionModel.findOne(filter).skip(randomIndex).lean();
    if (!item) {
      res.status(404).json({ error: 'No practice board question available.' });
      return;
    }

    res.json({ question: serializePracticeBoardQuestion(item) });
  } catch {
    res.status(500).json({ error: 'Failed to load random practice board question.' });
  }
});

app.post('/api/question-submissions', async (req, res) => {
  const {
    subject,
    questionText = '',
    questionDescription = '',
    questionSource = '',
    submissionReason = '',
    attachments = [],
    submittedByName = '',
    submittedByEmail = '',
    submittedByUserId = '',
  } = req.body || {};

  const normalizedSubject = String(subject || '').trim();
  if (!normalizedSubject) {
    res.status(400).json({ error: 'Subject is required.' });
    return;
  }

  const safeAttachments = Array.isArray(attachments)
    ? attachments.slice(0, 3).map((file) => ({
      name: String(file?.name || '').trim(),
      mimeType: String(file?.mimeType || '').trim(),
      size: Number(file?.size || 0),
      dataUrl: String(file?.dataUrl || '').trim(),
    }))
    : [];

  const allowedMimeTypes = new Set([
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  for (const file of safeAttachments) {
    if (!file.name || !file.mimeType || !file.dataUrl || !Number.isFinite(file.size)) {
      res.status(400).json({ error: 'Each attachment must include name, mimeType, size, and file data.' });
      return;
    }
    if (!allowedMimeTypes.has(file.mimeType)) {
      res.status(400).json({ error: `Unsupported attachment type: ${file.mimeType}` });
      return;
    }
    if (file.size > 2.5 * 1024 * 1024) {
      res.status(400).json({ error: `Attachment ${file.name} exceeds 2.5 MB.` });
      return;
    }
    if (!file.dataUrl.startsWith('data:')) {
      res.status(400).json({ error: `Attachment ${file.name} is not a valid uploaded file payload.` });
      return;
    }
  }

  const text = String(questionText || '').trim();
  const description = String(questionDescription || '').trim();
  const source = String(questionSource || '').trim();
  const reason = String(submissionReason || '').trim();

  if (!text && !safeAttachments.length) {
    res.status(400).json({ error: 'Please provide a typed/pasted question or at least one attachment.' });
    return;
  }

  if (!reason) {
    res.status(400).json({ error: 'Please explain why this question should be added.' });
    return;
  }

  const created = await QuestionSubmissionModel.create({
    subject: normalizedSubject,
    questionText: text,
    questionDescription: description,
    questionSource: source,
    submissionReason: reason,
    attachments: safeAttachments,
    status: 'pending',
    queuedForBank: false,
    submittedByName: String(submittedByName || '').trim(),
    submittedByEmail: String(submittedByEmail || '').trim(),
    submittedByUserId: String(submittedByUserId || '').trim(),
  });

  res.status(201).json({ submission: serializeQuestionSubmission(created) });
});

app.get('/api/question-submissions/history', async (req, res) => {
  const rawIds = String(req.query.ids || '').trim();
  if (!rawIds) {
    res.json({ submissions: [] });
    return;
  }

  const ids = rawIds
    .split(',')
    .map((value) => String(value || '').trim())
    .filter((value) => isValidObjectId(value))
    .slice(0, 100);

  if (!ids.length) {
    res.json({ submissions: [] });
    return;
  }

  const submissions = await QuestionSubmissionModel.find({ _id: { $in: ids } })
    .sort({ createdAt: -1 })
    .lean();

  res.json({ submissions: submissions.map((item) => serializeQuestionSubmission(item)) });
});

app.post('/api/ai/mentor/chat', authMiddleware, async (req, res) => {
  const message = String(req.body?.message || '').trim();
  const context = String(req.body?.context || '').trim();

  if (!message) {
    res.status(400).json({ error: 'Message is required.' });
    return;
  }

  const premium = ensurePremiumAccess(req.user, res);
  if (!premium) return;

  const day = new Date().toISOString().slice(0, 10);
  const usage = await AIUsageModel.findOneAndUpdate(
    { userId: req.user._id, day },
    { $inc: { chatCount: 1 } },
    { upsert: true, new: true },
  );

  if ((usage.chatCount || 0) > premium.plan.dailyAiLimit) {
    res.status(429).json({ error: `Daily guidance limit reached (${premium.plan.dailyAiLimit}). Please continue tomorrow.` });
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
            content: [
              'You are NET360 Smart Study Mentor for exam preparation.',
              'Always return your guidance in this exact plain-text structure:',
              'Concept Explanation',
              'Step-by-Step Solution',
              'Final Answer',
              'Quick Trick or Shortcut Method',
              'Keep it concise, educational, and teacher-like.',
            ].join('\n'),
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
      answer = formatStructuredStudyResponse({
        conceptExplanation: 'Integration by parts is best used when the integrand is a product of two functions where direct integration is difficult.',
        steps: [
          'Choose u and dv using LIATE so differentiation simplifies u.',
          'Compute du and v correctly before substitution.',
          'Apply integral(udv) = uv - integral(vdu).',
          'Simplify the remaining integral and combine constants.',
        ],
        finalAnswer: 'Use LIATE-based substitution and complete the remaining integral after applying uv - integral(vdu).',
        quickTrick: 'Try substitution first when an inner derivative is present; use integration by parts when substitution stalls.',
      });
    } else if (normalized.includes('physics') || normalized.includes('newton') || normalized.includes('force')) {
      answer = formatStructuredStudyResponse({
        conceptExplanation: 'Force and motion questions are solved fastest by converting the statement into a clean free-body diagram and equation set.',
        steps: [
          'Draw the free-body diagram and mark all forces with directions.',
          'Set coordinate axes and resolve components if needed.',
          'Apply Newton\'s laws with correct sign convention.',
          'Solve algebraically and validate units.',
        ],
        finalAnswer: 'Use the free-body diagram plus Newton\'s laws to compute the required value with consistent signs and units.',
        quickTrick: 'In MCQs, eliminate options with impossible direction/sign before full calculation.',
      });
    } else if (normalized.includes('chemistry')) {
      answer = formatStructuredStudyResponse({
        conceptExplanation: 'Chemistry performance improves when questions are classified into concept buckets before solving.',
        steps: [
          'Identify whether the question is periodic trend, bonding, stoichiometry, or equilibrium.',
          'Write the core rule/equation for that bucket.',
          'Substitute values carefully and check units/mole ratios.',
          'Cross-check the result against chemical feasibility.',
        ],
        finalAnswer: 'Classify first, apply the correct governing rule, then verify chemical feasibility.',
        quickTrick: 'For objective questions, use option elimination from trend direction before detailed math.',
      });
    } else {
      answer = formatStructuredStudyResponse({
        conceptExplanation: 'A strong preparation approach combines concept clarity, worked examples, and timed practice.',
        steps: [
          'Start with a short concept summary for the topic.',
          'Solve one representative example with reasoning.',
          'Attempt timed MCQs and review mistakes immediately.',
          'Repeat with a slightly harder variation of the same concept.',
        ],
        finalAnswer: 'Use an iterative cycle of concept, example, timed practice, and error review.',
        quickTrick: 'Track repeated mistakes in one notebook and revise those patterns daily.',
      });
    }
  }

  res.json({
    answer,
    usage: {
      usedToday: usage.chatCount,
      remainingToday: Math.max(0, premium.plan.dailyAiLimit - usage.chatCount),
    },
  });
});

app.get('/api/subscriptions/plans', (_req, res) => {
  res.json({ plans: Object.values(SUBSCRIPTION_PLANS) });
});

app.get('/api/subscriptions/me', authMiddleware, async (req, res) => {
  const subscription = normalizeSubscription(req.user);
  const plan = resolveSubscriptionPlan(subscription.planId);
  const day = new Date().toISOString().slice(0, 10);
  const usage = await AIUsageModel.findOne({ userId: req.user._id, day }).lean();

  res.json({
    subscription: {
      ...subscription,
      isActive: isSubscriptionActive(subscription),
      planName: plan?.name || '',
      dailyAiLimit: plan?.dailyAiLimit || 0,
    },
    usage: {
      day,
      chatCount: usage?.chatCount || 0,
      solverCount: usage?.solverCount || 0,
      tokenConsumed: usage?.tokenConsumed || 0,
      remainingToday: Math.max(0, (plan?.dailyAiLimit || 0) - ((usage?.chatCount || 0) + (usage?.solverCount || 0))),
    },
  });
});

app.post('/api/subscriptions/purchase', authMiddleware, async (req, res) => {
  const planId = String(req.body?.planId || '').trim();
  const paymentReference = String(req.body?.paymentReference || '').trim();
  const plan = resolveSubscriptionPlan(planId);

  if (!plan) {
    res.status(400).json({ error: 'Invalid plan selected.' });
    return;
  }

  if (!paymentReference || paymentReference.length < 4) {
    res.status(400).json({ error: 'Payment reference is required for verification.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  req.user.subscription = {
    status: 'active',
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference,
    lastActivatedAt: startedAt,
  };
  await req.user.save();

  res.status(201).json({
    ok: true,
    subscription: {
      ...normalizeSubscription(req.user),
      isActive: true,
      planName: plan.name,
      dailyAiLimit: plan.dailyAiLimit,
    },
  });
});

app.post('/api/ai/mentor/solve-image', authMiddleware, async (req, res) => {
  const premium = ensurePremiumAccess(req.user, res);
  if (!premium) return;

  const imageDataUrl = String(req.body?.imageDataUrl || '').trim();
  const providedText = String(req.body?.questionText || '').trim();
  const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();

  const isImageAllowed = !mimeType || mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/jpg';
  if (!isImageAllowed) {
    res.status(400).json({ error: 'Only JPG and PNG images are supported.' });
    return;
  }

  if (!imageDataUrl && !providedText) {
    res.status(400).json({ error: 'Question image or extracted question text is required.' });
    return;
  }

  const day = new Date().toISOString().slice(0, 10);
  let usage = await AIUsageModel.findOne({ userId: req.user._id, day });
  if (!usage) {
    usage = await AIUsageModel.create({ userId: req.user._id, day, chatCount: 0, solverCount: 0, tokenConsumed: 0 });
  }

  const usedToday = (usage.chatCount || 0) + (usage.solverCount || 0);
  if (usedToday >= premium.plan.dailyAiLimit) {
    res.status(429).json({ error: `Daily guidance limit reached (${premium.plan.dailyAiLimit}). Please continue tomorrow.` });
    return;
  }

  let extractedQuestion = providedText;

  if (!extractedQuestion && imageDataUrl && openai) {
    try {
      const ocrCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: 'Extract only the readable question text from this educational image. Return plain text only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract question text exactly as visible.' },
              { type: 'image_url', image_url: { url: imageDataUrl } },
            ],
          },
        ],
      });
      extractedQuestion = (ocrCompletion.choices?.[0]?.message?.content || '').trim();
    } catch {
      extractedQuestion = '';
    }
  }

  if (!extractedQuestion) {
    extractedQuestion = providedText || 'Could not extract text from image. Please type the question manually.';
  }

  const subject = inferSubject(extractedQuestion);
  const topic = inferTopic(extractedQuestion, subject);
  let structured = fallbackStructuredSolver(extractedQuestion, subject, topic);

  if (openai) {
    try {
      const prompt = [
        'You are NET360 Premium Question Solver with a custom educational guidance layer.',
        `Detected subject: ${subject}`,
        `Detected topic: ${topic}`,
        'Return only valid JSON with keys: conceptExplanation (string), stepByStepSolution (array of strings), finalAnswer (string), shortestTrick (string).',
        'Write crisp educational responses, not generic chatbot text. Keep steps exam-oriented and practical.',
        'Question:',
        extractedQuestion,
      ].join('\n');

      const solveCompletion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Return strict JSON only, no markdown.' },
          { role: 'user', content: prompt },
        ],
      });

      const raw = (solveCompletion.choices?.[0]?.message?.content || '').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.conceptExplanation && Array.isArray(parsed?.stepByStepSolution) && parsed?.finalAnswer && parsed?.shortestTrick) {
          structured = {
            conceptExplanation: String(parsed.conceptExplanation),
            stepByStepSolution: parsed.stepByStepSolution.map((item) => String(item)),
            finalAnswer: String(parsed.finalAnswer),
            shortestTrick: String(parsed.shortestTrick),
          };
        }
      }
    } catch {
      // Fall back to deterministic structured guidance.
    }
  }

  usage.solverCount = (usage.solverCount || 0) + 1;
  usage.tokenConsumed = (usage.tokenConsumed || 0) + estimateTokenUsage(`${extractedQuestion}\n${JSON.stringify(structured)}`);
  await usage.save();

  res.status(201).json({
    questionText: extractedQuestion,
    detected: { subject, topic },
    result: structured,
    usage: {
      usedToday: (usage.chatCount || 0) + (usage.solverCount || 0),
      remainingToday: Math.max(0, premium.plan.dailyAiLimit - ((usage.chatCount || 0) + (usage.solverCount || 0))),
      tokenConsumed: usage.tokenConsumed || 0,
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
    part,
    chapter,
    section,
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

    if (part) {
      filter.part = String(part).toLowerCase().trim();
    }
    if (chapter && chapter !== 'All Chapters') {
      filter.chapter = { $regex: String(chapter), $options: 'i' };
    }
    if (section && section !== 'All Sections') {
      filter.section = { $regex: String(section), $options: 'i' };
    }
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
    part: String(question.part || '').trim(),
    chapter: String(question.chapter || '').trim(),
    section: String(question.section || '').trim(),
    topic: question.topic,
    question: question.question,
    questionImageUrl: String(question.questionImageUrl || '').trim(),
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

app.get('/api/tests/attempts', authMiddleware, async (req, res) => {
  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).lean();
  res.json({ attempts: attempts.map((item) => serializeAttempt(item)) });
});

app.get('/api/tests/:sessionId', authMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }

  const session = await TestSessionModel.findOne({ _id: req.params.sessionId, userId: req.user._id });
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  res.json({ session: serializeSession(session) });
});

app.post('/api/tests/:sessionId/finish', authMiddleware, async (req, res) => {
  if (!isValidObjectId(req.params.sessionId)) {
    res.status(400).json({ error: 'Invalid session id.' });
    return;
  }

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
  const [usersCount, mcqCount, attemptsCount, latestAttempts, pendingSignupRequests, pendingQuestionSubmissions] = await Promise.all([
    UserModel.countDocuments(),
    MCQModel.countDocuments(),
    AttemptModel.countDocuments(),
    AttemptModel.find().sort({ attemptedAt: -1 }).limit(12).lean(),
    SignupRequestModel.countDocuments({ status: 'pending' }),
    QuestionSubmissionModel.countDocuments({ status: 'pending' }),
  ]);

  const averageScore = latestAttempts.length
    ? Math.round(latestAttempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / latestAttempts.length)
    : 0;

  res.json({
    usersCount,
    mcqCount,
    attemptsCount,
    pendingSignupRequests,
    pendingQuestionSubmissions,
    averageScore,
    recentAttempts: latestAttempts.map((item) => serializeAttempt(item)),
  });
});

app.get('/api/admin/question-submissions', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query.status || 'all').trim().toLowerCase();
  const subject = String(req.query.subject || '').trim();

  const filter = {};
  if (status !== 'all') {
    filter.status = status;
  }
  if (subject) {
    filter.subject = { $regex: subject, $options: 'i' };
  }

  const submissions = await QuestionSubmissionModel.find(filter).sort({ createdAt: -1 }).limit(600).lean();
  res.json({ submissions: submissions.map((item) => serializeQuestionSubmission(item)) });
});

app.post('/api/admin/question-submissions/:submissionId/review', authMiddleware, requireAdmin, async (req, res) => {
  const submission = await QuestionSubmissionModel.findById(req.params.submissionId);
  if (!submission) {
    res.status(404).json({ error: 'Question submission not found.' });
    return;
  }

  const nextStatus = String(req.body?.status || '').trim().toLowerCase();
  const reviewNotes = String(req.body?.reviewNotes || '').trim();

  if (!['approved', 'rejected'].includes(nextStatus)) {
    res.status(400).json({ error: 'status must be approved or rejected.' });
    return;
  }

  if (nextStatus === 'rejected' && !reviewNotes) {
    res.status(400).json({ error: 'Please provide a short explanation for rejection.' });
    return;
  }

  submission.status = nextStatus;
  submission.queuedForBank = nextStatus === 'approved';
  submission.reviewNotes = reviewNotes;
  submission.reviewedAt = new Date();
  submission.reviewedByEmail = req.user.email;
  await submission.save();

  res.json({ submission: serializeQuestionSubmission(submission) });
});

app.get('/api/admin/subscriptions/overview', authMiddleware, requireAdmin, async (_req, res) => {
  const now = new Date();
  const [activeUsers, expiredUsers, totalUsers, dailyUsage] = await Promise.all([
    UserModel.countDocuments({ 'subscription.status': 'active', 'subscription.expiresAt': { $gt: now } }),
    UserModel.countDocuments({ 'subscription.status': { $in: ['expired', 'cancelled'] } }),
    UserModel.countDocuments(),
    AIUsageModel.aggregate([
      { $group: { _id: '$day', chatCount: { $sum: '$chatCount' }, solverCount: { $sum: '$solverCount' }, tokenConsumed: { $sum: '$tokenConsumed' } } },
      { $sort: { _id: -1 } },
      { $limit: 14 },
    ]),
  ]);

  res.json({
    totalUsers,
    activeUsers,
    expiredUsers,
    plans: Object.values(SUBSCRIPTION_PLANS),
    dailyUsage: dailyUsage.map((item) => ({
      day: item._id,
      chatCount: item.chatCount || 0,
      solverCount: item.solverCount || 0,
      tokenConsumed: item.tokenConsumed || 0,
    })),
  });
});

app.get('/api/admin/subscriptions/users', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const filter = {};
  if (status !== 'all') {
    filter['subscription.status'] = status;
  }

  const users = await UserModel.find(filter, {
    email: 1,
    firstName: 1,
    lastName: 1,
    subscription: 1,
  }).sort({ updatedAt: -1 }).limit(500).lean();

  res.json({
    users: users.map((item) => {
      const subscription = normalizeSubscription(item);
      const plan = resolveSubscriptionPlan(subscription.planId);
      return {
        id: String(item._id),
        email: item.email,
        firstName: item.firstName || '',
        lastName: item.lastName || '',
        subscription: {
          ...subscription,
          isActive: isSubscriptionActive(subscription),
          planName: plan?.name || '',
          dailyAiLimit: plan?.dailyAiLimit || 0,
        },
      };
    }),
  });
});

app.post('/api/admin/subscriptions/:userId/update', authMiddleware, requireAdmin, async (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const planId = String(req.body?.planId || '').trim();
  const status = String(req.body?.status || '').trim().toLowerCase();
  const paymentReference = String(req.body?.paymentReference || '').trim();
  const plan = resolveSubscriptionPlan(planId);

  if (!userId || !plan || !['active', 'inactive', 'expired', 'cancelled'].includes(status)) {
    res.status(400).json({ error: 'Valid userId, planId, and status are required.' });
    return;
  }

  const user = await UserModel.findById(userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  user.subscription = {
    status,
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference,
    lastActivatedAt: startedAt,
  };
  await user.save();

  res.json({ ok: true, userId, subscription: normalizeSubscription(user) });
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

app.get('/api/admin/mcq-bank/structure', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const filter = subject ? { subject } : {};

  const rows = await MCQModel.aggregate([
    { $match: filter },
    {
      $group: {
        _id: {
          subject: '$subject',
          part: '$part',
          chapter: '$chapter',
          section: '$section',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.subject': 1, '_id.part': 1, '_id.chapter': 1, '_id.section': 1 } },
  ]);

  res.json({
    structure: rows.map((item) => ({
      subject: String(item._id?.subject || ''),
      part: String(item._id?.part || ''),
      chapter: String(item._id?.chapter || ''),
      section: String(item._id?.section || ''),
      count: Number(item.count || 0),
    })),
  });
});

app.get('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const part = String(req.query.part || '').trim().toLowerCase();
  const chapter = String(req.query.chapter || '').trim();
  const section = String(req.query.section || '').trim();
  const topic = String(req.query.topic || '').trim();
  const difficulty = String(req.query.difficulty || '').trim();

  const filter = {};
  if (subject) filter.subject = subject;
  if (part) filter.part = part;
  if (chapter) filter.chapter = { $regex: chapter, $options: 'i' };
  if (section) filter.section = { $regex: section, $options: 'i' };
  if (topic) filter.topic = { $regex: topic, $options: 'i' };
  if (difficulty) filter.difficulty = difficulty;

  const mcqs = await MCQModel.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({
    mcqs: mcqs.map((item) => serializeMcq(item)),
  });
});

app.delete('/api/admin/mcqs/purge-all', authMiddleware, requireAdmin, async (_req, res) => {
  const [mcqResult, sessionResult, attemptResult] = await Promise.all([
    MCQModel.deleteMany({}),
    TestSessionModel.deleteMany({}),
    AttemptModel.deleteMany({}),
  ]);

  res.json({
    ok: true,
    removed: {
      mcqs: mcqResult.deletedCount || 0,
      sessions: sessionResult.deletedCount || 0,
      attempts: attemptResult.deletedCount || 0,
    },
  });
});

app.post('/api/admin/mcqs', authMiddleware, requireAdmin, async (req, res) => {
  const {
    question,
    questionImageUrl = '',
    options,
    answer,
    subject,
    part,
    chapter,
    section,
    topic,
    difficulty = 'Medium',
    tip = '',
  } = req.body || {};

  if (!question || !Array.isArray(options) || options.length < 4 || !answer || !subject || !part || !chapter || !section) {
    res.status(400).json({ error: 'question, options (min 4), answer, subject, part, chapter, and section are required.' });
    return;
  }

  const cleanOptions = options
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (cleanOptions.length < 4) {
    res.status(400).json({ error: 'At least four non-empty options are required.' });
    return;
  }

  const resolvedTopic = String(topic || `${chapter} - ${section}`).trim();

  const mcq = await MCQModel.create({
    question: String(question),
    questionImageUrl: String(questionImageUrl || '').trim(),
    options: cleanOptions,
    answer: String(answer),
    subject: String(subject).toLowerCase(),
    part: String(part).toLowerCase().trim(),
    chapter: String(chapter).trim(),
    section: String(section).trim(),
    topic: resolvedTopic,
    difficulty: String(difficulty),
    tip: String(tip),
    source: 'Admin',
  });

  res.status(201).json({
    mcq: serializeMcq(mcq),
  });
});

app.put('/api/admin/mcqs/:mcqId', authMiddleware, requireAdmin, async (req, res) => {
  const payload = {};
  ['question', 'questionImageUrl', 'answer', 'subject', 'part', 'chapter', 'section', 'topic', 'difficulty', 'tip'].forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      const value = String(req.body[field] ?? '');
      payload[field] = ['subject', 'part'].includes(field) ? value.toLowerCase().trim() : value;
    }
  });
  if (Array.isArray(req.body?.options)) {
    payload.options = req.body.options
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (payload.options.length < 4) {
      res.status(400).json({ error: 'At least four non-empty options are required.' });
      return;
    }
  }

  if (!payload.topic && (payload.chapter || payload.section)) {
    const chapterText = String(payload.chapter || '').trim();
    const sectionText = String(payload.section || '').trim();
    payload.topic = `${chapterText} - ${sectionText}`.trim();
  }

  const mcq = await MCQModel.findByIdAndUpdate(req.params.mcqId, { $set: payload }, { new: true });
  if (!mcq) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  res.json({
    mcq: serializeMcq(mcq),
  });
});

app.delete('/api/admin/mcqs/:mcqId', authMiddleware, requireAdmin, async (req, res) => {
  const mcqId = String(req.params.mcqId || '').trim();
  if (!mcqId) {
    res.status(400).json({ error: 'MCQ id is required.' });
    return;
  }

  const removed = await MCQModel.findByIdAndDelete(mcqId).lean();
  if (!removed) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  res.json({ ok: true, removedMcqId: mcqId });
});

app.get('/api/admin/practice-board/questions', authMiddleware, requireAdmin, async (req, res) => {
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const chapter = String(req.query.chapter || '').trim();
  const section = String(req.query.section || '').trim();
  const difficulty = String(req.query.difficulty || '').trim();
  const search = String(req.query.search || '').trim();

  const filter = {};
  if (subject) filter.subject = subject;
  if (chapter) filter.chapter = { $regex: chapter, $options: 'i' };
  if (section) filter.section = { $regex: section, $options: 'i' };
  if (difficulty) filter.difficulty = difficulty;
  if (search) {
    filter.$or = [
      { questionText: { $regex: search, $options: 'i' } },
      { solutionText: { $regex: search, $options: 'i' } },
    ];
  }

  const questions = await PracticeBoardQuestionModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
  res.json({ questions: questions.map((item) => serializePracticeBoardQuestion(item)) });
});

app.post('/api/admin/practice-board/questions', authMiddleware, requireAdmin, async (req, res) => {
  const {
    subject,
    chapter,
    section,
    difficulty = 'Medium',
    questionText = '',
    questionImageUrl = '',
    solutionText = '',
    solutionImageUrl = '',
  } = req.body || {};

  const normalizedSubject = String(subject || '').trim().toLowerCase();
  if (!normalizedSubject || !chapter || !section) {
    res.status(400).json({ error: 'subject, chapter, and section are required.' });
    return;
  }

  if (!String(questionText || '').trim() && !String(questionImageUrl || '').trim()) {
    res.status(400).json({ error: 'Provide question text or question image.' });
    return;
  }

  if (!String(solutionText || '').trim() && !String(solutionImageUrl || '').trim()) {
    res.status(400).json({ error: 'Provide solution text or solution image.' });
    return;
  }

  const created = await PracticeBoardQuestionModel.create({
    subject: normalizedSubject,
    chapter: String(chapter).trim(),
    section: String(section).trim(),
    difficulty: String(difficulty || 'Medium').trim() || 'Medium',
    questionText: String(questionText || '').trim(),
    questionImageUrl: String(questionImageUrl || '').trim(),
    solutionText: String(solutionText || '').trim(),
    solutionImageUrl: String(solutionImageUrl || '').trim(),
    source: 'Admin',
  });

  res.status(201).json({ question: serializePracticeBoardQuestion(created) });
});

app.put('/api/admin/practice-board/questions/:questionId', authMiddleware, requireAdmin, async (req, res) => {
  const existing = await PracticeBoardQuestionModel.findById(req.params.questionId);
  if (!existing) {
    res.status(404).json({ error: 'Practice board question not found.' });
    return;
  }

  const next = {
    subject: Object.prototype.hasOwnProperty.call(req.body, 'subject')
      ? String(req.body.subject ?? '').trim().toLowerCase()
      : String(existing.subject || '').trim().toLowerCase(),
    chapter: Object.prototype.hasOwnProperty.call(req.body, 'chapter')
      ? String(req.body.chapter ?? '').trim()
      : String(existing.chapter || '').trim(),
    section: Object.prototype.hasOwnProperty.call(req.body, 'section')
      ? String(req.body.section ?? '').trim()
      : String(existing.section || '').trim(),
    difficulty: Object.prototype.hasOwnProperty.call(req.body, 'difficulty')
      ? String(req.body.difficulty ?? '').trim()
      : String(existing.difficulty || '').trim(),
    questionText: Object.prototype.hasOwnProperty.call(req.body, 'questionText')
      ? String(req.body.questionText ?? '').trim()
      : String(existing.questionText || '').trim(),
    questionImageUrl: Object.prototype.hasOwnProperty.call(req.body, 'questionImageUrl')
      ? String(req.body.questionImageUrl ?? '').trim()
      : String(existing.questionImageUrl || '').trim(),
    solutionText: Object.prototype.hasOwnProperty.call(req.body, 'solutionText')
      ? String(req.body.solutionText ?? '').trim()
      : String(existing.solutionText || '').trim(),
    solutionImageUrl: Object.prototype.hasOwnProperty.call(req.body, 'solutionImageUrl')
      ? String(req.body.solutionImageUrl ?? '').trim()
      : String(existing.solutionImageUrl || '').trim(),
  };

  if (!next.subject || !next.chapter || !next.section) {
    res.status(400).json({ error: 'subject, chapter, and section are required.' });
    return;
  }

  if (!next.questionText && !next.questionImageUrl) {
    res.status(400).json({ error: 'Provide question text or question image.' });
    return;
  }

  if (!next.solutionText && !next.solutionImageUrl) {
    res.status(400).json({ error: 'Provide solution text or solution image.' });
    return;
  }

  Object.assign(existing, next);
  const updated = await existing.save();

  res.json({ question: serializePracticeBoardQuestion(updated) });
});

app.delete('/api/admin/practice-board/questions/:questionId', authMiddleware, requireAdmin, async (req, res) => {
  const questionId = String(req.params.questionId || '').trim();
  if (!questionId) {
    res.status(400).json({ error: 'Question id is required.' });
    return;
  }

  const removed = await PracticeBoardQuestionModel.findByIdAndDelete(questionId).lean();
  if (!removed) {
    res.status(404).json({ error: 'Practice board question not found.' });
    return;
  }

  res.json({ ok: true, removedQuestionId: questionId });
});

async function bootstrap() {
  await connectMongo(MONGODB_URI);
  await bootstrapAdminAccounts();

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
