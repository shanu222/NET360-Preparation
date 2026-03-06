import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.API_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@net360.local').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || 'admin123456');
const ADMIN_COOKIE_NAME = 'net360_admin_token';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'data', 'db.json');
const MCQ_DATA_DIRS = [
  path.join(__dirname, '..', 'MCQS'),
  path.join(__dirname, '..', 'public', 'MCQS'),
];

const SUBJECTS = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

const publicSseClients = new Set();
const adminSseClients = new Set();

const subjectAliases = {
  mathematics: 'mathematics',
  math: 'mathematics',
  maths: 'mathematics',
  physics: 'physics',
  english: 'english',
  biology: 'biology',
  chemistry: 'chemistry',
};

function splitCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function classifyDifficulty(index, total) {
  if (total <= 2) return index === 0 ? 'Easy' : index === 1 ? 'Medium' : 'Hard';
  const ratio = (index + 1) / total;
  if (ratio <= 0.34) return 'Easy';
  if (ratio <= 0.67) return 'Medium';
  return 'Hard';
}

function parseDifficulty(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'easy') return 'Easy';
  if (normalized === 'medium' || normalized === 'moderate') return 'Medium';
  if (normalized === 'hard' || normalized === 'difficult') return 'Hard';
  return null;
}

function normalizeSubject(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return subjectAliases[normalized] || null;
}

function parseCsvRows(csvText) {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = splitCsvLine(lines[i]);
    const row = {};
    headers.forEach((key, idx) => {
      row[key] = (values[idx] ?? '').trim();
    });
    rows.push(row);
  }

  return rows;
}

async function listCsvFilesRecursively(rootDir) {
  try {
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) return [];
  } catch {
    return [];
  }

  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

async function findMcqCsvFiles() {
  const filesByName = new Map();

  for (const dirPath of MCQ_DATA_DIRS) {
    const files = await listCsvFilesRecursively(dirPath);
    for (const filePath of files) {
      const fileNameKey = path.basename(filePath).toLowerCase();
      if (!filesByName.has(fileNameKey)) {
        filesByName.set(fileNameKey, filePath);
      }
    }
  }

  return Array.from(filesByName.values());
}

function inferSubjectFromFilePath(filePath) {
  const tokens = filePath
    .split(/[\\/._\-\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const token of tokens) {
    const candidate = subjectAliases[token];
    if (candidate) return candidate;
  }

  return null;
}

function inferDifficultyFromFilePath(filePath) {
  const tokens = filePath
    .split(/[\\/._\-\s]+/)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean);

  for (const token of tokens) {
    const parsed = parseDifficulty(token);
    if (parsed) return parsed;
  }

  return null;
}

async function loadMcqsFromCsv() {
  const csvFiles = await findMcqCsvFiles();

  if (!csvFiles.length) {
    return [];
  }

  const grouped = {
    mathematics: [],
    physics: [],
    english: [],
    biology: [],
    chemistry: [],
  };

  const explicitDifficulties = new Map();

  for (const filePath of csvFiles) {
    const csvText = await fs.readFile(filePath, 'utf-8');
    const rows = parseCsvRows(csvText);
    const fallbackSubject = inferSubjectFromFilePath(filePath);
    const fallbackDifficulty = inferDifficultyFromFilePath(filePath);

    rows.forEach((row, rowIndex) => {
      const subject = normalizeSubject(row.subject) || fallbackSubject;
      if (!subject) return;
      const normalizedRow = {
        ...row,
        __sourceFile: filePath,
        __rowIndex: rowIndex,
      };

      grouped[subject].push(normalizedRow);

      const explicitDifficulty = parseDifficulty(row.difficulty) || fallbackDifficulty;
      if (explicitDifficulty) {
        const stableId = `${subject}-${row.id || rowIndex + 1}-${filePath}-${rowIndex}`;
        explicitDifficulties.set(stableId, explicitDifficulty);
      }
    });
  }

  const mcqs = [];

  SUBJECTS.forEach((subject) => {
    const subjectRows = grouped[subject];
    subjectRows.forEach((row, index) => {
      const options = [row.optionA, row.optionB, row.optionC, row.optionD]
        .map((value) => (value || '').trim())
        .filter(Boolean);
      if (!row.question || !options.length) return;

      const stableId = `${subject}-${row.id || row.__rowIndex + 1}-${row.__sourceFile}-${row.__rowIndex}`;
      const explicitDifficulty = explicitDifficulties.get(stableId);

      mcqs.push({
        id: `mcq-${crypto.randomUUID()}`,
        subject,
        topic: row.topic || 'General',
        question: row.question,
        options,
        answer: row.answer || '',
        tip: row.tip || '',
        difficulty: explicitDifficulty || classifyDifficulty(index, subjectRows.length),
        source: 'seed',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
  });

  return mcqs;
}

function ensureDbShape(data) {
  return {
    users: Array.isArray(data?.users) ? data.users : [],
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    attempts: Array.isArray(data?.attempts) ? data.attempts : [],
    mcqs: Array.isArray(data?.mcqs) ? data.mcqs : [],
    signupRequests: Array.isArray(data?.signupRequests) ? data.signupRequests : [],
    signupTokens: Array.isArray(data?.signupTokens) ? data.signupTokens : [],
    deviceSessions: Array.isArray(data?.deviceSessions) ? data.deviceSessions : [],
    admins: Array.isArray(data?.admins) ? data.admins : [],
  };
}

async function readDb() {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    return ensureDbShape(JSON.parse(raw));
  } catch {
    return ensureDbShape({});
  }
}

async function writeDb(data) {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  await fs.writeFile(DB_PATH, JSON.stringify(ensureDbShape(data), null, 2));
}

function createUserToken(user, deviceSession) {
  return jwt.sign(
    { userId: user.id, email: user.email, deviceSessionId: deviceSession.id, role: 'user' },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function createAdminToken(admin) {
  return jwt.sign(
    { adminId: admin.id, email: admin.email, role: 'admin' },
    JWT_SECRET,
    { expiresIn: '8h' },
  );
}

function userOrDefaultPreferences(preferences) {
  return {
    emailNotifications: preferences?.emailNotifications ?? true,
    dailyReminders: preferences?.dailyReminders ?? true,
    performanceReports: preferences?.performanceReports ?? true,
  };
}

function publicUser(user) {
  return {
    id: user.id,
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
    blocked: Boolean(user.blocked),
    createdAt: user.createdAt || null,
    lastSeenAt: user.lastSeenAt || null,
    preferences: userOrDefaultPreferences(user.preferences),
  };
}

function publicMcq(mcq) {
  return {
    id: mcq.id,
    subject: mcq.subject,
    topic: mcq.topic,
    question: mcq.question,
    options: Array.isArray(mcq.options) ? mcq.options : [],
    answer: mcq.answer || '',
    tip: mcq.tip || '',
    difficulty: mcq.difficulty,
    updatedAt: mcq.updatedAt || mcq.createdAt || null,
  };
}

function generateSignupTokenCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'NET-';
  for (let i = 0; i < 10; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)];
    if (i === 4) code += '-';
  }
  return code;
}

function sanitizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || '');
  const pairs = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  const map = {};

  pairs.forEach((pair) => {
    const index = pair.indexOf('=');
    if (index < 0) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (!key) return;
    map[key] = decodeURIComponent(value);
  });

  return map;
}

function getAuthTokenFromRequest(req, options = {}) {
  const allowCookie = options.allowCookie !== false;
  const allowBearer = options.allowBearer !== false;
  const authHeader = req.headers.authorization || '';
  if (allowBearer && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  if (allowCookie) {
    const cookies = parseCookies(req);
    if (cookies[ADMIN_COOKIE_NAME]) {
      return cookies[ADMIN_COOKIE_NAME];
    }
  }

  return null;
}

function createAdminCookie(token) {
  const attrs = [
    `${ADMIN_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${8 * 60 * 60}`,
    IS_PRODUCTION ? 'SameSite=None' : 'SameSite=Lax',
  ];

  if (IS_PRODUCTION) {
    attrs.push('Secure');
  }

  return attrs.join('; ');
}

function clearAdminCookie() {
  const attrs = [
    `${ADMIN_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    IS_PRODUCTION ? 'SameSite=None' : 'SameSite=Lax',
  ];

  if (IS_PRODUCTION) {
    attrs.push('Secure');
  }

  return attrs.join('; ');
}

function normalizeMcqPayload(payload) {
  const subject = normalizeSubject(payload?.subject);
  const difficulty = parseDifficulty(payload?.difficulty);
  const question = String(payload?.question || '').trim();
  const answer = String(payload?.answer || '').trim();
  const topic = String(payload?.topic || 'General').trim() || 'General';
  const tip = String(payload?.tip || '').trim();
  const options = Array.isArray(payload?.options)
    ? payload.options.map((option) => String(option || '').trim()).filter(Boolean)
    : [];

  if (!subject) {
    return { error: 'Valid subject is required.' };
  }
  if (!difficulty) {
    return { error: 'Valid difficulty is required (Easy, Medium, Hard).' };
  }
  if (!question) {
    return { error: 'Question is required.' };
  }
  if (options.length < 2) {
    return { error: 'At least 2 options are required.' };
  }
  if (!answer) {
    return { error: 'Answer is required.' };
  }

  return {
    subject,
    difficulty,
    topic,
    question,
    options,
    answer,
    tip,
  };
}

async function ensureInitialized() {
  const db = await readDb();
  let changed = false;

  if (!db.admins.length) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.admins.push({
      id: 'admin-default',
      email: ADMIN_EMAIL,
      passwordHash,
      name: 'NET360 Admin',
      createdAt: new Date().toISOString(),
    });
    changed = true;
  }

  if (!db.mcqs.length) {
    db.mcqs = await loadMcqsFromCsv();
    changed = true;
  }

  if (changed) {
    await writeDb(db);
  }
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
    if (payload.role !== 'user') {
      res.status(401).json({ error: 'Invalid user token.' });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.id === payload.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    if (user.blocked) {
      res.status(403).json({ error: 'Your account is blocked.' });
      return;
    }

    const deviceSession = db.deviceSessions.find(
      (item) => item.id === payload.deviceSessionId && item.userId === user.id && item.status === 'active',
    );

    if (!deviceSession) {
      res.status(401).json({ error: 'Session is no longer active. Please login again.' });
      return;
    }

    deviceSession.lastSeenAt = new Date().toISOString();
    user.lastSeenAt = deviceSession.lastSeenAt;

    req.user = user;
    req.db = db;
    req.deviceSession = deviceSession;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

async function adminAuthMiddleware(req, res, next) {
  const token = getAuthTokenFromRequest(req, { allowCookie: true, allowBearer: false });

  if (!token) {
    res.status(401).json({ error: 'Missing admin token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      res.status(401).json({ error: 'Invalid admin token.' });
      return;
    }

    const db = await readDb();
    const admin = db.admins.find((item) => item.id === payload.adminId);

    if (!admin) {
      res.status(401).json({ error: 'Admin not found.' });
      return;
    }

    req.admin = admin;
    req.db = db;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
}

function getActiveSessionForUser(db, userId) {
  return db.deviceSessions.find((item) => item.userId === userId && item.status === 'active');
}

function applyMcqFilters(mcqs, query) {
  let results = [...mcqs];

  if (query?.subject) {
    const subject = normalizeSubject(query.subject);
    if (subject) {
      results = results.filter((item) => item.subject === subject);
    }
  }

  if (query?.difficulty) {
    const difficulty = parseDifficulty(query.difficulty);
    if (difficulty) {
      results = results.filter((item) => item.difficulty === difficulty);
    }
  }

  if (query?.topic) {
    const keyword = String(query.topic).toLowerCase();
    results = results.filter((item) => String(item.topic || '').toLowerCase().includes(keyword));
  }

  return results;
}

function initSse(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function sendSseEvent(client, eventName, payload) {
  try {
    client.write(`event: ${eventName}\n`);
    client.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    // Ignore write failures for disconnected clients.
  }
}

function broadcastPublicEvent(eventName, payload = {}) {
  for (const client of publicSseClients) {
    sendSseEvent(client, eventName, payload);
  }
}

function broadcastAdminEvent(eventName, payload = {}) {
  for (const client of adminSseClients) {
    sendSseEvent(client, eventName, payload);
  }
}

app.get('/api/events', (req, res) => {
  initSse(res);
  publicSseClients.add(res);
  sendSseEvent(res, 'connected', { stream: 'public', connectedAt: new Date().toISOString() });

  const keepAlive = setInterval(() => {
    sendSseEvent(res, 'keepalive', { ts: Date.now() });
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    publicSseClients.delete(res);
    res.end();
  });
});

app.get('/api/admin/events', (req, res) => {
  const token = getAuthTokenFromRequest(req, { allowCookie: true, allowBearer: false });
  if (!token) {
    res.status(401).json({ error: 'Missing admin token.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') {
      res.status(401).json({ error: 'Invalid admin token.' });
      return;
    }

    initSse(res);
    adminSseClients.add(res);
    sendSseEvent(res, 'connected', { stream: 'admin', connectedAt: new Date().toISOString() });

    const keepAlive = setInterval(() => {
      sendSseEvent(res, 'keepalive', { ts: Date.now() });
    }, 25000);

    req.on('close', () => {
      clearInterval(keepAlive);
      adminSseClients.delete(res);
      res.end();
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'net360-api' });
});

app.post('/api/auth/signup-request', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const paymentReference = String(req.body?.paymentReference || '').trim();

    if (!email || !paymentReference) {
      res.status(400).json({ error: 'Email and payment reference are required.' });
      return;
    }

    const db = await readDb();

    const existingUser = db.users.find((item) => item.email === email);
    if (existingUser) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const existingPending = db.signupRequests.find(
      (item) => item.email === email && item.status === 'pending',
    );

    if (existingPending) {
      res.status(409).json({ error: 'A pending signup request already exists for this email.' });
      return;
    }

    const request = {
      id: `req-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      email,
      firstName,
      lastName,
      paymentReference,
      status: 'pending',
      createdAt: new Date().toISOString(),
      reviewedAt: null,
      reviewedBy: null,
      notes: '',
      signupTokenId: null,
    };

    db.signupRequests.unshift(request);
    await writeDb(db);
    broadcastAdminEvent('signup.updated', { scope: 'admin' });

    res.status(201).json({
      request: {
        id: request.id,
        status: request.status,
        createdAt: request.createdAt,
      },
      message: 'Signup request submitted. Wait for admin approval to receive your token code.',
    });
  } catch {
    res.status(500).json({ error: 'Could not submit signup request.' });
  }
});

app.post('/api/auth/register-with-token', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const tokenCode = String(req.body?.tokenCode || '').trim().toUpperCase();
    const deviceId = String(req.body?.deviceId || '').trim();
    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();

    if (!email || !password || !tokenCode || !deviceId) {
      res.status(400).json({ error: 'Email, password, token code, and deviceId are required.' });
      return;
    }

    const db = await readDb();

    const existing = db.users.find((item) => item.email === email);
    if (existing) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const signupToken = db.signupTokens.find((item) => item.code === tokenCode);
    if (!signupToken) {
      res.status(400).json({ error: 'Invalid token code.' });
      return;
    }

    if (signupToken.status !== 'active') {
      res.status(400).json({ error: 'This token is no longer active.' });
      return;
    }

    if (signupToken.email && signupToken.email !== email) {
      res.status(400).json({ error: 'This token was issued for a different email.' });
      return;
    }

    if (signupToken.expiresAt && new Date(signupToken.expiresAt).getTime() < Date.now()) {
      signupToken.status = 'expired';
      await writeDb(db);
      res.status(400).json({ error: 'Token has expired. Contact admin for a new token.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: `user-${Date.now()}`,
      email,
      passwordHash,
      firstName: firstName || signupToken.firstName || '',
      lastName: lastName || signupToken.lastName || '',
      phone: '',
      city: '',
      targetProgram: '',
      testSeries: '',
      sscPercentage: '',
      hsscPercentage: '',
      testDate: '',
      blocked: false,
      preferences: userOrDefaultPreferences(null),
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
    };

    const deviceSession = {
      id: `devsess-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      userId: user.id,
      deviceId,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      endedAt: null,
      endReason: null,
    };

    signupToken.status = 'used';
    signupToken.usedAt = new Date().toISOString();
    signupToken.usedByUserId = user.id;

    const request = db.signupRequests.find((item) => item.id === signupToken.signupRequestId);
    if (request) {
      request.status = 'completed';
      request.notes = request.notes || 'Signup completed successfully';
    }

    db.users.push(user);
    db.deviceSessions.push(deviceSession);

    await writeDb(db);
    broadcastAdminEvent('users.updated', { scope: 'admin' });
    broadcastAdminEvent('signup.updated', { scope: 'admin' });

    const authToken = createUserToken(user, deviceSession);
    res.status(201).json({ token: authToken, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  res.status(410).json({
    error: 'Direct registration is disabled. Submit a signup request and use an approved token code.',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    const deviceId = String(req.body?.deviceId || '').trim();
    const forceLogoutOtherDevice = Boolean(req.body?.forceLogoutOtherDevice);

    if (!email || !password || !deviceId) {
      res.status(400).json({ error: 'Email, password, and deviceId are required.' });
      return;
    }

    const db = await readDb();
    const user = db.users.find((item) => item.email === email);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    if (user.blocked) {
      res.status(403).json({ error: 'Your account is blocked by admin.' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash || '');
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const activeSession = getActiveSessionForUser(db, user.id);

    if (activeSession && activeSession.deviceId !== deviceId && !forceLogoutOtherDevice) {
      res.status(409).json({
        error: 'You are already logged in on another device. Logout there first or confirm switch.',
        code: 'active_session_exists',
        activeSession: {
          id: activeSession.id,
          deviceId: activeSession.deviceId,
          lastSeenAt: activeSession.lastSeenAt,
        },
      });
      return;
    }

    if (activeSession && activeSession.deviceId !== deviceId && forceLogoutOtherDevice) {
      activeSession.status = 'terminated';
      activeSession.endedAt = new Date().toISOString();
      activeSession.endReason = 'switched-device';
    }

    let session = getActiveSessionForUser(db, user.id);

    if (!session || session.deviceId !== deviceId) {
      session = {
        id: `devsess-${Date.now()}-${Math.round(Math.random() * 1000)}`,
        userId: user.id,
        deviceId,
        status: 'active',
        createdAt: new Date().toISOString(),
        lastSeenAt: new Date().toISOString(),
        endedAt: null,
        endReason: null,
      };
      db.deviceSessions.push(session);
    } else {
      session.lastSeenAt = new Date().toISOString();
    }

    user.lastSeenAt = session.lastSeenAt;

    await writeDb(db);
    broadcastAdminEvent('users.updated', { scope: 'admin' });

    const token = createUserToken(user, session);
    res.json({ token, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', authMiddleware, async (req, res) => {
  req.deviceSession.status = 'terminated';
  req.deviceSession.endedAt = new Date().toISOString();
  req.deviceSession.endReason = 'user-logout';
  await writeDb(req.db);
  broadcastAdminEvent('users.updated', { scope: 'admin' });
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  await writeDb(req.db);
  broadcastAdminEvent('users.updated', { scope: 'admin' });
  res.json({ user: publicUser(req.user) });
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'city', 'targetProgram', 'testSeries', 'sscPercentage', 'hsscPercentage', 'testDate'];

  allowed.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      req.user[field] = String(req.body[field] ?? '');
    }
  });

  await writeDb(req.db);
  broadcastAdminEvent('users.updated', { scope: 'admin' });
  res.json({ user: publicUser(req.user) });
});

app.put('/api/auth/preferences', authMiddleware, async (req, res) => {
  const current = userOrDefaultPreferences(req.user.preferences);
  req.user.preferences = {
    emailNotifications: typeof req.body?.emailNotifications === 'boolean' ? req.body.emailNotifications : current.emailNotifications,
    dailyReminders: typeof req.body?.dailyReminders === 'boolean' ? req.body.dailyReminders : current.dailyReminders,
    performanceReports: typeof req.body?.performanceReports === 'boolean' ? req.body.performanceReports : current.performanceReports,
  };

  await writeDb(req.db);
  res.json({ user: publicUser(req.user) });
});

app.get('/api/mcqs', async (req, res) => {
  try {
    const db = await readDb();
    const filtered = applyMcqFilters(db.mcqs, req.query);
    const max = Math.max(1, Math.min(Number(req.query?.limit) || 10000, 10000));
    res.json({ mcqs: filtered.slice(0, max).map(publicMcq), total: filtered.length });
  } catch {
    res.status(500).json({ error: 'Failed to load MCQs.' });
  }
});

app.get('/api/mcqs/meta', async (req, res) => {
  try {
    const db = await readDb();

    const summary = {
      total: db.mcqs.length,
      bySubject: {
        mathematics: { total: 0, Easy: 0, Medium: 0, Hard: 0 },
        physics: { total: 0, Easy: 0, Medium: 0, Hard: 0 },
        english: { total: 0, Easy: 0, Medium: 0, Hard: 0 },
        biology: { total: 0, Easy: 0, Medium: 0, Hard: 0 },
        chemistry: { total: 0, Easy: 0, Medium: 0, Hard: 0 },
      },
    };

    db.mcqs.forEach((mcq) => {
      if (!summary.bySubject[mcq.subject]) return;
      const bucket = summary.bySubject[mcq.subject];
      bucket.total += 1;
      if (bucket[mcq.difficulty] !== undefined) {
        bucket[mcq.difficulty] += 1;
      }
    });

    res.json(summary);
  } catch {
    res.status(500).json({ error: 'Failed to load MCQ metadata.' });
  }
});

app.post('/api/tests/start', authMiddleware, async (req, res) => {
  const {
    subject,
    difficulty,
    topic,
    mode,
    questionCount = 20,
  } = req.body || {};

  if (!subject || !difficulty || !mode) {
    res.status(400).json({ error: 'subject, difficulty, and mode are required.' });
    return;
  }

  let pool = req.db.mcqs.filter(
    (item) =>
      item.subject === String(subject).toLowerCase() &&
      String(item.difficulty).toLowerCase() === String(difficulty).toLowerCase(),
  );

  if (topic && topic !== 'All Topics') {
    const byTopic = pool.filter((item) => String(item.topic).toLowerCase().includes(String(topic).toLowerCase()));
    if (byTopic.length) {
      pool = byTopic;
    }
  }

  if (!pool.length) {
    res.status(404).json({ error: 'No questions available for this configuration.' });
    return;
  }

  const selected = pool.slice(0, Math.min(Number(questionCount) || 20, pool.length));
  const session = {
    id: `session-${Date.now()}`,
    userId: req.user.id,
    subject: String(subject).toLowerCase(),
    difficulty,
    topic: topic || 'All Topics',
    mode,
    questionIds: selected.map((item) => item.id),
    questionCount: selected.length,
    startedAt: new Date().toISOString(),
    finishedAt: null,
  };

  req.db.sessions.push(session);
  await writeDb(req.db);
  broadcastAdminEvent('tests.updated', { scope: 'admin' });

  res.status(201).json({ session });
});

app.post('/api/tests/:sessionId/finish', authMiddleware, async (req, res) => {
  const { sessionId } = req.params;
  const { score = 0, durationMinutes = 0 } = req.body || {};

  const session = req.db.sessions.find((item) => item.id === sessionId && item.userId === req.user.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found.' });
    return;
  }

  if (session.finishedAt) {
    const existing = req.db.attempts.find((item) => item.sessionId === session.id && item.userId === req.user.id);
    res.json({ attempt: existing });
    return;
  }

  session.finishedAt = new Date().toISOString();

  const attempt = {
    id: `attempt-${Date.now()}`,
    sessionId: session.id,
    userId: req.user.id,
    subject: session.subject,
    topic: session.topic,
    difficulty: session.difficulty,
    mode: session.mode,
    score: Math.max(0, Math.min(100, Number(score) || 0)),
    totalQuestions: session.questionCount,
    durationMinutes: Math.max(1, Number(durationMinutes) || Math.round(session.questionCount * 1.2)),
    attemptedAt: session.finishedAt,
  };

  req.db.attempts.unshift(attempt);
  await writeDb(req.db);
  broadcastAdminEvent('tests.updated', { scope: 'admin' });

  res.status(201).json({ attempt });
});

app.get('/api/tests/attempts', authMiddleware, async (req, res) => {
  const attempts = req.db.attempts.filter((item) => item.userId === req.user.id);
  await writeDb(req.db);
  res.json({ attempts });
});

app.get('/api/reports/export', authMiddleware, async (req, res) => {
  const format = String(req.query.format || 'json').toLowerCase();
  const attempts = req.db.attempts.filter((item) => item.userId === req.user.id);

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

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="net360-report.csv"');
    res.send([header, ...lines].join('\n'));
    return;
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="net360-report.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), attempts }, null, 2));
});

app.post('/api/admin/auth/login', async (req, res) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = await readDb();
    const admin = db.admins.find((item) => item.email === email);

    if (!admin) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    const valid = await bcrypt.compare(password, admin.passwordHash || '');
    if (!valid) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    const token = createAdminToken(admin);
    res.setHeader('Set-Cookie', createAdminCookie(token));
    res.json({
      token,
      admin: { id: admin.id, email: admin.email, name: admin.name || 'Admin' },
    });
  } catch {
    res.status(500).json({ error: 'Admin login failed.' });
  }
});

app.post('/api/admin/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearAdminCookie());
  res.json({ ok: true });
});

app.get('/api/admin/auth/me', adminAuthMiddleware, async (req, res) => {
  res.json({ admin: { id: req.admin.id, email: req.admin.email, name: req.admin.name || 'Admin' } });
});

app.get('/api/admin/overview', adminAuthMiddleware, async (req, res) => {
  const activeUserIds = new Set(
    req.db.deviceSessions.filter((item) => item.status === 'active').map((item) => item.userId),
  );

  const usersTotal = req.db.users.length;
  const blockedUsers = req.db.users.filter((item) => item.blocked).length;
  const activeUsers = req.db.users.filter((item) => activeUserIds.has(item.id) && !item.blocked).length;
  const pendingSignupRequests = req.db.signupRequests.filter((item) => item.status === 'pending').length;

  res.json({
    usersTotal,
    activeUsers,
    blockedUsers,
    pendingSignupRequests,
    mcqTotal: req.db.mcqs.length,
  });
});

app.get('/api/admin/users', adminAuthMiddleware, async (req, res) => {
  const activeSessionsByUser = new Map();
  req.db.deviceSessions
    .filter((item) => item.status === 'active')
    .forEach((item) => {
      activeSessionsByUser.set(item.userId, item);
    });

  const users = req.db.users.map((user) => {
    const activeSession = activeSessionsByUser.get(user.id) || null;
    return {
      ...publicUser(user),
      activeSession,
      attemptsCount: req.db.attempts.filter((attempt) => attempt.userId === user.id).length,
    };
  });

  res.json({ users });
});

app.patch('/api/admin/users/:userId', adminAuthMiddleware, async (req, res) => {
  const user = req.db.users.find((item) => item.id === req.params.userId);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  if (typeof req.body?.blocked === 'boolean') {
    user.blocked = req.body.blocked;
  }

  if (user.blocked) {
    req.db.deviceSessions
      .filter((item) => item.userId === user.id && item.status === 'active')
      .forEach((item) => {
        item.status = 'terminated';
        item.endedAt = new Date().toISOString();
        item.endReason = 'blocked-by-admin';
      });
  }

  await writeDb(req.db);
  broadcastAdminEvent('users.updated', { scope: 'admin' });
  res.json({ user: publicUser(user) });
});

app.delete('/api/admin/users/:userId', adminAuthMiddleware, async (req, res) => {
  const userId = req.params.userId;
  const exists = req.db.users.some((item) => item.id === userId);
  if (!exists) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }

  req.db.users = req.db.users.filter((item) => item.id !== userId);
  req.db.attempts = req.db.attempts.filter((item) => item.userId !== userId);
  req.db.sessions = req.db.sessions.filter((item) => item.userId !== userId);
  req.db.deviceSessions = req.db.deviceSessions.filter((item) => item.userId !== userId);

  await writeDb(req.db);
  broadcastAdminEvent('users.updated', { scope: 'admin' });
  res.json({ ok: true });
});

app.get('/api/admin/mcqs', adminAuthMiddleware, async (req, res) => {
  const filtered = applyMcqFilters(req.db.mcqs, req.query);
  res.json({ mcqs: filtered.map(publicMcq), total: filtered.length });
});

app.post('/api/admin/mcqs', adminAuthMiddleware, async (req, res) => {
  const normalized = normalizeMcqPayload(req.body);
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  const mcq = {
    id: `mcq-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    ...normalized,
    source: 'admin',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  req.db.mcqs.unshift(mcq);
  await writeDb(req.db);
  broadcastPublicEvent('mcqs.updated', { scope: 'public' });
  broadcastAdminEvent('mcqs.updated', { scope: 'admin' });
  res.status(201).json({ mcq: publicMcq(mcq) });
});

app.put('/api/admin/mcqs/:mcqId', adminAuthMiddleware, async (req, res) => {
  const mcq = req.db.mcqs.find((item) => item.id === req.params.mcqId);
  if (!mcq) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  const normalized = normalizeMcqPayload(req.body);
  if (normalized.error) {
    res.status(400).json({ error: normalized.error });
    return;
  }

  Object.assign(mcq, normalized, { updatedAt: new Date().toISOString() });

  await writeDb(req.db);
  broadcastPublicEvent('mcqs.updated', { scope: 'public' });
  broadcastAdminEvent('mcqs.updated', { scope: 'admin' });
  res.json({ mcq: publicMcq(mcq) });
});

app.delete('/api/admin/mcqs/:mcqId', adminAuthMiddleware, async (req, res) => {
  const before = req.db.mcqs.length;
  req.db.mcqs = req.db.mcqs.filter((item) => item.id !== req.params.mcqId);

  if (before === req.db.mcqs.length) {
    res.status(404).json({ error: 'MCQ not found.' });
    return;
  }

  await writeDb(req.db);
  broadcastPublicEvent('mcqs.updated', { scope: 'public' });
  broadcastAdminEvent('mcqs.updated', { scope: 'admin' });
  res.json({ ok: true });
});

app.get('/api/admin/signup-requests', adminAuthMiddleware, async (req, res) => {
  const status = String(req.query?.status || '').trim().toLowerCase();
  const filtered = req.db.signupRequests.filter((item) => {
    if (!status || status === 'all') return true;
    return String(item.status).toLowerCase() === status;
  });

  res.json({ requests: filtered });
});

app.post('/api/admin/signup-requests/:requestId/approve', adminAuthMiddleware, async (req, res) => {
  const request = req.db.signupRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be approved.' });
    return;
  }

  const expiresInDays = Math.max(1, Math.min(Number(req.body?.expiresInDays) || 7, 30));
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  const code = generateSignupTokenCode();
  const signupToken = {
    id: `suptok-${Date.now()}-${Math.round(Math.random() * 1000)}`,
    code,
    email: request.email,
    firstName: request.firstName,
    lastName: request.lastName,
    signupRequestId: request.id,
    status: 'active',
    createdAt: new Date().toISOString(),
    expiresAt,
    usedAt: null,
    usedByUserId: null,
  };

  request.status = 'approved';
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = req.admin.email;
  request.signupTokenId = signupToken.id;
  request.notes = String(req.body?.notes || '').trim();

  req.db.signupTokens.unshift(signupToken);

  await writeDb(req.db);
  broadcastAdminEvent('signup.updated', { scope: 'admin' });

  res.status(201).json({
    token: {
      id: signupToken.id,
      code: signupToken.code,
      expiresAt: signupToken.expiresAt,
    },
    request,
  });
});

app.post('/api/admin/signup-requests/:requestId/reject', adminAuthMiddleware, async (req, res) => {
  const request = req.db.signupRequests.find((item) => item.id === req.params.requestId);
  if (!request) {
    res.status(404).json({ error: 'Signup request not found.' });
    return;
  }

  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Only pending requests can be rejected.' });
    return;
  }

  request.status = 'rejected';
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = req.admin.email;
  request.notes = String(req.body?.notes || '').trim();

  await writeDb(req.db);
  broadcastAdminEvent('signup.updated', { scope: 'admin' });
  res.json({ request });
});

app.listen(PORT, async () => {
  await ensureInitialized();
  console.log(`NET360 API running on http://localhost:${PORT}`);
  console.log(`Default admin login: ${ADMIN_EMAIL}`);
});
