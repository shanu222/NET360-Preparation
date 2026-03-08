import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../app/components/ui/tabs';
import { Badge } from '../app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Textarea } from '../app/components/ui/textarea';
import { toast } from 'sonner';
import { Preparation } from '../app/components/Preparation';
import type { SubjectKey } from '../app/lib/mcq';

const FLAT_TOPIC_SUBJECTS = new Set(['quantitative-mathematics', 'design-aptitude']);

type SelectedHierarchy =
  | {
      kind: 'section';
      subject: SubjectKey;
      part: 'part1' | 'part2';
      chapterTitle: string;
      sectionTitle: string;
    }
  | {
      kind: 'flat-topic';
      subject: 'quantitative-mathematics' | 'design-aptitude';
      chapterTitle: '';
      sectionTitle: string;
    };

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'student' | 'admin';
  createdAt: string | null;
}

interface AdminOverview {
  usersCount: number;
  mcqCount: number;
  attemptsCount: number;
  averageScore: number;
  pendingSignupRequests?: number;
  pendingQuestionSubmissions?: number;
}

interface AdminQuestionSubmissionAttachment {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface AdminQuestionSubmission {
  id: string;
  subject: string;
  questionText: string;
  questionDescription?: string;
  questionSource?: string;
  submissionReason?: string;
  attachments: AdminQuestionSubmissionAttachment[];
  status: 'pending' | 'approved' | 'rejected';
  queuedForBank?: boolean;
  submittedByName?: string;
  submittedByEmail?: string;
  submittedByUserId?: string;
  submittedByClientId?: string;
  actorKey?: string;
  moderation?: {
    result?: 'approved' | 'rejected' | 'manual-override';
    reasons?: string[];
    score?: number;
    blockedActor?: boolean;
    reviewedAt?: string | null;
  };
  reviewNotes?: string;
  reviewedByEmail?: string;
  reviewedAt?: string | null;
  createdAt?: string | null;
}

interface AdminContributionPolicy {
  maxSubmissionsPerDay: number;
  maxFilesPerSubmission: number;
  maxFileSizeBytes: number;
  blockDurationMinutes: number;
  updatedByEmail?: string;
}

interface SignupRequest {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobileNumber: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'hbl';
  paymentTransactionId: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
}

interface AdminMCQ {
  id: string;
  subject: string;
  part?: string;
  chapter?: string;
  section?: string;
  topic: string;
  question: string;
  questionImageUrl?: string;
  options: string[];
  answer: string;
  tip: string;
  difficulty: string;
}

interface AdminPracticeBoardQuestion {
  id: string;
  subject: string;
  chapter: string;
  section: string;
  difficulty: string;
  questionText: string;
  questionImageUrl?: string;
  solutionText: string;
  solutionImageUrl?: string;
}

interface AdminSubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  billingCycle: string;
  pricePkr: number;
  dailyAiLimit: number;
}

interface AdminSubscriptionOverview {
  totalUsers: number;
  activeUsers: number;
  expiredUsers: number;
  plans: AdminSubscriptionPlan[];
  dailyUsage: Array<{
    day: string;
    chatCount: number;
    solverCount: number;
    tokenConsumed: number;
  }>;
}

interface AdminSubscriptionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  subscription: {
    status: string;
    planId: string;
    billingCycle: string;
    isActive: boolean;
    planName: string;
    dailyAiLimit: number;
    paymentReference?: string;
    expiresAt?: string | null;
  };
}

interface AdminCommunityReport {
  id: string;
  connectionId: string;
  reporterUserId: string;
  reportedUserId: string;
  reason: string;
  status: string;
  moderation?: {
    result?: string;
    reasons?: string[];
    score?: number;
    violatorUserId?: string;
    autoBlocked?: boolean;
    reviewedAt?: string | null;
    reviewedByEmail?: string;
  };
  chatSnapshot: Array<{
    senderUserId: string;
    text: string;
    createdAt?: string | null;
  }>;
  createdAt: string | null;
}

interface LoginUser {
  id: string;
  role?: 'student' | 'admin';
}

interface ParsedBulkMcq {
  question: string;
  questionImageUrl: string;
  options: string[];
  answer: string;
  tip: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

type BulkDeleteMode = 'all' | 'subject' | 'chapter' | 'section-topic';

const TOKEN_KEY = 'net360-admin-access-token';
const REFRESH_TOKEN_KEY = 'net360-admin-refresh-token';

function emptyForm() {
  return {
    id: '',
    subject: 'mathematics',
    part: 'part1',
    chapter: '',
    section: '',
    topic: 'General',
    question: '',
    questionImageUrl: '',
    options: 'Option A\nOption B\nOption C\nOption D',
    answer: '',
    tip: '',
    difficulty: 'Medium',
  };
}

function emptyPracticeForm() {
  return {
    id: '',
    subject: 'mathematics',
    chapter: '',
    section: '',
    difficulty: 'Medium',
    questionText: '',
    questionImageUrl: '',
    solutionText: '',
    solutionImageUrl: '',
  };
}

function parseBulkMcqs(raw: string): { parsed: ParsedBulkMcq[]; errors: string[] } {
  const text = String(raw || '').replace(/\r\n/g, '\n').trim();
  if (!text) return { parsed: [], errors: ['Paste questions before uploading.'] };

  const starts: Array<{ index: number; number: string }> = [];
  const startRegex = /^\s*(\d{1,3})\s*[\).:-]\s+/gm;
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

  const blocks: Array<{ number: string; content: string }> = starts.map((entry, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return {
      number: entry.number,
      content: text.slice(entry.index, end).trim(),
    };
  });

  const errors: string[] = [];
  const parsed: ParsedBulkMcq[] = [];

  blocks.forEach((block) => {
    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) {
      errors.push(`Q${block.number}: empty block.`);
      return;
    }

    lines[0] = lines[0].replace(/^\d{1,3}\s*[\).:-]\s*/, '').trim();

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

      const imageMatch = line.match(/^(?:image|img|question\s*image)\s*[:=-]\s*(https?:\/\/\S+)$/i) ||
        line.match(/^!\[[^\]]*\]\((https?:\/\/[^\)\s]+)\)$/i);
      if (imageMatch) {
        questionImageUrl = imageMatch[1].trim();
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|answer)\s*[:=-]\s*(.+)$/i);
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

      const optionMatch = line.match(/^(?:option\s*)?([A-Fa-f]|\d{1,2})\s*[\).:-]\s*(.+)$/);
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
    if (options.length < 4) {
      errors.push(`Q${block.number}: at least 4 options are required.`);
      return;
    }

    const normalizedAnswer = answer.trim();
    if (!normalizedAnswer) {
      errors.push(`Q${block.number}: correct answer is missing.`);
      return;
    }

    let resolvedAnswer = normalizedAnswer;
    const answerLetter = normalizedAnswer.match(/^([A-Fa-f])(?:\b|\)|\.)?/);
    if (answerLetter) {
      const idx = answerLetter[1].toUpperCase().charCodeAt(0) - 65;
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

export default function AdminApp() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [selectedHierarchy, setSelectedHierarchy] = useState<SelectedHierarchy | null>(null);
  const [subscriptionOverview, setSubscriptionOverview] = useState<AdminSubscriptionOverview | null>(null);
  const [subscriptionUsers, setSubscriptionUsers] = useState<AdminSubscriptionUser[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [practiceQuestions, setPracticeQuestions] = useState<AdminPracticeBoardQuestion[]>([]);
  const [practiceQuery, setPracticeQuery] = useState('');
  const [practiceForm, setPracticeForm] = useState(emptyPracticeForm());
  const [bulkInput, setBulkInput] = useState('');
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState<BulkDeleteMode>('section-topic');
  const [bulkDeleteSubject, setBulkDeleteSubject] = useState('mathematics');
  const [bulkDeleteChapter, setBulkDeleteChapter] = useState('');
  const [bulkDeleteSectionOrTopic, setBulkDeleteSectionOrTopic] = useState('');
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [questionSubmissions, setQuestionSubmissions] = useState<AdminQuestionSubmission[]>([]);
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState('all');
  const [submissionSubjectFilter, setSubmissionSubjectFilter] = useState('all');
  const [submissionQuery, setSubmissionQuery] = useState('');
  const [submissionReviewNotes, setSubmissionReviewNotes] = useState<Record<string, string>>({});
  const [communityReports, setCommunityReports] = useState<AdminCommunityReport[]>([]);
  const [communityReportNotes, setCommunityReportNotes] = useState<Record<string, string>>({});
  const [contributionPolicy, setContributionPolicy] = useState<AdminContributionPolicy>({
    maxSubmissionsPerDay: 5,
    maxFilesPerSubmission: 3,
    maxFileSizeBytes: 1024 * 1024,
    blockDurationMinutes: 180,
  });

  const filteredMcqs = useMemo(() => {
    if (!query.trim()) return mcqs;
    const needle = query.toLowerCase();
    return mcqs.filter((item) =>
      [item.subject, item.part, item.chapter, item.section, item.topic, item.question, item.difficulty]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [mcqs, query]);

  const filteredPracticeQuestions = useMemo(() => {
    if (!practiceQuery.trim()) return practiceQuestions;
    const needle = practiceQuery.toLowerCase();
    return practiceQuestions.filter((item) =>
      [item.subject, item.chapter, item.section, item.difficulty, item.questionText, item.solutionText]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [practiceQuestions, practiceQuery]);

  const filteredQuestionSubmissions = useMemo(() => {
    const needle = submissionQuery.trim().toLowerCase();

    return questionSubmissions.filter((item) => {
      if (submissionStatusFilter !== 'all' && item.status !== submissionStatusFilter) return false;
      if (submissionSubjectFilter !== 'all' && item.subject.toLowerCase() !== submissionSubjectFilter.toLowerCase()) return false;
      if (!needle) return true;

      const blob = [
        item.subject,
        item.questionText,
        item.questionDescription,
        item.questionSource,
        item.submissionReason,
        item.submittedByName,
        item.submittedByEmail,
        item.reviewNotes,
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [questionSubmissions, submissionStatusFilter, submissionSubjectFilter, submissionQuery]);

  const submissionSubjects = useMemo(() => {
    return Array.from(new Set(questionSubmissions.map((item) => item.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [questionSubmissions]);

  const authToken = token;

  const clearAdminSession = () => {
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  };

  const loadAdminData = async (activeToken: string) => {
    const [
      overviewPayload,
      usersPayload,
      requestPayload,
      mcqPayload,
      practicePayload,
      submissionPayload,
      policyPayload,
      subscriptionOverviewPayload,
      subscriptionUsersPayload,
      communityReportsPayload,
    ] = await Promise.all([
      apiRequest<AdminOverview>('/api/admin/overview', {}, activeToken),
      apiRequest<{ users: AdminUser[] }>('/api/admin/users', {}, activeToken),
      apiRequest<{ requests: SignupRequest[] }>('/api/admin/signup-requests?status=all', {}, activeToken),
      apiRequest<{ mcqs: AdminMCQ[] }>('/api/admin/mcqs', {}, activeToken),
      apiRequest<{ questions: AdminPracticeBoardQuestion[] }>('/api/admin/practice-board/questions', {}, activeToken).catch(() => ({ questions: [] })),
      apiRequest<{ submissions: AdminQuestionSubmission[] }>('/api/admin/question-submissions?status=all', {}, activeToken).catch(() => ({ submissions: [] })),
      apiRequest<{ policy: AdminContributionPolicy }>('/api/admin/question-submissions/policy', {}, activeToken).catch(() => ({
        policy: {
          maxSubmissionsPerDay: 5,
          maxFilesPerSubmission: 3,
          maxFileSizeBytes: 1024 * 1024,
          blockDurationMinutes: 180,
        },
      })),
      apiRequest<AdminSubscriptionOverview>('/api/admin/subscriptions/overview', {}, activeToken).catch(() => ({
        totalUsers: 0,
        activeUsers: 0,
        expiredUsers: 0,
        plans: [],
        dailyUsage: [],
      })),
      apiRequest<{ users: AdminSubscriptionUser[] }>(`/api/admin/subscriptions/users?status=${subscriptionFilter}`, {}, activeToken).catch(() => ({ users: [] })),
      apiRequest<{ reports: AdminCommunityReport[] }>('/api/admin/community/reports', {}, activeToken).catch(() => ({ reports: [] })),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setSignupRequests(requestPayload.requests || []);
    setMcqs(mcqPayload.mcqs || []);
    setPracticeQuestions(practicePayload.questions || []);
    setQuestionSubmissions(submissionPayload.submissions || []);
    setContributionPolicy(policyPayload.policy || {
      maxSubmissionsPerDay: 5,
      maxFilesPerSubmission: 3,
      maxFileSizeBytes: 1024 * 1024,
      blockDurationMinutes: 180,
    });
    setSubscriptionOverview(subscriptionOverviewPayload);
    setSubscriptionUsers(subscriptionUsersPayload.users || []);
    setCommunityReports(communityReportsPayload.reports || []);
  };

  const loadSectionMcqs = async (
    activeToken: string,
    sectionPath: SelectedHierarchy,
  ) => {
    const params = new URLSearchParams({ subject: sectionPath.subject });
    if (sectionPath.kind === 'section') {
      params.set('part', sectionPath.part);
      params.set('chapter', sectionPath.chapterTitle);
      params.set('section', sectionPath.sectionTitle);
    } else {
      params.set('topic', sectionPath.sectionTitle);
    }

    const payload = await apiRequest<{ mcqs: AdminMCQ[] }>(`/api/admin/mcqs?${params.toString()}`, {}, activeToken);
    setMcqs(payload.mcqs || []);
  };

  useEffect(() => {
    if (!authToken) {
      setReady(true);
      return;
    }
    const currentToken: string = authToken;
    const currentRefreshToken: string | null = refreshToken;

    let cancelled = false;

    async function bootstrap() {
      try {
        await loadAdminData(currentToken);
      } catch (error) {
        if (!cancelled) {
          const status = Number((error as { status?: number } | null)?.status || 0);
          const shouldTryRefresh = Boolean(currentRefreshToken) && (status === 401 || status === 403);

          if (shouldTryRefresh && currentRefreshToken) {
            try {
              const refreshed = await apiRequest<{ token: string; refreshToken: string; user: LoginUser }>('/api/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refreshToken: currentRefreshToken }),
              });

              if (refreshed.user?.role !== 'admin') {
                clearAdminSession();
                return;
              }

              setToken(refreshed.token);
              setRefreshToken(refreshed.refreshToken);
              localStorage.setItem(TOKEN_KEY, refreshed.token);
              localStorage.setItem(REFRESH_TOKEN_KEY, refreshed.refreshToken);
              await loadAdminData(refreshed.token);
              return;
            } catch {
              clearAdminSession();
              return;
            }
          }

          if (status === 401 || status === 403) {
            clearAdminSession();
          } else {
            toast.error('Could not load admin data. Please try refreshing again.');
          }
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [authToken, refreshToken, subscriptionFilter]);

  useEffect(() => {
    if (!selectedHierarchy) return;
    setBulkDeleteSubject(selectedHierarchy.subject);
    if (selectedHierarchy.kind === 'section') {
      setBulkDeleteChapter(selectedHierarchy.chapterTitle);
      setBulkDeleteSectionOrTopic(selectedHierarchy.sectionTitle);
    } else {
      setBulkDeleteChapter('');
      setBulkDeleteSectionOrTopic(selectedHierarchy.sectionTitle);
    }
  }, [selectedHierarchy]);

  const login = async () => {
    if (!authForm.email || !authForm.password) {
      toast.error('Email and password are required.');
      return;
    }

    try {
      setLoading(true);
      const payload = await apiRequest<{ token: string; refreshToken: string; user: LoginUser }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(authForm),
      });

      if (payload.user?.role !== 'admin') {
        toast.error('Admin access required for this panel.');
        return;
      }

      localStorage.setItem(TOKEN_KEY, payload.token);
      localStorage.setItem(REFRESH_TOKEN_KEY, payload.refreshToken);
      setToken(payload.token);
      setRefreshToken(payload.refreshToken);
      await loadAdminData(payload.token);
      toast.success('Admin login successful.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Admin login failed.');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    if (refreshToken) {
      void apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearAdminSession();
  };

  const removeUser = async (user: AdminUser) => {
    if (!authToken) return;
    if (user.role === 'admin') {
      toast.error('For safety, admin accounts cannot be removed from this panel.');
      return;
    }
    if (!window.confirm(`Remove ${user.email}? They will have to login/register again.`)) return;

    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' }, authToken);
      toast.success('User removed successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove user.');
    }
  };

  const approveSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ requestId: string; token: { code: string; expiresAt: string } }>(
        `/api/admin/signup-requests/${request.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment verified by admin.' }),
        },
        authToken,
      );
      setIssuedTokens((prev) => ({ ...prev, [request.id]: payload.token.code }));
      toast.success(`Approved. Token: ${payload.token.code}`);
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve request.');
    }
  };

  const rejectSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    try {
      await apiRequest(`/api/admin/signup-requests/${request.id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Payment could not be verified.' }),
      }, authToken);
      toast.success('Request rejected.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject request.');
    }
  };

  const copyToken = async (tokenCode: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tokenCode);
      } else {
        const temp = document.createElement('textarea');
        temp.value = tokenCode;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Token copied to clipboard.');
    } catch {
      toast.error('Could not copy token.');
    }
  };

  const sendTokenBySms = (mobileNumber: string, tokenCode: string, email: string) => {
    const target = String(mobileNumber || '').trim();
    if (!target) {
      toast.error('Mobile number is missing for this request.');
      return;
    }

    const message = `NET360 approval token for ${email}: ${tokenCode}. Use this token to complete signup.`;
    const smsUrl = `sms:${encodeURIComponent(target)}?body=${encodeURIComponent(message)}`;
    window.location.href = smsUrl;
  };

  const resetForm = () => {
    const fresh = emptyForm();
    if (selectedHierarchy) {
      fresh.subject = selectedHierarchy.subject;
      if (selectedHierarchy.kind === 'section') {
        fresh.part = selectedHierarchy.part;
        fresh.chapter = selectedHierarchy.chapterTitle;
        fresh.section = selectedHierarchy.sectionTitle;
        fresh.topic = `${selectedHierarchy.chapterTitle} - ${selectedHierarchy.sectionTitle}`;
      } else {
        fresh.part = '';
        fresh.chapter = '';
        fresh.section = selectedHierarchy.sectionTitle;
        fresh.topic = selectedHierarchy.sectionTitle;
      }
    }
    setForm(fresh);
  };

  const saveMcq = async () => {
    if (!authToken) return;

    const options = form.options
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (!form.question.trim() || !form.answer.trim() || options.length < 4) {
      toast.error('Question, answer, and at least 4 options are required.');
      return;
    }

    const normalizedSubject = String(form.subject || '').toLowerCase().trim();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizedSubject);

    if (!normalizedSubject) {
      toast.error('Subject is required before adding MCQs.');
      return;
    }

    if (!isFlatTopicSubject && (!form.part || !form.chapter.trim() || !form.section.trim())) {
      toast.error('Select subject, part, chapter, and section before adding MCQs.');
      return;
    }

    if (isFlatTopicSubject && !form.topic.trim()) {
      toast.error('Topic is required for this subject.');
      return;
    }

    const payload = {
      subject: normalizedSubject,
      part: isFlatTopicSubject ? '' : form.part,
      chapter: isFlatTopicSubject ? '' : form.chapter,
      section: isFlatTopicSubject ? (form.section || form.topic) : form.section,
      topic: form.topic,
      question: form.question,
      questionImageUrl: form.questionImageUrl,
      options,
      answer: form.answer,
      tip: form.tip,
      difficulty: form.difficulty,
    };

    try {
      if (form.id) {
        await apiRequest(`/api/admin/mcqs/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('MCQ updated.');
      } else {
        await apiRequest('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('MCQ added.');
      }

      resetForm();
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      } else {
        await loadAdminData(authToken);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save MCQ.');
    }
  };

  const uploadBulkMcqs = async () => {
    if (!authToken) return;
    if (!selectedHierarchy) {
      toast.error('Select a section/topic first before bulk upload.');
      return;
    }

    const { parsed, errors } = parseBulkMcqs(bulkInput);
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }

    if (!parsed.length) {
      toast.error('No questions were parsed.');
      return;
    }

    if (parsed.length > 50) {
      toast.error('You can upload at most 50 questions at once.');
      return;
    }

    const contextPayload =
      selectedHierarchy.kind === 'section'
        ? {
            subject: selectedHierarchy.subject,
            part: selectedHierarchy.part,
            chapter: selectedHierarchy.chapterTitle,
            section: selectedHierarchy.sectionTitle,
            topic: `${selectedHierarchy.chapterTitle} - ${selectedHierarchy.sectionTitle}`,
          }
        : {
            subject: selectedHierarchy.subject,
            part: '',
            chapter: '',
            section: selectedHierarchy.sectionTitle,
            topic: selectedHierarchy.sectionTitle,
          };

    try {
      setBulkUploading(true);

      for (const item of parsed) {
        await apiRequest('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify({
            ...contextPayload,
            question: item.question,
            questionImageUrl: item.questionImageUrl,
            options: item.options,
            answer: item.answer,
            tip: item.tip,
            difficulty: item.difficulty,
          }),
        }, authToken);
      }

      toast.success(`${parsed.length} MCQ(s) uploaded successfully.`);
      setBulkInput('');
      await loadSectionMcqs(authToken, selectedHierarchy);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk upload failed.');
    } finally {
      setBulkUploading(false);
    }
  };

  const deleteMcq = async (mcqId: string) => {
    if (!authToken) return;
    if (!window.confirm('Delete this MCQ from the bank?')) return;

    try {
      await apiRequest(`/api/admin/mcqs/${mcqId}`, { method: 'DELETE' }, authToken);
      toast.success('MCQ removed.');
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      } else {
        await loadAdminData(authToken);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete MCQ.');
    }
  };

  const bulkDeleteMcqs = async () => {
    if (!authToken) return;

    const subject = String(bulkDeleteSubject || '').trim().toLowerCase();
    const chapter = String(bulkDeleteChapter || '').trim();
    const sectionOrTopic = String(bulkDeleteSectionOrTopic || '').trim();

    if (bulkDeleteMode === 'subject' && !subject) {
      toast.error('Select or type a subject for subject-level deletion.');
      return;
    }

    if (bulkDeleteMode === 'chapter' && (!subject || !chapter)) {
      toast.error('Subject and chapter are required for chapter-level deletion.');
      return;
    }

    if (bulkDeleteMode === 'section-topic' && (!subject || !sectionOrTopic)) {
      toast.error('Subject and section/topic are required for section/topic deletion.');
      return;
    }

    const summary =
      bulkDeleteMode === 'all'
        ? 'all MCQs in the application'
        : bulkDeleteMode === 'subject'
          ? `all MCQs in subject "${subject}"`
          : bulkDeleteMode === 'chapter'
            ? `all MCQs in chapter "${chapter}" under subject "${subject}"`
            : `all MCQs in section/topic "${sectionOrTopic}"${chapter ? ` under chapter "${chapter}"` : ''} and subject "${subject}"`;

    const confirmed = window.confirm(`Are you sure you want to permanently delete ${summary}? This action cannot be undone.`);
    if (!confirmed) return;

    try {
      setBulkDeleting(true);
      const payload = await apiRequest<{ ok: boolean; removed: number }>(
        '/api/admin/mcqs/bulk-delete',
        {
          method: 'POST',
          body: JSON.stringify({
            mode: bulkDeleteMode,
            subject,
            chapter,
            sectionOrTopic,
          }),
        },
        authToken,
      );

      toast.success(`${payload.removed || 0} MCQ(s) deleted.`);
      await loadAdminData(authToken);
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not bulk delete MCQs.');
    } finally {
      setBulkDeleting(false);
    }
  };

  const updateUserSubscription = async (userId: string, planId: string, status: string) => {
    if (!authToken) return;
    try {
      await apiRequest(
        `/api/admin/subscriptions/${userId}/update`,
        {
          method: 'POST',
          body: JSON.stringify({
            planId,
            status,
            paymentReference: `admin-${Date.now()}`,
          }),
        },
        authToken,
      );
      toast.success('Subscription updated successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update subscription.');
    }
  };

  const resetPracticeForm = () => {
    setPracticeForm(emptyPracticeForm());
  };

  const savePracticeQuestion = async () => {
    if (!authToken) return;

    if (!practiceForm.subject.trim() || !practiceForm.chapter.trim() || !practiceForm.section.trim()) {
      toast.error('Subject, chapter, and section are required.');
      return;
    }

    if (!practiceForm.questionText.trim() && !practiceForm.questionImageUrl.trim()) {
      toast.error('Provide question text or question image URL.');
      return;
    }

    if (!practiceForm.solutionText.trim() && !practiceForm.solutionImageUrl.trim()) {
      toast.error('Provide solution text or solution image URL.');
      return;
    }

    const payload = {
      subject: practiceForm.subject.toLowerCase().trim(),
      chapter: practiceForm.chapter.trim(),
      section: practiceForm.section.trim(),
      difficulty: practiceForm.difficulty,
      questionText: practiceForm.questionText.trim(),
      questionImageUrl: practiceForm.questionImageUrl.trim(),
      solutionText: practiceForm.solutionText.trim(),
      solutionImageUrl: practiceForm.solutionImageUrl.trim(),
    };

    try {
      if (practiceForm.id) {
        await apiRequest(`/api/admin/practice-board/questions/${practiceForm.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('Practice board question updated.');
      } else {
        await apiRequest('/api/admin/practice-board/questions', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);
        toast.success('Practice board question added.');
      }

      resetPracticeForm();
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save practice board question.');
    }
  };

  const deletePracticeQuestion = async (questionId: string) => {
    if (!authToken) return;
    if (!window.confirm('Delete this practice board question?')) return;

    try {
      await apiRequest(`/api/admin/practice-board/questions/${questionId}`, { method: 'DELETE' }, authToken);
      toast.success('Practice board question removed.');
      if (practiceForm.id === questionId) {
        resetPracticeForm();
      }
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete practice board question.');
    }
  };

  const reviewQuestionSubmission = async (
    submissionId: string,
    status: 'approved' | 'rejected',
  ) => {
    if (!authToken) return;

    const notes = String(submissionReviewNotes[submissionId] || '').trim();
    try {
      await apiRequest(
        `/api/admin/question-submissions/${submissionId}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            status,
            reviewNotes: notes,
          }),
        },
        authToken,
      );
      toast.success('Submission review updated.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update submission review.');
    }
  };

  const saveContributionPolicy = async () => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ policy: AdminContributionPolicy }>(
        '/api/admin/question-submissions/policy',
        {
          method: 'PUT',
          body: JSON.stringify({
            maxSubmissionsPerDay: contributionPolicy.maxSubmissionsPerDay,
            maxFilesPerSubmission: contributionPolicy.maxFilesPerSubmission,
            maxFileSizeBytes: contributionPolicy.maxFileSizeBytes,
            blockDurationMinutes: contributionPolicy.blockDurationMinutes,
          }),
        },
        authToken,
      );
      setContributionPolicy(payload.policy);
      toast.success('Submission policy updated.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update policy.');
    }
  };

  const reviewCommunityReport = async (report: AdminCommunityReport, action: 'block' | 'dismiss') => {
    if (!authToken) return;

    const notes = String(communityReportNotes[report.id] || '').trim();
    const defaultViolator = String(report.moderation?.violatorUserId || report.reportedUserId || '').trim();

    try {
      await apiRequest(
        `/api/admin/community/reports/${report.id}/review`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
            notes,
            violatorUserId: defaultViolator,
          }),
        },
        authToken,
      );
      toast.success(action === 'block' ? 'User blocked from community.' : 'Report dismissed.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not review community report.');
    }
  };

  const handleSectionSelection = async (selection: {
    subject: SubjectKey;
    part: 'part1' | 'part2';
    chapterTitle: string;
    sectionTitle: string;
  }) => {
    if (!authToken) return;

    const normalizedSelection: SelectedHierarchy = {
      kind: 'section',
      ...selection,
    };
    setSelectedHierarchy(normalizedSelection);
    setForm((prev) => ({
      ...prev,
      subject: selection.subject,
      part: selection.part,
      chapter: selection.chapterTitle,
      section: selection.sectionTitle,
      topic: `${selection.chapterTitle} - ${selection.sectionTitle}`,
    }));

    try {
      await loadSectionMcqs(authToken, normalizedSelection);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load section MCQs.');
    }
  };

  const handleFlatTopicSelection = async (selection: {
    tabKey: 'quantitative-mathematics' | 'design-aptitude';
    subject: 'quantitative-mathematics' | 'design-aptitude';
    topicTitle: string;
  }) => {
    if (!authToken) return;

    const normalizedSelection: SelectedHierarchy = {
      kind: 'flat-topic',
      subject: selection.subject,
      chapterTitle: '',
      sectionTitle: selection.topicTitle,
    };

    setSelectedHierarchy(normalizedSelection);
    setForm((prev) => ({
      ...prev,
      subject: selection.subject,
      part: '',
      chapter: '',
      section: selection.topicTitle,
      topic: selection.topicTitle,
    }));

    try {
      await loadSectionMcqs(authToken, normalizedSelection);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load topic MCQs.');
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen p-5 flex items-center justify-center">
        <Card>
          <CardContent className="py-8">Loading admin panel...</CardContent>
        </Card>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="min-h-screen p-5 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>NET360 Admin Panel</CardTitle>
            <CardDescription>Separate management panel (outside student app)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email">Admin Email</Label>
              <Input
                id="admin-email"
                type="email"
                value={authForm.email}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                value={authForm.password}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, password: e.target.value }))}
              />
            </div>
            <Button className="w-full" onClick={login} disabled={loading}>
              {loading ? 'Signing in...' : 'Login'}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-3 sm:p-5">
      <div className="mx-auto w-full max-w-[1700px] space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>NET360 Admin Management</h1>
          <p className="text-sm text-muted-foreground">Manage users and MCQs from this separate panel</p>
        </div>
        <Button variant="outline" onClick={logout}>Logout</Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric title="Registered Users" value={String(overview?.usersCount || 0)} />
        <Metric title="Question Bank" value={String(overview?.mcqCount || 0)} />
        <Metric title="Attempts" value={String(overview?.attemptsCount || 0)} />
        <Metric title="Average Score" value={`${overview?.averageScore || 0}%`} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric title="Pending Signup Requests" value={String(overview?.pendingSignupRequests || 0)} />
        <Metric title="Approved Requests" value={String(signupRequests.filter((item) => item.status === 'approved').length)} />
        <Metric title="Completed Signups" value={String(signupRequests.filter((item) => item.status === 'completed').length)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric title="Pending User Submissions" value={String(overview?.pendingQuestionSubmissions || 0)} />
        <Metric title="Approved Submissions" value={String(questionSubmissions.filter((item) => item.status === 'approved').length)} />
        <Metric title="Rejected Submissions" value={String(questionSubmissions.filter((item) => item.status === 'rejected').length)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric title="Active Subscriptions" value={String(subscriptionOverview?.activeUsers || 0)} />
        <Metric title="Expired/Inactive" value={String(subscriptionOverview?.expiredUsers || 0)} />
        <Metric title="Tracked Users" value={String(subscriptionOverview?.totalUsers || 0)} />
      </div>

      <Tabs defaultValue="users" className="w-full min-w-0 space-y-4">
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex h-auto min-w-max gap-1">
            <TabsTrigger className="min-w-[150px]" value="users">Users</TabsTrigger>
            <TabsTrigger className="min-w-[170px]" value="requests">Signup Requests</TabsTrigger>
            <TabsTrigger className="min-w-[120px]" value="mcqs">MCQs</TabsTrigger>
            <TabsTrigger className="min-w-[150px]" value="practice-board">Practice Board</TabsTrigger>
            <TabsTrigger className="min-w-[140px]" value="submissions">Submissions</TabsTrigger>
            <TabsTrigger className="min-w-[190px]" value="community-moderation">Community Moderation</TabsTrigger>
            <TabsTrigger className="min-w-[150px]" value="subscriptions">Subscriptions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Registered Users</CardTitle>
              <CardDescription>Remove users when needed</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="text-sm">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {[user.firstName, user.lastName].filter(Boolean).join(' ') || 'No name'}
                      {' • '}
                      {user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown date'}
                    </p>
                    <Badge variant="outline" className="mt-1">{user.role}</Badge>
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => void removeUser(user)}>
                    Remove
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="requests" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Payment Approval Requests</CardTitle>
              <CardDescription>Verify transaction IDs and approve to generate signup token.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[520px] overflow-auto">
              {signupRequests.map((request) => (
                <div key={request.id} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm">{request.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Mobile: {request.mobileNumber || 'N/A'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.paymentMethod.toUpperCase()} • Tx ID: {request.paymentTransactionId}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}
                      </p>
                    </div>
                    <Badge variant={request.status === 'pending' ? 'default' : 'outline'}>{request.status}</Badge>
                  </div>

                  {issuedTokens[request.id] ? (
                    <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs text-emerald-700 flex items-center justify-between gap-2">
                      <span>
                        Generated token: <strong>{issuedTokens[request.id]}</strong>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => void copyToken(issuedTokens[request.id])}
                      >
                        Copy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => sendTokenBySms(request.mobileNumber, issuedTokens[request.id], request.email)}
                      >
                        Send SMS
                      </Button>
                    </div>
                  ) : null}

                  {request.status === 'pending' ? (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void approveSignupRequest(request)}>Approve + Generate Token</Button>
                      <Button size="sm" variant="outline" onClick={() => void rejectSignupRequest(request)}>Reject</Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcqs" className="space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>PTB Syllabus Browser (Admin)</CardTitle>
                <CardDescription>
                  Select Subject / Part / Chapter / Section, or choose Quantitative Mathematics/Design Aptitude topics.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[860px] overflow-auto">
                <Preparation
                  onSelectSection={(payload) => void handleSectionSelection(payload)}
                  onSelectFlatTopic={(payload) => void handleFlatTopicSelection(payload)}
                />
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-4">
              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Section MCQ Editor</CardTitle>
                  <CardDescription>
                    {selectedHierarchy
                      ? selectedHierarchy.kind === 'section'
                        ? `${selectedHierarchy.subject} / ${selectedHierarchy.part} / ${selectedHierarchy.chapterTitle} / ${selectedHierarchy.sectionTitle}`
                        : `${selectedHierarchy.subject} / ${selectedHierarchy.sectionTitle}`
                      : 'Pick a section from the syllabus browser first.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3">
                    <p className="text-sm font-medium text-rose-800">Bulk Delete MCQs (Admin Only)</p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Deletion Scope</Label>
                        <Select value={bulkDeleteMode} onValueChange={(value: BulkDeleteMode) => setBulkDeleteMode(value)}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Delete all MCQs</SelectItem>
                            <SelectItem value="subject">Delete by subject</SelectItem>
                            <SelectItem value="chapter">Delete by chapter</SelectItem>
                            <SelectItem value="section-topic">Delete by section/topic</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {bulkDeleteMode !== 'all' ? (
                        <div className="space-y-1.5">
                          <Label>Subject</Label>
                          <Input
                            value={bulkDeleteSubject}
                            onChange={(e) => setBulkDeleteSubject(e.target.value)}
                            placeholder="e.g. mathematics"
                          />
                        </div>
                      ) : null}
                    </div>

                    {bulkDeleteMode === 'chapter' || bulkDeleteMode === 'section-topic' ? (
                      <div className="space-y-1.5">
                        <Label>Chapter</Label>
                        <Input
                          value={bulkDeleteChapter}
                          onChange={(e) => setBulkDeleteChapter(e.target.value)}
                          placeholder="Exact chapter title (optional for section/topic mode)"
                        />
                      </div>
                    ) : null}

                    {bulkDeleteMode === 'section-topic' ? (
                      <div className="space-y-1.5">
                        <Label>Section / Topic</Label>
                        <Input
                          value={bulkDeleteSectionOrTopic}
                          onChange={(e) => setBulkDeleteSectionOrTopic(e.target.value)}
                          placeholder="Exact section or topic title"
                        />
                      </div>
                    ) : null}

                    <div className="flex justify-end">
                      <Button
                        variant="destructive"
                        onClick={() => void bulkDeleteMcqs()}
                        disabled={bulkDeleting}
                      >
                        {bulkDeleting ? 'Deleting...' : 'Delete in Bulk'}
                      </Button>
                    </div>
                  </div>

                  {selectedHierarchy?.kind === 'flat-topic' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Subject</Label>
                        <Input value={form.subject} readOnly />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Topic</Label>
                        <Input value={form.topic || form.section} readOnly />
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Subject</Label>
                          <Input value={form.subject} readOnly />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Part</Label>
                          <Input value={form.part} readOnly />
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Chapter</Label>
                          <Input value={form.chapter} readOnly />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Section</Label>
                          <Input value={form.section} readOnly />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="space-y-1.5">
                    <Label>Question</Label>
                    <Textarea
                      value={form.question}
                      onChange={(e) => setForm((prev) => ({ ...prev, question: e.target.value }))}
                      className="min-h-[95px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Optional Image URL (diagram/equation)</Label>
                    <Input
                      value={form.questionImageUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, questionImageUrl: e.target.value }))}
                      placeholder="https://..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Options (one per line, minimum 4)</Label>
                    <Textarea
                      value={form.options}
                      onChange={(e) => setForm((prev) => ({ ...prev, options: e.target.value }))}
                      className="min-h-[120px]"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Correct Answer</Label>
                      <Input value={form.answer} onChange={(e) => setForm((prev) => ({ ...prev, answer: e.target.value }))} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Difficulty</Label>
                      <Select value={form.difficulty} onValueChange={(value) => setForm((prev) => ({ ...prev, difficulty: value }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Easy">Easy</SelectItem>
                          <SelectItem value="Medium">Medium</SelectItem>
                          <SelectItem value="Hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Explanation (optional)</Label>
                    <Textarea value={form.tip} onChange={(e) => setForm((prev) => ({ ...prev, tip: e.target.value }))} className="min-h-[90px]" />
                  </div>

                  <div className="space-y-2 rounded-lg border border-indigo-100 bg-indigo-50/30 p-3">
                    <Label>Bulk Paste (1-50 questions)</Label>
                    <Textarea
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="min-h-[180px]"
                      placeholder={[
                        '1. Question text here',
                        'Image: https://example.com/q1.png',
                        'A) Option A',
                        'B) Option B',
                        'C) Option C',
                        'D) Option D',
                        'Answer: B',
                        'Explanation: Why option B is correct',
                        '',
                        '2) Next question...',
                      ].join('\n')}
                    />
                    <Button
                      variant="outline"
                      onClick={() => void uploadBulkMcqs()}
                      disabled={!selectedHierarchy || bulkUploading}
                    >
                      {bulkUploading ? 'Uploading...' : 'Upload'}
                    </Button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void saveMcq()} disabled={!selectedHierarchy}>{form.id ? 'Update' : 'Add'} MCQ</Button>
                    <Button variant="outline" onClick={resetForm}>Clear</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Section MCQ Bank</CardTitle>
                  <CardDescription>Edit or remove questions for the selected section.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="Search MCQs in this view" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <div className="space-y-2 max-h-[460px] overflow-auto">
                    {filteredMcqs.map((item) => (
                      <div key={item.id} className="rounded-lg border p-3">
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            setForm({
                              id: item.id,
                              subject: item.subject,
                              part: item.part || form.part,
                              chapter: item.chapter || '',
                              section: item.section || '',
                              topic: item.topic,
                              question: item.question,
                              questionImageUrl: item.questionImageUrl || '',
                              options: item.options.join('\n'),
                              answer: item.answer,
                              tip: item.tip,
                              difficulty: item.difficulty,
                            });
                          }}
                        >
                          <p className="line-clamp-2 text-sm">{item.question}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.subject} • {item.part || '-'} • {item.chapter || '-'} • {item.section || item.topic}
                          </p>
                        </button>
                        <div className="mt-2 flex justify-end">
                          <Button variant="destructive" size="sm" onClick={() => void deleteMcq(item.id)}>Delete</Button>
                        </div>
                      </div>
                    ))}
                    {!filteredMcqs.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No MCQs in this section yet.
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="subscriptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Subscription Plans</CardTitle>
              <CardDescription>Current plan catalog and daily limits</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {(subscriptionOverview?.plans || []).map((plan) => (
                <div key={plan.id} className="rounded-lg border p-3">
                  <p className="text-sm">{plan.name}</p>
                  <p className="text-xs text-muted-foreground">{plan.tier} - {plan.billingCycle}</p>
                  <p className="text-xs text-muted-foreground">PKR {plan.pricePkr} | Daily limit: {plan.dailyAiLimit}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>User Subscriptions</CardTitle>
              <CardDescription>Filter and update user subscription status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="subscription-status-filter">Status</Label>
                <Select value={subscriptionFilter} onValueChange={setSubscriptionFilter}>
                  <SelectTrigger id="subscription-status-filter" className="w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-auto">
                {subscriptionUsers.map((entry) => (
                  <div key={entry.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm">{entry.email}</p>
                        <p className="text-xs text-muted-foreground">
                          {[entry.firstName, entry.lastName].filter(Boolean).join(' ') || 'No name'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={entry.subscription.isActive ? 'default' : 'outline'}>
                          {entry.subscription.status || 'inactive'}
                        </Badge>
                        <Badge variant="outline">{entry.subscription.planName || entry.subscription.planId || 'No plan'}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-3">
                      <Button
                        size="sm"
                        onClick={() => void updateUserSubscription(entry.id, 'basic_monthly', 'active')}
                      >
                        Activate Basic
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void updateUserSubscription(entry.id, 'pro_monthly', 'active')}
                      >
                        Activate Pro
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void updateUserSubscription(entry.id, entry.subscription.planId || 'basic_monthly', 'inactive')}
                      >
                        Set Inactive
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Mentor Usage (14 Days)</CardTitle>
              <CardDescription>Combined chat and solver activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[360px] overflow-auto">
              {(subscriptionOverview?.dailyUsage || []).map((item) => (
                <div key={item.day} className="rounded-lg border p-3 text-sm">
                  <p>{item.day}</p>
                  <p className="text-xs text-muted-foreground">
                    Chat: {item.chatCount} | Solver: {item.solverCount} | Tokens: {item.tokenConsumed}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="practice-board" className="space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.9fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Practice Board Question Editor</CardTitle>
                <CardDescription>
                  Add long-form conceptual questions with text/image combinations for both prompt and solution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Subject</Label>
                    <Select
                      value={practiceForm.subject}
                      onValueChange={(value) => setPracticeForm((prev) => ({ ...prev, subject: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mathematics">Mathematics</SelectItem>
                        <SelectItem value="physics">Physics</SelectItem>
                        <SelectItem value="chemistry">Chemistry</SelectItem>
                        <SelectItem value="biology">Biology</SelectItem>
                        <SelectItem value="english">English</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Difficulty</Label>
                    <Select
                      value={practiceForm.difficulty}
                      onValueChange={(value) => setPracticeForm((prev) => ({ ...prev, difficulty: value }))}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Easy">Easy</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="Hard">Hard</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Chapter</Label>
                    <Input
                      value={practiceForm.chapter}
                      onChange={(e) => setPracticeForm((prev) => ({ ...prev, chapter: e.target.value }))}
                      placeholder="e.g. Thermodynamics"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Section</Label>
                    <Input
                      value={practiceForm.section}
                      onChange={(e) => setPracticeForm((prev) => ({ ...prev, section: e.target.value }))}
                      placeholder="e.g. First Law Applications"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Question Text</Label>
                  <Textarea
                    value={practiceForm.questionText}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, questionText: e.target.value }))}
                    className="min-h-[120px]"
                    placeholder="Type the conceptual problem statement..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Question Image URL (optional)</Label>
                  <Input
                    value={practiceForm.questionImageUrl}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, questionImageUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Solution Text</Label>
                  <Textarea
                    value={practiceForm.solutionText}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, solutionText: e.target.value }))}
                    className="min-h-[120px]"
                    placeholder="Type the complete answer/explanation..."
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Solution Image URL (optional)</Label>
                  <Input
                    value={practiceForm.solutionImageUrl}
                    onChange={(e) => setPracticeForm((prev) => ({ ...prev, solutionImageUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void savePracticeQuestion()}>
                    {practiceForm.id ? 'Update' : 'Add'} Practice Question
                  </Button>
                  <Button variant="outline" onClick={resetPracticeForm}>Clear</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Practice Board Question Bank</CardTitle>
                <CardDescription>Edit or remove existing conceptual questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by subject/chapter/section/question..."
                  value={practiceQuery}
                  onChange={(e) => setPracticeQuery(e.target.value)}
                />
                <div className="space-y-2 max-h-[760px] overflow-auto">
                  {filteredPracticeQuestions.map((item) => (
                    <div key={item.id} className="rounded-lg border p-3">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => {
                          setPracticeForm({
                            id: item.id,
                            subject: item.subject,
                            chapter: item.chapter || '',
                            section: item.section || '',
                            difficulty: item.difficulty || 'Medium',
                            questionText: item.questionText || '',
                            questionImageUrl: item.questionImageUrl || '',
                            solutionText: item.solutionText || '',
                            solutionImageUrl: item.solutionImageUrl || '',
                          });
                        }}
                      >
                        <p className="line-clamp-2 text-sm">{item.questionText || '(Image-only question)'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.subject} • {item.chapter || '-'} • {item.section || '-'} • {item.difficulty}
                        </p>
                      </button>
                      <div className="mt-2 flex justify-end">
                        <Button variant="destructive" size="sm" onClick={() => void deletePracticeQuestion(item.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!filteredPracticeQuestions.length ? (
                    <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                      No practice board questions found.
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>User Question Submissions</CardTitle>
              <CardDescription>
                Review community-submitted questions, then approve or reject each submission with feedback.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-medium">Submission Policy</p>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Max submissions/day</Label>
                    <Input
                      type="number"
                      min={1}
                      max={100}
                      value={contributionPolicy.maxSubmissionsPerDay}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxSubmissionsPerDay: Number(e.target.value) || prev.maxSubmissionsPerDay }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max files/submission</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={contributionPolicy.maxFilesPerSubmission}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxFilesPerSubmission: Number(e.target.value) || prev.maxFilesPerSubmission }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Max file size (bytes)</Label>
                    <Input
                      type="number"
                      min={65536}
                      max={10485760}
                      value={contributionPolicy.maxFileSizeBytes}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, maxFileSizeBytes: Number(e.target.value) || prev.maxFileSizeBytes }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Block duration (minutes)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={10080}
                      value={contributionPolicy.blockDurationMinutes}
                      onChange={(e) => setContributionPolicy((prev) => ({ ...prev, blockDurationMinutes: Number(e.target.value) || prev.blockDurationMinutes }))}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">Allowed types are fixed: JPG, PNG, PDF, DOC, DOCX.</p>
                  <Button size="sm" variant="outline" onClick={() => void saveContributionPolicy()}>Save Policy</Button>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={submissionStatusFilter} onValueChange={setSubmissionStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Subject</Label>
                  <Select value={submissionSubjectFilter} onValueChange={setSubmissionSubjectFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All subjects</SelectItem>
                      {submissionSubjects.map((subject) => (
                        <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label>Search</Label>
                  <Input
                    value={submissionQuery}
                    onChange={(e) => setSubmissionQuery(e.target.value)}
                    placeholder="Search by text, subject, submitter, or notes"
                  />
                </div>
              </div>

              <div className="space-y-3 max-h-[760px] overflow-auto">
                {filteredQuestionSubmissions.map((item) => (
                  <div key={item.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{item.subject}</p>
                        <p className="text-xs text-muted-foreground">
                          Submitted by {item.submittedByName || 'Anonymous'}
                          {item.submittedByEmail ? ` (${item.submittedByEmail})` : ''}
                          {item.submittedByUserId ? ` • UserId: ${item.submittedByUserId}` : ''}
                          {!item.submittedByUserId && item.actorKey ? ` • Identifier: ${item.actorKey}` : ''}
                          {item.createdAt ? ` • ${new Date(item.createdAt).toLocaleString()}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={item.status === 'pending' ? 'default' : 'outline'}>{item.status}</Badge>
                        <Badge variant="outline">Moderation: {item.moderation?.result || 'approved'}</Badge>
                        {item.queuedForBank ? <Badge variant="outline">Queued for Bank</Badge> : null}
                      </div>
                    </div>

                    {item.moderation?.reasons?.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <p className="font-medium">AI moderation reasons</p>
                        <p>{item.moderation.reasons.join(' ')}</p>
                      </div>
                    ) : null}

                    <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      {item.questionText || 'No typed text provided. See attached files below.'}
                    </div>

                    {item.questionDescription ? (
                      <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Question Description</p>
                        {item.questionDescription}
                      </div>
                    ) : null}

                    {item.questionSource ? (
                      <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Source</p>
                        {item.questionSource}
                      </div>
                    ) : null}

                    {item.submissionReason ? (
                      <div className="rounded-md border bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Reason for Submission</p>
                        {item.submissionReason}
                      </div>
                    ) : null}

                    {item.attachments?.length ? (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Attachments</p>
                        {item.attachments.map((file) => (
                          <a
                            key={`${item.id}-${file.name}`}
                            href={file.dataUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-md border px-3 py-2 text-sm hover:bg-slate-50"
                          >
                            {file.name} • {file.mimeType}
                          </a>
                        ))}
                      </div>
                    ) : null}

                    <div className="space-y-1.5">
                      <Label>Review Notes (required for rejection)</Label>
                      <Textarea
                        value={Object.prototype.hasOwnProperty.call(submissionReviewNotes, item.id)
                          ? submissionReviewNotes[item.id]
                          : (item.reviewNotes || '')}
                        onChange={(e) => setSubmissionReviewNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="min-h-[90px]"
                        placeholder="Add a short explanation, especially when rejecting."
                      />
                      {item.reviewedByEmail || item.reviewedAt ? (
                        <p className="text-xs text-muted-foreground">
                          Last review: {item.reviewedByEmail || 'Admin'}
                          {item.reviewedAt ? ` • ${new Date(item.reviewedAt).toLocaleString()}` : ''}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void reviewQuestionSubmission(item.id, 'approved')}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => void reviewQuestionSubmission(item.id, 'rejected')}>Reject</Button>
                    </div>
                  </div>
                ))}

                {!filteredQuestionSubmissions.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No submissions found for current filters.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="community-moderation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Community Safety Reports</CardTitle>
              <CardDescription>
                Review flagged private chats, then block harmful users or dismiss false reports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 max-h-[760px] overflow-auto">
                {communityReports.map((report) => (
                  <div key={report.id} className="rounded-lg border p-3 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">Report #{report.id.slice(-6)}</p>
                        <p className="text-xs text-muted-foreground">
                          Reporter: {report.reporterUserId} • Reported: {report.reportedUserId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {report.createdAt ? new Date(report.createdAt).toLocaleString() : 'Unknown time'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={report.status === 'open' ? 'default' : 'outline'}>{report.status}</Badge>
                        <Badge variant="outline">{report.moderation?.result || 'pending'}</Badge>
                      </div>
                    </div>

                    <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                      <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Reporter reason</p>
                      {report.reason || 'No reason provided.'}
                    </div>

                    {report.moderation?.reasons?.length ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="mb-1 text-xs uppercase tracking-wide">Auto moderation findings</p>
                        <p>{report.moderation.reasons.join(' ')}</p>
                      </div>
                    ) : null}

                    <div className="rounded-md border bg-white p-3">
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Chat snapshot</p>
                      <div className="space-y-2 max-h-[220px] overflow-auto">
                        {(report.chatSnapshot || []).map((row, idx) => (
                          <div key={`${report.id}-${idx}`} className="rounded border px-2 py-1.5 text-xs">
                            <p className="text-muted-foreground">{row.senderUserId}</p>
                            <p className="whitespace-pre-wrap">{row.text}</p>
                          </div>
                        ))}
                        {!report.chatSnapshot?.length ? (
                          <p className="text-xs text-muted-foreground">No snapshot available.</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label>Admin Notes</Label>
                      <Textarea
                        value={communityReportNotes[report.id] || ''}
                        onChange={(e) => setCommunityReportNotes((prev) => ({ ...prev, [report.id]: e.target.value }))}
                        placeholder="Add your moderation note (optional but recommended)."
                        className="min-h-[80px]"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void reviewCommunityReport(report, 'block')}>Block User</Button>
                      <Button size="sm" variant="outline" onClick={() => void reviewCommunityReport(report, 'dismiss')}>Dismiss</Button>
                    </div>
                  </div>
                ))}

                {!communityReports.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No community reports found.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl">{value}</p>
      </CardContent>
    </Card>
  );
}
