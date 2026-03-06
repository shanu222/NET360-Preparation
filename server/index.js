import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.API_PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DB_PATH = path.join(__dirname, 'data', 'db.json');
const MCQ_CSV_PATH = path.join(__dirname, '..', 'public', 'MCQS', 'NET_10000_MCQs_Dataset.csv');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));

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

async function loadMcqs() {
  const csvText = await fs.readFile(MCQ_CSV_PATH, 'utf-8');
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

  const grouped = {
    mathematics: [],
    physics: [],
    english: [],
    biology: [],
    chemistry: [],
  };

  rows.forEach((row) => {
    const subjectRaw = (row.subject || '').toLowerCase();
    const subject = subjectAliases[subjectRaw];
    if (!subject) return;
    grouped[subject].push(row);
  });

  const orderedSubjects = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
  const mcqs = [];

  orderedSubjects.forEach((subject) => {
    const subjectRows = grouped[subject];
    subjectRows.forEach((row, index) => {
      const options = [row.optionA, row.optionB, row.optionC, row.optionD]
        .map((value) => (value || '').trim())
        .filter(Boolean);
      if (!row.question || !options.length) return;

      mcqs.push({
        id: `${subject}-${row.id || index + 1}-${index}`,
        subject,
        topic: row.topic || 'General',
        question: row.question,
        options,
        answer: row.answer || '',
        tip: row.tip || '',
        difficulty: classifyDifficulty(index, subjectRows.length),
      });
    });
  });

  return mcqs;
}

async function readDb() {
  const raw = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(raw);
}

async function writeDb(data) {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

function createToken(user) {
  return jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
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
    preferences: user.preferences || {
      emailNotifications: true,
      dailyReminders: true,
      performanceReports: true,
    },
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
    const db = await readDb();
    const user = db.users.find((item) => item.id === payload.userId);

    if (!user) {
      res.status(401).json({ error: 'User not found.' });
      return;
    }

    req.user = user;
    req.db = db;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

let cachedMcqs = [];

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'net360-api' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName = '', lastName = '' } = req.body || {};
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const db = await readDb();
    const existing = db.users.find((user) => user.email.toLowerCase() === String(email).toLowerCase());
    if (existing) {
      res.status(409).json({ error: 'Email is already registered.' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = {
      id: `user-${Date.now()}`,
      email: String(email).trim().toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      phone: '',
      city: '',
      targetProgram: '',
      testSeries: '',
      sscPercentage: '',
      hsscPercentage: '',
      testDate: '',
      preferences: {
        emailNotifications: true,
        dailyReminders: true,
        performanceReports: true,
      },
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    await writeDb(db);

    const token = createToken(user);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
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

    const db = await readDb();
    const user = db.users.find((item) => item.email === String(email).toLowerCase());
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const isValid = await bcrypt.compare(String(password), user.passwordHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid credentials.' });
      return;
    }

    const token = createToken(user);
    res.json({ token, user: publicUser(user) });
  } catch {
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

app.put('/api/auth/profile', authMiddleware, async (req, res) => {
  const allowed = ['firstName', 'lastName', 'phone', 'city', 'targetProgram', 'testSeries', 'sscPercentage', 'hsscPercentage', 'testDate'];
  const user = req.user;

  allowed.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(req.body, field)) {
      user[field] = String(req.body[field] ?? '');
    }
  });

  await writeDb(req.db);
  res.json({ user: publicUser(user) });
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

function userOrDefaultPreferences(preferences) {
  return {
    emailNotifications: preferences?.emailNotifications ?? true,
    dailyReminders: preferences?.dailyReminders ?? true,
    performanceReports: preferences?.performanceReports ?? true,
  };
}

app.get('/api/mcqs', async (req, res) => {
  try {
    if (!cachedMcqs.length) {
      cachedMcqs = await loadMcqs();
    }

    const { subject, difficulty, topic, limit = '10000' } = req.query;
    let results = [...cachedMcqs];

    if (subject) {
      results = results.filter((item) => item.subject === String(subject).toLowerCase());
    }
    if (difficulty) {
      const d = String(difficulty).toLowerCase();
      results = results.filter((item) => item.difficulty.toLowerCase() === d);
    }
    if (topic) {
      const keyword = String(topic).toLowerCase();
      results = results.filter((item) => item.topic.toLowerCase().includes(keyword));
    }

    const max = Math.max(1, Math.min(Number(limit) || 10000, 10000));
    res.json({ mcqs: results.slice(0, max), total: results.length });
  } catch {
    res.status(500).json({ error: 'Failed to load MCQs.' });
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

  if (!cachedMcqs.length) {
    cachedMcqs = await loadMcqs();
  }

  let pool = cachedMcqs.filter(
    (item) =>
      item.subject === String(subject).toLowerCase() &&
      item.difficulty.toLowerCase() === String(difficulty).toLowerCase(),
  );

  if (topic && topic !== 'All Topics') {
    const byTopic = pool.filter((item) => item.topic.toLowerCase().includes(String(topic).toLowerCase()));
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

  res.status(201).json({ attempt });
});

app.get('/api/tests/attempts', authMiddleware, async (req, res) => {
  const attempts = req.db.attempts.filter((item) => item.userId === req.user.id);
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

app.listen(PORT, () => {
  console.log(`NET360 API running on http://localhost:${PORT}`);
});
