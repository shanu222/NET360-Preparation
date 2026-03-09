import { type Difficulty, type MCQ, type SubjectKey } from './mcq';

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
  part?: string;
  chapter?: string;
  section?: string;
  topic: string;
  question: string;
  questionImageUrl?: string;
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

interface LocalPracticeBoardQuestion {
  id: string;
  subject: string;
  difficulty: string;
  questionText: string;
  questionFile: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  solutionText: string;
  solutionFile: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  source: string;
  createdAt: string;
  updatedAt: string;
}

interface LocalSubmissionAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface LocalQuestionSubmission {
  id: string;
  subject: string;
  questionText: string;
  questionDescription: string;
  questionSource: string;
  submissionReason: string;
  attachments: LocalSubmissionAttachment[];
  status: 'pending' | 'approved' | 'rejected';
  queuedForBank: boolean;
  submittedByName: string;
  submittedByEmail: string;
  submittedByUserId: string;
  submittedByClientId: string;
  actorKey: string;
  moderation: {
    result: 'approved' | 'rejected' | 'manual-override';
    reasons: string[];
    score: number;
    blockedActor: boolean;
    reviewedAt: string | null;
  };
  reviewNotes: string;
  reviewedByEmail: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LocalContributionPolicy {
  maxSubmissionsPerDay: number;
  maxFilesPerSubmission: number;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
  blockDurationMinutes: number;
  updatedByEmail: string;
}

interface LocalSubmissionRestriction {
  actorKey: string;
  blockedUntil: string | null;
  reason: string;
  lastViolationAt: string | null;
}

interface LocalCommunityProfile {
  userId: string;
  username: string;
  profilePictureUrl: string;
  shareProfilePicture: boolean;
  favoriteSubjects: string[];
}

interface LocalCommunityConnectionRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
}

interface LocalCommunityConnection {
  id: string;
  participantA: string;
  participantB: string;
  participantKey: string;
  createdAt: string;
}

interface LocalCommunityMessage {
  id: string;
  connectionId: string;
  senderUserId: string;
  text: string;
  readByUserIds: string[];
  createdAt: string;
}

interface LocalCommunityReport {
  id: string;
  connectionId: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: string;
  status: 'open' | 'actioned' | 'dismissed';
  moderation: {
    result: 'safe' | 'harmful';
    reasons: string[];
    score: number;
    violatorUserId: string;
    autoBlocked: boolean;
    reviewedAt: string | null;
    reviewedByEmail: string;
  };
  chatSnapshot: Array<{ senderUserId: string; text: string; createdAt: string }>;
  createdAt: string;
}

interface LocalCommunityBlock {
  userId: string;
  blocked: boolean;
  reason: string;
  blockedAt: string;
  sourceReportId: string;
}

interface LocalDb {
  users: LocalUser[];
  sessions: LocalSession[];
  attempts: LocalAttempt[];
  aiUsage: LocalAIUsage[];
  practiceBoardQuestions: LocalPracticeBoardQuestion[];
  questionSubmissions: LocalQuestionSubmission[];
  contributionPolicy: LocalContributionPolicy;
  submissionRestrictions: LocalSubmissionRestriction[];
  communityProfiles: LocalCommunityProfile[];
  communityConnectionRequests: LocalCommunityConnectionRequest[];
  communityConnections: LocalCommunityConnection[];
  communityMessages: LocalCommunityMessage[];
  communityReports: LocalCommunityReport[];
  communityBlocks: LocalCommunityBlock[];
}

const DB_STORAGE_KEY = 'net360-local-db-v7';
let cachedMcqs: MCQ[] = [];

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
const DEFAULT_CONTRIBUTION_POLICY: LocalContributionPolicy = {
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
  updatedByEmail: '',
};

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
    return {
      users: [],
      sessions: [],
      attempts: [],
      aiUsage: [],
      practiceBoardQuestions: [],
      questionSubmissions: [],
      contributionPolicy: { ...DEFAULT_CONTRIBUTION_POLICY },
      submissionRestrictions: [],
      communityProfiles: [],
      communityConnectionRequests: [],
      communityConnections: [],
      communityMessages: [],
      communityReports: [],
      communityBlocks: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalDb>;
    return {
      users: parsed.users || [],
      sessions: parsed.sessions || [],
      attempts: parsed.attempts || [],
      aiUsage: parsed.aiUsage || [],
      practiceBoardQuestions: parsed.practiceBoardQuestions || [],
      questionSubmissions: parsed.questionSubmissions || [],
      contributionPolicy: {
        ...DEFAULT_CONTRIBUTION_POLICY,
        ...(parsed.contributionPolicy || {}),
      },
      submissionRestrictions: parsed.submissionRestrictions || [],
      communityProfiles: parsed.communityProfiles || [],
      communityConnectionRequests: parsed.communityConnectionRequests || [],
      communityConnections: parsed.communityConnections || [],
      communityMessages: parsed.communityMessages || [],
      communityReports: parsed.communityReports || [],
      communityBlocks: parsed.communityBlocks || [],
    };
  } catch {
    return {
      users: [],
      sessions: [],
      attempts: [],
      aiUsage: [],
      practiceBoardQuestions: [],
      questionSubmissions: [],
      contributionPolicy: { ...DEFAULT_CONTRIBUTION_POLICY },
      submissionRestrictions: [],
      communityProfiles: [],
      communityConnectionRequests: [],
      communityConnections: [],
      communityMessages: [],
      communityReports: [],
      communityBlocks: [],
    };
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
  // Legacy bundled dataset has been removed. Keep structures ready for future imports/admin additions.
  cachedMcqs = [];
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

function normalizeBulkText(raw: string): string {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/[ \f\v]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/([^\n])\s+((?:q(?:uestion)?\s*)?\d{1,3}\s*[\).:-])/gi, '$1\n$2')
    .trim();
}

function splitInlineOptions(line: string): string[] {
  const compact = String(line || '').replace(/\s+/g, ' ').trim();
  if (!compact) return [];

  const markerRegex = /(?:^|\s)(?:option\s*)?([A-H]|\d{1,2})(?:[\).:-])?\s+/gi;
  const markers: Array<{ label: string; markerPos: number; valueStart: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(compact))) {
    const label = String(match[1] || '').toUpperCase();
    const markerPos = compact.indexOf(label, match.index);
    markers.push({ label, markerPos, valueStart: markerRegex.lastIndex });
  }

  const startsWithMarker = /^(?:option\s*)?(?:[A-H]|\d{1,2})(?:[\).:-])?\s+\S/i.test(compact);
  if (!markers.length || (!startsWithMarker && markers.length < 2)) {
    return [];
  }

  const extracted: string[] = [];
  for (let i = 0; i < markers.length; i += 1) {
    const current = markers[i];
    const next = markers[i + 1];
    const end = next ? next.markerPos : compact.length;
    const segment = compact.slice(current.valueStart, end).trim();
    if (segment) extracted.push(segment);
  }

  return extracted;
}

function parseBulkMcqsFromText(raw: string): { parsed: Array<{ question: string; questionImageUrl: string; options: string[]; answer: string; tip: string; difficulty: 'Easy' | 'Medium' | 'Hard' }>; errors: string[] } {
  const text = normalizeBulkText(raw);
  if (!text) return { parsed: [], errors: ['No content found to parse.'] };

  const starts: Array<{ index: number; number: string }> = [];
  const startRegex = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})\s*[\).:-]\s+/gim;
  let match: RegExpExecArray | null;
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

  const errors: string[] = [];
  const parsed: Array<{ question: string; questionImageUrl: string; options: string[]; answer: string; tip: string; difficulty: 'Easy' | 'Medium' | 'Hard' }> = [];

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
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    const questionLines: string[] = [];
    const options: string[] = [];
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

function normalizeContributionActorKey(params: {
  submittedByUserId?: string;
  submittedByClientId?: string;
  submittedByEmail?: string;
}) {
  const userId = String(params?.submittedByUserId || '').trim();
  if (userId) return `user:${userId}`;

  const clientId = String(params?.submittedByClientId || '').trim();
  if (clientId) return `client:${clientId}`;

  const email = String(params?.submittedByEmail || '').trim().toLowerCase();
  if (email) return `email:${email}`;

  return 'guest:local-browser';
}

function normalizePolicy(policy?: Partial<LocalContributionPolicy>): LocalContributionPolicy {
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

function moderateQuestionSubmission(params: {
  subject: string;
  questionText: string;
  questionDescription: string;
  questionSource: string;
  submissionReason: string;
  attachments: Array<{ name: string; mimeType: string }>;
}) {
  const subject = String(params.subject || '').trim().toLowerCase();
  const blob = [
    subject,
    String(params.questionText || '').trim(),
    String(params.questionDescription || '').trim(),
    String(params.questionSource || '').trim(),
    String(params.submissionReason || '').trim(),
    ...params.attachments.map((item) => `${item.name} ${item.mimeType}`),
  ]
    .join(' ')
    .toLowerCase();

  const reasons: string[] = [];
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

  if (String(params.questionText || '').trim().length > 0 && String(params.questionText || '').trim().length < 10 && params.attachments.length === 0) {
    reasons.push('Question text is too short to be useful for review.');
    score += 20;
  }

  const uniqueReasons = Array.from(new Set(reasons));
  return {
    result: uniqueReasons.length ? 'rejected' : 'approved',
    reasons: uniqueReasons,
    score: uniqueReasons.length ? Math.min(100, score || 60) : 0,
  } as const;
}

function getRestrictionState(db: LocalDb, actorKey: string) {
  const found = db.submissionRestrictions.find((item) => item.actorKey === actorKey);
  if (!found?.blockedUntil) {
    return { restricted: false, blockedUntil: null as string | null };
  }

  const blockedUntilMs = new Date(found.blockedUntil).getTime();
  if (!Number.isFinite(blockedUntilMs) || blockedUntilMs <= Date.now()) {
    return { restricted: false, blockedUntil: null as string | null };
  }

  return { restricted: true, blockedUntil: found.blockedUntil };
}

function applyActorRestriction(db: LocalDb, actorKey: string, reason: string) {
  const blockDurationMinutes = normalizePolicy(db.contributionPolicy).blockDurationMinutes;
  const blockedUntil = new Date(Date.now() + blockDurationMinutes * 60 * 1000).toISOString();
  const index = db.submissionRestrictions.findIndex((item) => item.actorKey === actorKey);
  const next: LocalSubmissionRestriction = {
    actorKey,
    blockedUntil,
    reason,
    lastViolationAt: new Date().toISOString(),
  };

  if (index >= 0) {
    db.submissionRestrictions[index] = next;
  } else {
    db.submissionRestrictions.push(next);
  }

  return blockedUntil;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0).getTime();
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

function serializePracticeBoardQuestion(item: LocalPracticeBoardQuestion) {
  const legacyQuestionUrl = String((item as any).questionImageUrl || '').trim();
  const legacySolutionUrl = String((item as any).solutionImageUrl || '').trim();

  return {
    id: item.id,
    subject: item.subject,
    difficulty: item.difficulty,
    questionText: item.questionText,
    questionFile: item.questionFile || (legacyQuestionUrl
      ? {
        name: 'question-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacyQuestionUrl,
      }
      : null),
    solutionText: item.solutionText,
    solutionFile: item.solutionFile || (legacySolutionUrl
      ? {
        name: 'solution-image',
        mimeType: 'image/*',
        size: 0,
        dataUrl: legacySolutionUrl,
      }
      : null),
  };
}

function serializeQuestionSubmission(item: LocalQuestionSubmission) {
  const normalizedStatus = String(item.status || 'pending') === 'converted' ? 'approved' : item.status;
  const moderation = item.moderation || {
    result: 'approved',
    reasons: [],
    score: 0,
    blockedActor: false,
    reviewedAt: null,
  };
  return {
    id: item.id,
    subject: item.subject,
    questionText: item.questionText,
    questionDescription: item.questionDescription,
    questionSource: item.questionSource,
    submissionReason: item.submissionReason,
    attachments: item.attachments,
    status: normalizedStatus,
    queuedForBank: item.queuedForBank,
    submittedByName: item.submittedByName,
    submittedByEmail: item.submittedByEmail,
    submittedByUserId: item.submittedByUserId,
    submittedByClientId: item.submittedByClientId,
    actorKey: item.actorKey,
    moderation,
    reviewNotes: item.reviewNotes,
    reviewedByEmail: item.reviewedByEmail,
    reviewedAt: item.reviewedAt,
    createdAt: item.createdAt,
  };
}

function localConnectionKey(a: string, b: string) {
  return [String(a), String(b)].sort().join(':');
}

function localNormalizeUsername(input: string) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function getOrCreateLocalCommunityProfile(db: LocalDb, user: LocalUser) {
  let profile = db.communityProfiles.find((item) => item.userId === user.id);
  if (!profile) {
    const base = [user.firstName, user.lastName].filter(Boolean).join('.').toLowerCase() || user.email.split('@')[0] || `student-${user.id}`;
    profile = {
      userId: user.id,
      username: localNormalizeUsername(base) || `student-${Date.now()}`,
      profilePictureUrl: '',
      shareProfilePicture: false,
      favoriteSubjects: [],
    };
    db.communityProfiles.push(profile);
  }
  return profile;
}

function serializeLocalCommunityUser(user: LocalUser, profile?: LocalCommunityProfile) {
  const resolvedProfile = profile || {
    userId: user.id,
    username: localNormalizeUsername(user.firstName || user.email.split('@')[0] || 'student'),
    profilePictureUrl: '',
    shareProfilePicture: false,
    favoriteSubjects: [],
  };

  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    targetProgram: user.targetProgram,
    city: user.city,
    score: Number(user.progress?.averageScore || 0),
    weakTopics: Array.isArray(user.progress?.weakTopics) ? user.progress.weakTopics : [],
    username: resolvedProfile.username,
    shareProfilePicture: resolvedProfile.shareProfilePicture,
    profilePictureUrl: resolvedProfile.shareProfilePicture ? resolvedProfile.profilePictureUrl : '',
    favoriteSubjects: resolvedProfile.favoriteSubjects || [],
  };
}

function moderateLocalCommunityConversation(messages: LocalCommunityMessage[]): {
  result: 'safe' | 'harmful';
  reasons: string[];
  score: number;
  violatorUserId: string;
} {
  const reasons: string[] = [];
  let score = 0;
  let violatorUserId = '';

  const harmfulPatterns = [
    /(abuse|harass|threat|kill|suicide|terror|extort)/i,
    /(porn|adult|escort|nude|sex)/i,
    /(hack|malware|steal password|phish|bank otp)/i,
    /(scam|crypto signal|betting|casino|loan fraud)/i,
  ];

  messages.forEach((item) => {
    const text = String(item.text || '').toLowerCase();
    harmfulPatterns.forEach((pattern) => {
      if (pattern.test(text)) {
        score += 45;
        violatorUserId = item.senderUserId;
      }
    });
  });

  if (score >= 45) {
    reasons.push('Detected potentially harmful content in the reported conversation.');
  }

  const result: 'safe' | 'harmful' = score >= 70 ? 'harmful' : 'safe';

  return {
    result,
    reasons,
    score,
    violatorUserId,
  };
}

function isLocalCommunityBlocked(db: LocalDb, userId: string) {
  const block = db.communityBlocks.find((item) => item.userId === userId && item.blocked);
  return block || null;
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

  if (url.pathname === '/api/community/profile' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const block = isLocalCommunityBlocked(db, user.id);
    if (block) {
      const blockedError = new Error(block.reason || 'Community access blocked.') as Error & { status?: number; code?: string };
      blockedError.status = 403;
      blockedError.code = 'COMMUNITY_BLOCKED';
      throw blockedError;
    }
    const profile = getOrCreateLocalCommunityProfile(db, user);
    writeDb(db);
    return { profile: serializeLocalCommunityUser(user, profile) } as T;
  }

  if (url.pathname === '/api/community/profile' && method === 'PUT') {
    const { db, user } = requireAuth(token);
    const profile = getOrCreateLocalCommunityProfile(db, user);
    const username = localNormalizeUsername(String(body.username || profile.username));
    if (!username) throw new Error('username is required.');
    const taken = db.communityProfiles.some((item) => item.userId !== user.id && item.username === username);
    if (taken) throw new Error('Username is already taken.');
    profile.username = username;
    profile.profilePictureUrl = String(body.profilePictureUrl || '').trim();
    profile.shareProfilePicture = Boolean(body.shareProfilePicture);
    writeDb(db);
    return { profile: serializeLocalCommunityUser(user, profile) } as T;
  }

  if (url.pathname === '/api/community/users/search' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const q = String(url.searchParams.get('q') || '').toLowerCase().trim();
    const me = user.id;

    const rows = db.users
      .filter((item) => item.role === 'student' && item.id !== me)
      .map((candidate) => {
        const profile = getOrCreateLocalCommunityProfile(db, candidate);
        const connection = db.communityConnections.find((entry) => entry.participantKey === localConnectionKey(me, candidate.id));
        const pendingTo = db.communityConnectionRequests.find((entry) => entry.fromUserId === me && entry.toUserId === candidate.id && entry.status === 'pending');
        const pendingFrom = db.communityConnectionRequests.find((entry) => entry.fromUserId === candidate.id && entry.toUserId === me && entry.status === 'pending');
        return {
          ...serializeLocalCommunityUser(candidate, profile),
          connectionStatus: connection ? 'connected' : pendingTo ? 'pending-sent' : pendingFrom ? 'pending-received' : 'none',
        };
      })
      .filter((entry) => {
        if (!q) return true;
        const blob = [entry.username, entry.firstName, entry.lastName, entry.targetProgram, entry.city].join(' ').toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 20);

    writeDb(db);
    return { users: rows } as T;
  }

  if (url.pathname === '/api/community/connections/request' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const toUserId = String(body.toUserId || '').trim();
    if (!toUserId || toUserId === user.id) throw new Error('Valid target user id is required.');

    const target = db.users.find((item) => item.id === toUserId && item.role === 'student');
    if (!target) throw new Error('User not found.');

    const existingConnection = db.communityConnections.find((item) => item.participantKey === localConnectionKey(user.id, toUserId));
    if (existingConnection) throw new Error('You are already connected.');

    const existingPending = db.communityConnectionRequests.find((item) => (
      ((item.fromUserId === user.id && item.toUserId === toUserId) || (item.fromUserId === toUserId && item.toUserId === user.id))
      && item.status === 'pending'
    ));
    if (existingPending) throw new Error('A pending connection request already exists.');

    db.communityConnectionRequests.push({
      id: `conn-req-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      fromUserId: user.id,
      toUserId,
      status: 'pending',
      createdAt: new Date().toISOString(),
    });

    writeDb(db);
    return { ok: true } as T;
  }

  if (url.pathname === '/api/community/connections/requests' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const incoming = db.communityConnectionRequests.filter((item) => item.toUserId === user.id && item.status === 'pending');
    const outgoing = db.communityConnectionRequests.filter((item) => item.fromUserId === user.id && item.status === 'pending');

    const mapRequest = (item: LocalCommunityConnectionRequest, direction: 'incoming' | 'outgoing') => {
      const otherUserId = direction === 'incoming' ? item.fromUserId : item.toUserId;
      const otherUser = db.users.find((entry) => entry.id === otherUserId);
      if (!otherUser) return null;
      const profile = getOrCreateLocalCommunityProfile(db, otherUser);
      return {
        id: item.id,
        direction,
        status: item.status,
        createdAt: item.createdAt,
        user: serializeLocalCommunityUser(otherUser, profile),
      };
    };

    writeDb(db);
    return {
      incoming: incoming.map((item) => mapRequest(item, 'incoming')).filter(Boolean),
      outgoing: outgoing.map((item) => mapRequest(item, 'outgoing')).filter(Boolean),
    } as T;
  }

  if (/^\/api\/community\/connections\/requests\/[^/]+\/respond$/.test(url.pathname) && method === 'POST') {
    const { db, user } = requireAuth(token);
    const requestId = url.pathname.split('/')[5];
    const action = String(body.action || '').toLowerCase().trim();
    if (!['accept', 'reject'].includes(action)) throw new Error('action must be accept or reject.');

    const request = db.communityConnectionRequests.find((item) => item.id === requestId && item.toUserId === user.id);
    if (!request) throw new Error('Connection request not found.');
    if (request.status !== 'pending') throw new Error('Request is already handled.');

    if (action === 'accept') {
      const key = localConnectionKey(request.fromUserId, request.toUserId);
      if (!db.communityConnections.some((item) => item.participantKey === key)) {
        const [a, b] = [request.fromUserId, request.toUserId].sort();
        db.communityConnections.push({
          id: `connection-${Date.now()}-${Math.round(Math.random() * 10000)}`,
          participantA: a,
          participantB: b,
          participantKey: key,
          createdAt: new Date().toISOString(),
        });
      }
      request.status = 'accepted';
    } else {
      request.status = 'rejected';
    }

    writeDb(db);
    return { ok: true, status: request.status } as T;
  }

  if (url.pathname === '/api/community/connections' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const rows = db.communityConnections
      .filter((item) => item.participantA === user.id || item.participantB === user.id)
      .map((item) => {
        const otherUserId = item.participantA === user.id ? item.participantB : item.participantA;
        const otherUser = db.users.find((entry) => entry.id === otherUserId);
        if (!otherUser) return null;
        const profile = getOrCreateLocalCommunityProfile(db, otherUser);
        const unreadCount = db.communityMessages.filter((msg) => (
          msg.connectionId === item.id && msg.senderUserId !== user.id && !msg.readByUserIds.includes(user.id)
        )).length;

        return {
          connectionId: item.id,
          connectedAt: item.createdAt,
          user: serializeLocalCommunityUser(otherUser, profile),
          unreadCount,
        };
      })
      .filter(Boolean);

    writeDb(db);
    return { connections: rows } as T;
  }

  if (/^\/api\/community\/messages\/.+/.test(url.pathname) && method === 'GET') {
    const { db, user } = requireAuth(token);
    const connectionId = url.pathname.split('/')[4];
    const connection = db.communityConnections.find((item) => item.id === connectionId);
    if (!connection) throw new Error('Connection not found.');
    if (![connection.participantA, connection.participantB].includes(user.id)) throw new Error('Access denied for this chat.');

    db.communityMessages.forEach((msg) => {
      if (msg.connectionId === connectionId && msg.senderUserId !== user.id && !msg.readByUserIds.includes(user.id)) {
        msg.readByUserIds.push(user.id);
      }
    });

    const messages = db.communityMessages
      .filter((item) => item.connectionId === connectionId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map((item) => ({
        id: item.id,
        connectionId: item.connectionId,
        senderUserId: item.senderUserId,
        text: item.text,
        createdAt: item.createdAt,
      }));

    writeDb(db);
    return { messages } as T;
  }

  if (/^\/api\/community\/messages\/.+/.test(url.pathname) && method === 'POST') {
    const { db, user } = requireAuth(token);
    const connectionId = url.pathname.split('/')[4];
    const text = String(body.text || '').trim();
    if (!text) throw new Error('Message text is required.');

    const connection = db.communityConnections.find((item) => item.id === connectionId);
    if (!connection) throw new Error('Connection not found.');
    if (![connection.participantA, connection.participantB].includes(user.id)) throw new Error('Access denied for this chat.');

    const created: LocalCommunityMessage = {
      id: `message-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      connectionId,
      senderUserId: user.id,
      text,
      readByUserIds: [user.id],
      createdAt: new Date().toISOString(),
    };
    db.communityMessages.push(created);
    writeDb(db);
    return {
      message: {
        id: created.id,
        connectionId: created.connectionId,
        senderUserId: created.senderUserId,
        text: created.text,
        createdAt: created.createdAt,
      },
    } as T;
  }

  if (url.pathname === '/api/community/report' && method === 'POST') {
    const { db, user } = requireAuth(token);
    const connectionId = String(body.connectionId || '').trim();
    const reportedUserId = String(body.reportedUserId || '').trim();
    const reason = String(body.reason || '').trim();
    if (!connectionId || !reportedUserId) throw new Error('Valid connection id and reported user id are required.');

    const connection = db.communityConnections.find((item) => item.id === connectionId);
    if (!connection) throw new Error('Connection not found.');
    if (![connection.participantA, connection.participantB].includes(user.id)) throw new Error('Access denied for this chat.');

    const messages = db.communityMessages.filter((item) => item.connectionId === connectionId);
    const moderation = moderateLocalCommunityConversation(messages);
    const report: LocalCommunityReport = {
      id: `community-report-${Date.now()}-${Math.round(Math.random() * 10000)}`,
      connectionId,
      reporterUserId: user.id,
      reportedUserId,
      reason,
      status: moderation.result === 'harmful' ? 'actioned' : 'open',
      moderation: {
        result: moderation.result,
        reasons: moderation.reasons,
        score: moderation.score,
        violatorUserId: moderation.violatorUserId,
        autoBlocked: moderation.result === 'harmful',
        reviewedAt: moderation.result === 'harmful' ? new Date().toISOString() : null,
        reviewedByEmail: moderation.result === 'harmful' ? 'system@net360.local' : '',
      },
      chatSnapshot: messages.slice(-150).map((item) => ({ senderUserId: item.senderUserId, text: item.text, createdAt: item.createdAt })),
      createdAt: new Date().toISOString(),
    };
    db.communityReports.unshift(report);

    if (moderation.result === 'harmful' && moderation.violatorUserId) {
      const existingBlock = db.communityBlocks.find((item) => item.userId === moderation.violatorUserId);
      if (existingBlock) {
        existingBlock.blocked = true;
        existingBlock.reason = moderation.reasons.join(' ') || 'Harmful community behavior detected.';
        existingBlock.blockedAt = new Date().toISOString();
        existingBlock.sourceReportId = report.id;
      } else {
        db.communityBlocks.push({
          userId: moderation.violatorUserId,
          blocked: true,
          reason: moderation.reasons.join(' ') || 'Harmful community behavior detected.',
          blockedAt: new Date().toISOString(),
          sourceReportId: report.id,
        });
      }
    }

    writeDb(db);
    return {
      ok: true,
      reportId: report.id,
      moderation: {
        result: moderation.result,
        reasons: moderation.reasons,
        score: moderation.score,
      },
    } as T;
  }

  if (url.pathname === '/api/community/leaderboard' && method === 'GET') {
    const { db } = requireAuth(token);
    const leaderboard = db.users
      .filter((item) => item.role === 'student')
      .sort((a, b) => Number(b.progress?.averageScore || 0) - Number(a.progress?.averageScore || 0))
      .slice(0, 20)
      .map((entry, index) => {
        const profile = getOrCreateLocalCommunityProfile(db, entry);
        return {
          rank: index + 1,
          ...serializeLocalCommunityUser(entry, profile),
        };
      });
    writeDb(db);
    return { leaderboard } as T;
  }

  if (url.pathname === '/api/community/groups' && method === 'GET') {
    requireAuth(token);
    return {
      groups: [
        { id: 'math-core', title: 'Mathematics Problem Solvers', subject: 'mathematics', members: 24, description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.' },
        { id: 'physics-lab', title: 'Physics Concept Lab', subject: 'physics', members: 21, description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.' },
        { id: 'chem-crackers', title: 'Chemistry MCQ Crackers', subject: 'chemistry', members: 19, description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.' },
        { id: 'bio-circle', title: 'Biology Revision Circle', subject: 'biology', members: 17, description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.' },
        { id: 'english-boost', title: 'English NET Boosters', subject: 'english', members: 20, description: 'Subject-focused discussion and study support for NET aspirants in Pakistan.' },
      ],
    } as T;
  }

  if (url.pathname === '/api/community/study-partners' && method === 'GET') {
    const { db, user } = requireAuth(token);
    const meWeak = new Set((user.progress?.weakTopics || []).map((item) => String(item).toLowerCase()));

    const studyPartners = db.users
      .filter((item) => item.role === 'student' && item.id !== user.id)
      .map((entry) => {
        const profile = getOrCreateLocalCommunityProfile(db, entry);
        const weakTopics = (entry.progress?.weakTopics || []).map((item) => String(item).toLowerCase());
        const overlap = weakTopics.filter((topic) => meWeak.has(topic)).length;
        const scoreGap = Math.abs(Number(entry.progress?.averageScore || 0) - Number(user.progress?.averageScore || 0));
        const compatibility = Math.max(0, 100 - scoreGap + overlap * 8);
        return {
          compatibility,
          user: serializeLocalCommunityUser(entry, profile),
        };
      })
      .sort((a, b) => b.compatibility - a.compatibility)
      .slice(0, 12);

    writeDb(db);
    return { studyPartners } as T;
  }

  if (url.pathname === '/api/admin/community/reports' && method === 'GET') {
    requireAdmin(token);
    const db = readDb();
    return {
      reports: db.communityReports.slice(0, 300),
    } as T;
  }

  if (/^\/api\/admin\/community\/reports\/[^/]+\/review$/.test(url.pathname) && method === 'POST') {
    const { db, user } = requireAdmin(token);
    const reportId = url.pathname.split('/')[5];
    const action = String(body.action || '').trim().toLowerCase();
    const notes = String(body.notes || '').trim();
    const violatorUserId = String(body.violatorUserId || '').trim();
    if (!['block', 'dismiss'].includes(action)) throw new Error('action must be block or dismiss.');

    const report = db.communityReports.find((item) => item.id === reportId);
    if (!report) throw new Error('Report not found.');

    if (action === 'dismiss') {
      report.status = 'dismissed';
      report.moderation.reviewedAt = new Date().toISOString();
      report.moderation.reviewedByEmail = user.email;
      if (notes) {
        report.moderation.reasons = [...(report.moderation.reasons || []), `Admin note: ${notes}`];
      }
      writeDb(db);
      return { ok: true, status: report.status } as T;
    }

    const target = violatorUserId || report.moderation.violatorUserId || report.reportedUserId;
    if (!target) throw new Error('A valid violator user id is required to block.');
    const existingBlock = db.communityBlocks.find((item) => item.userId === target);
    if (existingBlock) {
      existingBlock.blocked = true;
      existingBlock.reason = notes || 'Blocked by admin after community report review.';
      existingBlock.blockedAt = new Date().toISOString();
      existingBlock.sourceReportId = report.id;
    } else {
      db.communityBlocks.push({
        userId: target,
        blocked: true,
        reason: notes || 'Blocked by admin after community report review.',
        blockedAt: new Date().toISOString(),
        sourceReportId: report.id,
      });
    }

    report.status = 'actioned';
    report.moderation.result = 'harmful';
    report.moderation.violatorUserId = target;
    report.moderation.autoBlocked = true;
    report.moderation.reviewedAt = new Date().toISOString();
    report.moderation.reviewedByEmail = user.email;
    if (notes) {
      report.moderation.reasons = [...(report.moderation.reasons || []), `Admin note: ${notes}`];
    }

    writeDb(db);
    return { ok: true, status: report.status } as T;
  }

  if (url.pathname === '/api/mcqs' && method === 'GET') {
    const mcqs = await loadMcqs();
    const subject = url.searchParams.get('subject');
    const part = url.searchParams.get('part');
    const chapter = url.searchParams.get('chapter');
    const section = url.searchParams.get('section');
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
    if (part) {
      results = results.filter((item) => String(item.part || '').toLowerCase() === part.toLowerCase());
    }
    if (chapter) {
      results = results.filter((item) => String(item.chapter || '').toLowerCase().includes(chapter.toLowerCase()));
    }
    if (section) {
      results = results.filter((item) => String(item.section || '').toLowerCase().includes(section.toLowerCase()));
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

  if (url.pathname === '/api/practice-board/questions' && method === 'GET') {
    const db = readDb();
    const subject = String(url.searchParams.get('subject') || '').trim().toLowerCase();
    const difficulty = String(url.searchParams.get('difficulty') || '').trim().toLowerCase();
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
    const limit = clamp(Number(url.searchParams.get('limit') || '100'), 1, 500);

    const filtered = db.practiceBoardQuestions.filter((item) => {
      if (subject && item.subject !== subject) return false;
      if (difficulty && item.difficulty.toLowerCase() !== difficulty) return false;
      if (search) {
        const haystack = [
          item.questionText,
          item.solutionText,
          item.questionFile?.name || '',
          item.solutionFile?.name || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    return {
      questions: filtered.slice(0, limit).map(serializePracticeBoardQuestion),
      total: filtered.length,
    } as T;
  }

  if (url.pathname === '/api/practice-board/questions/random' && method === 'GET') {
    const db = readDb();
    const subject = String(url.searchParams.get('subject') || '').trim().toLowerCase();
    const difficulty = String(url.searchParams.get('difficulty') || '').trim().toLowerCase();
    const excludeId = String(url.searchParams.get('excludeId') || '').trim();

    const filtered = db.practiceBoardQuestions.filter((item) => {
      if (subject && item.subject !== subject) return false;
      if (difficulty && item.difficulty.toLowerCase() !== difficulty) return false;
      if (excludeId && item.id === excludeId) return false;
      return true;
    });

    if (!filtered.length) {
      throw new Error('No practice board questions found for this selection.');
    }

    const randomIndex = Math.floor(Math.random() * filtered.length);
    const picked = filtered[randomIndex];
    return { question: serializePracticeBoardQuestion(picked) } as T;
  }

  if (url.pathname === '/api/question-submissions' && method === 'POST') {
    const db = readDb();
    const policy = normalizePolicy(db.contributionPolicy);
    const subject = String(body.subject || '').trim();
    const questionText = String(body.questionText || '').trim();
    const questionDescription = String(body.questionDescription || '').trim();
    const questionSource = String(body.questionSource || '').trim();
    const submissionReason = String(body.submissionReason || '').trim();
    const submittedByName = String(body.submittedByName || '').trim();
    const submittedByEmail = String(body.submittedByEmail || '').trim();
    const submittedByUserId = String(body.submittedByUserId || '').trim();
    const submittedByClientId = String(body.submittedByClientId || '').trim();
    const actorKey = normalizeContributionActorKey({ submittedByUserId, submittedByClientId, submittedByEmail });

    const restriction = getRestrictionState(db, actorKey);
    if (restriction.restricted) {
      const blockedError = new Error(CONTENT_RESTRICTION_MESSAGE) as Error & { status?: number; code?: string; payload?: Record<string, unknown> };
      blockedError.status = 403;
      blockedError.code = 'UPLOAD_RESTRICTED';
      blockedError.payload = { blockedUntil: restriction.blockedUntil, code: 'UPLOAD_RESTRICTED' };
      throw blockedError;
    }

    const attachments = Array.isArray(body.attachments)
      ? body.attachments.map((file: any) => ({
        name: String(file?.name || '').trim(),
        mimeType: String(file?.mimeType || '').trim(),
        size: Number(file?.size || 0),
        dataUrl: String(file?.dataUrl || '').trim(),
      }))
      : [];

    if (attachments.length > policy.maxFilesPerSubmission) {
      throw new Error(`You can upload up to ${policy.maxFilesPerSubmission} files per submission.`);
    }

    if (!subject) {
      throw new Error('Subject is required.');
    }
    if (!questionText && !attachments.length) {
      throw new Error('Please provide a typed/pasted question or at least one attachment.');
    }
    if (!submissionReason) {
      throw new Error('Please explain why this question should be added.');
    }

    const allowedMimeTypes = new Set(policy.allowedMimeTypes);

    for (const file of attachments) {
      if (!file.name || !file.mimeType || !file.dataUrl || !Number.isFinite(file.size)) {
        throw new Error('Each attachment must include name, mimeType, size, and file data.');
      }
      if (!allowedMimeTypes.has(file.mimeType)) {
        throw new Error(`Unsupported attachment type: ${file.mimeType}`);
      }
      if (file.size > policy.maxFileSizeBytes) {
        throw new Error('Upload failed: File size exceeds the allowed limit.');
      }
      if (!file.dataUrl.startsWith('data:')) {
        throw new Error(`Attachment ${file.name} is not a valid uploaded file payload.`);
      }
    }

    const submissionsToday = db.questionSubmissions.filter((item) => item.actorKey === actorKey && new Date(item.createdAt).getTime() >= startOfToday());
    if (submissionsToday.length >= policy.maxSubmissionsPerDay) {
      const limitError = new Error(`Daily limit reached. You can submit up to ${policy.maxSubmissionsPerDay} times per day.`) as Error & { status?: number };
      limitError.status = 429;
      throw limitError;
    }

    const moderation = moderateQuestionSubmission({
      subject,
      questionText,
      questionDescription,
      questionSource,
      submissionReason,
      attachments,
    });
    const rejectedByModeration = moderation.result === 'rejected';

    const now = new Date().toISOString();
    const submission: LocalQuestionSubmission = {
      id: `qs-${Date.now()}`,
      subject,
      questionText,
      questionDescription,
      questionSource,
      submissionReason,
      attachments,
      status: rejectedByModeration ? 'rejected' : 'pending',
      queuedForBank: false,
      submittedByName,
      submittedByEmail,
      submittedByUserId,
      submittedByClientId,
      actorKey,
      moderation: {
        result: moderation.result,
        reasons: moderation.reasons,
        score: moderation.score,
        blockedActor: rejectedByModeration,
        reviewedAt: rejectedByModeration ? now : null,
      },
      reviewNotes: rejectedByModeration ? `Auto moderation: ${moderation.reasons.join(' ')}` : '',
      reviewedByEmail: rejectedByModeration ? 'AI moderation' : '',
      reviewedAt: rejectedByModeration ? now : null,
      createdAt: now,
      updatedAt: now,
    };

    db.questionSubmissions.unshift(submission);

    if (rejectedByModeration) {
      const blockedUntil = applyActorRestriction(db, actorKey, moderation.reasons.join(' '));
      writeDb(db);
      const moderationError = new Error(CONTENT_RESTRICTION_MESSAGE) as Error & { status?: number; code?: string; payload?: Record<string, unknown> };
      moderationError.status = 403;
      moderationError.code = 'CONTENT_RESTRICTED';
      moderationError.payload = {
        code: 'CONTENT_RESTRICTED',
        blockedUntil,
        submission: serializeQuestionSubmission(submission),
      };
      throw moderationError;
    }

    writeDb(db);
    return { submission: serializeQuestionSubmission(submission) } as T;
  }

  if (url.pathname === '/api/question-submissions/access' && method === 'GET') {
    const db = readDb();
    const submittedByEmail = String(url.searchParams.get('submittedByEmail') || '').trim();
    const submittedByUserId = String(url.searchParams.get('submittedByUserId') || '').trim();
    const submittedByClientId = String(url.searchParams.get('submittedByClientId') || '').trim();
    const actorKey = normalizeContributionActorKey({ submittedByEmail, submittedByUserId, submittedByClientId });
    const policy = normalizePolicy(db.contributionPolicy);
    const restriction = getRestrictionState(db, actorKey);
    const submissionsToday = db.questionSubmissions.filter((item) => item.actorKey === actorKey && new Date(item.createdAt).getTime() >= startOfToday());

    return {
      blocked: restriction.restricted,
      blockedUntil: restriction.blockedUntil,
      message: restriction.restricted ? CONTENT_RESTRICTION_MESSAGE : '',
      limits: {
        maxSubmissionsPerDay: policy.maxSubmissionsPerDay,
        maxFilesPerSubmission: policy.maxFilesPerSubmission,
        maxFileSizeBytes: policy.maxFileSizeBytes,
        remainingSubmissionsToday: Math.max(0, policy.maxSubmissionsPerDay - submissionsToday.length),
        allowedMimeTypes: policy.allowedMimeTypes,
      },
    } as T;
  }

  if (url.pathname === '/api/question-submissions/history' && method === 'GET') {
    const db = readDb();
    const rawIds = String(url.searchParams.get('ids') || '').trim();
    if (!rawIds) {
      return { submissions: [] } as T;
    }

    const ids = rawIds
      .split(',')
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .slice(0, 100);

    const submissions = db.questionSubmissions
      .filter((item) => ids.includes(item.id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { submissions: submissions.map(serializeQuestionSubmission) } as T;
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
      throw new Error(`Daily guidance limit reached (${dailyLimit}). Please continue tomorrow.`);
    }

    let answer = [
      'Concept Explanation',
      'A strong preparation approach combines concept clarity, worked examples, and timed practice.',
      '',
      'Step-by-Step Solution',
      '1. Start with a short concept summary for the topic.',
      '2. Solve one representative example with reasoning.',
      '3. Attempt timed MCQs and review mistakes immediately.',
      '4. Repeat with a slightly harder variation of the same concept.',
      '',
      'Final Answer',
      'Use an iterative cycle of concept, example, timed practice, and error review.',
      '',
      'Quick Trick or Shortcut Method',
      'Track repeated mistakes in one notebook and revise those patterns daily.',
    ].join('\n');
    const normalized = message.toLowerCase();
    if (normalized.includes('integration')) {
      answer = [
        'Concept Explanation',
        'Integration by parts is used when the integrand is a product of two functions and direct integration is difficult.',
        '',
        'Step-by-Step Solution',
        '1. Choose u and dv using LIATE.',
        '2. Compute du and v correctly.',
        '3. Apply integral(udv) = uv - integral(vdu).',
        '4. Simplify the remaining integral and verify.',
        '',
        'Final Answer',
        'Apply LIATE and complete the remaining integral after uv - integral(vdu).',
        '',
        'Quick Trick or Shortcut Method',
        'Try substitution first when an inner derivative appears; switch to integration by parts if needed.',
      ].join('\n');
    } else if (normalized.includes('physics') || normalized.includes('newton')) {
      answer = [
        'Concept Explanation',
        'Force and motion numericals are solved fastest through a clear free-body diagram and correct sign convention.',
        '',
        'Step-by-Step Solution',
        '1. Draw the free-body diagram and mark all forces.',
        '2. Resolve components and set axes.',
        '3. Apply Newton\'s laws with proper signs.',
        '4. Solve and confirm units.',
        '',
        'Final Answer',
        'Use free-body analysis and Newton\'s laws to obtain the required quantity.',
        '',
        'Quick Trick or Shortcut Method',
        'Eliminate options with impossible direction/sign before full calculation.',
      ].join('\n');
    } else if (normalized.includes('chemistry')) {
      answer = [
        'Concept Explanation',
        'Chemistry questions become easier when grouped into concept buckets before solving.',
        '',
        'Step-by-Step Solution',
        '1. Classify the question into trend, bonding, stoichiometry, or equilibrium.',
        '2. Write the core relation/rule.',
        '3. Substitute values with correct units and ratios.',
        '4. Validate the result against chemical feasibility.',
        '',
        'Final Answer',
        'Classify first, apply the core rule, and confirm chemical feasibility.',
        '',
        'Quick Trick or Shortcut Method',
        'Use trend-based elimination to remove impossible options quickly.',
      ].join('\n');
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
    const part = String(body.part || '').toLowerCase();
    const chapter = String(body.chapter || '').toLowerCase();
    const section = String(body.section || '').toLowerCase();
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

      if (part) {
        pool = pool.filter((item) => String(item.part || '').toLowerCase() === part);
      }
      if (chapter) {
        pool = pool.filter((item) => String(item.chapter || '').toLowerCase().includes(chapter));
      }
      if (section) {
        pool = pool.filter((item) => String(item.section || '').toLowerCase().includes(section));
      }

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
      part: item.part,
      chapter: item.chapter,
      section: item.section,
      topic: item.topic,
      question: item.question,
      questionImageUrl: item.questionImageUrl,
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
    const pendingQuestionSubmissions = db.questionSubmissions.filter((item) => item.status === 'pending').length;
    const recentAttempts = db.attempts.slice(0, 12);
    const averageScore = recentAttempts.length
      ? Math.round(recentAttempts.reduce((sum, item) => sum + item.score, 0) / recentAttempts.length)
      : 0;

    return {
      usersCount,
      mcqCount,
      attemptsCount,
      pendingQuestionSubmissions,
      averageScore,
      recentAttempts,
    } as T;
  }

  if (url.pathname === '/api/admin/question-submissions' && method === 'GET') {
    requireAdmin(token);
    const db = readDb();
    const status = String(url.searchParams.get('status') || 'all').trim().toLowerCase();
    const subject = String(url.searchParams.get('subject') || '').trim().toLowerCase();

    const submissions = db.questionSubmissions
      .filter((item) => {
        if (status !== 'all' && item.status !== status) return false;
        if (subject && item.subject.toLowerCase() !== subject) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { submissions: submissions.map(serializeQuestionSubmission) } as T;
  }

  if (url.pathname === '/api/admin/question-submissions/policy' && method === 'GET') {
    requireAdmin(token);
    const db = readDb();
    return { policy: normalizePolicy(db.contributionPolicy) } as T;
  }

  if (url.pathname === '/api/admin/question-submissions/policy' && method === 'PUT') {
    const { db, user } = requireAdmin(token);
    db.contributionPolicy = normalizePolicy({
      maxSubmissionsPerDay: Number(body.maxSubmissionsPerDay),
      maxFilesPerSubmission: Number(body.maxFilesPerSubmission),
      maxFileSizeBytes: Number(body.maxFileSizeBytes),
      blockDurationMinutes: Number(body.blockDurationMinutes),
      allowedMimeTypes: DEFAULT_CONTRIBUTION_POLICY.allowedMimeTypes,
      updatedByEmail: user.email,
    });
    writeDb(db);
    return { policy: db.contributionPolicy } as T;
  }

  if (/^\/api\/admin\/question-submissions\/[^/]+\/review$/.test(url.pathname) && method === 'POST') {
    const { db, user } = requireAdmin(token);
    const submissionId = url.pathname.split('/')[4];
    const submission = db.questionSubmissions.find((item) => item.id === submissionId);
    if (!submission) {
      throw new Error('Question submission not found.');
    }

    const status = String(body.status || '').trim().toLowerCase();
    const reviewNotes = String(body.reviewNotes || '').trim();

    if (!['approved', 'rejected'].includes(status)) {
      throw new Error('status must be approved or rejected.');
    }

    if (status === 'rejected' && !reviewNotes) {
      throw new Error('Please provide a short explanation for rejection.');
    }

    submission.status = status as LocalQuestionSubmission['status'];
    submission.queuedForBank = status === 'approved';
    submission.reviewNotes = reviewNotes;
    submission.reviewedByEmail = user.email;
    submission.reviewedAt = new Date().toISOString();
    if (status === 'approved' && submission.moderation?.result === 'rejected') {
      submission.moderation.result = 'manual-override';
      submission.moderation.reviewedAt = new Date().toISOString();
    }
    submission.updatedAt = new Date().toISOString();

    writeDb(db);
    return { submission: serializeQuestionSubmission(submission) } as T;
  }

  if (url.pathname === '/api/admin/mcqs' && method === 'GET') {
    requireAdmin(token);
    const subject = String(url.searchParams.get('subject') || '').toLowerCase();
    const part = String(url.searchParams.get('part') || '').toLowerCase();
    const chapter = String(url.searchParams.get('chapter') || '').toLowerCase();
    const section = String(url.searchParams.get('section') || '').toLowerCase();
    const topic = String(url.searchParams.get('topic') || '').toLowerCase();
    const difficulty = String(url.searchParams.get('difficulty') || '');

    const mcqs = await loadMcqs();
    const filtered = mcqs.filter((item) => {
      if (subject && item.subject !== subject) return false;
      if (part && String(item.part || '').toLowerCase() !== part) return false;
      if (chapter && !String(item.chapter || '').toLowerCase().includes(chapter)) return false;
      if (section && !String(item.section || '').toLowerCase().includes(section)) return false;
      if (topic && !item.topic.toLowerCase().includes(topic)) return false;
      if (difficulty && item.difficulty !== difficulty) return false;
      return true;
    });

    return {
      mcqs: filtered.slice(0, 200).map((item) => ({
        id: item.id,
        subject: item.subject,
        part: item.part || '',
        chapter: item.chapter || '',
        section: item.section || '',
        topic: item.topic,
        question: item.question,
        questionImageUrl: item.questionImageUrl || '',
        options: item.options,
        answer: item.answer,
        tip: item.tip,
        difficulty: item.difficulty,
      })),
    } as T;
  }

  if (url.pathname === '/api/admin/mcqs/parse' && method === 'POST') {
    requireAdmin(token);
    const sourceType = String(body.sourceType || 'text').trim().toLowerCase();

    if (sourceType === 'file') {
      throw new Error('File parsing requires the server API. Start backend and try again.');
    }

    return parseBulkMcqsFromText(String(body.rawText || '')) as T;
  }

  if (url.pathname === '/api/admin/mcqs' && method === 'POST') {
    requireAdmin(token);
    const mcqs = await loadMcqs();
    const normalizedSubject = String(body.subject || 'mathematics').toLowerCase().trim();
    const isFlatTopicSubject = normalizedSubject === 'quantitative-mathematics' || normalizedSubject === 'design-aptitude';
    const normalizedPart = String(body.part || '').toLowerCase().trim();
    const normalizedChapter = String(body.chapter || '').trim();
    const normalizedSection = String(body.section || '').trim();
    const normalizedTopic = String(body.topic || 'General').trim();
    const payload = {
      id: `admin-${Date.now()}`,
      subject: normalizedSubject as SubjectKey,
      part: isFlatTopicSubject ? '' : normalizedPart,
      chapter: isFlatTopicSubject ? '' : normalizedChapter,
      section: isFlatTopicSubject ? (normalizedSection || normalizedTopic) : normalizedSection,
      topic: isFlatTopicSubject ? (normalizedTopic || normalizedSection) : normalizedTopic,
      question: String(body.question || ''),
      questionImageUrl: String(body.questionImageUrl || ''),
      options: Array.isArray(body.options) ? body.options.map((item: unknown) => String(item)) : [],
      answer: String(body.answer || ''),
      tip: String(body.tip || ''),
      difficulty: String(body.difficulty || 'Medium') as Difficulty,
    };

    if (!payload.question || payload.options.length < 2 || !payload.answer || !payload.subject) {
      throw new Error('question, options (min 2), answer, and subject are required.');
    }

    if (!isFlatTopicSubject && (!payload.part || !payload.chapter || !payload.section)) {
      throw new Error('part, chapter, and section are required for this subject.');
    }

    if (isFlatTopicSubject && !payload.topic && !payload.section) {
      throw new Error('topic is required for this subject.');
    }

    cachedMcqs = [payload as MCQ, ...mcqs];

    return { mcq: payload } as T;
  }

  if (url.pathname === '/api/admin/mcqs/bulk-delete' && method === 'POST') {
    requireAdmin(token);
    const mode = String(body.mode || '').trim().toLowerCase();
    const subject = String(body.subject || '').trim().toLowerCase();
    const chapter = String(body.chapter || '').trim().toLowerCase();
    const sectionOrTopic = String(body.sectionOrTopic || '').trim().toLowerCase();

    if (!['all', 'subject', 'chapter', 'section-topic'].includes(mode)) {
      throw new Error('mode must be one of: all, subject, chapter, section-topic.');
    }

    if (mode === 'subject' && !subject) {
      throw new Error('subject is required for subject deletion.');
    }

    if (mode === 'chapter' && (!subject || !chapter)) {
      throw new Error('subject and chapter are required for chapter deletion.');
    }

    if (mode === 'section-topic' && (!subject || !sectionOrTopic)) {
      throw new Error('subject and section/topic are required for section/topic deletion.');
    }

    const mcqs = await loadMcqs();
    const shouldDelete = (item: MCQ) => {
      if (mode === 'all') return true;
      const itemSubject = String(item.subject || '').toLowerCase();
      const itemChapter = String(item.chapter || '').toLowerCase();
      const itemSection = String(item.section || '').toLowerCase();
      const itemTopic = String(item.topic || '').toLowerCase();

      if (mode === 'subject') {
        return itemSubject === subject;
      }

      if (mode === 'chapter') {
        return itemSubject === subject && itemChapter === chapter;
      }

      if (mode === 'section-topic') {
        const sectionTopicMatch = itemSection === sectionOrTopic || itemTopic === sectionOrTopic;
        if (!sectionTopicMatch) return false;
        if (!chapter) {
          return itemSubject === subject;
        }
        return itemSubject === subject && itemChapter === chapter;
      }

      return false;
    };

    const before = mcqs.length;
    cachedMcqs = mcqs.filter((item) => !shouldDelete(item));
    const removed = Math.max(0, before - cachedMcqs.length);

    return {
      ok: true,
      mode,
      removed,
    } as T;
  }

  if (url.pathname === '/api/admin/practice-board/questions' && method === 'GET') {
    const { db } = requireAdmin(token);
    const subject = String(url.searchParams.get('subject') || '').trim().toLowerCase();
    const difficulty = String(url.searchParams.get('difficulty') || '').trim().toLowerCase();
    const search = String(url.searchParams.get('search') || '').trim().toLowerCase();

    const questions = db.practiceBoardQuestions
      .filter((item) => {
        if (subject && item.subject !== subject) return false;
        if (difficulty && item.difficulty.toLowerCase() !== difficulty) return false;
        if (search) {
          const haystack = [
            item.questionText,
            item.solutionText,
            item.questionFile?.name || '',
            item.solutionFile?.name || '',
          ].join(' ').toLowerCase();
          if (!haystack.includes(search)) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { questions: questions.map(serializePracticeBoardQuestion) } as T;
  }

  if (url.pathname === '/api/admin/practice-board/questions' && method === 'POST') {
    const { db } = requireAdmin(token);
    const subject = String(body.subject || '').trim().toLowerCase();
    const difficulty = String(body.difficulty || 'Medium').trim() || 'Medium';
    const questionText = String(body.questionText || '').trim();
    const questionFile = body.questionFile && typeof body.questionFile === 'object'
      ? {
        name: String(body.questionFile.name || '').trim(),
        mimeType: String(body.questionFile.mimeType || '').trim(),
        size: Number(body.questionFile.size || 0),
        dataUrl: String(body.questionFile.dataUrl || '').trim(),
      }
      : null;
    const solutionText = String(body.solutionText || '').trim();
    const solutionFile = body.solutionFile && typeof body.solutionFile === 'object'
      ? {
        name: String(body.solutionFile.name || '').trim(),
        mimeType: String(body.solutionFile.mimeType || '').trim(),
        size: Number(body.solutionFile.size || 0),
        dataUrl: String(body.solutionFile.dataUrl || '').trim(),
      }
      : null;

    if (!subject) {
      throw new Error('subject is required.');
    }
    if (!questionText && !questionFile) {
      throw new Error('Provide question text or a question file.');
    }
    if (!solutionText && !solutionFile) {
      throw new Error('Provide solution text or a solution file.');
    }

    const now = new Date().toISOString();
    const question: LocalPracticeBoardQuestion = {
      id: `pbq-${Date.now()}`,
      subject,
      difficulty,
      questionText,
      questionFile,
      solutionText,
      solutionFile,
      source: 'Admin',
      createdAt: now,
      updatedAt: now,
    };

    db.practiceBoardQuestions.unshift(question);
    writeDb(db);
    return { question: serializePracticeBoardQuestion(question) } as T;
  }

  if (/^\/api\/admin\/practice-board\/questions\/[^/]+$/.test(url.pathname) && method === 'PUT') {
    const { db } = requireAdmin(token);
    const questionId = url.pathname.split('/')[5];
    const index = db.practiceBoardQuestions.findIndex((item) => item.id === questionId);
    if (index < 0) {
      throw new Error('Practice board question not found.');
    }

    const target = db.practiceBoardQuestions[index];
    const updated: LocalPracticeBoardQuestion = {
      ...target,
      subject: Object.prototype.hasOwnProperty.call(body, 'subject') ? String(body.subject || '').trim().toLowerCase() : target.subject,
      difficulty: Object.prototype.hasOwnProperty.call(body, 'difficulty') ? String(body.difficulty || '').trim() : target.difficulty,
      questionText: Object.prototype.hasOwnProperty.call(body, 'questionText') ? String(body.questionText || '').trim() : target.questionText,
      questionFile: Object.prototype.hasOwnProperty.call(body, 'questionFile')
        ? (body.questionFile && typeof body.questionFile === 'object'
          ? {
            name: String(body.questionFile.name || '').trim(),
            mimeType: String(body.questionFile.mimeType || '').trim(),
            size: Number(body.questionFile.size || 0),
            dataUrl: String(body.questionFile.dataUrl || '').trim(),
          }
          : null)
        : target.questionFile,
      solutionText: Object.prototype.hasOwnProperty.call(body, 'solutionText') ? String(body.solutionText || '').trim() : target.solutionText,
      solutionFile: Object.prototype.hasOwnProperty.call(body, 'solutionFile')
        ? (body.solutionFile && typeof body.solutionFile === 'object'
          ? {
            name: String(body.solutionFile.name || '').trim(),
            mimeType: String(body.solutionFile.mimeType || '').trim(),
            size: Number(body.solutionFile.size || 0),
            dataUrl: String(body.solutionFile.dataUrl || '').trim(),
          }
          : null)
        : target.solutionFile,
      updatedAt: new Date().toISOString(),
    };

    if (!updated.subject) {
      throw new Error('subject is required.');
    }
    if (!updated.questionText && !updated.questionFile) {
      throw new Error('Provide question text or a question file.');
    }
    if (!updated.solutionText && !updated.solutionFile) {
      throw new Error('Provide solution text or a solution file.');
    }

    db.practiceBoardQuestions[index] = updated;
    writeDb(db);
    return { question: serializePracticeBoardQuestion(updated) } as T;
  }

  if (/^\/api\/admin\/practice-board\/questions\/[^/]+$/.test(url.pathname) && method === 'DELETE') {
    const { db } = requireAdmin(token);
    const questionId = url.pathname.split('/')[5];
    const exists = db.practiceBoardQuestions.some((item) => item.id === questionId);
    if (!exists) {
      throw new Error('Practice board question not found.');
    }
    db.practiceBoardQuestions = db.practiceBoardQuestions.filter((item) => item.id !== questionId);
    writeDb(db);
    return { ok: true, removedQuestionId: questionId } as T;
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
      part: Object.prototype.hasOwnProperty.call(body, 'part') ? String(body.part) : target.part,
      chapter: Object.prototype.hasOwnProperty.call(body, 'chapter') ? String(body.chapter) : target.chapter,
      section: Object.prototype.hasOwnProperty.call(body, 'section') ? String(body.section) : target.section,
      topic: Object.prototype.hasOwnProperty.call(body, 'topic') ? String(body.topic) : target.topic,
      question: Object.prototype.hasOwnProperty.call(body, 'question') ? String(body.question) : target.question,
      questionImageUrl: Object.prototype.hasOwnProperty.call(body, 'questionImageUrl') ? String(body.questionImageUrl) : target.questionImageUrl,
      answer: Object.prototype.hasOwnProperty.call(body, 'answer') ? String(body.answer) : target.answer,
      tip: Object.prototype.hasOwnProperty.call(body, 'tip') ? String(body.tip) : target.tip,
      difficulty: Object.prototype.hasOwnProperty.call(body, 'difficulty') ? String(body.difficulty) as Difficulty : target.difficulty,
      options: Array.isArray(body.options) ? body.options.map((item: unknown) => String(item)) : target.options,
    };

    if (!updated.question || !updated.answer || !updated.options || updated.options.length < 2) {
      throw new Error('question, answer, and at least 2 options are required.');
    }

    mcqs[index] = updated;
    cachedMcqs = [...mcqs];
    return { mcq: updated } as T;
  }

  if (/^\/api\/admin\/mcqs\/[^/]+$/.test(url.pathname) && method === 'DELETE') {
    requireAdmin(token);
    const mcqId = url.pathname.split('/')[4];
    const mcqs = await loadMcqs();
    const remaining = mcqs.filter((item) => item.id !== mcqId);
    cachedMcqs = [...remaining];
    return { ok: true, removedMcqId: mcqId } as T;
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
