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
import nodemailer from 'nodemailer';
import Twilio from 'twilio';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';
import { connectMongo } from './lib/mongo.js';
import { UserModel } from './models/User.js';
import { MCQModel } from './models/MCQ.js';
import { TestSessionModel } from './models/TestSession.js';
import { AttemptModel } from './models/Attempt.js';
import { AIUsageModel } from './models/AIUsage.js';
import { PracticeBoardQuestionModel } from './models/PracticeBoardQuestion.js';
import { QuestionSubmissionModel } from './models/QuestionSubmission.js';
import { ContributionPolicyModel } from './models/ContributionPolicy.js';
import { SubmissionRestrictionModel } from './models/SubmissionRestriction.js';
import { CommunityProfileModel } from './models/CommunityProfile.js';
import { CommunityConnectionRequestModel } from './models/CommunityConnectionRequest.js';
import { CommunityConnectionModel } from './models/CommunityConnection.js';
import { CommunityMessageModel } from './models/CommunityMessage.js';
import { CommunityReportModel } from './models/CommunityReport.js';
import { CommunityBlockModel } from './models/CommunityBlock.js';
import { CommunityRoomPostModel } from './models/CommunityRoomPost.js';
import { SignupRequestModel } from './models/SignupRequest.js';
import { SignupTokenModel } from './models/SignupToken.js';
import { PremiumSubscriptionRequestModel } from './models/PremiumSubscriptionRequest.js';
import { PremiumActivationTokenModel } from './models/PremiumActivationToken.js';
import { PasswordRecoveryRequestModel } from './models/PasswordRecoveryRequest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || process.env.API_PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI || process.env.DATABASE_URL || process.env.MONGO_URI || '';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;
const NODE_ENV = String(process.env.NODE_ENV || 'development').toLowerCase();
const IS_PRODUCTION = NODE_ENV === 'production';
const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const AI_DAILY_LIMIT = Number(process.env.SMART_DAILY_LIMIT || process.env.AI_DAILY_LIMIT || 50);
const OPENAI_MODEL = process.env.MODEL_PROVIDER_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
const SIGNUP_TOKEN_TTL_HOURS = Number(process.env.SIGNUP_TOKEN_TTL_HOURS || 24);
const PREMIUM_TOKEN_TTL_HOURS = Number(process.env.PREMIUM_TOKEN_TTL_HOURS || 24);
const NUST_UPDATES_CACHE_MS = Number(process.env.NUST_UPDATES_CACHE_MS || 60 * 1000);
const MAX_JSON_BODY_MB = clamp(Number(process.env.MAX_JSON_BODY_MB || 10), 1, 20);
const REQUEST_TIMEOUT_MS = clamp(Number(process.env.REQUEST_TIMEOUT_MS || 30_000), 5_000, 120_000);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const CORS_ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const MODEL_PROVIDER_KEY = process.env.MODEL_PROVIDER_API_KEY || process.env.OPENAI_API_KEY || '';
const SMTP_HOST = String(process.env.SMTP_HOST || 'smtp.gmail.com').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = String(process.env.SMTP_USER || '').trim();
const SMTP_PASS = String(process.env.SMTP_PASS || '').trim();
const SMTP_FROM_EMAIL = String(process.env.SMTP_FROM_EMAIL || SMTP_USER).trim();
const TWILIO_ACCOUNT_SID = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
const TWILIO_AUTH_TOKEN = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
const TWILIO_PHONE_NUMBER = String(process.env.TWILIO_PHONE_NUMBER || '').trim();
const TWILIO_WHATSAPP_FROM = String(process.env.TWILIO_WHATSAPP_FROM || '').trim();

const openai = MODEL_PROVIDER_KEY
  ? new OpenAI({ apiKey: MODEL_PROVIDER_KEY })
  : null;

const smtpTransporter = SMTP_USER && SMTP_PASS
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  })
  : null;

const twilioClient = TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN
  ? Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
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

const PAYMENT_PROOF_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);
const PAYMENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;
// Render sits behind a proxy and forwards client IP in X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.set('query parser', 'simple');
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'no-referrer' },
  }),
);

function sanitizePrimitive(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\u0000/g, '');
}

function sanitizePayload(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePayload(item));
  }

  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, nested]) => {
      const safeKey = String(key || '').trim();
      if (!safeKey) return;
      if (safeKey === '__proto__' || safeKey === 'constructor' || safeKey === 'prototype') return;
      if (safeKey.startsWith('$')) return;
      out[safeKey] = sanitizePayload(nested);
    });
    return out;
  }

  return sanitizePrimitive(value);
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (!IS_PRODUCTION) return true;
  if (CORS_ALLOWED_ORIGINS.length === 0) return true;
  return CORS_ALLOWED_ORIGINS.includes(origin);
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('CORS origin denied.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: `${MAX_JSON_BODY_MB}mb` }));
app.use(express.urlencoded({ extended: false, limit: `${MAX_JSON_BODY_MB}mb` }));
app.use((req, res, next) => {
  req.body = sanitizePayload(req.body);
  req.query = sanitizePayload(req.query);
  req.params = sanitizePayload(req.params);
  res.setTimeout(REQUEST_TIMEOUT_MS);
  next();
});

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

app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again shortly.' },
  }),
);

app.use(
  '/api/auth/forgot-password',
  rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many reset requests. Please wait before retrying.' },
  }),
);

app.use(
  '/api/auth/reset-password',
  rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset attempts. Please try again later.' },
  }),
);

app.use(
  '/api/ai',
  rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI endpoint rate limit reached. Please wait a moment and retry.' },
  }),
);

const nustUpdatesCache = {
  fetchedAt: 0,
  updates: [],
};

const CONTENT_RESTRICTION_MESSAGE = 'Your submission contains content that does not meet the platform guidelines.\nUpload access has been temporarily restricted.\nPlease contact the administration if you believe this action was taken by mistake.';
const SUPPORTED_SUBJECTS = new Set([
  'mathematics',
  'physics',
  'chemistry',
  'biology',
  'english',
  'quantitative mathematics',
  'design aptitude',
]);
const DEFAULT_CONTRIBUTION_POLICY = {
  maxSubmissionsPerDay: 5,
  maxFilesPerSubmission: 3,
  maxFileSizeBytes: 1024 * 1024,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  blockDurationMinutes: 180,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function parsePositiveInt(value, fallback, min = 1, max = 500) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isNaN(parsed)) return fallback;
  return clamp(parsed, min, max);
}

function readPagination(query, options = {}) {
  const defaultLimit = options.defaultLimit ?? 50;
  const maxLimit = options.maxLimit ?? 200;
  const page = parsePositiveInt(query?.page, 1, 1, 10_000);
  const limit = parsePositiveInt(query?.limit, defaultLimit, 1, maxLimit);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function escapeRegexLiteral(value, maxLen = 80) {
  const normalized = String(value || '').trim().slice(0, maxLen);
  if (!normalized) return '';
  return normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsRegex(value, maxLen = 80) {
  const escaped = escapeRegexLiteral(value, maxLen);
  if (!escaped) return null;
  return { $regex: escaped, $options: 'i' };
}

const COMMUNITY_PROFILE_SELECT = 'userId username shareProfilePicture profilePictureUrl favoriteSubjects targetNetType subjectsNeedHelp preparationLevel studyTimePreference testScoreRange bio createdAt';
const COMMUNITY_USER_SELECT = 'firstName lastName targetProgram city progress.averageScore progress.weakTopics role';
const COMMUNITY_CONNECTION_SELECT = 'participantA participantB createdAt';
const COMMUNITY_REQUEST_SELECT = 'fromUserId toUserId status createdAt';
const COMMUNITY_MESSAGE_SELECT = 'connectionId senderUserId text createdAt readByUserIds';
const COMMUNITY_ROOM_POST_SELECT = 'roomId authorUserId type title text subject upvotes answers flagged createdAt';
const MCQ_SELECT = 'subject part chapter section topic question questionImageUrl options answer tip difficulty source createdAt';
const PRACTICE_BOARD_SELECT = 'subject difficulty questionText questionFile questionImageUrl solutionText solutionFile solutionImageUrl source createdAt';

const PRACTICE_BOARD_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const PRACTICE_BOARD_MAX_FILE_BYTES = 8 * 1024 * 1024;
const COMMUNITY_PROFILE_PICTURE_ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);
const COMMUNITY_PROFILE_PICTURE_MAX_BYTES = 3 * 1024 * 1024;

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

function normalizeContributionActorKey(params) {
  const userId = String(params?.submittedByUserId || '').trim();
  if (userId) return `user:${userId}`;

  const clientId = String(params?.submittedByClientId || '').trim();
  if (clientId) return `client:${clientId}`;

  const email = String(params?.submittedByEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  const ip = String(params?.ipAddress || '').trim();
  const ua = String(params?.userAgent || '').trim();
  return `guest:${hashToken(`${ip}|${ua}`)}`;
}

async function getContributionPolicy() {
  const existing = await ContributionPolicyModel.findOne({ key: 'default' }).lean();
  if (existing) {
    return {
      maxSubmissionsPerDay: clamp(Number(existing.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100),
      maxFilesPerSubmission: clamp(Number(existing.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10),
      maxFileSizeBytes: clamp(Number(existing.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024),
      allowedMimeTypes: Array.isArray(existing.allowedMimeTypes) && existing.allowedMimeTypes.length
        ? existing.allowedMimeTypes
        : DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
      blockDurationMinutes: clamp(Number(existing.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080),
      updatedByEmail: String(existing.updatedByEmail || '').trim(),
    };
  }

  const created = await ContributionPolicyModel.create({ key: 'default', ...DEFAULT_CONTRIBUTION_POLICY });
  return {
    maxSubmissionsPerDay: created.maxSubmissionsPerDay,
    maxFilesPerSubmission: created.maxFilesPerSubmission,
    maxFileSizeBytes: created.maxFileSizeBytes,
    allowedMimeTypes: created.allowedMimeTypes,
    blockDurationMinutes: created.blockDurationMinutes,
    updatedByEmail: String(created.updatedByEmail || '').trim(),
  };
}

function moderateQuestionSubmission(params) {
  const subject = String(params?.subject || '').trim().toLowerCase();
  const questionText = String(params?.questionText || '').trim();
  const questionDescription = String(params?.questionDescription || '').trim();
  const questionSource = String(params?.questionSource || '').trim();
  const submissionReason = String(params?.submissionReason || '').trim();
  const attachments = Array.isArray(params?.attachments) ? params.attachments : [];

  const blob = [
    subject,
    questionText,
    questionDescription,
    questionSource,
    submissionReason,
    ...attachments.map((item) => `${item.name} ${item.mimeType} ${String(item.extractedSnippet || '')}`),
  ]
    .join(' ')
    .toLowerCase();

  const reasons = [];
  let score = 0;

  if (!SUPPORTED_SUBJECTS.has(subject)) {
    reasons.push('Subject is not part of supported academic categories.');
    score += 50;
  }

  const blockedPatterns = [
    /(casino|betting|loan scam|crypto signal|porn|adult|escort|hack|malware|ransomware)/i,
    /(<script|javascript:|onerror=|drop table|union select|--\s)/i,
    /(buy now|free money|click here|subscribe now|whatsapp group)/i,
  ];
  blockedPatterns.forEach((pattern) => {
    if (pattern.test(blob)) {
      reasons.push('Contains malicious, offensive, spam, or fraudulent patterns.');
      score += 50;
    }
  });

  const educationalSignals = /(equation|theorem|proof|mcq|numerical|past paper|chapter|syllabus|concept|net|engineering|science|question)/i;
  if (!educationalSignals.test(blob)) {
    reasons.push('Submission appears non-educational or unrelated to platform scope.');
    score += 35;
  }

  if (questionText.length && questionText.length < 10 && attachments.length === 0) {
    reasons.push('Question text is too short to be useful for review.');
    score += 20;
  }

  const normalizedReasons = Array.from(new Set(reasons));
  const result = normalizedReasons.length ? 'rejected' : 'approved';
  const finalScore = normalizedReasons.length ? Math.min(100, score || 60) : 0;
  return { result, reasons: normalizedReasons, score: finalScore };
}

function serializeContributionPolicy(policy) {
  return {
    maxSubmissionsPerDay: clamp(Number(policy?.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100),
    maxFilesPerSubmission: clamp(Number(policy?.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10),
    maxFileSizeBytes: clamp(Number(policy?.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024),
    allowedMimeTypes: Array.isArray(policy?.allowedMimeTypes) && policy.allowedMimeTypes.length
      ? policy.allowedMimeTypes
      : DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
    blockDurationMinutes: clamp(Number(policy?.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080),
    updatedByEmail: String(policy?.updatedByEmail || '').trim(),
  };
}

function getAttachmentSignalSnippet(attachment) {
  const dataUrl = String(attachment?.dataUrl || '').trim();
  if (!dataUrl.startsWith('data:')) return '';

  const comma = dataUrl.indexOf(',');
  if (comma < 0) return '';

  const meta = dataUrl.slice(0, comma).toLowerCase();
  const payload = dataUrl.slice(comma + 1);
  try {
    if (meta.includes(';base64')) {
      return Buffer.from(payload, 'base64').toString('utf8').replace(/\s+/g, ' ').slice(0, 2500);
    }
    return decodeURIComponent(payload).replace(/\s+/g, ' ').slice(0, 2500);
  } catch {
    return '';
  }
}

function parseDataUrl(dataUrl) {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return null;
  const comma = raw.indexOf(',');
  if (comma < 0) return null;

  const meta = raw.slice(5, comma);
  const payload = raw.slice(comma + 1);
  const [mimeTypeRaw = 'application/octet-stream'] = meta.split(';');
  const mimeType = String(mimeTypeRaw || 'application/octet-stream').trim().toLowerCase();
  const isBase64 = /;base64/i.test(meta);

  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf8');
    return { mimeType, buffer };
  } catch {
    return null;
  }
}

function normalizePracticeBoardFile(input) {
  if (input == null) return null;
  if (typeof input !== 'object') return null;

  const name = String(input.name || '').trim();
  const dataUrl = String(input.dataUrl || '').trim();
  if (!name && !dataUrl) return null;
  if (!name || !dataUrl) {
    throw new Error('Practice file must include both name and dataUrl.');
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error(`Invalid file data for ${name}.`);
  }

  const mimeType = String(input.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  if (!PRACTICE_BOARD_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Unsupported file type for ${name}. Allowed types: JPG, PNG, PDF, DOC, DOCX.`);
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > PRACTICE_BOARD_MAX_FILE_BYTES) {
    throw new Error(`File ${name} exceeds the ${Math.floor(PRACTICE_BOARD_MAX_FILE_BYTES / (1024 * 1024))}MB limit.`);
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function normalizeCommunityProfilePicture(dataUrlRaw) {
  const dataUrl = String(dataUrlRaw || '').trim();
  if (!dataUrl) return '';
  if (!dataUrl.startsWith('data:')) {
    throw new Error('Profile picture must be uploaded as a valid image file.');
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed?.buffer) {
    throw new Error('Invalid profile picture data.');
  }

  const mimeType = String(parsed.mimeType || '').trim().toLowerCase();
  if (!COMMUNITY_PROFILE_PICTURE_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Unsupported profile picture format. Use JPG, PNG, WEBP, GIF, or SVG.');
  }

  if (parsed.buffer.length > COMMUNITY_PROFILE_PICTURE_MAX_BYTES) {
    throw new Error('Profile picture exceeds 3MB size limit.');
  }

  return dataUrl;
}

function normalizePlainText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\s+((?:q(?:uestion)?\s*)?\d{1,3}\s*[\).:-])/gi, '$1\n$2')
    .trim();
}

function splitInlineOptions(line) {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact) return [];

  const markerRegex = /(?:^|\s)(?:option\s*)?([A-H]|\d{1,2})(?:[\).:-])?\s+/gi;
  const markers = [];
  let match;

  while ((match = markerRegex.exec(compact))) {
    const label = String(match[1] || '').toUpperCase();
    const markerPos = compact.indexOf(label, match.index);
    markers.push({ label, markerPos, valueStart: markerRegex.lastIndex });
  }

  const startsWithMarker = /^(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+\S/i.test(compact);
  if (!markers.length || (!startsWithMarker && markers.length < 2)) {
    return [];
  }

  const extracted = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const end = next ? next.markerPos : compact.length;
    const segment = compact.slice(current.valueStart, end).trim();
    if (segment) extracted.push(segment);
  }

  return extracted;
}

function normalizeOptionText(value) {
  return String(value || '')
    .replace(/^(?:option\s*)?(?:[A-H]|\d{1,2})(?:\s*[\).:-])?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveAnswerToOption(answerRaw, options) {
  const normalizedAnswer = String(answerRaw || '').trim();
  if (!normalizedAnswer) return '';

  const token = normalizedAnswer.match(/(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (token) {
    const marker = token[1];
    const idx = /^\d+$/.test(marker)
      ? Number(marker) - 1
      : marker.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  const directIndex = options.findIndex((item) => String(item || '').trim().toLowerCase() === normalizedAnswer.toLowerCase());
  if (directIndex >= 0) return options[directIndex];

  return normalizedAnswer;
}

function normalizeDifficulty(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'easy') return 'Easy';
  if (raw === 'hard') return 'Hard';
  return 'Medium';
}

function parseOptionsFromUnknown(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeOptionText(item))
      .filter(Boolean);
  }

  const raw = String(value || '').trim();
  if (!raw) return [];

  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const options = [];

  for (const line of lines) {
    const inline = splitInlineOptions(line);
    if (inline.length) {
      options.push(...inline.map((item) => normalizeOptionText(item)).filter(Boolean));
      continue;
    }

    const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])?\s+(.+)$/i);
    if (optionMatch) {
      options.push(normalizeOptionText(optionMatch[2]));
      continue;
    }

    if (!options.length) {
      const parts = raw.split(/\s+(?=(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+)/i);
      if (parts.length > 1) {
        return parts
          .map((part) => normalizeOptionText(part))
          .filter(Boolean);
      }
    }
  }

  if (!options.length) {
    return lines.map((line) => normalizeOptionText(line)).filter(Boolean);
  }

  return options;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function parseBulkMcqsWithAi(rawText) {
  if (!openai) {
    return { parsed: [], errors: ['AI parser is unavailable.'] };
  }

  const inputText = String(rawText || '').trim();
  if (!inputText) {
    return { parsed: [], errors: ['No content found to parse.'] };
  }

  const clippedText = inputText.length > 120000 ? inputText.slice(0, 120000) : inputText;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You extract ALL MCQs from messy educational documents.',
            'Return strict JSON only in this schema:',
            '{"mcqs":[{"question":"...","options":["..."],"answer":"...","explanation":"...","difficulty":"Easy|Medium|Hard"}]}',
            'Rules:',
            '- Detect all question boundaries (1., 1), Q1, Question 1, etc.).',
            '- Support mixed option formats: A) A. A, Option 1, 1) and inline options in one line.',
            '- Keep options separated as array items.',
            '- answer may be letter/number/text; provide best available answer token from source.',
            '- If explanation is not present, use empty string.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: clippedText,
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || '';
    const parsedJson = extractJsonObject(raw);
    const rows = Array.isArray(parsedJson?.mcqs) ? parsedJson.mcqs : [];

    const parsed = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const question = String(row?.question || '').replace(/\s+/g, ' ').trim();
      const options = parseOptionsFromUnknown(row?.options);
      const answer = resolveAnswerToOption(row?.answer, options);
      const tip = String(row?.explanation || '').trim();
      const difficulty = normalizeDifficulty(row?.difficulty);

      if (!question) {
        errors.push(`Q${idx + 1}: question text is missing.`);
        return;
      }
      if (options.length < 2) {
        errors.push(`Q${idx + 1}: at least 2 options are required.`);
        return;
      }
      if (!answer) {
        errors.push(`Q${idx + 1}: correct answer is missing.`);
        return;
      }

      parsed.push({
        question,
        questionImageUrl: '',
        options,
        answer,
        tip,
        difficulty,
      });
    });

    if (!parsed.length) {
      return { parsed: [], errors: ['AI parser could not extract valid MCQs.'] };
    }

    return { parsed, errors };
  } catch {
    return { parsed: [], errors: ['AI parser failed for this document.'] };
  }
}

function parseBulkMcqsFromText(raw) {
  const text = normalizePlainText(raw);
  if (!text) return { parsed: [], errors: ['No content found to parse.'] };

  const starts = [];
  const startRegex = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[\).:-]\s+/gim;
  let match;
  while ((match = startRegex.exec(text))) {
    starts.push({ index: match.index, number: match[1] });
  }

  if (!starts.length) {
    return {
      parsed: [],
      errors: ['Could not detect question numbering. Use format like "1. ...", "2) ...", etc.'],
    };
  }

  const blocks = starts.map((entry, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return {
      number: entry.number,
      content: text.slice(entry.index, end).trim(),
    };
  });

  const errors = [];
  const parsed = [];

  blocks.forEach((block) => {
    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      errors.push(`Q${block.number}: empty block.`);
      return;
    }

    lines[0] = lines[0].replace(/^(?:q(?:uestion)?\s*)?\d{1,3}\s*[\).:-]\s*/i, '').trim();

    let questionImageUrl = '';
    let answer = '';
    let explanation = '';
    let difficulty = 'Medium';
    const questionLines = [];
    const options = [];
    let capturingExplanation = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const imageMatch = line.match(/^(?:image|img|question\s*image)\s*[:=-]\s*(https?:\/\/\S+)$/i)
        || line.match(/^!\[[^\]]*\]\((https?:\/\/[^\)\s]+)\)$/i);
      if (imageMatch) {
        questionImageUrl = imageMatch[1].trim();
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|correct|answer|ans\.?)\s*[:=-]\s*(.+)$/i);
      if (answerMatch) {
        answer = answerMatch[1].trim();
        capturingExplanation = false;
        continue;
      }

      const explanationMatch = line.match(/^(?:explanation|solution|reason)\s*[:=-]\s*(.*)$/i);
      if (explanationMatch) {
        explanation = explanationMatch[1].trim();
        capturingExplanation = true;
        continue;
      }

      const difficultyMatch = line.match(/^difficulty\s*[:=-]\s*(easy|medium|hard)$/i);
      if (difficultyMatch) {
        const normalized = difficultyMatch[1].toLowerCase();
        difficulty = normalized === 'easy' ? 'Easy' : normalized === 'hard' ? 'Hard' : 'Medium';
        continue;
      }

      const inlineOptions = splitInlineOptions(line);
      if (inlineOptions.length) {
        options.push(...inlineOptions);
        capturingExplanation = false;
        continue;
      }

      const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])?\s+(.+)$/i);
      if (optionMatch) {
        options.push(optionMatch[2].trim());
        capturingExplanation = false;
        continue;
      }

      if (capturingExplanation) {
        explanation = explanation ? `${explanation}\n${line}` : line;
      } else {
        questionLines.push(line);
      }
    }

    const question = questionLines.join(' ').trim();
    if (!question) {
      errors.push(`Q${block.number}: question text is missing.`);
      return;
    }

    if (options.length < 2) {
      errors.push(`Q${block.number}: at least 2 options are required.`);
      return;
    }

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      errors.push(`Q${block.number}: correct answer is missing.`);
      return;
    }

    let resolvedAnswer = normalizedAnswer;
    const answerToken = normalizedAnswer.match(/(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
    if (answerToken) {
      const token = answerToken[1];
      const idx = /^\d+$/.test(token)
        ? Number(token) - 1
        : token.toUpperCase().charCodeAt(0) - 65;
      if (idx >= 0 && idx < options.length) {
        resolvedAnswer = options[idx];
      }
    }

    parsed.push({
      question,
      questionImageUrl,
      options,
      answer: resolvedAnswer,
      tip: explanation,
      difficulty,
    });
  });

  return { parsed, errors };
}

async function extractTextFromUpload(filePayload) {
  const fileName = String(filePayload?.name || '').trim();
  const extension = path.extname(fileName).toLowerCase();
  const fileMeta = parseDataUrl(filePayload?.dataUrl);
  if (!fileMeta?.buffer?.length) {
    throw new Error('Uploaded file data is invalid.');
  }

  const mimeType = String(filePayload?.mimeType || fileMeta.mimeType || '').toLowerCase().trim();
  const sizeBytes = Number(filePayload?.size || fileMeta.buffer.length || 0);
  if (!sizeBytes || sizeBytes > 8 * 1024 * 1024) {
    throw new Error('Uploaded file must be between 1 byte and 8 MB.');
  }

  if (mimeType.includes('pdf') || extension === '.pdf') {
    const parsed = await pdfParse(fileMeta.buffer);
    return normalizePlainText(parsed?.text || '');
  }

  if (
    mimeType.includes('officedocument.wordprocessingml.document')
    || extension === '.docx'
  ) {
    const result = await mammoth.extractRawText({ buffer: fileMeta.buffer });
    return normalizePlainText(result?.value || '');
  }

  if (mimeType.includes('msword') || extension === '.doc') {
    // Legacy DOC is often binary; this fallback extracts any readable text blocks.
    const text = normalizePlainText(fileMeta.buffer.toString('latin1'));
    if (!text || text.length < 25) {
      throw new Error('Could not reliably parse this DOC file. Please save it as DOCX and upload again.');
    }
    return text;
  }

  throw new Error('Unsupported file type. Upload PDF, DOC, or DOCX.');
}

async function checkSubmissionRestriction(actorKey) {
  if (!actorKey) return { restricted: false, blockedUntil: null };
  const restriction = await SubmissionRestrictionModel.findOne({ actorKey }).lean();
  if (!restriction?.blockedUntil) {
    return { restricted: false, blockedUntil: null };
  }

  const blockedUntil = new Date(restriction.blockedUntil);
  if (Number.isNaN(blockedUntil.getTime()) || blockedUntil.getTime() <= Date.now()) {
    return { restricted: false, blockedUntil: null };
  }

  return {
    restricted: true,
    blockedUntil: blockedUntil.toISOString(),
    reason: String(restriction.reason || '').trim(),
  };
}

async function blockSubmissionActor(actorKey, reason, durationMinutes) {
  if (!actorKey) return null;
  const blockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
  await SubmissionRestrictionModel.findOneAndUpdate(
    { actorKey },
    {
      $set: {
        blockedUntil,
        reason: String(reason || '').trim(),
        lastViolationAt: new Date(),
      },
      $setOnInsert: {
        actorKey,
      },
    },
    { upsert: true, new: true },
  );
  return blockedUntil.toISOString();
}

function startOfTodayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
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

function isValidEmail(value) {
  const normalized = normalizeEmail(value);
  if (!normalized || normalized.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

function sanitizeHumanName(value, maxLen = 80) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function sanitizePlainText(value, maxLen = 240) {
  return String(value || '')
    .replace(/[\u0000<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').trim().slice(0, 120);
}

function getUserAgent(req) {
  return String(req.get('user-agent') || '').trim().slice(0, 240);
}

function normalizeMobileNumber(value) {
  return String(value || '').trim();
}

function normalizePaymentMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'hbl') return 'bank_transfer';
  return method;
}

function normalizeContactMethod(value) {
  const method = String(value || '').trim().toLowerCase();
  if (method === 'phone' || method === 'sms' || method === 'email' || method === 'whatsapp') return 'whatsapp';
  return '';
}

function isValidMobileNumber(value) {
  const cleaned = String(value || '').replace(/[\s()-]/g, '');
  return /^\+?[0-9]{8,18}$/.test(cleaned);
}

function isValidWhatsAppNumber(value) {
  const cleaned = String(value || '').replace(/[\s()-]/g, '');
  return /^\+[1-9][0-9]{7,14}$/.test(cleaned);
}

function compactMobile(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizePaymentProofMime(value) {
  const mime = String(value || '').trim().toLowerCase();
  if (mime === 'image/jpg') return 'image/jpeg';
  if (mime === 'application/x-pdf') return 'application/pdf';
  return mime;
}

function inferPaymentProofMimeFromName(fileName) {
  const name = String(fileName || '').trim().toLowerCase();
  if (!name.includes('.')) return '';
  const ext = name.split('.').pop() || '';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'pdf') return 'application/pdf';
  return '';
}

function serializePasswordRecoveryRequest(item) {
  return {
    id: String(item._id),
    identifier: String(item.identifier || ''),
    matchedBy: String(item.matchedBy || 'none'),
    userId: item.userId ? String(item.userId) : '',
    userName: String(item.userName || ''),
    email: String(item.email || ''),
    mobileNumber: String(item.mobileNumber || ''),
    recoveryStatus: String(item.recoveryStatus || 'failed'),
    dispatches: Array.isArray(item.dispatches)
      ? item.dispatches.map((dispatch) => ({
        channel: String(dispatch.channel || ''),
        destination: String(dispatch.destination || ''),
        status: String(dispatch.status || ''),
        provider: String(dispatch.provider || ''),
        detail: String(dispatch.detail || ''),
      }))
      : [],
    tokenExpiresAt: item.tokenExpiresAt ? new Date(item.tokenExpiresAt).toISOString() : null,
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

async function sendRecoveryEmail(destination, token, expiresInMinutes = 30) {
  if (!isValidEmail(destination)) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: 'No valid email available for delivery.',
    };
  }

  if (!smtpTransporter || !SMTP_FROM_EMAIL) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: 'SMTP provider not configured.',
    };
  }

  try {
    await smtpTransporter.sendMail({
      from: SMTP_FROM_EMAIL,
      to: destination,
      subject: 'NET360 Password Recovery Token',
      text: `Your NET360 reset token is: ${token}. It expires in ${expiresInMinutes} minutes.`,
      html: `<p>Your NET360 reset token is: <strong>${token}</strong></p><p>This token expires in ${expiresInMinutes} minutes.</p>`,
    });

    return {
      channel: 'email',
      destination,
      status: 'sent',
      provider: 'smtp-gmail',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'email',
      destination,
      status: 'failed',
      provider: 'smtp-gmail',
      detail: error instanceof Error ? error.message : 'Email provider error.',
    };
  }
}

async function sendRecoverySms(destination, token, expiresInMinutes = 30) {
  if (!isValidMobileNumber(destination)) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: 'No valid mobile number available for delivery.',
    };
  }

  if (!twilioClient || !TWILIO_PHONE_NUMBER) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: 'Twilio SMS provider not configured.',
    };
  }

  try {
    await twilioClient.messages.create({
      to: destination,
      from: TWILIO_PHONE_NUMBER,
      body: `NET360 reset token: ${token}. Expires in ${expiresInMinutes} minutes.`,
    });

    return {
      channel: 'sms',
      destination,
      status: 'sent',
      provider: 'twilio-sms',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'sms',
      destination,
      status: 'failed',
      provider: 'twilio-sms',
      detail: error instanceof Error ? error.message : 'SMS provider error.',
    };
  }
}

async function sendRecoveryWhatsApp(destination, token, expiresInMinutes = 30) {
  if (!isValidMobileNumber(destination)) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: 'No valid mobile number available for delivery.',
    };
  }

  if (!twilioClient || !TWILIO_WHATSAPP_FROM) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: 'Twilio WhatsApp provider not configured.',
    };
  }

  const to = destination.startsWith('whatsapp:') ? destination : `whatsapp:${destination}`;

  try {
    await twilioClient.messages.create({
      to,
      from: TWILIO_WHATSAPP_FROM,
      body: `NET360 reset token: ${token}. Expires in ${expiresInMinutes} minutes.`,
    });

    return {
      channel: 'whatsapp',
      destination,
      status: 'sent',
      provider: 'twilio-whatsapp',
      detail: 'Recovery token sent.',
    };
  } catch (error) {
    return {
      channel: 'whatsapp',
      destination,
      status: 'failed',
      provider: 'twilio-whatsapp',
      detail: error instanceof Error ? error.message : 'WhatsApp provider error.',
    };
  }
}

function normalizePaymentProof(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Payment proof file is required.');
  }

  const name = sanitizePlainText(input.name || '', 120);
  const dataUrl = String(input.dataUrl || '').trim();
  const parsed = parseDataUrl(dataUrl);
  if (!name || !parsed?.buffer?.length) {
    throw new Error('Payment proof must include a valid file name and file data.');
  }

  const providedMime = normalizePaymentProofMime(input.mimeType || '');
  const parsedMime = normalizePaymentProofMime(parsed.mimeType || '');
  const inferredMime = inferPaymentProofMimeFromName(name);
  const mimeType = [providedMime, parsedMime, inferredMime].find((candidate) => PAYMENT_PROOF_ALLOWED_MIME_TYPES.has(candidate));
  if (!PAYMENT_PROOF_ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error('Payment proof must be JPG, PNG, or PDF.');
  }

  const size = Number(input.size || parsed.buffer.length || 0);
  if (!size || size > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error('Payment proof must be up to 5MB.');
  }

  return {
    name,
    mimeType,
    size,
    dataUrl,
  };
}

function buildSafeDownloadName(rawName, fallback = 'payment-proof') {
  const base = String(rawName || '').trim() || fallback;
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}

function streamPaymentProofFromDataUrl(res, paymentProof = {}, fallbackName = 'payment-proof') {
  const parsed = parseDataUrl(paymentProof.dataUrl || '');
  if (!parsed?.buffer || !parsed.buffer.length) return false;

  const fileName = buildSafeDownloadName(paymentProof.name, fallbackName);
  const mimeType = String(paymentProof.mimeType || parsed.mimeType || 'application/octet-stream').trim().toLowerCase();
  const download = String(res.req?.query?.download || '') === '1';
  const disposition = download ? 'attachment' : 'inline';

  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Length', String(parsed.buffer.length));
  res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
  res.send(parsed.buffer);
  return true;
}

function serializeSignupRequest(item) {
  return {
    id: String(item._id),
    email: item.email,
    firstName: item.firstName || '',
    lastName: item.lastName || '',
    mobileNumber: item.mobileNumber || '',
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    paymentTransactionId: item.paymentTransactionId,
    paymentProof: {
      name: String(item.paymentProof?.name || ''),
      mimeType: String(item.paymentProof?.mimeType || ''),
      size: Number(item.paymentProof?.size || 0),
      dataUrl: String(item.paymentProof?.dataUrl || ''),
    },
    contactMethod: normalizeContactMethod(item.contactMethod || 'whatsapp'),
    contactValue: String(item.contactValue || ''),
    status: item.status,
    notes: item.notes || '',
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    reviewedByEmail: item.reviewedByEmail || '',
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
}

function serializePremiumSubscriptionRequest(item, planName = '') {
  return {
    id: String(item._id),
    userId: String(item.userId || ''),
    email: item.email,
    mobileNumber: item.mobileNumber || '',
    planId: String(item.planId || ''),
    planName,
    paymentMethod: normalizePaymentMethod(item.paymentMethod),
    paymentTransactionId: item.paymentTransactionId,
    paymentProof: {
      name: String(item.paymentProof?.name || ''),
      mimeType: String(item.paymentProof?.mimeType || ''),
      size: Number(item.paymentProof?.size || 0),
      dataUrl: String(item.paymentProof?.dataUrl || ''),
    },
    contactMethod: normalizeContactMethod(item.contactMethod || 'whatsapp'),
    contactValue: String(item.contactValue || ''),
    status: String(item.status || 'pending'),
    notes: String(item.notes || ''),
    reviewedAt: item.reviewedAt ? new Date(item.reviewedAt).toISOString() : null,
    reviewedByEmail: String(item.reviewedByEmail || ''),
    createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
  };
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

function generatePremiumTokenCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const parts = [];
  for (let block = 0; block < 3; block += 1) {
    let token = '';
    for (let i = 0; i < 4; i += 1) {
      token += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    parts.push(token);
  }
  return `PREM-${parts.join('-')}`;
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

function toPlainRecord(value) {
  if (!value || typeof value !== 'object') return {};
  if (typeof value.toObject === 'function') {
    return value.toObject();
  }
  if (value._doc && typeof value._doc === 'object') {
    return value._doc;
  }
  return value;
}

function normalizeSubscription(user) {
  const plainUser = toPlainRecord(user);
  const userSubscription = plainUser.subscription
    || (typeof user?.get === 'function' ? user.get('subscription') : null)
    || user?.subscription
    || {};
  const plainSubscription = toPlainRecord(userSubscription);

  return {
    ...defaultSubscription(),
    ...plainSubscription,
  };
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
  const legacyQuestionUrl = String(item.questionImageUrl || '').trim();
  const legacySolutionUrl = String(item.solutionImageUrl || '').trim();
  const normalizedQuestionFile = item.questionFile
    ? {
      name: String(item.questionFile.name || '').trim(),
      mimeType: String(item.questionFile.mimeType || '').trim().toLowerCase(),
      size: Number(item.questionFile.size || 0),
      dataUrl: String(item.questionFile.dataUrl || '').trim(),
    }
    : (legacyQuestionUrl
      ? {
        name: 'question-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacyQuestionUrl,
      }
      : null);

  const normalizedSolutionFile = item.solutionFile
    ? {
      name: String(item.solutionFile.name || '').trim(),
      mimeType: String(item.solutionFile.mimeType || '').trim().toLowerCase(),
      size: Number(item.solutionFile.size || 0),
      dataUrl: String(item.solutionFile.dataUrl || '').trim(),
    }
    : (legacySolutionUrl
      ? {
        name: 'solution-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacySolutionUrl,
      }
      : null);

  return {
    id: String(item._id),
    subject: String(item.subject || '').toLowerCase(),
    difficulty: String(item.difficulty || 'Medium'),
    questionText: String(item.questionText || '').trim(),
    questionFile: normalizedQuestionFile,
    solutionText: String(item.solutionText || '').trim(),
    solutionFile: normalizedSolutionFile,
  };
}

function makeCommunityUsername(user) {
  const first = String(user?.firstName || '').trim();
  const last = String(user?.lastName || '').trim();
  const full = [first, last].filter(Boolean).join(' ').trim();
  if (full) return full;
  const email = String(user?.email || '').trim().toLowerCase();
  if (email.includes('@')) return email.split('@')[0];
  return `student-${String(user?._id || '').slice(-6)}`;
}

const COMMUNITY_ROOM_DEFINITIONS = [
  { id: 'mathematics', title: 'Math Problem Solving', subject: 'mathematics' },
  { id: 'physics', title: 'Physics Concepts', subject: 'physics' },
  { id: 'chemistry', title: 'Chemistry Discussion', subject: 'chemistry' },
  { id: 'biology', title: 'Biology Revision Circle', subject: 'biology' },
  { id: 'english', title: 'English NET Boosters', subject: 'english' },
  { id: 'quantitative-mathematics', title: 'Quantitative Mathematics', subject: 'quantitative mathematics' },
  { id: 'design-aptitude', title: 'Design Aptitude Lab', subject: 'design aptitude' },
  { id: 'past-mcqs', title: 'NET Past MCQs Discussion', subject: 'mixed' },
  { id: 'quick-doubt', title: 'Quick Doubt Help', subject: 'mixed' },
  { id: 'study-motivation', title: 'Study Motivation', subject: 'mixed' },
];

function normalizeSubjectList(values, limit = 8) {
  if (!Array.isArray(values)) return [];
  return values
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeCommunityNetType(value) {
  const raw = String(value || '').trim().toLowerCase();
  const allowed = new Set([
    'net-engineering',
    'net-applied-sciences',
    'net-business-social-sciences',
    'net-architecture',
    'net-natural-sciences',
  ]);
  return allowed.has(raw) ? raw : 'net-engineering';
}

function normalizePreparationLevel(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['beginner', 'intermediate', 'advanced'].includes(raw) ? raw : 'intermediate';
}

function normalizeStudyTimePreference(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['morning', 'evening', 'night', 'flexible'].includes(raw) ? raw : 'flexible';
}

function levelRank(level) {
  if (level === 'advanced') return 3;
  if (level === 'intermediate') return 2;
  return 1;
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function getOrCreateCommunityProfile(user) {
  const existing = await CommunityProfileModel.findOne({ userId: user._id });
  if (existing) return existing;

  const base = normalizeUsername(makeCommunityUsername(user)) || `student-${String(user._id).slice(-6)}`;
  let candidate = base;
  let suffix = 1;
  while (await CommunityProfileModel.findOne({ username: candidate })) {
    suffix += 1;
    candidate = `${base}-${suffix}`.slice(0, 40);
  }

  return CommunityProfileModel.create({
    userId: user._id,
    username: candidate,
    shareProfilePicture: false,
    profilePictureUrl: '',
    favoriteSubjects: [],
    targetNetType: 'net-engineering',
    subjectsNeedHelp: [],
    preparationLevel: 'intermediate',
    studyTimePreference: 'flexible',
    testScoreRange: { min: 0, max: 200 },
    bio: '',
  });
}

function connectionKey(userIdA, userIdB) {
  return [String(userIdA), String(userIdB)].sort().join(':');
}

async function getCommunityRestriction(userId) {
  const block = await CommunityBlockModel.findOne({ userId }).lean();
  if (!block) {
    return {
      blocked: false,
      muted: false,
      warningCount: 0,
      reason: '',
      action: 'none',
    };
  }

  const now = Date.now();
  const bannedUntil = block.bannedUntil ? new Date(block.bannedUntil).getTime() : 0;
  const mutedUntil = block.mutedUntil ? new Date(block.mutedUntil).getTime() : 0;
  const blocked = Boolean(block.blocked && (!bannedUntil || bannedUntil > now));
  const muted = Boolean(mutedUntil && mutedUntil > now);

  return {
    blocked,
    muted,
    warningCount: Number(block.warningCount || 0),
    reason: String(block.reason || 'Community access restricted due to moderation action.').trim(),
    action: String(block.lastAction || 'none'),
    mutedUntil: block.mutedUntil ? new Date(block.mutedUntil).toISOString() : null,
    bannedUntil: block.bannedUntil ? new Date(block.bannedUntil).toISOString() : null,
  };
}

async function ensureCommunityAccess(userId) {
  const restriction = await getCommunityRestriction(userId);
  if (!restriction.blocked) return null;
  return {
    blocked: true,
    reason: restriction.reason,
    code: 'COMMUNITY_BANNED',
  };
}

async function ensureCommunityWritable(userId) {
  const restriction = await getCommunityRestriction(userId);
  if (restriction.blocked) {
    return {
      blocked: true,
      reason: restriction.reason,
      code: 'COMMUNITY_BANNED',
      restriction,
    };
  }
  if (restriction.muted) {
    return {
      blocked: true,
      reason: `You are temporarily muted in community until ${restriction.mutedUntil}.`,
      code: 'COMMUNITY_MUTED',
      restriction,
    };
  }
  return null;
}

async function applyCommunityViolation(userId, reason, sourceReportId = '') {
  const current = await CommunityBlockModel.findOne({ userId });
  const warningCount = Number(current?.warningCount || 0) + 1;
  const next = {
    warningCount,
    reason: String(reason || 'Community policy violation detected.').trim(),
    sourceReportId: String(sourceReportId || current?.sourceReportId || ''),
  };

  if (warningCount >= 5) {
    next.blocked = true;
    next.lastAction = 'ban';
    next.bannedUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    next.blockedAt = new Date();
  } else if (warningCount >= 3) {
    next.blocked = false;
    next.lastAction = 'mute';
    next.mutedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  } else {
    next.blocked = false;
    next.lastAction = 'warning';
  }

  await CommunityBlockModel.findOneAndUpdate(
    { userId },
    {
      $set: next,
      $setOnInsert: { blockedAt: new Date() },
    },
    { upsert: true, new: true },
  );

  return warningCount;
}

function serializeCommunityUser(params) {
  const profile = params?.profile || {};
  const user = params?.user || {};
  const includePrivatePicture = Boolean(params?.includePrivatePicture);
  const showPicture = Boolean(profile.profilePictureUrl && (includePrivatePicture || profile.shareProfilePicture));
  return {
    id: String(user._id || ''),
    userId: String(user._id || ''),
    firstName: String(user.firstName || ''),
    lastName: String(user.lastName || ''),
    city: String(user.city || ''),
    username: String(profile.username || makeCommunityUsername(user)),
    profilePictureUrl: showPicture ? String(profile.profilePictureUrl || '') : '',
    shareProfilePicture: Boolean(profile.shareProfilePicture),
    targetProgram: String(user.targetProgram || ''),
    score: Number(user.progress?.averageScore || 0),
    testsCompleted: Number(user.progress?.testsCompleted || 0),
    questionsSolved: Number(user.progress?.questionsSolved || 0),
    targetNetType: String(profile.targetNetType || 'net-engineering'),
    subjectsNeedHelp: normalizeSubjectList(profile.subjectsNeedHelp || []),
    preparationLevel: normalizePreparationLevel(profile.preparationLevel),
    studyTimePreference: normalizeStudyTimePreference(profile.studyTimePreference),
    testScoreRange: {
      min: Number(profile.testScoreRange?.min || 0),
      max: Number(profile.testScoreRange?.max || 200),
    },
    favoriteSubjects: normalizeSubjectList(profile.favoriteSubjects || []),
    bio: String(profile.bio || ''),
  };
}

function moderateCommunityConversation(messages) {
  const harmfulPattern = /(abuse|idiot|stupid|hate|kill|threat|harass|scam|fraud|porn|adult|nude|hack|malware|terror|fuck|bitch|slur)/i;
  const spamPattern = /(buy now|click here|free money|join now|whatsapp group|crypto signal)/i;

  const offenderScore = new Map();
  const reasons = [];

  for (const message of messages || []) {
    const sender = String(message.senderUserId || '');
    const text = String(message.text || '').trim();
    if (!sender || !text) continue;

    let score = offenderScore.get(sender) || 0;
    if (harmfulPattern.test(text)) {
      score += 55;
      reasons.push('Detected abusive or harmful wording in chat.');
    }
    if (spamPattern.test(text)) {
      score += 45;
      reasons.push('Detected spam-like or malicious promotional patterns.');
    }
    if (text.length > 0 && text.length < 2) {
      score += 5;
    }
    offenderScore.set(sender, score);
  }

  let violatorUserId = '';
  let topScore = 0;
  offenderScore.forEach((score, sender) => {
    if (score > topScore) {
      topScore = score;
      violatorUserId = sender;
    }
  });

  return {
    result: topScore >= 50 ? 'harmful' : 'clean',
    score: Math.min(100, topScore),
    reasons: Array.from(new Set(reasons)),
    violatorUserId,
  };
}

function getPeriodBounds(period) {
  const now = new Date();
  const start = new Date(now);
  if (period === 'monthly') {
    start.setMonth(start.getMonth() - 1);
  } else {
    start.setDate(start.getDate() - 7);
  }
  return { start, end: now };
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function longestRecentStreak(dates) {
  const unique = Array.from(new Set((dates || []).map((item) => dayKey(item)))).sort();
  if (!unique.length) return 0;
  let best = 1;
  let current = 1;
  for (let i = 1; i < unique.length; i += 1) {
    const prev = new Date(`${unique[i - 1]}T00:00:00Z`).getTime();
    const next = new Date(`${unique[i]}T00:00:00Z`).getTime();
    if ((next - prev) === 24 * 60 * 60 * 1000) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 1;
    }
  }
  return best;
}

function serializeQuestionSubmission(item) {
  const normalizedStatus = String(item.status || 'pending').toLowerCase();
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
    submittedByClientId: String(item.submittedByClientId || '').trim(),
    actorKey: String(item.actorKey || '').trim(),
    moderation: {
      result: String(item.moderation?.result || 'approved').trim(),
      reasons: Array.isArray(item.moderation?.reasons) ? item.moderation.reasons.map((reason) => String(reason || '').trim()).filter(Boolean) : [],
      score: Number(item.moderation?.score || 0),
      blockedActor: Boolean(item.moderation?.blockedActor),
      reviewedAt: item.moderation?.reviewedAt ? new Date(item.moderation.reviewedAt).toISOString() : null,
    },
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

function sanitizeUpdateText(text, maxLen = 220) {
  return String(text || '')
    .replace(/\bhttps?:\/\/\S+/gi, ' ')
    .replace(/\b\w+>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
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
    const title = sanitizeUpdateText(stripHtml(match[2] || ''), 180);
    if (!href || !title || title.length < 6) continue;
    if (ignoredTitles.has(title.toLowerCase())) continue;

    const absoluteUrl = toAbsoluteUrl(href);
    const key = `${title.toLowerCase()}|${absoluteUrl}`;
    if (seen.has(key)) continue;

    // Capture nearby sentence fragments for subtitle context.
    const index = Number(match.index || 0);
    const nearbyRaw = block.slice(Math.max(0, index - 180), Math.min(block.length, index + 360));
    const nearbyText = sanitizeUpdateText(stripHtml(nearbyRaw).replace(title, ''), 220);

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
    const firstName = sanitizeHumanName(req.body?.firstName || '');
    const lastName = sanitizeHumanName(req.body?.lastName || '');
    const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber);
    const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
    const paymentTransactionId = sanitizePlainText(req.body?.paymentTransactionId || '', 120);
    const contactMethod = normalizeContactMethod(req.body?.contactMethod || 'whatsapp');
    const contactValueRaw = String(req.body?.contactValue || '').trim();

    let paymentProof;
    try {
      paymentProof = normalizePaymentProof(req.body?.paymentProof);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Payment proof is invalid.' });
      return;
    }

    const contactValue = normalizeMobileNumber(contactValueRaw || mobileNumber);

    if (!email || !mobileNumber || !paymentTransactionId || !paymentMethod || !contactMethod || !contactValue) {
      res.status(400).json({ error: 'Email, mobile number, payment method, transaction ID, payment proof, and contact details are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    if (!isValidMobileNumber(mobileNumber)) {
      res.status(400).json({ error: 'Enter a valid mobile number.' });
      return;
    }

    if (!['easypaisa', 'jazzcash', 'bank_transfer'].includes(paymentMethod)) {
      res.status(400).json({ error: 'Payment method must be one of: easypaisa, jazzcash, bank_transfer.' });
      return;
    }

    if (contactMethod !== 'whatsapp') {
      res.status(400).json({ error: 'Contact method must be whatsapp.' });
      return;
    }

    if (!isValidWhatsAppNumber(contactValue)) {
      res.status(400).json({ error: 'Enter a valid WhatsApp number in international format (e.g. +923XXXXXXXXX).' });
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
      paymentProof,
      contactMethod,
      contactValue,
      status: 'pending',
    });

    res.status(201).json({
      request: serializeSignupRequest(request),
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
    const firstName = sanitizeHumanName(req.body?.firstName || '');
    const lastName = sanitizeHumanName(req.body?.lastName || '');
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');

    if (!email || !password || !tokenCode) {
      res.status(400).json({ error: 'Email, password, and token code are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
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
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);
    const deviceId = sanitizeDeviceId(req.body?.deviceId || req.headers['user-agent'] || '');
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    if (!isValidEmail(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const user = await UserModel.findOne({ email });
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
  const email = normalizeEmail(req.body?.email || '');
  const mobileNumber = normalizeMobileNumber(req.body?.mobileNumber || '');

  if (!email || !mobileNumber) {
    res.status(400).json({ error: 'Registered email and mobile number are required.' });
    return;
  }

  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Enter a valid email address.' });
    return;
  }

  if (!isValidMobileNumber(mobileNumber)) {
    res.status(400).json({ error: 'Enter a valid mobile number.' });
    return;
  }

  const user = await UserModel.findOne({ email });
  const matchedBy = user && compactMobile(user.phone) === compactMobile(mobileNumber) ? 'email' : 'none';

  if (!user || compactMobile(user.phone) !== compactMobile(mobileNumber)) {
    await PasswordRecoveryRequestModel.create({
      identifier: `${email} | ${mobileNumber}`,
      normalizedIdentifier: `${email} | ${compactMobile(mobileNumber)}`,
      matchedBy: 'none',
      recoveryStatus: 'not_found',
      dispatches: [],
      requestedIp: getClientIp(req),
      requestedUserAgent: getUserAgent(req),
    });

    res.json({ message: 'No active account matched this email and mobile number.' });
    return;
  }

  const resetToken = crypto.randomBytes(24).toString('hex');
  const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
  user.resetPasswordTokenHash = hashToken(resetToken);
  user.resetPasswordExpiresAt = tokenExpiresAt;
  await user.save();

  const request = await PasswordRecoveryRequestModel.create({
    identifier: `${email} | ${mobileNumber}`,
    normalizedIdentifier: `${email} | ${compactMobile(mobileNumber)}`,
    matchedBy,
    userId: user._id,
    userName: `${String(user.firstName || '').trim()} ${String(user.lastName || '').trim()}`.trim(),
    email,
    mobileNumber: normalizeMobileNumber(user.phone || ''),
    recoveryStatus: 'sent',
    dispatches: [],
    tokenExpiresAt,
    requestedIp: getClientIp(req),
    requestedUserAgent: getUserAgent(req),
  });

  res.json({
    message: 'Verification successful. Use the generated reset token to set a new password.',
    resetToken,
    request: serializePasswordRecoveryRequest(request),
  });
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
  if (Object.prototype.hasOwnProperty.call(req.body, 'firstName')) {
    req.user.firstName = sanitizeHumanName(req.body.firstName || '');
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'lastName')) {
    req.user.lastName = sanitizeHumanName(req.body.lastName || '');
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'phone')) {
    req.user.phone = sanitizePlainText(req.body.phone || '', 30);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'city')) {
    req.user.city = sanitizePlainText(req.body.city || '', 80);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'targetProgram')) {
    req.user.targetProgram = sanitizePlainText(req.body.targetProgram || '', 120);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'testSeries')) {
    req.user.testSeries = sanitizePlainText(req.body.testSeries || '', 50);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'sscPercentage')) {
    req.user.sscPercentage = sanitizePlainText(req.body.sscPercentage || '', 12);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'hsscPercentage')) {
    req.user.hsscPercentage = sanitizePlainText(req.body.hsscPercentage || '', 12);
  }
  if (Object.prototype.hasOwnProperty.call(req.body, 'testDate')) {
    req.user.testDate = sanitizePlainText(req.body.testDate || '', 40);
  }

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

async function communityGuard(req, res) {
  const blocked = await ensureCommunityAccess(req.user._id);
  if (!blocked) return false;
  res.status(403).json({ error: blocked.reason, code: blocked.code || 'COMMUNITY_BLOCKED' });
  return true;
}

async function communityWriteGuard(req, res) {
  const blocked = await ensureCommunityWritable(req.user._id);
  if (!blocked) return false;
  res.status(403).json({ error: blocked.reason, code: blocked.code || 'COMMUNITY_BLOCKED', restriction: blocked.restriction || null });
  return true;
}

app.get('/api/community/profile', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const profile = await getOrCreateCommunityProfile(req.user);
  res.json({ profile: serializeCommunityUser({ user: req.user, profile, includePrivatePicture: true }) });
});

app.put('/api/community/profile', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const profile = await getOrCreateCommunityProfile(req.user);

  const nextUsername = normalizeUsername(req.body?.username || profile.username);
  if (!nextUsername) {
    res.status(400).json({ error: 'username is required.' });
    return;
  }

  const taken = await CommunityProfileModel.findOne({
    username: nextUsername,
    userId: { $ne: req.user._id },
  }).lean();
  if (taken) {
    res.status(400).json({ error: 'Username is already taken.' });
    return;
  }

  profile.username = nextUsername;
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'shareProfilePicture')) {
    profile.shareProfilePicture = Boolean(req.body?.shareProfilePicture);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profilePictureDataUrl')) {
    try {
      profile.profilePictureUrl = normalizeCommunityProfilePicture(req.body?.profilePictureDataUrl);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid profile picture upload.' });
      return;
    }
  } else if (Object.prototype.hasOwnProperty.call(req.body || {}, 'profilePictureUrl')) {
    // Backward compatibility for older clients still sending URL field.
    profile.profilePictureUrl = String(req.body?.profilePictureUrl || '').trim();
  }
  if (Array.isArray(req.body?.favoriteSubjects)) {
    profile.favoriteSubjects = normalizeSubjectList(req.body.favoriteSubjects, 8);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'targetNetType')) {
    profile.targetNetType = normalizeCommunityNetType(req.body?.targetNetType);
  }
  if (Array.isArray(req.body?.subjectsNeedHelp)) {
    profile.subjectsNeedHelp = normalizeSubjectList(req.body.subjectsNeedHelp, 10);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'preparationLevel')) {
    profile.preparationLevel = normalizePreparationLevel(req.body?.preparationLevel);
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'studyTimePreference')) {
    profile.studyTimePreference = normalizeStudyTimePreference(req.body?.studyTimePreference);
  }
  if (req.body?.testScoreRange && typeof req.body.testScoreRange === 'object') {
    const min = Math.max(0, Math.min(200, Number(req.body.testScoreRange?.min ?? profile.testScoreRange?.min ?? 0)));
    const max = Math.max(min, Math.min(200, Number(req.body.testScoreRange?.max ?? profile.testScoreRange?.max ?? 200)));
    profile.testScoreRange = { min, max };
  }
  if (Object.prototype.hasOwnProperty.call(req.body || {}, 'bio')) {
    profile.bio = String(req.body?.bio || '').trim().slice(0, 280);
  }

  await profile.save();
  res.json({ profile: serializeCommunityUser({ user: req.user, profile, includePrivatePicture: true }) });
});

app.get('/api/community/users/search', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const q = String(req.query.q || '').trim().toLowerCase();
  const me = String(req.user._id);

  const profiles = await CommunityProfileModel.find(q ? { username: containsRegex(q, 50) } : {})
    .select(COMMUNITY_PROFILE_SELECT)
    .limit(30)
    .lean();

  const userIds = profiles.map((item) => String(item.userId));
  const users = await UserModel.find({ _id: { $in: userIds }, role: 'student' })
    .select(COMMUNITY_USER_SELECT)
    .lean();
  const usersById = new Map(users.map((item) => [String(item._id), item]));

  const candidateIds = profiles
    .map((item) => String(item.userId))
    .filter((id) => id !== me && usersById.has(id));

  const participantKeys = candidateIds.map((userId) => connectionKey(req.user._id, userId));
  const [connections, pendingToRows, pendingFromRows] = await Promise.all([
    CommunityConnectionModel.find({ participantKey: { $in: participantKeys } }).select('participantKey').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: req.user._id,
      toUserId: { $in: candidateIds },
      status: 'pending',
    }).select('toUserId').lean(),
    CommunityConnectionRequestModel.find({
      fromUserId: { $in: candidateIds },
      toUserId: req.user._id,
      status: 'pending',
    }).select('fromUserId').lean(),
  ]);

  const connectedKeys = new Set(connections.map((item) => String(item.participantKey)));
  const pendingTo = new Set(pendingToRows.map((item) => String(item.toUserId)));
  const pendingFrom = new Set(pendingFromRows.map((item) => String(item.fromUserId)));

  const rows = [];
  for (const profile of profiles) {
    const userId = String(profile.userId);
    if (userId === me) continue;
    const user = usersById.get(userId);
    if (!user) continue;

    const status = connectedKeys.has(connectionKey(req.user._id, userId))
      ? 'connected'
      : pendingTo.has(userId)
        ? 'pending-sent'
        : pendingFrom.has(userId)
          ? 'pending-received'
          : 'none';

    rows.push({
      ...serializeCommunityUser({ user, profile }),
      connectionStatus: status,
    });
  }

  res.json({ users: rows.slice(0, 20) });
});

app.post('/api/community/connections/request', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const toUserId = String(req.body?.toUserId || '').trim();
  if (!isValidObjectId(toUserId)) {
    res.status(400).json({ error: 'Valid target user id is required.' });
    return;
  }
  if (String(req.user._id) === toUserId) {
    res.status(400).json({ error: 'You cannot connect to yourself.' });
    return;
  }

  const target = await UserModel.findById(toUserId).lean();
  if (!target || target.role !== 'student') {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const targetBlocked = await ensureCommunityAccess(toUserId);
  if (targetBlocked) {
    res.status(403).json({ error: 'This user is not available in community right now.' });
    return;
  }

  const key = connectionKey(req.user._id, toUserId);
  const existingConnection = await CommunityConnectionModel.findOne({ participantKey: key }).lean();
  if (existingConnection) {
    res.status(400).json({ error: 'You are already connected.' });
    return;
  }

  const existingPending = await CommunityConnectionRequestModel.findOne({
    $or: [
      { fromUserId: req.user._id, toUserId, status: 'pending' },
      { fromUserId: toUserId, toUserId: req.user._id, status: 'pending' },
    ],
  }).lean();
  if (existingPending) {
    res.status(400).json({ error: 'A pending connection request already exists.' });
    return;
  }

  const created = await CommunityConnectionRequestModel.create({
    fromUserId: req.user._id,
    toUserId,
    status: 'pending',
  });

  res.status(201).json({ requestId: String(created._id) });
});

app.get('/api/community/connections/requests', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 100 });

  const [incoming, outgoing] = await Promise.all([
    CommunityConnectionRequestModel.find({ toUserId: req.user._id, status: 'pending' })
      .select(COMMUNITY_REQUEST_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CommunityConnectionRequestModel.find({ fromUserId: req.user._id, status: 'pending' })
      .select(COMMUNITY_REQUEST_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  const relatedUserIds = Array.from(new Set([
    ...incoming.map((item) => String(item.fromUserId)),
    ...outgoing.map((item) => String(item.toUserId)),
  ]));

  const [users, profiles] = await Promise.all([
    UserModel.find({ _id: { $in: relatedUserIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: relatedUserIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesByUserId = new Map(profiles.map((item) => [String(item.userId), item]));

  const mapRequest = (item, direction) => {
    const otherUserId = direction === 'incoming' ? String(item.fromUserId) : String(item.toUserId);
    const user = usersById.get(otherUserId);
    const profile = profilesByUserId.get(otherUserId);
    if (!user) return null;
    return {
      id: String(item._id),
      direction,
      status: String(item.status || 'pending'),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      user: serializeCommunityUser({ user, profile }),
    };
  };

  res.json({
    page,
    limit,
    incoming: incoming.map((item) => mapRequest(item, 'incoming')).filter(Boolean),
    outgoing: outgoing.map((item) => mapRequest(item, 'outgoing')).filter(Boolean),
  });
});

app.post('/api/community/connections/requests/:requestId/respond', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const requestId = String(req.params.requestId || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  if (!isValidObjectId(requestId)) {
    res.status(400).json({ error: 'Valid request id is required.' });
    return;
  }
  if (!['accept', 'reject'].includes(action)) {
    res.status(400).json({ error: 'action must be accept or reject.' });
    return;
  }

  const request = await CommunityConnectionRequestModel.findById(requestId);
  if (!request || String(request.toUserId) !== String(req.user._id)) {
    res.status(404).json({ error: 'Connection request not found.' });
    return;
  }
  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Request is already handled.' });
    return;
  }

  if (action === 'accept') {
    const key = connectionKey(request.fromUserId, request.toUserId);
    await CommunityConnectionModel.findOneAndUpdate(
      { participantKey: key },
      {
        $setOnInsert: {
          participantA: String(request.fromUserId) < String(request.toUserId) ? request.fromUserId : request.toUserId,
          participantB: String(request.fromUserId) < String(request.toUserId) ? request.toUserId : request.fromUserId,
          participantKey: key,
        },
      },
      { upsert: true, new: true },
    );
    request.status = 'accepted';
  } else {
    request.status = 'rejected';
  }

  await request.save();
  res.json({ ok: true, status: request.status });
});

app.get('/api/community/connections', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const myId = String(req.user._id);
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 50, maxLimit: 120 });
  const connections = await CommunityConnectionModel.find({
    $or: [{ participantA: myId }, { participantB: myId }],
  })
    .select(COMMUNITY_CONNECTION_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const otherUserIds = connections.map((item) => (String(item.participantA) === myId ? String(item.participantB) : String(item.participantA)));
  const connectionIds = connections.map((item) => item._id);

  const [users, profiles, unreadRows] = await Promise.all([
    UserModel.find({ _id: { $in: otherUserIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: otherUserIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
    CommunityMessageModel.aggregate([
      {
        $match: {
          connectionId: { $in: connectionIds },
          senderUserId: { $ne: req.user._id },
          readByUserIds: { $ne: req.user._id },
        },
      },
      { $group: { _id: '$connectionId', count: { $sum: 1 } } },
    ]),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesById = new Map(profiles.map((item) => [String(item.userId), item]));
  const unreadByConnection = new Map(unreadRows.map((item) => [String(item._id), Number(item.count || 0)]));

  const rows = [];
  for (const connection of connections) {
    const otherUserId = String(connection.participantA) === myId ? String(connection.participantB) : String(connection.participantA);
    const user = usersById.get(otherUserId);
    if (!user) continue;
    const profile = profilesById.get(otherUserId);

    rows.push({
      connectionId: String(connection._id),
      connectedAt: connection.createdAt ? new Date(connection.createdAt).toISOString() : null,
      user: serializeCommunityUser({ user, profile }),
      unreadCount: unreadByConnection.get(String(connection._id)) || 0,
    });
  }

  res.json({ page, limit, connections: rows });
});

app.get('/api/community/messages/:connectionId', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 120, maxLimit: 300 });
  const connectionId = String(req.params.connectionId || '').trim();
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const messages = await CommunityMessageModel.find({ connectionId })
    .select(COMMUNITY_MESSAGE_SELECT)
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  await CommunityMessageModel.updateMany(
    {
      connectionId,
      senderUserId: { $ne: req.user._id },
      readByUserIds: { $ne: req.user._id },
    },
    { $addToSet: { readByUserIds: req.user._id } },
  );

  res.json({
    page,
    limit,
    messages: messages.map((item) => ({
      id: String(item._id),
      connectionId: String(item.connectionId),
      senderUserId: String(item.senderUserId),
      text: String(item.text || ''),
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.post('/api/community/messages/:connectionId', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const connectionId = String(req.params.connectionId || '').trim();
  const text = String(req.body?.text || '').trim();
  if (!isValidObjectId(connectionId)) {
    res.status(400).json({ error: 'Valid connection id is required.' });
    return;
  }
  if (!text) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }
  if (text.length > 1200) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const created = await CommunityMessageModel.create({
    connectionId,
    senderUserId: req.user._id,
    text,
    readByUserIds: [req.user._id],
  });

  res.status(201).json({
    message: {
      id: String(created._id),
      connectionId,
      senderUserId: String(created.senderUserId),
      text: String(created.text || ''),
      createdAt: created.createdAt ? new Date(created.createdAt).toISOString() : null,
    },
  });
});

app.post('/api/community/report', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;
  const connectionId = String(req.body?.connectionId || '').trim();
  const reportedUserId = String(req.body?.reportedUserId || '').trim();
  const reason = String(req.body?.reason || '').trim();

  if (!isValidObjectId(connectionId) || !isValidObjectId(reportedUserId)) {
    res.status(400).json({ error: 'Valid connection id and reported user id are required.' });
    return;
  }

  const connection = await CommunityConnectionModel.findById(connectionId).lean();
  if (!connection) {
    res.status(404).json({ error: 'Connection not found.' });
    return;
  }
  const myId = String(req.user._id);
  if (![String(connection.participantA), String(connection.participantB)].includes(myId)) {
    res.status(403).json({ error: 'Access denied for this chat.' });
    return;
  }

  const messages = await CommunityMessageModel.find({ connectionId })
    .select('senderUserId text createdAt')
    .sort({ createdAt: 1 })
    .limit(300)
    .lean();
  const moderation = moderateCommunityConversation(messages);
  const snapshot = messages.map((item) => ({
    senderUserId: String(item.senderUserId),
    text: String(item.text || ''),
    createdAt: item.createdAt || null,
  }));

  const report = await CommunityReportModel.create({
    connectionId,
    reporterUserId: req.user._id,
    reportedUserId,
    reason,
    status: moderation.result === 'harmful' ? 'actioned' : 'open',
    moderation: {
      result: moderation.result,
      reasons: moderation.reasons,
      score: moderation.score,
      violatorUserId: moderation.violatorUserId,
      autoBlocked: moderation.result === 'harmful',
      reviewedAt: moderation.result === 'harmful' ? new Date() : null,
    },
    chatSnapshot: snapshot,
  });

  let enforcement = null;
  if (moderation.result === 'harmful' && moderation.violatorUserId) {
    const warnings = await applyCommunityViolation(
      moderation.violatorUserId,
      moderation.reasons.join(' ') || 'Harmful community behavior detected.',
      String(report._id),
    );
    const state = await getCommunityRestriction(moderation.violatorUserId);
    enforcement = {
      warningCount: warnings,
      action: state.action,
      mutedUntil: state.mutedUntil || null,
      bannedUntil: state.bannedUntil || null,
    };
  }

  res.status(201).json({
    ok: true,
    reportId: String(report._id),
    moderation: {
      result: moderation.result,
      reasons: moderation.reasons,
      score: moderation.score,
    },
    enforcement,
  });
});

app.get('/api/community/leaderboard', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const period = String(req.query.period || 'weekly').toLowerCase() === 'monthly' ? 'monthly' : 'weekly';
  const { start } = getPeriodBounds(period);
  const attempts = await AttemptModel.find({ attemptedAt: { $gte: start } }).lean();
  const previousWindowStart = new Date(start);
  previousWindowStart.setTime(start.getTime() - (period === 'monthly' ? 30 : 7) * 24 * 60 * 60 * 1000);
  const previousAttempts = await AttemptModel.find({ attemptedAt: { $gte: previousWindowStart, $lt: start } }).lean();

  const periodStats = new Map();
  for (const attempt of attempts) {
    const key = String(attempt.userId);
    const row = periodStats.get(key) || {
      userId: key,
      tests: 0,
      scoreSum: 0,
      correctSum: 0,
      totalQuestions: 0,
    };
    row.tests += 1;
    row.scoreSum += Number(attempt.score || 0);
    row.correctSum += Number(attempt.correctAnswers || 0);
    row.totalQuestions += Number(attempt.totalQuestions || 0);
    periodStats.set(key, row);
  }

  const previousStats = new Map();
  for (const attempt of previousAttempts) {
    const key = String(attempt.userId);
    const row = previousStats.get(key) || { tests: 0, scoreSum: 0 };
    row.tests += 1;
    row.scoreSum += Number(attempt.score || 0);
    previousStats.set(key, row);
  }

  const userIds = Array.from(periodStats.keys());
  const users = await UserModel.find({ _id: { $in: userIds } }).lean();
  const profiles = await CommunityProfileModel.find({ userId: { $in: userIds } }).lean();
  const userById = new Map(users.map((item) => [String(item._id), item]));
  const profileById = new Map(profiles.map((item) => [String(item.userId), item]));

  const leaderboard = Array.from(periodStats.values())
    .map((stats) => {
      const user = userById.get(stats.userId);
      if (!user) return null;
      const profile = profileById.get(stats.userId);
      const averageScore = stats.tests ? (stats.scoreSum / stats.tests) : 0;
      const accuracy = stats.totalQuestions ? (stats.correctSum / stats.totalQuestions) * 100 : 0;
      const prev = previousStats.get(stats.userId);
      const previousAverage = prev?.tests ? (prev.scoreSum / prev.tests) : averageScore;
      const improvement = averageScore - previousAverage;
      const competitionScore = (averageScore * 0.55) + (accuracy * 0.25) + (Math.max(0, improvement) * 0.2);

      return {
        ...serializeCommunityUser({ user, profile }),
        averageScore: Number(averageScore.toFixed(1)),
        tests: stats.tests,
        accuracy: Number(accuracy.toFixed(1)),
        improvement: Number(improvement.toFixed(1)),
        competitionScore,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.competitionScore - a.competitionScore)
    .slice(0, 20)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  res.json({ leaderboard, period });
});

app.get('/api/community/groups', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const roomIds = COMMUNITY_ROOM_DEFINITIONS.map((room) => room.id);
  const counts = await CommunityRoomPostModel.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $group: { _id: '$roomId', posts: { $sum: 1 } } },
  ]);
  const countByRoom = new Map(counts.map((row) => [String(row._id), Number(row.posts || 0)]));

  res.json({
    groups: COMMUNITY_ROOM_DEFINITIONS.map((room) => ({
      ...room,
      members: Math.max(8, Math.round(15 + (countByRoom.get(room.id) || 0) * 1.4)),
      posts: countByRoom.get(room.id) || 0,
      description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.',
    })),
  });
});

app.get('/api/community/discussion-rooms', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const roomIds = COMMUNITY_ROOM_DEFINITIONS.map((room) => room.id);
  const counts = await CommunityRoomPostModel.aggregate([
    { $match: { roomId: { $in: roomIds } } },
    { $group: { _id: '$roomId', posts: { $sum: 1 } } },
  ]);
  const countByRoom = new Map(counts.map((row) => [String(row._id), Number(row.posts || 0)]));

  res.json({
    rooms: COMMUNITY_ROOM_DEFINITIONS.map((room) => ({
      ...room,
      posts: countByRoom.get(room.id) || 0,
    })),
  });
});

app.get('/api/community/discussion-rooms/:roomId/posts', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 80, maxLimit: 180 });
  const roomId = String(req.params.roomId || '').trim();
  const room = COMMUNITY_ROOM_DEFINITIONS.find((item) => item.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Discussion room not found.' });
    return;
  }

  const posts = await CommunityRoomPostModel.find({ roomId })
    .select(COMMUNITY_ROOM_POST_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  const userIds = Array.from(new Set([
    ...posts.map((item) => String(item.authorUserId)),
    ...posts.flatMap((item) => (item.answers || []).map((answer) => String(answer.authorUserId))),
  ]));
  const [users, profiles] = await Promise.all([
    UserModel.find({ _id: { $in: userIds } }).select(COMMUNITY_USER_SELECT).lean(),
    CommunityProfileModel.find({ userId: { $in: userIds } }).select(COMMUNITY_PROFILE_SELECT).lean(),
  ]);
  const usersById = new Map(users.map((item) => [String(item._id), item]));
  const profilesById = new Map(profiles.map((item) => [String(item.userId), item]));

  const payload = posts.map((post) => {
    const author = usersById.get(String(post.authorUserId));
    const authorProfile = profilesById.get(String(post.authorUserId));
    return {
      id: String(post._id),
      roomId: post.roomId,
      type: String(post.type || 'discussion'),
      title: String(post.title || ''),
      text: String(post.text || ''),
      subject: String(post.subject || room.subject || ''),
      upvotes: Number(post.upvotes || 0),
      createdAt: post.createdAt ? new Date(post.createdAt).toISOString() : null,
      author: author ? serializeCommunityUser({ user: author, profile: authorProfile }) : null,
      answers: Array.isArray(post.answers) ? post.answers.map((answer) => {
        const answerAuthor = usersById.get(String(answer.authorUserId));
        const answerProfile = profilesById.get(String(answer.authorUserId));
        return {
          id: String(answer._id),
          text: String(answer.text || ''),
          upvotes: Number(answer.upvotes || 0),
          createdAt: answer.createdAt ? new Date(answer.createdAt).toISOString() : null,
          author: answerAuthor ? serializeCommunityUser({ user: answerAuthor, profile: answerProfile }) : null,
        };
      }) : [],
    };
  });

  res.json({ room, page, limit, posts: payload });
});

app.post('/api/community/discussion-rooms/:roomId/posts', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const roomId = String(req.params.roomId || '').trim();
  const room = COMMUNITY_ROOM_DEFINITIONS.find((item) => item.id === roomId);
  if (!room) {
    res.status(404).json({ error: 'Discussion room not found.' });
    return;
  }

  const type = String(req.body?.type || 'discussion').trim().toLowerCase() === 'doubt' ? 'doubt' : 'discussion';
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const text = String(req.body?.text || '').trim().slice(0, 2500);
  const subject = String(req.body?.subject || room.subject || '').trim().toLowerCase();
  if (!text) {
    res.status(400).json({ error: 'Post text is required.' });
    return;
  }

  const moderation = moderateCommunityConversation([{ senderUserId: req.user._id, text }]);
  if (moderation.result === 'harmful') {
    const warnings = await applyCommunityViolation(req.user._id, moderation.reasons.join(' ') || 'Policy violation in discussion post.');
    const state = await getCommunityRestriction(req.user._id);
    res.status(403).json({
      error: 'Your message violates community rules and could not be posted.',
      code: 'COMMUNITY_POLICY_BLOCK',
      moderation,
      enforcement: {
        warningCount: warnings,
        action: state.action,
        mutedUntil: state.mutedUntil || null,
        bannedUntil: state.bannedUntil || null,
      },
    });
    return;
  }

  const created = await CommunityRoomPostModel.create({
    roomId,
    authorUserId: req.user._id,
    type,
    title,
    text,
    subject,
  });

  res.status(201).json({ postId: String(created._id) });
});

app.post('/api/community/discussion-posts/:postId/answers', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const postId = String(req.params.postId || '').trim();
  if (!isValidObjectId(postId)) {
    res.status(400).json({ error: 'Valid post id is required.' });
    return;
  }
  const text = String(req.body?.text || '').trim().slice(0, 1800);
  if (!text) {
    res.status(400).json({ error: 'Answer text is required.' });
    return;
  }

  const moderation = moderateCommunityConversation([{ senderUserId: req.user._id, text }]);
  if (moderation.result === 'harmful') {
    const warnings = await applyCommunityViolation(req.user._id, moderation.reasons.join(' ') || 'Policy violation in doubt answer.');
    const state = await getCommunityRestriction(req.user._id);
    res.status(403).json({
      error: 'Your answer violates community rules and could not be posted.',
      code: 'COMMUNITY_POLICY_BLOCK',
      moderation,
      enforcement: {
        warningCount: warnings,
        action: state.action,
        mutedUntil: state.mutedUntil || null,
        bannedUntil: state.bannedUntil || null,
      },
    });
    return;
  }

  const post = await CommunityRoomPostModel.findById(postId);
  if (!post) {
    res.status(404).json({ error: 'Discussion post not found.' });
    return;
  }

  post.answers.push({
    authorUserId: req.user._id,
    text,
    upvotes: 0,
    upvotedByUserIds: [],
  });
  await post.save();

  const answer = post.answers[post.answers.length - 1];
  res.status(201).json({ answerId: String(answer._id) });
});

app.post('/api/community/discussion-posts/:postId/upvote', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  if (await communityWriteGuard(req, res)) return;

  const postId = String(req.params.postId || '').trim();
  if (!isValidObjectId(postId)) {
    res.status(400).json({ error: 'Valid post id is required.' });
    return;
  }

  const targetType = String(req.body?.targetType || 'post').trim().toLowerCase();
  const answerId = String(req.body?.answerId || '').trim();
  const post = await CommunityRoomPostModel.findById(postId);
  if (!post) {
    res.status(404).json({ error: 'Discussion post not found.' });
    return;
  }

  if (targetType === 'answer') {
    const answer = post.answers.id(answerId);
    if (!answer) {
      res.status(404).json({ error: 'Answer not found.' });
      return;
    }
    const voted = answer.upvotedByUserIds.some((item) => String(item) === String(req.user._id));
    if (voted) {
      answer.upvotedByUserIds = answer.upvotedByUserIds.filter((item) => String(item) !== String(req.user._id));
      answer.upvotes = Math.max(0, Number(answer.upvotes || 0) - 1);
    } else {
      answer.upvotedByUserIds.push(req.user._id);
      answer.upvotes = Number(answer.upvotes || 0) + 1;
    }
    await post.save();
    res.json({ ok: true, targetType: 'answer', upvotes: Number(answer.upvotes || 0) });
    return;
  }

  const voted = post.upvotedByUserIds.some((item) => String(item) === String(req.user._id));
  if (voted) {
    post.upvotedByUserIds = post.upvotedByUserIds.filter((item) => String(item) !== String(req.user._id));
    post.upvotes = Math.max(0, Number(post.upvotes || 0) - 1);
  } else {
    post.upvotedByUserIds.push(req.user._id);
    post.upvotes = Number(post.upvotes || 0) + 1;
  }
  await post.save();
  res.json({ ok: true, targetType: 'post', upvotes: Number(post.upvotes || 0) });
});

app.get('/api/community/achievements', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;

  const me = await UserModel.findById(req.user._id).lean();
  if (!me) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const attempts = await AttemptModel.find({ userId: req.user._id }).sort({ attemptedAt: -1 }).limit(300).lean();
  const physicsAttempts = attempts.filter((item) => String(item.subject || '').toLowerCase() === 'physics');
  const physicsAverage = physicsAttempts.length
    ? physicsAttempts.reduce((sum, item) => sum + Number(item.score || 0), 0) / physicsAttempts.length
    : 0;

  const weeklyBoard = await (async () => {
    const { start } = getPeriodBounds('weekly');
    const rows = await AttemptModel.find({ attemptedAt: { $gte: start } }).lean();
    const scoreMap = new Map();
    for (const row of rows) {
      const key = String(row.userId);
      const bucket = scoreMap.get(key) || { scoreSum: 0, tests: 0 };
      bucket.scoreSum += Number(row.score || 0);
      bucket.tests += 1;
      scoreMap.set(key, bucket);
    }
    return Array.from(scoreMap.entries())
      .map(([userId, bucket]) => ({ userId, score: bucket.tests ? bucket.scoreSum / bucket.tests : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  })();
  const top10Ids = new Set(weeklyBoard.map((item) => String(item.userId)));

  const streak = longestRecentStreak(attempts.map((item) => item.attemptedAt));
  const solved = Number(me.progress?.questionsSolved || 0);
  const avg = Number(me.progress?.averageScore || 0);

  const myAnswers = await CommunityRoomPostModel.aggregate([
    { $unwind: '$answers' },
    { $match: { 'answers.authorUserId': req.user._id } },
    { $group: { _id: null, totalUpvotes: { $sum: '$answers.upvotes' }, answersCount: { $sum: 1 } } },
  ]);
  const answerStats = myAnswers[0] || { totalUpvotes: 0, answersCount: 0 };

  const badges = [
    { id: 'practice-master', label: 'Practice Master', icon: '📘', earned: solved >= 1000, progress: solved, target: 1000 },
    { id: 'accuracy-king', label: 'Accuracy King', icon: '🎯', earned: avg >= 90, progress: Number(avg.toFixed(1)), target: 90 },
    { id: 'physics-expert', label: 'Physics Expert', icon: '🧠', earned: physicsAttempts.length >= 5 && physicsAverage >= 85, progress: Number(physicsAverage.toFixed(1)), target: 85 },
    { id: 'study-streak-7', label: '7-Day Study Streak', icon: '🔥', earned: streak >= 7, progress: streak, target: 7 },
    { id: 'leaderboard-top10', label: 'Top 10 Leaderboard', icon: '🏆', earned: top10Ids.has(String(req.user._id)), progress: top10Ids.has(String(req.user._id)) ? 10 : 0, target: 10 },
    { id: 'doubt-contributor', label: 'Contributor Badge', icon: '🏅', earned: Number(answerStats.totalUpvotes || 0) >= 10, progress: Number(answerStats.totalUpvotes || 0), target: 10 },
  ];

  res.json({
    badges,
    stats: {
      solved,
      averageScore: Number(avg.toFixed(1)),
      streak,
      contributorUpvotes: Number(answerStats.totalUpvotes || 0),
      contributorAnswers: Number(answerStats.answersCount || 0),
    },
  });
});

app.get('/api/community/study-partners', authMiddleware, async (req, res) => {
  if (await communityGuard(req, res)) return;
  const subject = String(req.query.subject || '').trim().toLowerCase();
  const me = await UserModel.findById(req.user._id).select(COMMUNITY_USER_SELECT).lean();
  if (!me) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  const profiles = await CommunityProfileModel.find().select(COMMUNITY_PROFILE_SELECT).limit(200).lean();
  const profileMap = new Map(profiles.map((item) => [String(item.userId), item]));
  const meProfile = profileMap.get(String(req.user._id)) || await getOrCreateCommunityProfile(req.user);
  const candidates = await UserModel.find({ _id: { $ne: req.user._id }, role: 'student' })
    .select(COMMUNITY_USER_SELECT)
    .limit(80)
    .lean();

  const matches = candidates
    .map((item) => {
      const profile = profileMap.get(String(item._id));
      if (!profile) return null;
      const weakTopics = Array.isArray(item.progress?.weakTopics) ? item.progress.weakTopics.map((x) => String(x).toLowerCase()) : [];
      const meWeak = Array.isArray(me.progress?.weakTopics) ? me.progress.weakTopics.map((x) => String(x).toLowerCase()) : [];
      const overlap = meWeak.filter((topic) => weakTopics.includes(topic)).length;

      const meNeeds = normalizeSubjectList(meProfile.subjectsNeedHelp || []);
      const candidateNeeds = normalizeSubjectList(profile.subjectsNeedHelp || []);
      const subjectNeedOverlap = meNeeds.filter((topic) => candidateNeeds.includes(topic)).length;

      const netTypeMatch = String(meProfile.targetNetType || '') === String(profile.targetNetType || '') ? 18 : 0;
      const levelDistance = Math.abs(levelRank(normalizePreparationLevel(meProfile.preparationLevel)) - levelRank(normalizePreparationLevel(profile.preparationLevel)));
      const levelScore = levelDistance === 0 ? 12 : levelDistance === 1 ? 6 : 0;
      const timeMatch = normalizeStudyTimePreference(meProfile.studyTimePreference) === normalizeStudyTimePreference(profile.studyTimePreference) ? 12 : 4;

      const score = Number(item.progress?.averageScore || 0);
      const myScore = Number(me.progress?.averageScore || 0);
      const scoreGap = Math.abs(score - myScore);
      const scoreGapScore = Math.max(0, 22 - Math.round(scoreGap / 4));

      const requestedSubjectBonus = subject && (
        meNeeds.some((x) => x.includes(subject)) ||
        candidateNeeds.some((x) => x.includes(subject)) ||
        weakTopics.some((t) => t.includes(subject))
      ) ? 10 : 0;

      const rangeMin = Number(meProfile.testScoreRange?.min ?? 0);
      const rangeMax = Number(meProfile.testScoreRange?.max ?? 200);
      const rangeMatch = score >= rangeMin && score <= rangeMax ? 10 : 0;

      const compatibility = Math.max(0, Math.min(100,
        netTypeMatch
        + levelScore
        + timeMatch
        + scoreGapScore
        + overlap * 4
        + subjectNeedOverlap * 6
        + requestedSubjectBonus
        + rangeMatch
      ));

      return {
        compatibility,
        user: serializeCommunityUser({ user: item, profile }),
        reasons: [
          netTypeMatch ? 'Same NET type' : null,
          levelScore >= 6 ? 'Similar preparation level' : null,
          timeMatch >= 12 ? 'Same study time preference' : null,
          rangeMatch ? 'Within preferred score range' : null,
        ].filter(Boolean),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.compatibility - a.compatibility)
    .slice(0, 12);

  res.json({ studyPartners: matches });
});

app.get('/api/admin/community/reports', authMiddleware, requireAdmin, async (_req, res) => {
  const { page, limit, skip } = readPagination(_req.query, { defaultLimit: 100, maxLimit: 300 });
  const reports = await CommunityReportModel.find()
    .select('connectionId reporterUserId reportedUserId reason status moderation chatSnapshot createdAt')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({
    page,
    limit,
    reports: reports.map((item) => ({
      id: String(item._id),
      connectionId: String(item.connectionId),
      reporterUserId: String(item.reporterUserId),
      reportedUserId: String(item.reportedUserId),
      reason: String(item.reason || ''),
      status: String(item.status || 'open'),
      moderation: item.moderation || {},
      chatSnapshot: Array.isArray(item.chatSnapshot) ? item.chatSnapshot : [],
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
    })),
  });
});

app.post('/api/admin/community/reports/:reportId/review', authMiddleware, requireAdmin, async (req, res) => {
  const reportId = String(req.params.reportId || '').trim();
  const action = String(req.body?.action || '').trim().toLowerCase();
  const violatorUserId = String(req.body?.violatorUserId || '').trim();
  const notes = String(req.body?.notes || '').trim();

  if (!isValidObjectId(reportId)) {
    res.status(400).json({ error: 'Valid report id is required.' });
    return;
  }
  if (!['block', 'dismiss'].includes(action)) {
    res.status(400).json({ error: 'action must be block or dismiss.' });
    return;
  }

  const report = await CommunityReportModel.findById(reportId);
  if (!report) {
    res.status(404).json({ error: 'Report not found.' });
    return;
  }

  if (action === 'dismiss') {
    report.status = 'dismissed';
    report.moderation.reviewedByEmail = req.user.email;
    report.moderation.reviewedAt = new Date();
    if (notes) {
      const reasons = Array.isArray(report.moderation.reasons) ? report.moderation.reasons : [];
      report.moderation.reasons = [...reasons, `Admin note: ${notes}`];
    }
    await report.save();
    res.json({ ok: true, status: report.status });
    return;
  }

  const targetUserId = violatorUserId || String(report.moderation?.violatorUserId || report.reportedUserId || '');
  if (!isValidObjectId(targetUserId)) {
    res.status(400).json({ error: 'A valid violator user id is required to block.' });
    return;
  }

  await CommunityBlockModel.findOneAndUpdate(
    { userId: targetUserId },
    {
      $set: {
        blocked: true,
        reason: notes || 'Blocked by admin after community report review.',
        sourceReportId: reportId,
        blockedAt: new Date(),
      },
    },
    { upsert: true, new: true },
  );

  report.status = 'actioned';
  report.moderation.result = 'harmful';
  report.moderation.violatorUserId = targetUserId;
  report.moderation.autoBlocked = true;
  report.moderation.reviewedByEmail = req.user.email;
  report.moderation.reviewedAt = new Date();
  if (notes) {
    const reasons = Array.isArray(report.moderation.reasons) ? report.moderation.reasons : [];
    report.moderation.reasons = [...reasons, `Admin note: ${notes}`];
  }
  await report.save();

  res.json({ ok: true, status: report.status });
});

app.get('/api/mcqs', async (req, res) => {
  try {
    const { subject, part, chapter, section, difficulty, topic } = req.query;
    const { page, limit, skip } = readPagination(req.query, { defaultLimit: 500, maxLimit: 2000 });
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
      const expr = containsRegex(chapter, 100);
      if (expr) filter.chapter = expr;
    }
    if (section) {
      const expr = containsRegex(section, 100);
      if (expr) filter.section = expr;
    }
    if (topic) {
      const expr = containsRegex(topic, 100);
      if (expr) filter.topic = expr;
    }

    const mcqs = await MCQModel.find(filter)
      .select(MCQ_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      page,
      limit,
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
    const difficulty = String(req.query.difficulty || '').trim();
    const search = String(req.query.search || '').trim();
    const { page, limit, skip } = readPagination(req.query, { defaultLimit: 100, maxLimit: 500 });

    const filter = {};
    if (subject) filter.subject = subject;
    if (difficulty) filter.difficulty = difficulty;
    if (search) {
      const expr = containsRegex(search, 120);
      filter.$or = [{ questionText: expr }, { solutionText: expr }];
    }

    const questions = await PracticeBoardQuestionModel.find(filter)
      .select(PRACTICE_BOARD_SELECT)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    res.json({ page, limit, questions: questions.map((item) => serializePracticeBoardQuestion(item)), total: questions.length });
  } catch {
    res.status(500).json({ error: 'Failed to load practice board questions.' });
  }
});

app.get('/api/practice-board/questions/random', async (req, res) => {
  try {
    const subject = String(req.query.subject || '').trim().toLowerCase();
    const difficulty = String(req.query.difficulty || '').trim();
    const excludeId = String(req.query.excludeId || '').trim();

    const filter = {};
    if (subject) filter.subject = subject;
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
  try {
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
      submittedByClientId = '',
    } = req.body || {};

    const policy = await getContributionPolicy();
    const normalizedSubject = String(subject || '').trim();
    const actorKey = normalizeContributionActorKey({
      submittedByUserId,
      submittedByClientId,
      submittedByEmail,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    if (!normalizedSubject) {
      res.status(400).json({ error: 'Subject is required.' });
      return;
    }

    const restrictionState = await checkSubmissionRestriction(actorKey);
    if (restrictionState.restricted) {
      res.status(403).json({
        error: CONTENT_RESTRICTION_MESSAGE,
        code: 'UPLOAD_RESTRICTED',
        blockedUntil: restrictionState.blockedUntil,
      });
      return;
    }

    const rawAttachments = Array.isArray(attachments) ? attachments : [];
    if (rawAttachments.length > policy.maxFilesPerSubmission) {
      res.status(400).json({ error: `You can upload up to ${policy.maxFilesPerSubmission} files per submission.` });
      return;
    }

    const safeAttachments = rawAttachments.map((file) => ({
      name: String(file?.name || '').trim(),
      mimeType: String(file?.mimeType || '').trim(),
      size: Number(file?.size || 0),
      dataUrl: String(file?.dataUrl || '').trim(),
    }));

    const allowedMimeTypes = new Set(policy.allowedMimeTypes);

    for (const file of safeAttachments) {
      if (!file.name || !file.mimeType || !file.dataUrl || !Number.isFinite(file.size)) {
        res.status(400).json({ error: 'Each attachment must include name, mimeType, size, and file data.' });
        return;
      }
      if (!allowedMimeTypes.has(file.mimeType)) {
        res.status(400).json({ error: `Unsupported attachment type: ${file.mimeType}` });
        return;
      }
      if (file.size > policy.maxFileSizeBytes) {
        res.status(400).json({ error: 'Upload failed: File size exceeds the allowed limit.' });
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

    const todayStart = startOfTodayUtc();
    const todayCount = await QuestionSubmissionModel.countDocuments({
      actorKey,
      createdAt: { $gte: todayStart },
    });

    if (todayCount >= policy.maxSubmissionsPerDay) {
      res.status(429).json({ error: `Daily limit reached. You can submit up to ${policy.maxSubmissionsPerDay} times per day.` });
      return;
    }

    const moderation = moderateQuestionSubmission({
      subject: normalizedSubject,
      questionText: text,
      questionDescription: description,
      questionSource: source,
      submissionReason: reason,
      attachments: safeAttachments.map((file) => ({
        ...file,
        extractedSnippet: getAttachmentSignalSnippet(file),
      })),
    });

    const isRejectedByModeration = moderation.result === 'rejected';
    const autoReviewNote = isRejectedByModeration
      ? `Auto moderation: ${moderation.reasons.join(' ')}`
      : '';

    const created = await QuestionSubmissionModel.create({
      subject: normalizedSubject,
      questionText: text,
      questionDescription: description,
      questionSource: source,
      submissionReason: reason,
      attachments: safeAttachments,
      status: isRejectedByModeration ? 'rejected' : 'pending',
      queuedForBank: false,
      submittedByName: String(submittedByName || '').trim(),
      submittedByEmail: String(submittedByEmail || '').trim(),
      submittedByUserId: String(submittedByUserId || '').trim(),
      submittedByClientId: String(submittedByClientId || '').trim(),
      actorKey,
      moderation: {
        result: moderation.result,
        reasons: moderation.reasons,
        score: moderation.score,
        blockedActor: isRejectedByModeration,
        reviewedAt: isRejectedByModeration ? new Date() : null,
      },
      reviewNotes: autoReviewNote,
      reviewedAt: isRejectedByModeration ? new Date() : null,
      reviewedByEmail: isRejectedByModeration ? 'AI moderation' : '',
    });

    if (isRejectedByModeration) {
      const blockedUntil = await blockSubmissionActor(actorKey, moderation.reasons.join(' '), policy.blockDurationMinutes);
      res.status(403).json({
        error: CONTENT_RESTRICTION_MESSAGE,
        code: 'CONTENT_RESTRICTED',
        blockedUntil,
        submission: serializeQuestionSubmission(created),
      });
      return;
    }

    res.status(201).json({ submission: serializeQuestionSubmission(created) });
  } catch {
    res.status(500).json({ error: 'Failed to submit question.' });
  }
});

app.get('/api/question-submissions/access', async (req, res) => {
  try {
    const submittedByEmail = String(req.query.submittedByEmail || '').trim();
    const submittedByUserId = String(req.query.submittedByUserId || '').trim();
    const submittedByClientId = String(req.query.submittedByClientId || '').trim();
    const actorKey = normalizeContributionActorKey({
      submittedByEmail,
      submittedByUserId,
      submittedByClientId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const policy = await getContributionPolicy();
    const restrictionState = await checkSubmissionRestriction(actorKey);
    const todayCount = await QuestionSubmissionModel.countDocuments({
      actorKey,
      createdAt: { $gte: startOfTodayUtc() },
    });

    res.json({
      blocked: restrictionState.restricted,
      blockedUntil: restrictionState.blockedUntil || null,
      message: restrictionState.restricted ? CONTENT_RESTRICTION_MESSAGE : '',
      limits: {
        maxSubmissionsPerDay: policy.maxSubmissionsPerDay,
        maxFilesPerSubmission: policy.maxFilesPerSubmission,
        maxFileSizeBytes: policy.maxFileSizeBytes,
        remainingSubmissionsToday: Math.max(0, policy.maxSubmissionsPerDay - todayCount),
        allowedMimeTypes: policy.allowedMimeTypes,
      },
    });
  } catch {
    res.status(500).json({ error: 'Failed to load contribution access policy.' });
  }
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
  const latestActivationRequest = await PremiumSubscriptionRequestModel
    .findOne({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .lean();
  const requestPlan = resolveSubscriptionPlan(latestActivationRequest?.planId || '');

  res.json({
    subscription: {
      ...subscription,
      isActive: isSubscriptionActive(subscription),
      planName: plan?.name || '',
      dailyAiLimit: plan?.dailyAiLimit || 0,
    },
    activationRequest: latestActivationRequest
      ? serializePremiumSubscriptionRequest(latestActivationRequest, requestPlan?.name || '')
      : null,
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
  res.status(410).json({
    error: 'Direct activation is disabled. Submit payment proof and activate using admin-issued token.',
  });
});

app.post('/api/subscriptions/request-activation', authMiddleware, async (req, res) => {
  const planId = String(req.body?.planId || '').trim();
  const paymentMethod = normalizePaymentMethod(req.body?.paymentMethod);
  const paymentTransactionId = sanitizePlainText(req.body?.paymentTransactionId || '', 120);
  const contactMethod = normalizeContactMethod(req.body?.contactMethod || 'whatsapp');
  const contactValueRaw = String(req.body?.contactValue || '').trim();
  const plan = resolveSubscriptionPlan(planId);

  let paymentProof;
  try {
    paymentProof = normalizePaymentProof(req.body?.paymentProof);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Payment proof is invalid.' });
    return;
  }

  const defaultContactValue = normalizeMobileNumber(req.user.phone || '');
  const contactValue = normalizeMobileNumber(contactValueRaw || defaultContactValue);

  if (!plan) {
    res.status(400).json({ error: 'Invalid plan selected.' });
    return;
  }

  if (!['easypaisa', 'jazzcash', 'bank_transfer'].includes(paymentMethod)) {
    res.status(400).json({ error: 'Payment method must be one of: easypaisa, jazzcash, bank_transfer.' });
    return;
  }

  if (!paymentTransactionId || paymentTransactionId.length < 4) {
    res.status(400).json({ error: 'Payment transaction ID is required for verification.' });
    return;
  }

  if (contactMethod !== 'whatsapp') {
    res.status(400).json({ error: 'Contact method must be whatsapp.' });
    return;
  }

  if (!isValidWhatsAppNumber(contactValue)) {
    res.status(400).json({ error: 'Enter a valid WhatsApp number in international format (e.g. +923XXXXXXXXX).' });
    return;
  }

  const existingPending = await PremiumSubscriptionRequestModel.findOne({
    userId: req.user._id,
    status: 'pending',
  }).lean();
  if (existingPending) {
    res.status(409).json({ error: 'A premium activation request is already pending for your account.' });
    return;
  }

  const request = await PremiumSubscriptionRequestModel.create({
    userId: req.user._id,
    email: req.user.email,
    mobileNumber: normalizeMobileNumber(req.user.phone || ''),
    planId: plan.id,
    paymentMethod,
    paymentTransactionId,
    paymentProof,
    contactMethod,
    contactValue,
    status: 'pending',
  });

  res.status(201).json({
    ok: true,
    request: serializePremiumSubscriptionRequest(request, plan.name),
    message: 'Premium activation request submitted. Wait for admin verification and token.',
  });
});

app.post('/api/subscriptions/activate-with-token', authMiddleware, async (req, res) => {
  const tokenCode = String(req.body?.tokenCode || '').trim().toUpperCase();
  if (!tokenCode) {
    res.status(400).json({ error: 'Activation token is required.' });
    return;
  }

  const activationToken = await PremiumActivationTokenModel.findOne({ code: tokenCode });
  if (!activationToken) {
    res.status(400).json({ error: 'Invalid activation token.' });
    return;
  }

  if (String(activationToken.userId) !== String(req.user._id)) {
    res.status(403).json({ error: 'This token does not belong to your account.' });
    return;
  }

  if (activationToken.status !== 'active') {
    res.status(400).json({ error: 'This activation token is no longer active.' });
    return;
  }

  if (new Date(activationToken.expiresAt).getTime() <= Date.now()) {
    activationToken.status = 'expired';
    await activationToken.save();
    res.status(400).json({ error: 'Activation token expired. Request a new one from admin.' });
    return;
  }

  const request = await PremiumSubscriptionRequestModel.findById(activationToken.premiumRequestId);
  if (!request) {
    res.status(400).json({ error: 'Premium activation request not found for this token.' });
    return;
  }

  if (request.status !== 'approved') {
    res.status(400).json({ error: 'This premium activation request is not approved yet.' });
    return;
  }

  const plan = resolveSubscriptionPlan(request.planId);
  if (!plan) {
    res.status(400).json({ error: 'Approved plan is invalid. Contact admin.' });
    return;
  }

  const startedAt = new Date();
  const expiresAt = new Date(startedAt.getTime() + plan.expiresInDays * 24 * 60 * 60 * 1000);
  const nextSubscription = {
    status: 'active',
    planId: plan.id,
    billingCycle: plan.billingCycle,
    startedAt,
    expiresAt,
    paymentReference: request.paymentTransactionId,
    lastActivatedAt: startedAt,
  };

  await UserModel.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        subscription: nextSubscription,
      },
    },
    { runValidators: true },
  );

  req.user.subscription = nextSubscription;

  activationToken.status = 'used';
  activationToken.usedAt = new Date();
  await activationToken.save();

  request.status = 'completed';
  await request.save();

  const updatedUser = await UserModel.findById(req.user._id).lean();
  const normalizedSubscription = normalizeSubscription(updatedUser || req.user);

  res.status(201).json({
    ok: true,
    subscription: {
      ...normalizedSubscription,
      isActive: isSubscriptionActive(normalizedSubscription),
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
  const [usersCount, mcqCount, attemptsCount, latestAttempts, pendingSignupRequests, pendingPremiumRequests, pendingQuestionSubmissions, recoveryRequestCount, recoverySentCount, recoveryPartialCount, recoveryFailedCount, recoveryNotFoundCount] = await Promise.all([
    UserModel.countDocuments(),
    MCQModel.countDocuments(),
    AttemptModel.countDocuments(),
    AttemptModel.find().sort({ attemptedAt: -1 }).limit(12).lean(),
    SignupRequestModel.countDocuments({ status: 'pending' }),
    PremiumSubscriptionRequestModel.countDocuments({ status: 'pending' }),
    QuestionSubmissionModel.countDocuments({ status: 'pending' }),
    PasswordRecoveryRequestModel.countDocuments(),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'sent' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'partial' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'failed' }),
    PasswordRecoveryRequestModel.countDocuments({ recoveryStatus: 'not_found' }),
  ]);

  const averageScore = latestAttempts.length
    ? Math.round(latestAttempts.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / latestAttempts.length)
    : 0;

  res.json({
    usersCount,
    mcqCount,
    attemptsCount,
    pendingSignupRequests,
    pendingPremiumRequests,
    pendingQuestionSubmissions,
    recoveryRequestCount,
    recoveryStatusCounts: {
      sent: recoverySentCount,
      partial: recoveryPartialCount,
      failed: recoveryFailedCount,
      not_found: recoveryNotFoundCount,
    },
    averageScore,
    recentAttempts: latestAttempts.map((item) => serializeAttempt(item)),
  });
});

app.get('/api/admin/password-recovery-requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const q = String(req.query?.q || '').trim();

  const filter = status === 'all' ? {} : { recoveryStatus: status };
  if (q) {
    filter.$or = [
      { identifier: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
      { mobileNumber: { $regex: q, $options: 'i' } },
      { userName: { $regex: q, $options: 'i' } },
    ];
  }

  const requests = await PasswordRecoveryRequestModel.find(filter).sort({ createdAt: -1 }).limit(400).lean();
  res.json({ requests: requests.map((item) => serializePasswordRecoveryRequest(item)) });
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

app.get('/api/admin/question-submissions/policy', authMiddleware, requireAdmin, async (_req, res) => {
  try {
    const policy = await getContributionPolicy();
    res.json({ policy: serializeContributionPolicy(policy) });
  } catch {
    res.status(500).json({ error: 'Failed to load submission policy.' });
  }
});

app.put('/api/admin/question-submissions/policy', authMiddleware, requireAdmin, async (req, res) => {
  try {
    const maxSubmissionsPerDay = clamp(Number(req.body?.maxSubmissionsPerDay) || DEFAULT_CONTRIBUTION_POLICY.maxSubmissionsPerDay, 1, 100);
    const maxFilesPerSubmission = clamp(Number(req.body?.maxFilesPerSubmission) || DEFAULT_CONTRIBUTION_POLICY.maxFilesPerSubmission, 1, 10);
    const maxFileSizeBytes = clamp(Number(req.body?.maxFileSizeBytes) || DEFAULT_CONTRIBUTION_POLICY.maxFileSizeBytes, 64 * 1024, 10 * 1024 * 1024);
    const blockDurationMinutes = clamp(Number(req.body?.blockDurationMinutes) || DEFAULT_CONTRIBUTION_POLICY.blockDurationMinutes, 5, 10080);

    const next = await ContributionPolicyModel.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          maxSubmissionsPerDay,
          maxFilesPerSubmission,
          maxFileSizeBytes,
          blockDurationMinutes,
          allowedMimeTypes: DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
          updatedByEmail: req.user.email,
        },
        $setOnInsert: {
          key: 'default',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    res.json({ policy: serializeContributionPolicy(next) });
  } catch {
    res.status(500).json({ error: 'Failed to update submission policy.' });
  }
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
  if (nextStatus === 'approved' && submission.moderation?.result === 'rejected') {
    submission.moderation.result = 'manual-override';
    submission.moderation.reviewedAt = new Date();
  }
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

app.get('/api/admin/subscriptions/requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const q = String(req.query?.q || '').trim();
  const filter = status === 'all' ? {} : { status };

  if (q) {
    filter.$or = [
      { email: { $regex: q, $options: 'i' } },
      { contactValue: { $regex: q, $options: 'i' } },
      { paymentTransactionId: { $regex: q, $options: 'i' } },
      { planId: { $regex: q, $options: 'i' } },
    ];
  }

  const requests = await PremiumSubscriptionRequestModel.find(filter).sort({ createdAt: -1 }).limit(400).lean();
  res.json({
    requests: requests.map((item) => {
      const plan = resolveSubscriptionPlan(item.planId);
      return serializePremiumSubscriptionRequest(item, plan?.name || '');
    }),
  });
});

app.post('/api/admin/subscriptions/requests/:requestId/approve', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending premium requests can be approved.' });
    return;
  }

  const user = await UserModel.findById(request.userId).lean();
  if (!user) {
    request.status = 'rejected';
    request.notes = 'User account not found.';
    request.reviewedByAdminId = req.user._id;
    request.reviewedByEmail = req.user.email;
    request.reviewedAt = new Date();
    await request.save();
    res.status(409).json({ error: 'User account missing. Request auto-rejected.' });
    return;
  }

  let code = '';
  for (let i = 0; i < 5; i += 1) {
    const candidate = generatePremiumTokenCode();
    const exists = await PremiumActivationTokenModel.findOne({ code: candidate }).lean();
    if (!exists) {
      code = candidate;
      break;
    }
  }

  if (!code) {
    res.status(500).json({ error: 'Could not generate unique premium activation token. Try again.' });
    return;
  }

  const expiresAt = new Date(Date.now() + PREMIUM_TOKEN_TTL_HOURS * 60 * 60 * 1000);
  const tokenDoc = await PremiumActivationTokenModel.create({
    code,
    userId: request.userId,
    email: request.email,
    premiumRequestId: request._id,
    status: 'active',
    expiresAt,
  });

  request.status = 'approved';
  request.activationTokenId = tokenDoc._id;
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

app.post('/api/admin/subscriptions/requests/:requestId/reject', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending premium requests can be rejected.' });
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

app.get('/api/admin/signup-requests', authMiddleware, requireAdmin, async (req, res) => {
  const status = String(req.query?.status || 'all').toLowerCase();
  const filter = status === 'all' ? {} : { status };

  const requests = await SignupRequestModel.find(filter).sort({ createdAt: -1 }).limit(300).lean();
  res.json({
    requests: requests.map((item) => serializeSignupRequest(item)),
  });
});

app.get('/api/admin/signup-requests/:requestId/payment-proof', authMiddleware, requireAdmin, async (req, res) => {
  const request = await SignupRequestModel.findById(req.params.requestId).lean();
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  const streamed = streamPaymentProofFromDataUrl(
    res,
    request.paymentProof,
    `signup-proof-${String(request._id)}.dat`,
  );
  if (!streamed) {
    res.status(404).json({ error: 'Payment proof is not available for this signup request.' });
  }
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

app.get('/api/admin/subscriptions/requests/:requestId/payment-proof', authMiddleware, requireAdmin, async (req, res) => {
  const request = await PremiumSubscriptionRequestModel.findById(req.params.requestId).lean();
  if (!request) {
    res.status(404).json({ error: 'Premium activation request not found.' });
    return;
  }

  const streamed = streamPaymentProofFromDataUrl(
    res,
    request.paymentProof,
    `premium-proof-${String(request._id)}.dat`,
  );
  if (!streamed) {
    res.status(404).json({ error: 'Payment proof is not available for this premium request.' });
  }
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
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 200, maxLimit: 500 });

  const filter = {};
  if (subject) filter.subject = subject;
  if (part) filter.part = part;
  if (chapter) {
    const expr = containsRegex(chapter, 100);
    if (expr) filter.chapter = expr;
  }
  if (section) {
    const expr = containsRegex(section, 100);
    if (expr) filter.section = expr;
  }
  if (topic) {
    const expr = containsRegex(topic, 100);
    if (expr) filter.topic = expr;
  }
  if (difficulty) filter.difficulty = difficulty;

  const mcqs = await MCQModel.find(filter)
    .select(MCQ_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({
    page,
    limit,
    mcqs: mcqs.map((item) => serializeMcq(item)),
  });
});

app.post('/api/admin/mcqs/bulk-delete', authMiddleware, requireAdmin, async (req, res) => {
  const mode = String(req.body?.mode || '').trim().toLowerCase();
  const subject = String(req.body?.subject || '').trim().toLowerCase();
  const chapter = String(req.body?.chapter || '').trim();
  const sectionOrTopic = String(req.body?.sectionOrTopic || '').trim();

  if (!['all', 'subject', 'chapter', 'section-topic'].includes(mode)) {
    res.status(400).json({ error: 'mode must be one of: all, subject, chapter, section-topic.' });
    return;
  }

  const filter = {};

  if (mode === 'subject') {
    if (!subject) {
      res.status(400).json({ error: 'subject is required for subject deletion.' });
      return;
    }
    filter.subject = subject;
  }

  if (mode === 'chapter') {
    if (!subject || !chapter) {
      res.status(400).json({ error: 'subject and chapter are required for chapter deletion.' });
      return;
    }
    filter.subject = subject;
    filter.chapter = { $regex: `^${chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
  }

  if (mode === 'section-topic') {
    if (!subject || !sectionOrTopic) {
      res.status(400).json({ error: 'subject and section/topic are required for section/topic deletion.' });
      return;
    }
    filter.subject = subject;
    if (chapter) {
      filter.chapter = { $regex: `^${chapter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    }

    const escapedSectionOrTopic = sectionOrTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { section: { $regex: `^${escapedSectionOrTopic}$`, $options: 'i' } },
      { topic: { $regex: `^${escapedSectionOrTopic}$`, $options: 'i' } },
    ];
  }

  const result = await MCQModel.deleteMany(filter);

  res.json({
    ok: true,
    mode,
    removed: result.deletedCount || 0,
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

app.post('/api/admin/mcqs/parse', authMiddleware, requireAdmin, async (req, res) => {
  const sourceType = String(req.body?.sourceType || 'text').trim().toLowerCase();

  try {
    let sourceText = '';
    if (sourceType === 'file') {
      sourceText = await extractTextFromUpload(req.body?.file || {});
    } else {
      sourceText = String(req.body?.rawText || '').trim();
    }

    const heuristicResult = parseBulkMcqsFromText(sourceText);
    let finalResult = heuristicResult;

    if (openai) {
      const aiResult = await parseBulkMcqsWithAi(sourceText);
      const heuristicScore = (heuristicResult.parsed?.length || 0) - (heuristicResult.errors?.length || 0);
      const aiScore = (aiResult.parsed?.length || 0) - (aiResult.errors?.length || 0);

      if (aiResult.parsed.length > 0 && aiScore >= heuristicScore) {
        finalResult = aiResult;
      }
    }

    res.json(finalResult);
  } catch (error) {
    res.status(400).json({
      parsed: [],
      errors: [error instanceof Error ? error.message : 'Could not parse content.'],
    });
  }
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

  const normalizedSubject = String(subject || '').toLowerCase().trim();
  const normalizedPart = String(part || '').toLowerCase().trim();
  const normalizedChapter = String(chapter || '').trim();
  const normalizedSection = String(section || '').trim();
  const normalizedTopic = String(topic || '').trim();
  const isFlatTopicSubject = normalizedSubject === 'quantitative-mathematics' || normalizedSubject === 'design-aptitude';

  if (!question || !Array.isArray(options) || options.length < 2 || !answer || !normalizedSubject) {
    res.status(400).json({ error: 'question, options (min 2), answer, and subject are required.' });
    return;
  }

  if (!isFlatTopicSubject && (!normalizedPart || !normalizedChapter || !normalizedSection)) {
    res.status(400).json({ error: 'part, chapter, and section are required for this subject.' });
    return;
  }

  if (isFlatTopicSubject && !normalizedTopic && !normalizedSection) {
    res.status(400).json({ error: 'topic is required for this subject.' });
    return;
  }

  const cleanOptions = options
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (cleanOptions.length < 2) {
    res.status(400).json({ error: 'At least two non-empty options are required.' });
    return;
  }

  const resolvedTopic = isFlatTopicSubject
    ? (normalizedTopic || normalizedSection)
    : String(normalizedTopic || `${normalizedChapter} - ${normalizedSection}`).trim();
  const resolvedSection = isFlatTopicSubject ? (normalizedSection || resolvedTopic) : normalizedSection;

  const mcq = await MCQModel.create({
    question: String(question),
    questionImageUrl: String(questionImageUrl || '').trim(),
    options: cleanOptions,
    answer: String(answer),
    subject: normalizedSubject,
    part: isFlatTopicSubject ? '' : normalizedPart,
    chapter: isFlatTopicSubject ? '' : normalizedChapter,
    section: resolvedSection,
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
    if (payload.options.length < 2) {
      res.status(400).json({ error: 'At least two non-empty options are required.' });
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
  const difficulty = String(req.query.difficulty || '').trim();
  const search = String(req.query.search || '').trim();
  const { page, limit, skip } = readPagination(req.query, { defaultLimit: 200, maxLimit: 500 });

  const filter = {};
  if (subject) filter.subject = subject;
  if (difficulty) filter.difficulty = difficulty;
  if (search) {
    const expr = containsRegex(search, 120);
    filter.$or = [
      { questionText: expr },
      { solutionText: expr },
    ];
  }

  const questions = await PracticeBoardQuestionModel.find(filter)
    .select(PRACTICE_BOARD_SELECT)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
  res.json({ page, limit, questions: questions.map((item) => serializePracticeBoardQuestion(item)) });
});

app.post('/api/admin/practice-board/questions', authMiddleware, requireAdmin, async (req, res) => {
  const {
    subject,
    difficulty = 'Medium',
    questionText = '',
    questionFile = null,
    solutionText = '',
    solutionFile = null,
  } = req.body || {};

  const normalizedSubject = String(subject || '').trim().toLowerCase();
  if (!normalizedSubject) {
    res.status(400).json({ error: 'subject is required.' });
    return;
  }

  let normalizedQuestionFile;
  let normalizedSolutionFile;
  try {
    normalizedQuestionFile = normalizePracticeBoardFile(questionFile);
    normalizedSolutionFile = normalizePracticeBoardFile(solutionFile);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid uploaded file.' });
    return;
  }

  if (!String(questionText || '').trim() && !normalizedQuestionFile) {
    res.status(400).json({ error: 'Provide question text or a question file.' });
    return;
  }

  if (!String(solutionText || '').trim() && !normalizedSolutionFile) {
    res.status(400).json({ error: 'Provide solution text or a solution file.' });
    return;
  }

  const created = await PracticeBoardQuestionModel.create({
    subject: normalizedSubject,
    difficulty: String(difficulty || 'Medium').trim() || 'Medium',
    questionText: String(questionText || '').trim(),
    questionFile: normalizedQuestionFile,
    solutionText: String(solutionText || '').trim(),
    solutionFile: normalizedSolutionFile,
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
    difficulty: Object.prototype.hasOwnProperty.call(req.body, 'difficulty')
      ? String(req.body.difficulty ?? '').trim()
      : String(existing.difficulty || '').trim(),
    questionText: Object.prototype.hasOwnProperty.call(req.body, 'questionText')
      ? String(req.body.questionText ?? '').trim()
      : String(existing.questionText || '').trim(),
    solutionText: Object.prototype.hasOwnProperty.call(req.body, 'solutionText')
      ? String(req.body.solutionText ?? '').trim()
      : String(existing.solutionText || '').trim(),
  };

  let nextQuestionFile = existing.questionFile || null;
  let nextSolutionFile = existing.solutionFile || null;
  try {
    if (Object.prototype.hasOwnProperty.call(req.body, 'questionFile')) {
      nextQuestionFile = normalizePracticeBoardFile(req.body.questionFile);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'solutionFile')) {
      nextSolutionFile = normalizePracticeBoardFile(req.body.solutionFile);
    }
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid uploaded file.' });
    return;
  }

  next.questionFile = nextQuestionFile;
  next.solutionFile = nextSolutionFile;

  if (!next.subject) {
    res.status(400).json({ error: 'subject is required.' });
    return;
  }

  if (!next.questionText && !next.questionFile) {
    res.status(400).json({ error: 'Provide question text or a question file.' });
    return;
  }

  if (!next.solutionText && !next.solutionFile) {
    res.status(400).json({ error: 'Provide solution text or a solution file.' });
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

app.use((err, req, res, next) => {
  console.error('Unhandled API error:', {
    path: req.path,
    method: req.method,
    message: err?.message,
  });

  if (res.headersSent) {
    next(err);
    return;
  }

  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    res.status(413).json({ error: 'Uploaded file is too large. Upload a JPG, PNG, or PDF up to 5MB.' });
    return;
  }

  res.status(500).json({ error: 'Internal server error.' });
});

function validateCriticalConfiguration() {
  const problems = [];
  const warnings = [];

  if (IS_PRODUCTION && (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me' || JWT_SECRET.length < 32)) {
    problems.push('JWT_SECRET must be set to a strong random value with at least 32 characters in production.');
  }

  if (IS_PRODUCTION && (!JWT_REFRESH_SECRET || JWT_REFRESH_SECRET.length < 32)) {
    problems.push('JWT_REFRESH_SECRET must be set to a strong random value with at least 32 characters in production.');
  }

  if (IS_PRODUCTION && CORS_ALLOWED_ORIGINS.length === 0) {
    warnings.push('CORS_ALLOWED_ORIGINS is not configured in production. Falling back to allow-all CORS; configure this env var as soon as possible.');
  }

  if (problems.length) {
    throw new Error(`Security configuration validation failed: ${problems.join(' ')}`);
  }

  warnings.forEach((message) => console.warn(`Security warning: ${message}`));
}

async function bootstrap() {
  validateCriticalConfiguration();
  await connectMongo(MONGODB_URI);
  await bootstrapAdminAccounts();

  const server = app.listen(PORT, () => {
    console.log(`NET360 API running on http://localhost:${PORT}`);
  });

  server.headersTimeout = clamp(REQUEST_TIMEOUT_MS + 5_000, 10_000, 180_000);
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.keepAliveTimeout = 15_000;
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
