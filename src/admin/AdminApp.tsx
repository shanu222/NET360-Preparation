import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  BookCheck,
  Boxes,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FileQuestion,
  Gauge,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sparkles,
  Sun,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { apiRequest, buildApiUrl } from '../app/lib/api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../app/components/ui/card';
import { Button } from '../app/components/ui/button';
import { Input } from '../app/components/ui/input';
import { Label } from '../app/components/ui/label';
import { Tabs, TabsContent } from '../app/components/ui/tabs';
import { Badge } from '../app/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../app/components/ui/select';
import { Textarea } from '../app/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../app/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Preparation } from '../app/components/Preparation';
import type { SubjectKey } from '../app/lib/mcq';
import {
  downloadBlobFile,
  downloadDataUrlFile,
  openBlobPreview,
  openDataUrlPreview,
} from '../app/lib/filePreview';
import '../styles/admin-theme.css';

const FLAT_TOPIC_SUBJECTS = new Set(['quantitative-mathematics', 'design-aptitude']);
const ADMIN_SUPPORT_DESKTOP_ALERTS_KEY = 'net360-support-desktop-alerts-admin';
const ADMIN_SUPPORT_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const ADMIN_SUPPORT_ATTACHMENT_ACCEPT = '.pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.webp,.svg';
const ADMIN_SUPPORT_REACTIONS = ['😀', '🙏', '👍', '❤️', '✅'];
const ADMIN_SIDEBAR_EXPANDED_KEY = 'net360-admin-sidebar-expanded';
const ADMIN_DESKTOP_MIN_WIDTH = 1024;
const ADMIN_TABLET_COLLAPSE_MAX_WIDTH = 1280;
const ADMIN_BRAND_LOGO_SRC = '/net360-logo.png';

function readStoredAdminSidebarPreference() {
  try {
    const stored = localStorage.getItem(ADMIN_SIDEBAR_EXPANDED_KEY);
    if (stored == null) return null;
    return stored !== '0';
  } catch {
    return null;
  }
}

function isTabletSidebarViewport(width: number) {
  return width >= ADMIN_DESKTOP_MIN_WIDTH && width < ADMIN_TABLET_COLLAPSE_MAX_WIDTH;
}

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

type AdminSection =
  | 'dashboard'
  | 'users'
  | 'requests'
  | 'premium-requests'
  | 'support-chat'
  | 'password-recovery'
  | 'mcqs'
  | 'practice-board'
  | 'submissions'
  | 'community-moderation'
  | 'subscriptions'
  | 'system-config';

const ADMIN_SECTION_ROUTES: Record<AdminSection, string> = {
  dashboard: '/admin/dashboard',
  users: '/admin/users',
  requests: '/admin/signup-requests',
  'premium-requests': '/admin/premium-requests',
  'support-chat': '/admin/support-chat',
  'password-recovery': '/admin/password-recovery',
  mcqs: '/admin/mcqs',
  'practice-board': '/admin/practice-board',
  submissions: '/admin/submissions',
  'community-moderation': '/admin/community-moderation',
  subscriptions: '/admin/subscriptions',
  'system-config': '/admin/system-config',
};

const ADMIN_SECTION_META: Array<{ section: AdminSection; label: string; icon: LucideIcon }> = [
  { section: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { section: 'users', label: 'Users', icon: Users },
  { section: 'mcqs', label: 'MCQs', icon: FileQuestion },
  { section: 'practice-board', label: 'Practice Board', icon: BookCheck },
  { section: 'submissions', label: 'Submissions', icon: FileCheck2 },
  { section: 'community-moderation', label: 'Community', icon: ShieldAlert },
  { section: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { section: 'support-chat', label: 'Support Chat', icon: MessageSquare },
  { section: 'requests', label: 'Signup Requests', icon: ClipboardList },
  { section: 'premium-requests', label: 'Premium Requests', icon: Sparkles },
  { section: 'password-recovery', label: 'Recovery', icon: Activity },
  { section: 'system-config', label: 'Settings', icon: Settings },
];

function getSectionFromPath(pathname: string): AdminSection {
  const normalized = String(pathname || '').toLowerCase();

  if (!normalized.startsWith('/admin')) return 'dashboard';
  if (normalized === '/admin' || normalized === '/admin/') return 'dashboard';
  if (normalized.startsWith('/admin/dashboard')) return 'dashboard';
  if (normalized.startsWith('/admin/users')) return 'users';
  if (normalized.startsWith('/admin/signup-requests')) return 'requests';
  if (normalized.startsWith('/admin/premium-requests')) return 'premium-requests';
  if (normalized.startsWith('/admin/support-chat')) return 'support-chat';
  if (normalized.startsWith('/admin/password-recovery')) return 'password-recovery';
  if (normalized.startsWith('/admin/mcqs')) return 'mcqs';
  if (normalized.startsWith('/admin/practice-board')) return 'practice-board';
  if (normalized.startsWith('/admin/submissions')) return 'submissions';
  if (normalized.startsWith('/admin/community-moderation')) return 'community-moderation';
  if (normalized.startsWith('/admin/subscriptions')) return 'subscriptions';
  if (normalized.startsWith('/admin/system-config')) return 'system-config';

  return 'dashboard';
}

interface AdminUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  mobileNumber?: string;
  role: 'student' | 'admin';
  createdAt: string | null;
}

interface AdminOverview {
  usersCount: number;
  mcqCount: number;
  attemptsCount: number;
  averageScore: number;
  pendingSignupRequests?: number;
  pendingPremiumRequests?: number;
  recoveryRequestCount?: number;
  recoveryStatusCounts?: {
    sent: number;
    partial: number;
    failed: number;
    not_found: number;
  };
  pendingQuestionSubmissions?: number;
}

interface AdminSystemStatus {
  openai: {
    configured: boolean;
    model: string;
    keySource: string;
  };
  serverTime: string;
}

interface AdminConfigVariable {
  key: string;
  isSecret: boolean;
  description: string;
  updatedByEmail: string;
  updatedAt: string | null;
  valuePreview: string;
}

interface PasswordRecoveryRequest {
  id: string;
  identifier: string;
  matchedBy: 'email' | 'mobile' | 'none';
  userId: string;
  userName: string;
  email: string;
  mobileNumber: string;
  recoveryStatus: 'not_found' | 'sent' | 'partial' | 'failed';
  dispatches: Array<{
    channel: 'email' | 'sms' | 'whatsapp';
    destination: string;
    status: 'sent' | 'skipped' | 'failed';
    provider: string;
    detail: string;
  }>;
  tokenExpiresAt: string | null;
  createdAt: string | null;
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
  paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  paymentTransactionId: string;
  paymentProof?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    fileUrl?: string;
  };
  contactMethod?: 'in_app';
  contactValue?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
  codeDeliveryStatus?: 'not_generated' | 'pending_send' | 'sent';
  codeSentAt?: string | null;
}

interface PremiumSubscriptionRequest {
  id: string;
  userId: string;
  email: string;
  mobileNumber: string;
  planId: string;
  planName: string;
  paymentMethod: 'easypaisa' | 'jazzcash' | 'bank_transfer';
  paymentTransactionId: string;
  paymentProof?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    fileUrl?: string;
  };
  contactMethod: 'in_app';
  contactValue: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  notes?: string;
  reviewedAt: string | null;
  reviewedByEmail: string;
  createdAt: string | null;
  codeDeliveryStatus?: 'not_generated' | 'pending_send' | 'sent';
  codeSentAt?: string | null;
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
  questionImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  options: string[];
  optionMedia?: Array<{
    key: string;
    text: string;
    image?: {
      name: string;
      mimeType: string;
      size: number;
      dataUrl: string;
    } | null;
  }>;
  answer: string;
  answerKey?: string;
  tip: string;
  explanationText?: string;
  explanationImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  shortTrickText?: string;
  shortTrickImage?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  difficulty: string;
}

interface AdminMcqImageFile {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
}

interface AdminMcqOptionMedia {
  key: string;
  text: string;
  image?: AdminMcqImageFile | null;
}

interface AdminMcqBankStructureItem {
  subject: string;
  part?: string;
  chapter: string;
  section: string;
  count: number;
}

interface AdminPracticeBoardQuestion {
  id: string;
  subject: string;
  difficulty: string;
  questionText: string;
  questionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  solutionText: string;
  solutionFile?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
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

interface AdminSupportConversation {
  userId: string;
  userName: string;
  email: string;
  mobileNumber: string;
  lastMessageText: string;
  lastMessageAt: string | null;
  unreadForAdmin: number;
}

interface AdminSupportMessage {
  id: string;
  userId: string;
  senderRole: 'user' | 'admin';
  messageType?: 'text' | 'file' | string;
  text: string;
  attachment?: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
  } | null;
  reactions?: Array<{ emoji: string }>;
  createdAt: string | null;
}

interface AdminSupportThreadPayload {
  user: {
    id: string;
    name: string;
    email: string;
    mobileNumber: string;
  };
  messages: AdminSupportMessage[];
}

interface LoginUser {
  id: string;
  role?: 'student' | 'admin';
}

interface ParsedBulkMcq {
  subject?: string;
  part?: string;
  chapter?: string;
  section?: string;
  topic?: string;
  question: string;
  questionImageUrl: string;
  questionImageDataUrl?: string;
  options: string[];
  optionImageDataUrls?: string[];
  answer: string;
  tip: string;
  explanationImageDataUrl?: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

type BulkDeleteMode = 'all' | 'subject' | 'chapter' | 'section-topic';

interface ParsedBulkResponse {
  parsed: ParsedBulkMcq[];
  errors: string[];
}

const TOKEN_KEY = 'net360-admin-access-token';
const REFRESH_TOKEN_KEY = 'net360-admin-refresh-token';
const THEME_STORAGE_KEY = 'net360-theme-mode';

type ThemeMode = 'light' | 'dark';

function resolveInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function emptyForm() {
  return {
    id: '',
    subject: 'mathematics',
    part: 'part1',
    chapter: '',
    section: '',
    topic: 'General',
    question: '',
    questionImage: null as AdminMcqImageFile | null,
    optionMedia: [
      { key: 'A', text: '', image: null },
      { key: 'B', text: '', image: null },
      { key: 'C', text: '', image: null },
      { key: 'D', text: '', image: null },
    ] as AdminMcqOptionMedia[],
    answer: '',
    explanationText: '',
    explanationImage: null as AdminMcqImageFile | null,
    shortTrickText: '',
    shortTrickImage: null as AdminMcqImageFile | null,
    difficulty: 'Medium',
  };
}

function emptyPracticeForm() {
  return {
    id: '',
    subject: 'mathematics',
    difficulty: 'Medium',
    questionText: '',
    questionFile: null as AdminPracticeBoardQuestion['questionFile'],
    solutionText: '',
    solutionFile: null as AdminPracticeBoardQuestion['solutionFile'],
  };
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

function normalizeAnswerToken(answer: string, options: string[]): string {
  const normalizedAnswer = String(answer || '').trim();
  if (!normalizedAnswer) return '';

  const answerToken = normalizedAnswer.match(/(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (answerToken) {
    const token = answerToken[1];
    const idx = /^\d+$/.test(token)
      ? Number(token) - 1
      : token.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
  }

  const direct = options.find((option) => option.trim().toLowerCase() === normalizedAnswer.toLowerCase());
  return direct || '';
}

function extractImageReference(line: string): string {
  const raw = String(line || '').trim();
  if (!raw) return '';

  const markdownMatch = raw.match(/!\[[^\]]*\]\(([^)\s]+)\)/i);
  if (markdownMatch?.[1]) return markdownMatch[1].trim();

  const labelledMatch = raw.match(/(?:question\s*image|option\s*[A-H\d]*\s*image|explanation\s*image|solution\s*image|tip\s*image|image|img)\s*[:=-]\s*(.+)$/i);
  if (labelledMatch?.[1]) {
    const candidate = labelledMatch[1].trim();
    if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(candidate) || /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }

  const urlMatch = raw.match(/(data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+|https?:\/\/\S+)/i);
  return urlMatch?.[1]?.replace(/\s+/g, '') || '';
}

function splitQuestionBlocks(text: string): Array<{ number: string; content: string }> {
  const starts: Array<{ index: number; number: string }> = [];
  const startRegex = /^\s*(?:q(?:uestion)?\s*)?(\d{1,3})(?:\s*[\).:-])?\s+/gim;
  let match: RegExpExecArray | null;
  while ((match = startRegex.exec(text))) {
    starts.push({ index: match.index, number: match[1] });
  }

  if (!starts.length) {
    return [{ number: '1', content: text.trim() }];
  }

  return starts.map((entry, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].index : text.length;
    return {
      number: entry.number,
      content: text.slice(entry.index, end).trim(),
    };
  });
}

function normalizeParsedHierarchyContext(context: Partial<Pick<ParsedBulkMcq, 'subject' | 'part' | 'chapter' | 'section' | 'topic'>>) {
  const subjectRaw = String(context.subject || '').trim().toLowerCase();
  const partRaw = String(context.part || '').trim().toLowerCase();
  const chapterRaw = String(context.chapter || '').trim();
  const sectionRaw = String(context.section || '').trim();
  const topicRaw = String(context.topic || '').trim();

  const normalizedPart = partRaw === 'part 1' || partRaw === 'part1'
    ? 'part1'
    : partRaw === 'part 2' || partRaw === 'part2'
      ? 'part2'
      : '';

  return {
    subject: subjectRaw,
    part: normalizedPart,
    chapter: chapterRaw,
    section: sectionRaw,
    topic: topicRaw,
  };
}

function parseHierarchyLine(line: string): { key: 'subject' | 'part' | 'chapter' | 'section' | 'topic'; value: string } | null {
  const raw = String(line || '').trim();
  if (!raw) return null;

  const entries: Array<{ key: 'subject' | 'part' | 'chapter' | 'section' | 'topic'; re: RegExp }> = [
    { key: 'subject', re: /^(?:subject|course)\s*[:=-]\s*(.+)$/i },
    { key: 'part', re: /^part\s*[:=-]\s*(.+)$/i },
    { key: 'chapter', re: /^chapter\s*[:=-]\s*(.+)$/i },
    { key: 'section', re: /^section(?:\/topic)?\s*[:=-]\s*(.+)$/i },
    { key: 'topic', re: /^topic\s*[:=-]\s*(.+)$/i },
  ];

  for (const entry of entries) {
    const match = raw.match(entry.re);
    if (match?.[1]) {
      return {
        key: entry.key,
        value: String(match[1] || '').trim(),
      };
    }
  }

  return null;
}

function extractHierarchyContextFromText(text: string) {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const context: Pick<ParsedBulkMcq, 'subject' | 'part' | 'chapter' | 'section' | 'topic'> = {
    subject: '',
    part: '',
    chapter: '',
    section: '',
    topic: '',
  };

  lines.slice(0, 120).forEach((line) => {
    const parsed = parseHierarchyLine(line);
    if (parsed?.key && parsed.value) {
      context[parsed.key] = parsed.value;
    }
  });

  return normalizeParsedHierarchyContext(context);
}

function parseBulkMcqs(raw: string): { parsed: ParsedBulkMcq[]; errors: string[] } {
  const text = normalizeBulkText(raw);
  if (!text) return { parsed: [], errors: ['Paste questions before uploading.'] };

  const baseHierarchy = extractHierarchyContextFromText(text);
  const blocks = splitQuestionBlocks(text);

  const errors: string[] = [];
  const parsed: ParsedBulkMcq[] = [];
  let skipped = 0;

  blocks.forEach((block) => {
    if (parsed.length >= 15) return;

    const lines = block.content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (!lines.length) return;

    lines[0] = lines[0].replace(/^(?:q(?:uestion)?\s*)?\d{1,3}(?:\s*[\).:-])?\s*/i, '').trim();

    let questionImageUrl = '';
    let questionImageDataUrl = '';
    let answerToken = '';
    const explanationLines: string[] = [];
    let explanationImageDataUrl = '';
    let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
    const questionLines: string[] = [];
    const options: Array<{ text: string; imageDataUrl: string }> = [];
    const blockHierarchy = {
      ...baseHierarchy,
    };
    let capturingExplanation = false;
    let activeOptionIndex = -1;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const hierarchyLine = parseHierarchyLine(line);
      if (hierarchyLine?.key) {
        blockHierarchy[hierarchyLine.key] = hierarchyLine.value;
        continue;
      }

      const imageRef = extractImageReference(line);
      if (imageRef) {
        const isDataUrl = /^data:image\//i.test(imageRef);
        const optionImageLabel = line.match(/option\s*([A-H]|\d{1,2})\s*image/i);

        if (optionImageLabel) {
          const token = optionImageLabel[1];
          const optionIndex = /^\d+$/.test(token)
            ? Number(token) - 1
            : token.toUpperCase().charCodeAt(0) - 65;
          if (optionIndex >= 0 && optionIndex < options.length) {
            options[optionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          }
          continue;
        }

        if (/explanation\s*image|solution\s*image|tip\s*image/i.test(line) || capturingExplanation) {
          explanationImageDataUrl = isDataUrl ? imageRef : explanationImageDataUrl;
          continue;
        }

        if (activeOptionIndex >= 0 && activeOptionIndex < options.length) {
          options[activeOptionIndex].imageDataUrl = isDataUrl ? imageRef : '';
          continue;
        }

        if (isDataUrl) {
          questionImageDataUrl = imageRef;
        } else {
          questionImageUrl = imageRef;
        }
        continue;
      }

      const answerMatch = line.match(/^(?:correct\s*answer|correct\s*option|correct|answer|ans(?:wer)?\.?)\s*[:=-]\s*(.+)$/i);
      if (answerMatch) {
        answerToken = answerMatch[1].trim();
        capturingExplanation = false;
        activeOptionIndex = -1;
        continue;
      }

      const explanationMatch = line.match(/^(?:explanation|solution|reason|short\s*trick|tip)\s*[:=-]?\s*(.*)$/i);
      if (explanationMatch) {
        if (explanationMatch[1].trim()) explanationLines.push(explanationMatch[1].trim());
        capturingExplanation = true;
        activeOptionIndex = -1;
        continue;
      }

      const difficultyMatch = line.match(/^(?:difficulty|level)\s*[:=-]\s*(easy|medium|hard)$/i);
      if (difficultyMatch) {
        const normalized = difficultyMatch[1].toLowerCase();
        difficulty = normalized === 'easy' ? 'Easy' : normalized === 'hard' ? 'Hard' : 'Medium';
        continue;
      }

      const inlineOptions = splitInlineOptions(line);
      if (inlineOptions.length) {
        inlineOptions.forEach((optionText) => {
          options.push({ text: optionText, imageDataUrl: '' });
        });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      const optionMatch = line.match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\s*[\).:-])\s*(.+)$/i);
      if (optionMatch) {
        options.push({ text: optionMatch[2].trim(), imageDataUrl: '' });
        capturingExplanation = false;
        activeOptionIndex = options.length - 1;
        continue;
      }

      if (capturingExplanation) {
        explanationLines.push(line);
      } else if (activeOptionIndex >= 0 && options[activeOptionIndex]) {
        options[activeOptionIndex].text = `${options[activeOptionIndex].text} ${line}`.trim();
      } else {
        questionLines.push(line);
      }
    }

    const question = questionLines.join(' ').trim();
    const normalizedOptions = options.map((option) => option.text.trim()).filter(Boolean);
    const normalizedAnswer = normalizeAnswerToken(answerToken, normalizedOptions);
    if ((!question && !questionImageUrl && !questionImageDataUrl) || normalizedOptions.length < 2 || !normalizedAnswer) {
      skipped += 1;
      return;
    }

    parsed.push({
      subject: String(blockHierarchy.subject || '').trim().toLowerCase(),
      part: String(blockHierarchy.part || '').trim().toLowerCase(),
      chapter: String(blockHierarchy.chapter || '').trim(),
      section: String(blockHierarchy.section || '').trim(),
      topic: String(blockHierarchy.topic || '').trim(),
      question: question || 'Refer to attached image.',
      questionImageUrl,
      questionImageDataUrl,
      options: normalizedOptions,
      optionImageDataUrls: options.map((option) => option.imageDataUrl || ''),
      answer: normalizedAnswer,
      tip: explanationLines.join('\n').trim(),
      explanationImageDataUrl,
      difficulty,
    });
  });

  if (blocks.length > 15) {
    errors.push('Only the first 15 MCQs were kept from this import.');
  }
  if (skipped > 0) {
    errors.push(`Skipped ${skipped} unclear block(s) and continued parsing the rest.`);
  }

  return { parsed, errors };
}

function hierarchyLabel(selection: SelectedHierarchy | null): string {
  if (!selection) return 'No target selected';
  if (selection.kind === 'section') {
    return `${selection.subject} / ${selection.part} / ${selection.chapterTitle} / ${selection.sectionTitle}`;
  }
  return `${selection.subject} / ${selection.sectionTitle}`;
}

function resolveAnswerLabel(options: string[], answer: string): string {
  const normalized = String(answer || '').trim().toLowerCase();
  const answerIndex = options.findIndex((option) => String(option || '').trim().toLowerCase() === normalized);
  if (answerIndex >= 0) return String.fromCharCode(65 + answerIndex);

  const directLetter = String(answer || '').trim().match(/^(?:option\s*)?([A-Ha-h]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (directLetter) return directLetter[1].toUpperCase();

  return String(answer || '').trim();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}

const MCQ_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif']);
const MCQ_IMAGE_NAME_PATTERN = /\.(jpe?g|png|webp|svg|gif)$/i;
const MCQ_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function isSupportedMcqImage(file: File) {
  const mime = String(file.type || '').toLowerCase();
  return MCQ_IMAGE_MIME_TYPES.has(mime) || MCQ_IMAGE_NAME_PATTERN.test(file.name || '');
}

async function fileToMcqImage(file: File): Promise<AdminMcqImageFile> {
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    dataUrl: await fileToDataUrl(file),
  };
}

function parsedDataUrlToImage(dataUrl: string | undefined, fallbackName: string): AdminMcqImageFile | null {
  const normalized = String(dataUrl || '').trim();
  const match = normalized.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  if (!MCQ_IMAGE_MIME_TYPES.has(mimeType)) return null;

  const base64 = match[2].replace(/\s+/g, '');
  const size = Math.ceil((base64.length * 3) / 4);
  if (!size || size > MCQ_IMAGE_MAX_BYTES) return null;

  const extensionByMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/gif': 'gif',
  };

  return {
    name: `${fallbackName}.${extensionByMime[mimeType] || 'img'}`,
    mimeType,
    size,
    dataUrl: normalized,
  };
}

function resolveAnswerKeyFromInput(options: AdminMcqOptionMedia[], answerInput: string): string {
  const normalized = String(answerInput || '').trim().toLowerCase();
  if (!normalized) return '';

  const direct = normalized.match(/^(?:option\s*)?([a-d]|\d{1,2})(?:\b|\)|\.|:)?/i);
  if (direct) {
    const token = direct[1];
    const idx = /^\d+$/.test(token)
      ? Number(token) - 1
      : token.toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) {
      return String(options[idx].key || '').toUpperCase();
    }
  }

  const byText = options.find((item) => String(item.text || '').trim().toLowerCase() === normalized);
  if (byText) return String(byText.key || '').toUpperCase();

  const byKey = options.find((item) => String(item.key || '').trim().toLowerCase() === normalized);
  return byKey ? String(byKey.key || '').toUpperCase() : '';
}

const PRACTICE_FILE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const PRACTICE_FILE_NAME_PATTERN = /\.(jpe?g|png|pdf|doc|docx)$/i;
const PRACTICE_FILE_MAX_BYTES = 8 * 1024 * 1024;

function isSupportedPracticeFile(file: File) {
  const mime = String(file.type || '').toLowerCase();
  return PRACTICE_FILE_MIME_TYPES.has(mime) || PRACTICE_FILE_NAME_PATTERN.test(file.name || '');
}

function generateTemporaryPassword(length = 12) {
  const lowers = 'abcdefghjkmnpqrstuvwxyz';
  const uppers = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%*?';
  const allChars = `${lowers}${uppers}${digits}${symbols}`;

  const randomIndex = (max: number) => {
    if (max <= 0) return 0;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      return buffer[0] % max;
    }
    return Math.floor(Math.random() * max);
  };

  const required = [
    lowers[randomIndex(lowers.length)],
    uppers[randomIndex(uppers.length)],
    digits[randomIndex(digits.length)],
    symbols[randomIndex(symbols.length)],
  ];

  const result = [...required];
  while (result.length < Math.max(8, length)) {
    result.push(allChars[randomIndex(allChars.length)]);
  }

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = randomIndex(i + 1);
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }

  return result.join('');
}

export default function AdminApp() {
  const activeView = new URLSearchParams(window.location.search).get('view');
  const isQuestionBankView = activeView === 'question-bank';
  const isPracticeBoardBankView = activeView === 'practice-board-bank';
  const initialSection = getSectionFromPath(window.location.pathname);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem(REFRESH_TOKEN_KEY));
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [activeSection, setActiveSection] = useState<AdminSection>(initialSection);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && isTabletSidebarViewport(window.innerWidth)) {
      return false;
    }
    return readStoredAdminSidebarPreference() ?? true;
  });
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(resolveInitialThemeMode);

  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [isRefreshingSystemStatus, setIsRefreshingSystemStatus] = useState(false);
  const [configVariables, setConfigVariables] = useState<AdminConfigVariable[]>([]);
  const [isRefreshingConfigVariables, setIsRefreshingConfigVariables] = useState(false);
  const [isSavingConfigVariable, setIsSavingConfigVariable] = useState(false);
  const [isDeletingConfigVariable, setIsDeletingConfigVariable] = useState<string | null>(null);
  const [configForm, setConfigForm] = useState({
    key: '',
    value: '',
    description: '',
    isSecret: true,
  });
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [createUserForm, setCreateUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobileNumber: '',
    password: '',
    activatePlan: false,
    planId: 'basic_monthly',
  });
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [signupRequests, setSignupRequests] = useState<SignupRequest[]>([]);
  const [mcqs, setMcqs] = useState<AdminMCQ[]>([]);
  const [mcqStructure, setMcqStructure] = useState<AdminMcqBankStructureItem[]>([]);
  const [bankSubjectKey, setBankSubjectKey] = useState('');
  const [bankChapterKey, setBankChapterKey] = useState('');
  const [bankSectionKey, setBankSectionKey] = useState('');
  const [bankMcqs, setBankMcqs] = useState<AdminMCQ[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [issuedTokens, setIssuedTokens] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm());
  const [selectedHierarchy, setSelectedHierarchy] = useState<SelectedHierarchy | null>(null);
  const [isSectionEditorOpen, setIsSectionEditorOpen] = useState(false);
  const [isUploadMcqsOpen, setIsUploadMcqsOpen] = useState(false);
  const [subscriptionOverview, setSubscriptionOverview] = useState<AdminSubscriptionOverview | null>(null);
  const [subscriptionUsers, setSubscriptionUsers] = useState<AdminSubscriptionUser[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState('all');
  const [assignPlanForm, setAssignPlanForm] = useState({
    email: '',
    planId: 'basic_monthly',
    status: 'active',
  });
  const [isAssigningPlan, setIsAssigningPlan] = useState(false);
  const [isAssignPlanConfirmOpen, setIsAssignPlanConfirmOpen] = useState(false);
  const [premiumRequests, setPremiumRequests] = useState<PremiumSubscriptionRequest[]>([]);
  const [premiumRequestStatusFilter, setPremiumRequestStatusFilter] = useState('all');
  const [premiumRequestQuery, setPremiumRequestQuery] = useState('');
  const [issuedPremiumTokens, setIssuedPremiumTokens] = useState<Record<string, string>>({});
  const [passwordRecoveryRequests, setPasswordRecoveryRequests] = useState<PasswordRecoveryRequest[]>([]);
  const [passwordRecoveryStatusFilter, setPasswordRecoveryStatusFilter] = useState('all');
  const [passwordRecoveryQuery, setPasswordRecoveryQuery] = useState('');
  const [practiceQuestions, setPracticeQuestions] = useState<AdminPracticeBoardQuestion[]>([]);
  const [practiceQuery, setPracticeQuery] = useState('');
  const [practiceBankSubjectKey, setPracticeBankSubjectKey] = useState('');
  const [practiceForm, setPracticeForm] = useState(emptyPracticeForm());
  const [isPracticeEditorOpen, setIsPracticeEditorOpen] = useState(false);
  const [practiceQuestionUpload, setPracticeQuestionUpload] = useState<File | null>(null);
  const [practiceSolutionUpload, setPracticeSolutionUpload] = useState<File | null>(null);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkParsed, setBulkParsed] = useState<ParsedBulkMcq[]>([]);
  const [bulkParseErrors, setBulkParseErrors] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [isSavingMcq, setIsSavingMcq] = useState(false);
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
  const [collapsedReviewedSubmissionIds, setCollapsedReviewedSubmissionIds] = useState<Record<string, boolean>>({});
  const [communityReports, setCommunityReports] = useState<AdminCommunityReport[]>([]);
  const [communityReportNotes, setCommunityReportNotes] = useState<Record<string, string>>({});
  const [supportConversations, setSupportConversations] = useState<AdminSupportConversation[]>([]);
  const [selectedSupportUserId, setSelectedSupportUserId] = useState('');
  const [activeSupportUser, setActiveSupportUser] = useState<AdminSupportThreadPayload['user'] | null>(null);
  const [supportMessages, setSupportMessages] = useState<AdminSupportMessage[]>([]);
  const [supportReplyText, setSupportReplyText] = useState('');
  const [supportReplyAttachment, setSupportReplyAttachment] = useState<AdminSupportMessage['attachment']>(null);
  const [supportConversationQuery, setSupportConversationQuery] = useState('');
  const [adminDesktopAlertsEnabled, setAdminDesktopAlertsEnabled] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(ADMIN_SUPPORT_DESKTOP_ALERTS_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [isSupportThreadLoading, setIsSupportThreadLoading] = useState(false);
  const [isSendingSupportReply, setIsSendingSupportReply] = useState(false);
  const supportReplyFileInputRef = useRef<HTMLInputElement | null>(null);
  const explanationImageInputRef = useRef<HTMLInputElement | null>(null);
  const didHydrateSupportRef = useRef(false);
  const lastUnreadTotalRef = useRef(0);
  const lastUserMessageInThreadRef = useRef('');
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

  const selectedDirectAssignPlanName = useMemo(() => {
    const matched = (subscriptionOverview?.plans || []).find((item) => item.id === assignPlanForm.planId);
    return matched?.name || assignPlanForm.planId || 'Unknown plan';
  }, [subscriptionOverview, assignPlanForm.planId]);

  const filteredPracticeQuestions = useMemo(() => {
    if (!practiceQuery.trim()) return practiceQuestions;
    const needle = practiceQuery.toLowerCase();
    return practiceQuestions.filter((item) =>
      [
        item.subject,
        item.difficulty,
        item.questionText,
        item.solutionText,
        item.questionFile?.name || '',
        item.solutionFile?.name || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [practiceQuestions, practiceQuery]);

  const practiceQuestionsBySubject = useMemo(() => {
    const grouped = new Map<string, AdminPracticeBoardQuestion[]>();
    practiceQuestions.forEach((item) => {
      const key = String(item.subject || 'general').trim().toLowerCase() || 'general';
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([subject, questions]) => ({
        subject,
        questions: questions.sort((a, b) => {
          const aq = String(a.questionText || '').toLowerCase();
          const bq = String(b.questionText || '').toLowerCase();
          return aq.localeCompare(bq);
        }),
      }));
  }, [practiceQuestions]);

  const activePracticeBankSubject = useMemo(() => {
    if (!practiceQuestionsBySubject.length) return null;
    return practiceQuestionsBySubject.find((item) => item.subject === practiceBankSubjectKey) || practiceQuestionsBySubject[0];
  }, [practiceQuestionsBySubject, practiceBankSubjectKey]);

  useEffect(() => {
    const syncSection = () => {
      const nextSection = getSectionFromPath(window.location.pathname);
      setActiveSection(nextSection);

      if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
        setIsMobileSidebarOpen(false);
      }

      if (isTabletSidebarViewport(window.innerWidth)) {
        setIsSidebarExpanded(false);
      }
    };

    window.addEventListener('popstate', syncSection);
    return () => {
      window.removeEventListener('popstate', syncSection);
    };
  }, []);

  useEffect(() => {
    if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
      setIsMobileSidebarOpen(false);
    }

    if (isTabletSidebarViewport(window.innerWidth)) {
      setIsSidebarExpanded(false);
    }
  }, [activeSection]);

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;

      if (width < ADMIN_DESKTOP_MIN_WIDTH) {
        setIsMobileSidebarOpen(false);
      }

      if (isTabletSidebarViewport(width)) {
        setIsSidebarExpanded(false);
        return;
      }

      if (width >= ADMIN_TABLET_COLLAPSE_MAX_WIDTH) {
        setIsSidebarExpanded(readStoredAdminSidebarPreference() ?? true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', themeMode === 'dark');
    root.style.colorScheme = themeMode;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const practiceBankVisibleQuestions = useMemo(() => {
    const source = activePracticeBankSubject?.questions || [];
    if (!practiceQuery.trim()) return source;
    const needle = practiceQuery.toLowerCase();
    return source.filter((item) => {
      const blob = [
        item.questionText,
        item.solutionText,
        item.difficulty,
        item.questionFile?.name || '',
        item.solutionFile?.name || '',
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [activePracticeBankSubject, practiceQuery]);

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

  const filteredSupportConversations = useMemo(() => {
    const needle = supportConversationQuery.trim().toLowerCase();
    if (!needle) return supportConversations;
    return supportConversations.filter((item) => {
      const blob = [item.userName, item.email, item.mobileNumber, item.lastMessageText].join(' ').toLowerCase();
      return blob.includes(needle);
    });
  }, [supportConversations, supportConversationQuery]);

  const submissionSubjects = useMemo(() => {
    return Array.from(new Set(questionSubmissions.map((item) => item.subject).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [questionSubmissions]);

  const pendingSignupRequests = useMemo(() => {
    return signupRequests.filter((item) => item.status === 'pending');
  }, [signupRequests]);

  const completedSignupRequests = useMemo(() => {
    return signupRequests.filter((item) => item.status === 'completed' || (item.status === 'approved' && item.codeDeliveryStatus === 'sent'));
  }, [signupRequests]);

  const bankTree = useMemo(() => {
    const subjectMap = new Map<string, {
      key: string;
      label: string;
      count: number;
      chapters: Map<string, {
        key: string;
        label: string;
        count: number;
        sections: Map<string, { key: string; label: string; count: number }>;
      }>;
    }>();

    mcqStructure.forEach((row) => {
      const subjectKey = String(row.subject || '').trim().toLowerCase();
      if (!subjectKey) return;
      const chapterRaw = String(row.chapter || '').trim();
      const sectionRaw = String(row.section || '').trim();
      const count = Number(row.count || 0);

      const chapterKey = chapterRaw ? chapterRaw.toLowerCase() : '__no_chapter__';
      const chapterLabel = chapterRaw || 'General Topics';
      const sectionLabel = sectionRaw || chapterLabel;
      const sectionKey = sectionLabel.toLowerCase();

      if (!subjectMap.has(subjectKey)) {
        subjectMap.set(subjectKey, {
          key: subjectKey,
          label: subjectKey,
          count: 0,
          chapters: new Map(),
        });
      }

      const subjectNode = subjectMap.get(subjectKey)!;
      subjectNode.count += count;

      if (!subjectNode.chapters.has(chapterKey)) {
        subjectNode.chapters.set(chapterKey, {
          key: chapterKey,
          label: chapterLabel,
          count: 0,
          sections: new Map(),
        });
      }

      const chapterNode = subjectNode.chapters.get(chapterKey)!;
      chapterNode.count += count;

      if (!chapterNode.sections.has(sectionKey)) {
        chapterNode.sections.set(sectionKey, {
          key: sectionKey,
          label: sectionLabel,
          count: 0,
        });
      }
      chapterNode.sections.get(sectionKey)!.count += count;
    });

    return Array.from(subjectMap.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map((subject) => ({
        ...subject,
        chapters: Array.from(subject.chapters.values())
          .sort((a, b) => a.label.localeCompare(b.label))
          .map((chapter) => ({
            ...chapter,
            sections: Array.from(chapter.sections.values()).sort((a, b) => a.label.localeCompare(b.label)),
          })),
      }));
  }, [mcqStructure]);

  const activeBankSubject = useMemo(() => bankTree.find((item) => item.key === bankSubjectKey) || null, [bankTree, bankSubjectKey]);
  const activeBankChapter = useMemo(() => activeBankSubject?.chapters.find((item) => item.key === bankChapterKey) || null, [activeBankSubject, bankChapterKey]);
  const activeBankSection = useMemo(() => activeBankChapter?.sections.find((item) => item.key === bankSectionKey) || null, [activeBankChapter, bankSectionKey]);

  const authToken = token;

  const playNotificationTone = () => {
    try {
      const AudioCtx = (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AudioCtx) return;
      const context = new AudioCtx();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = 930;
      gain.gain.value = 0.03;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.1);
    } catch {
      // Ignore notification tone errors.
    }
  };

  const canUseDesktopNotifications = typeof window !== 'undefined' && 'Notification' in window;

  const setAdminDesktopAlertsPreference = (enabled: boolean) => {
    setAdminDesktopAlertsEnabled(enabled);
    try {
      sessionStorage.setItem(ADMIN_SUPPORT_DESKTOP_ALERTS_KEY, enabled ? '1' : '0');
    } catch {
      // Ignore storage failures.
    }
  };

  const enableAdminDesktopAlerts = async () => {
    if (!canUseDesktopNotifications) {
      toast.error('Desktop notifications are not supported in this browser.');
      return;
    }

    if (Notification.permission === 'granted') {
      setAdminDesktopAlertsPreference(true);
      toast.success('Desktop alerts enabled for this tab.');
      return;
    }

    if (Notification.permission === 'denied') {
      toast.error('Desktop notifications are blocked in browser settings.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      setAdminDesktopAlertsPreference(true);
      toast.success('Desktop alerts enabled for this tab.');
    } else {
      toast.error('Notification permission was not granted.');
    }
  };

  const notifyAdminDesktop = (title: string, body: string) => {
    if (!adminDesktopAlertsEnabled || !canUseDesktopNotifications) return;
    if (Notification.permission !== 'granted') return;
    if (!document.hidden) return;

    try {
      const notification = new Notification(title, {
        body,
        tag: 'net360-support-admin',
      });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
    } catch {
      // Ignore notification delivery errors.
    }
  };

  const clearAdminSession = () => {
    setToken(null);
    setRefreshToken(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  };

  const navigateToSection = (section: AdminSection, replace = false) => {
    const nextPath = ADMIN_SECTION_ROUTES[section] || ADMIN_SECTION_ROUTES.dashboard;
    const nextUrl = `${nextPath}${window.location.search || ''}${window.location.hash || ''}`;
    const currentUrl = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;

    if (replace) {
      window.history.replaceState({}, '', nextUrl);
    } else if (currentUrl !== nextUrl) {
      window.history.pushState({}, '', nextUrl);
    }

    setActiveSection(section);

    if (window.innerWidth < ADMIN_DESKTOP_MIN_WIDTH) {
      setIsMobileSidebarOpen(false);
    }

    if (isTabletSidebarViewport(window.innerWidth)) {
      setIsSidebarExpanded(false);
    }
  };

  const toggleSidebar = () => {
    if (window.innerWidth >= ADMIN_DESKTOP_MIN_WIDTH) {
      const nextExpanded = !isSidebarExpanded;
      setIsSidebarExpanded(nextExpanded);

      if (!isTabletSidebarViewport(window.innerWidth)) {
        try {
          localStorage.setItem(ADMIN_SIDEBAR_EXPANDED_KEY, nextExpanded ? '1' : '0');
        } catch {
          // Ignore persistence failures.
        }
      }
      return;
    }
    setIsMobileSidebarOpen((prev) => !prev);
  };

  useEffect(() => {
    const pathname = String(window.location.pathname || '').toLowerCase();
    if (pathname === '/admin' || pathname === '/admin/') {
      navigateToSection('dashboard', true);
    }
  }, []);

  const openQuestionBankWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'question-bank');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const openPracticeBoardBankWindow = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'practice-board-bank');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  const openPracticeFile = (file?: { dataUrl: string } | null) => {
    const dataUrl = String(file?.dataUrl || '').trim();
    if (!dataUrl) return;
    if (!openDataUrlPreview(dataUrl)) {
      toast.error('Could not open file preview.');
    }
  };

  const downloadPracticeFile = (file?: { dataUrl: string; name: string } | null) => {
    const dataUrl = String(file?.dataUrl || '').trim();
    const name = String(file?.name || 'practice-file');
    if (!dataUrl) return;

    if (!downloadDataUrlFile(dataUrl, name)) {
      toast.error('Could not download file.');
    }
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
      premiumRequestsPayload,
      passwordRecoveryPayload,
      communityReportsPayload,
      supportConversationsPayload,
      structurePayload,
      systemStatusPayload,
      configVariablesPayload,
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
      apiRequest<{ requests: PremiumSubscriptionRequest[] }>(
        `/api/admin/subscriptions/requests?status=${premiumRequestStatusFilter}&q=${encodeURIComponent(premiumRequestQuery.trim())}`,
        {},
        activeToken,
      ).catch(() => ({ requests: [] })),
      apiRequest<{ requests: PasswordRecoveryRequest[] }>(
        `/api/admin/password-recovery-requests?status=${passwordRecoveryStatusFilter}&q=${encodeURIComponent(passwordRecoveryQuery.trim())}`,
        {},
        activeToken,
      ).catch(() => ({ requests: [] })),
      apiRequest<{ reports: AdminCommunityReport[] }>('/api/admin/community/reports', {}, activeToken).catch(() => ({ reports: [] })),
      apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, activeToken).catch(() => ({ conversations: [] })),
      apiRequest<{ structure: AdminMcqBankStructureItem[] }>('/api/admin/mcq-bank/structure', {}, activeToken).catch(() => ({ structure: [] })),
      apiRequest<AdminSystemStatus>('/api/admin/system-status', {}, activeToken).catch(() => ({
        openai: {
          configured: false,
          model: 'unknown',
          keySource: 'missing',
        },
        serverTime: new Date().toISOString(),
      })),
      apiRequest<{ variables: AdminConfigVariable[] }>('/api/admin/configurations', {}, activeToken).catch(() => ({ variables: [] })),
    ]);

    setOverview(overviewPayload);
    setUsers(usersPayload.users || []);
    setSignupRequests(requestPayload.requests || []);
    setMcqs((previous) => (selectedHierarchy ? previous : []));
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
    setPremiumRequests(premiumRequestsPayload.requests || []);
    setPasswordRecoveryRequests(passwordRecoveryPayload.requests || []);
    setCommunityReports(communityReportsPayload.reports || []);
    setSupportConversations(supportConversationsPayload.conversations || []);
    setMcqStructure(structurePayload.structure || []);
    setSystemStatus(systemStatusPayload);
    setConfigVariables(configVariablesPayload.variables || []);
  };

  const loadBankMcqs = async (
    activeToken: string,
    subject: string,
    chapterKey: string,
    chapterLabel: string,
    sectionLabel: string,
  ) => {
    const params = new URLSearchParams({ subject });
    if (chapterKey && chapterKey !== '__no_chapter__' && chapterLabel) {
      params.set('chapter', chapterLabel);
    }
    params.set('section', sectionLabel);

    setBankLoading(true);
    try {
      const payload = await apiRequest<{ mcqs: AdminMCQ[] }>(`/api/admin/mcqs?${params.toString()}`, {}, activeToken);
      setBankMcqs(payload.mcqs || []);
    } finally {
      setBankLoading(false);
    }
  };

  const refreshSystemStatus = async () => {
    if (!authToken) {
      toast.error('Login required to refresh system status.');
      return;
    }

    setIsRefreshingSystemStatus(true);
    try {
      const payload = await apiRequest<AdminSystemStatus>('/api/admin/system-status', {}, authToken);
      setSystemStatus(payload);
      toast.success('System status refreshed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh system status.');
    } finally {
      setIsRefreshingSystemStatus(false);
    }
  };

  const refreshConfigVariables = async () => {
    if (!authToken) {
      toast.error('Login required to refresh configuration list.');
      return;
    }

    setIsRefreshingConfigVariables(true);
    try {
      const payload = await apiRequest<{ variables: AdminConfigVariable[] }>('/api/admin/configurations', {}, authToken);
      setConfigVariables(payload.variables || []);
      toast.success('Configuration list refreshed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh configurations.');
    } finally {
      setIsRefreshingConfigVariables(false);
    }
  };

  const saveConfigVariable = async () => {
    if (!authToken) {
      toast.error('Login required to save configuration.');
      return;
    }

    const key = configForm.key.trim().toUpperCase();
    if (!key) {
      toast.error('Configuration key is required.');
      return;
    }
    if (!configForm.value.trim()) {
      toast.error('Configuration value is required.');
      return;
    }

    setIsSavingConfigVariable(true);
    try {
      await apiRequest<{ variable: AdminConfigVariable }>(
        `/api/admin/configurations/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            key,
            value: configForm.value,
            description: configForm.description,
            isSecret: configForm.isSecret,
          }),
        },
        authToken,
      );

      setConfigForm({ key: '', value: '', description: '', isSecret: true });
      await refreshConfigVariables();
      if (activeSection !== 'system-config') {
        await refreshSystemStatus();
      }
      toast.success('Configuration saved securely.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save configuration.');
    } finally {
      setIsSavingConfigVariable(false);
    }
  };

  const deleteConfigVariable = async (key: string) => {
    if (!authToken) {
      toast.error('Login required to delete configuration.');
      return;
    }

    const approved = window.confirm(`Delete configuration ${key}? This cannot be undone.`);
    if (!approved) return;

    setIsDeletingConfigVariable(key);
    try {
      await apiRequest(`/api/admin/configurations/${encodeURIComponent(key)}`, { method: 'DELETE' }, authToken);
      await refreshConfigVariables();
      if (activeSection !== 'system-config') {
        await refreshSystemStatus();
      }
      toast.success(`Deleted configuration ${key}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete configuration.');
    } finally {
      setIsDeletingConfigVariable(null);
    }
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
  }, [
    authToken,
    refreshToken,
    subscriptionFilter,
    premiumRequestStatusFilter,
    premiumRequestQuery,
    passwordRecoveryStatusFilter,
    passwordRecoveryQuery,
  ]);

  useEffect(() => {
    if (!authToken || !ready) return;

    let closed = false;
    let reconnectTimer: number | null = null;
    let source: EventSource | null = null;

    const closeCurrent = () => {
      if (source) {
        source.close();
        source = null;
      }
    };

    const connect = () => {
      if (closed) return;
      closeCurrent();
      source = new EventSource(`${buildApiUrl('/api/stream')}?token=${encodeURIComponent(authToken)}`);

      source.addEventListener('sync', () => {
        if (document.hidden) return;
        void loadAdminData(authToken).catch(() => undefined);
      });

      source.addEventListener('heartbeat', () => {
        // Keepalive only.
      });

      source.onerror = () => {
        closeCurrent();
        if (closed) return;
        reconnectTimer = window.setTimeout(() => {
          connect();
        }, 3000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (reconnectTimer) {
        window.clearTimeout(reconnectTimer);
      }
      closeCurrent();
    };
  }, [
    authToken,
    ready,
    subscriptionFilter,
    premiumRequestStatusFilter,
    premiumRequestQuery,
    passwordRecoveryStatusFilter,
    passwordRecoveryQuery,
  ]);

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

  useEffect(() => {
    if (!isQuestionBankView) return;

    if (!bankTree.length) {
      if (bankSubjectKey || bankChapterKey || bankSectionKey) {
        setBankSubjectKey('');
        setBankChapterKey('');
        setBankSectionKey('');
      }
      return;
    }

    const subject = bankTree.find((item) => item.key === bankSubjectKey);
    if (!subject) {
      if (bankSubjectKey) setBankSubjectKey('');
      if (bankChapterKey) setBankChapterKey('');
      if (bankSectionKey) setBankSectionKey('');
      return;
    }

    const chapter = subject.chapters.find((item) => item.key === bankChapterKey);
    if (!chapter) {
      if (bankChapterKey) setBankChapterKey('');
      if (bankSectionKey) setBankSectionKey('');
      return;
    }

    if (bankSectionKey && !chapter.sections.some((item) => item.key === bankSectionKey)) {
      setBankSectionKey('');
    }
  }, [isQuestionBankView, bankTree, bankSubjectKey, bankChapterKey, bankSectionKey]);

  useEffect(() => {
    if (!isQuestionBankView || !authToken || !activeBankSubject || !activeBankChapter || !activeBankSection) return;
    void loadBankMcqs(
      authToken,
      activeBankSubject.key,
      activeBankChapter.key,
      activeBankChapter.label,
      activeBankSection.label,
    ).catch(() => {
      setBankMcqs([]);
      toast.error('Could not load question bank items for this section.');
    });
  }, [isQuestionBankView, authToken, activeBankSubject, activeBankChapter, activeBankSection]);

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
      navigateToSection('dashboard');
      toast.success('Admin login successful.');

      void loadAdminData(payload.token).catch((error) => {
        const status = Number((error as { status?: number } | null)?.status || 0);
        if (status === 401 || status === 403) {
          clearAdminSession();
          toast.error('Session expired after login. Please sign in again.');
          return;
        }
        toast.error('Login succeeded, but admin data failed to load. Please click Refresh Data.');
      });
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

  const createUserAccount = async () => {
    if (!authToken) return;

    if (!createUserForm.email.trim() || !createUserForm.mobileNumber.trim() || !createUserForm.password.trim()) {
      toast.error('Email, mobile number, and password are required.');
      return;
    }

    if (createUserForm.password.trim().length < 8) {
      toast.error('Password must be at least 8 characters.');
      return;
    }

    try {
      setIsCreatingUser(true);
      await apiRequest('/api/admin/users/create', {
        method: 'POST',
        body: JSON.stringify({
          firstName: createUserForm.firstName,
          lastName: createUserForm.lastName,
          email: createUserForm.email.trim(),
          mobileNumber: createUserForm.mobileNumber.trim(),
          password: createUserForm.password,
          activatePlan: createUserForm.activatePlan,
          planId: createUserForm.planId,
        }),
      }, authToken);

      toast.success('User account created successfully.');
      setCreateUserForm({
        firstName: '',
        lastName: '',
        email: '',
        mobileNumber: '',
        password: '',
        activatePlan: false,
        planId: createUserForm.planId,
      });
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create user account.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const fillGeneratedTemporaryPassword = async () => {
    const generated = generateTemporaryPassword(12);
    setCreateUserForm((prev) => ({ ...prev, password: generated }));

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(generated);
        toast.success('Temporary password generated and copied.');
        return;
      }
    } catch {
      // Continue with generated-only success feedback.
    }

    toast.success('Temporary password generated.');
  };

  const copyTemporaryPassword = async () => {
    const currentPassword = createUserForm.password.trim();
    if (!currentPassword) {
      toast.error('Enter or generate a password first.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentPassword);
      } else {
        const temp = document.createElement('textarea');
        temp.value = currentPassword;
        temp.style.position = 'fixed';
        temp.style.opacity = '0';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        document.body.removeChild(temp);
      }
      toast.success('Password copied.');
    } catch {
      toast.error('Could not copy password.');
    }
  };

  const approveSignupRequest = async (request: SignupRequest) => {
    if (!authToken) return;
    setSignupRequests((prev) => prev.map((item) => (item.id === request.id
      ? {
          ...item,
          status: 'completed',
          codeDeliveryStatus: 'sent',
          codeSentAt: new Date().toISOString(),
        }
      : item)));

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
      setSignupRequests((prev) => prev.map((item) => (item.id === request.id ? request : item)));
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

  const approvePremiumRequest = async (request: PremiumSubscriptionRequest) => {
    if (!authToken) return;
    try {
      const payload = await apiRequest<{ requestId: string; token: { code: string; expiresAt: string } }>(
        `/api/admin/subscriptions/requests/${request.id}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment verified by admin.' }),
        },
        authToken,
      );
      setIssuedPremiumTokens((prev) => ({ ...prev, [request.id]: payload.token.code }));
      toast.success(`Premium request approved. Token: ${payload.token.code}`);
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not approve premium request.');
    }
  };

  const rejectPremiumRequest = async (request: PremiumSubscriptionRequest) => {
    if (!authToken) return;
    try {
      await apiRequest(
        `/api/admin/subscriptions/requests/${request.id}/reject`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: 'Payment could not be verified.' }),
        },
        authToken,
      );
      toast.success('Premium request rejected.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reject premium request.');
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

  const sendCodeInApp = async (requestId: string, purpose: 'signup' | 'premium') => {
    if (!authToken) return;
    try {
      const endpoint = purpose === 'premium'
        ? `/api/admin/subscriptions/requests/${requestId}/send-code`
        : `/api/admin/signup-requests/${requestId}/send-code`;

      await apiRequest(endpoint, { method: 'POST' }, authToken);
      toast.success('Code sent in-app successfully. User token field will auto-fill.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send code in-app.');
    }
  };

  const loadSupportThread = async (userId: string, activeToken = authToken) => {
    if (!activeToken || !userId) return;
    try {
      setIsSupportThreadLoading(true);
      const payload = await apiRequest<AdminSupportThreadPayload>(`/api/admin/support-chat/messages/${userId}`, {}, activeToken);
      setActiveSupportUser(payload.user || null);
      setSupportMessages(payload.messages || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load support thread.');
    } finally {
      setIsSupportThreadLoading(false);
    }
  };

  const sendSupportReply = async () => {
    if (!authToken || !selectedSupportUserId) return;
    const text = supportReplyText.trim();
    const messageType = supportReplyAttachment ? 'file' : 'text';
    if (messageType === 'text' && !text) return;
    try {
      setIsSendingSupportReply(true);
      await apiRequest(`/api/admin/support-chat/messages/${selectedSupportUserId}`, {
        method: 'POST',
        body: JSON.stringify({
          messageType,
          text,
          attachment: supportReplyAttachment,
        }),
      }, authToken);
      setSupportReplyText('');
      setSupportReplyAttachment(null);
      await Promise.all([
        loadSupportThread(selectedSupportUserId),
        apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, authToken)
          .then((payload) => setSupportConversations(payload.conversations || []))
          .catch(() => undefined),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send support reply.');
    } finally {
      setIsSendingSupportReply(false);
    }
  };

  const onSupportReplyFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    if (!selected) return;

    if (selected.size > ADMIN_SUPPORT_ATTACHMENT_MAX_BYTES) {
      toast.error('File exceeds 8MB size limit.');
      event.target.value = '';
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      setSupportReplyAttachment({
        name: selected.name,
        mimeType: String(selected.type || 'application/octet-stream').toLowerCase(),
        size: selected.size,
        dataUrl,
      });
      toast.success('File attached to admin reply.');
    } catch {
      toast.error('Could not read selected file.');
    } finally {
      event.target.value = '';
    }
  };

  const reactToSupportMessage = async (messageId: string, emoji: string) => {
    if (!authToken || !selectedSupportUserId) return;
    try {
      await apiRequest(`/api/admin/support-chat/messages/${selectedSupportUserId}/${messageId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      }, authToken);
      await loadSupportThread(selectedSupportUserId, authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not update reaction.');
    }
  };

  const openPaymentProof = async (path: string, fileName: string, fallbackDataUrl?: string, download = false) => {
    const fallback = String(fallbackDataUrl || '').trim();
    const previewWindow = !download ? window.open('', '_blank', 'noopener,noreferrer') : null;

    if (!authToken) {
      if (fallback.startsWith('data:')) {
        if (download) {
          if (!downloadDataUrlFile(fallback, fileName || 'payment-proof')) {
            toast.error('Could not download payment proof file.');
          }
        } else {
          const opened = openDataUrlPreview(fallback);
          if (!opened && previewWindow) previewWindow.close();
        }
        return;
      }
      if (previewWindow) previewWindow.close();
      toast.error('Session expired. Please log in again to access payment proof.');
      return;
    }

    try {
      const response = await fetch(path, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Proof request failed (${response.status})`);
      }

      const blob = await response.blob();

      if (download) {
        downloadBlobFile(blob, fileName || 'payment-proof');
      } else {
        openBlobPreview(blob, previewWindow);
      }
      return;
    } catch {
      if (fallback.startsWith('data:')) {
        if (download) {
          if (!downloadDataUrlFile(fallback, fileName || 'payment-proof')) {
            toast.error('Could not download payment proof file.');
          }
        } else {
          const opened = openDataUrlPreview(fallback);
          if (!opened && previewWindow) previewWindow.close();
        }
        return;
      }
      if (previewWindow) previewWindow.close();
      toast.error('Could not open payment proof. Please try again.');
    }
  };

  useEffect(() => {
    if (!authToken) return;
    if (!selectedSupportUserId) {
      if (supportConversations.length) {
        setSelectedSupportUserId(supportConversations[0].userId);
      }
      return;
    }

    void loadSupportThread(selectedSupportUserId, authToken);
  }, [selectedSupportUserId, authToken]);

  useEffect(() => {
    if (!supportConversations.length) {
      setSelectedSupportUserId('');
      setActiveSupportUser(null);
      setSupportMessages([]);
      return;
    }

    const selectedExistsInAll = supportConversations.some((item) => item.userId === selectedSupportUserId);
    const selectedExistsInFiltered = filteredSupportConversations.some((item) => item.userId === selectedSupportUserId);
    const shouldReselect = !selectedSupportUserId || !selectedExistsInAll || (supportConversationQuery.trim() && !selectedExistsInFiltered);

    if (shouldReselect) {
      const source = filteredSupportConversations.length ? filteredSupportConversations : supportConversations;
      setSelectedSupportUserId(source[0].userId);
    }
  }, [supportConversations, filteredSupportConversations, selectedSupportUserId, supportConversationQuery]);

  useEffect(() => {
    lastUserMessageInThreadRef.current = '';
  }, [selectedSupportUserId]);

  useEffect(() => {
    const unreadTotal = supportConversations.reduce((sum, item) => sum + Number(item.unreadForAdmin || 0), 0);
    if (!didHydrateSupportRef.current) {
      didHydrateSupportRef.current = true;
      lastUnreadTotalRef.current = unreadTotal;
      return;
    }

    if (unreadTotal > lastUnreadTotalRef.current) {
      const latestIncoming = supportConversations.find((item) => Number(item.unreadForAdmin || 0) > 0);
      playNotificationTone();
      toast.message('New incoming support message');
      notifyAdminDesktop(
        'NET360 Support Admin',
        latestIncoming
          ? `${latestIncoming.userName || latestIncoming.email}: ${latestIncoming.lastMessageText || 'New message'}`
          : 'You have new incoming support messages.',
      );
    }
    lastUnreadTotalRef.current = unreadTotal;
  }, [supportConversations]);

  useEffect(() => {
    const latestUserMessage = [...supportMessages].reverse().find((item) => item.senderRole === 'user');
    const latestUserMessageId = latestUserMessage?.id || '';
    if (!latestUserMessageId) return;

    if (!lastUserMessageInThreadRef.current) {
      lastUserMessageInThreadRef.current = latestUserMessageId;
      return;
    }

    if (latestUserMessageId !== lastUserMessageInThreadRef.current) {
      lastUserMessageInThreadRef.current = latestUserMessageId;
      playNotificationTone();
      toast.message('New message in active support thread');
      notifyAdminDesktop(
        'NET360 Active Thread',
        latestUserMessage?.text || 'You have a new message in the active support thread.',
      );
    }
  }, [supportMessages]);

  useEffect(() => {
    if (!authToken) return;

    const timer = window.setInterval(() => {
      void apiRequest<{ conversations: AdminSupportConversation[] }>('/api/admin/support-chat/conversations', {}, authToken)
        .then((payload) => setSupportConversations(payload.conversations || []))
        .catch(() => undefined);

      if (selectedSupportUserId) {
        void loadSupportThread(selectedSupportUserId, authToken);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [authToken, selectedSupportUserId]);

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
    if (!authToken || !selectedHierarchy || isSavingMcq) return;

    const normalizedOptionMedia = form.optionMedia
      .map((item, idx) => ({
        key: String(item.key || String.fromCharCode(65 + idx)).trim().toUpperCase(),
        text: String(item.text || '').trim(),
        image: item.image || null,
      }))
      .filter((item) => item.text || item.image);

    const options = normalizedOptionMedia.map((item) => item.text || `[${item.key}]`);

    if (!form.question.trim() && !form.questionImage) {
      toast.error('Question text or question image is required.');
      return;
    }

    if (normalizedOptionMedia.length < 2) {
      toast.error('At least 2 options are required (text, image, or both).');
      return;
    }

    const answerKey = resolveAnswerKeyFromInput(normalizedOptionMedia, form.answer);
    if (!answerKey) {
      toast.error('Provide a valid answer (A-D, option number, or exact option text).');
      return;
    }

    const selectedContext =
      selectedHierarchy.kind === 'section'
        ? {
            subject: selectedHierarchy.subject,
            part: selectedHierarchy.part,
            chapter: selectedHierarchy.chapterTitle,
            section: selectedHierarchy.sectionTitle,
            topic: String(form.topic || '').trim() || `${selectedHierarchy.chapterTitle} - ${selectedHierarchy.sectionTitle}`,
          }
        : {
            subject: selectedHierarchy.subject,
            part: '',
            chapter: '',
            section: selectedHierarchy.sectionTitle,
            topic: String(form.topic || '').trim() || selectedHierarchy.sectionTitle,
          };

    const normalizedSubject = String(selectedContext.subject || '').toLowerCase().trim();
    const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(normalizedSubject);

    if (!normalizedSubject) {
      toast.error('Subject is required before adding MCQs.');
      return;
    }

    if (!isFlatTopicSubject && (!selectedContext.part || !selectedContext.chapter.trim() || !selectedContext.section.trim())) {
      toast.error('Select subject, part, chapter, and section before adding MCQs.');
      return;
    }

    if (isFlatTopicSubject && !selectedContext.topic.trim()) {
      toast.error('Topic is required for this subject.');
      return;
    }

    const payload = {
      subject: normalizedSubject,
      part: isFlatTopicSubject ? '' : selectedContext.part,
      chapter: isFlatTopicSubject ? '' : selectedContext.chapter,
      section: isFlatTopicSubject ? (selectedContext.section || selectedContext.topic) : selectedContext.section,
      topic: selectedContext.topic,
      question: form.question,
      questionImage: form.questionImage,
      options,
      optionMedia: normalizedOptionMedia,
      answer: answerKey,
      answerKey,
      tip: form.explanationText,
      explanationText: form.explanationText,
      explanationImage: form.explanationImage,
      shortTrickText: '',
      shortTrickImage: null,
      difficulty: form.difficulty,
    };

    try {
      setIsSavingMcq(true);
      if (form.id) {
        const updateResult = await apiRequest<{ mcq?: AdminMCQ }>(`/api/admin/mcqs/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        }, authToken);

        if (updateResult?.mcq?.id) {
          setMcqs((previous) => previous.map((item) => (item.id === updateResult.mcq!.id ? updateResult.mcq! : item)));
        }

        toast.success('MCQ updated.');
      } else {
        const createResult = await apiRequest<{ mcq?: AdminMCQ }>('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify(payload),
        }, authToken);

        if (createResult?.mcq?.id) {
          setMcqs((previous) => {
            const next = [createResult.mcq!, ...previous.filter((item) => item.id !== createResult.mcq!.id)];
            return next;
          });
        }

        toast.success('MCQ added and saved to database.');
      }

      resetForm();
      setQuery('');

      void loadSectionMcqs(authToken, selectedHierarchy).catch((error) => {
        toast.error(error instanceof Error ? error.message : 'MCQ saved, but section refresh failed. Use Refresh Data.');
      });

      void apiRequest<{ structure: AdminMcqBankStructureItem[] }>('/api/admin/mcq-bank/structure', {}, authToken)
        .then((payload) => setMcqStructure(payload.structure || []))
        .catch(() => undefined);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save MCQ.');
    } finally {
      setIsSavingMcq(false);
    }
  };

  const analyzeBulkMcqs = async () => {
    if (!authToken) return;

    const hasText = Boolean(bulkInput.trim());
    if (!hasText && !bulkFile) {
      toast.error('Paste MCQs or upload a PDF, DOC, DOCX, or TXT file first.');
      return;
    }

    if (bulkFile && bulkFile.size > 8 * 1024 * 1024) {
      toast.error('Uploaded file is too large. Maximum size is 8 MB.');
      return;
    }

    try {
      setBulkProcessing(true);

      let payload: ParsedBulkResponse;

      if (bulkFile) {
        const dataUrl = await fileToDataUrl(bulkFile);
        payload = await apiRequest<ParsedBulkResponse>('/api/admin/mcqs/parse', {
          method: 'POST',
          body: JSON.stringify({
            sourceType: 'file',
            file: {
              name: bulkFile.name,
              mimeType: bulkFile.type,
              size: bulkFile.size,
              dataUrl,
            },
          }),
        }, authToken);
      } else {
        try {
          payload = await apiRequest<ParsedBulkResponse>('/api/admin/mcqs/parse', {
            method: 'POST',
            body: JSON.stringify({
              sourceType: 'text',
              rawText: bulkInput,
            }),
          }, authToken);
        } catch {
          // Fallback keeps local mode usable when backend parser route is unavailable.
          payload = parseBulkMcqs(bulkInput);
        }
      }

      setBulkParsed(payload.parsed || []);
      setBulkParseErrors(payload.errors || []);

      if (!payload.parsed?.length) {
        toast.error(payload.errors?.[0] || 'No questions were parsed.');
        return;
      }

      const limitedParsed = (payload.parsed || []).slice(0, 15);
      const didTrim = (payload.parsed || []).length > limitedParsed.length;
      if (didTrim) {
        const nextErrors = [...(payload.errors || [])];
        if (!nextErrors.some((error) => /first 15 mcqs/i.test(error))) {
          nextErrors.unshift('Only the first 15 MCQs were kept from this import.');
        }
        setBulkParseErrors(nextErrors);
      }
      setBulkParsed(limitedParsed);

      toast.success(`Parsed ${limitedParsed.length} MCQ(s). Review and confirm target before saving.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not parse uploaded content.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const uploadBulkMcqs = async () => {
    if (!authToken) return;

    if (!bulkParsed.length) {
      toast.error('Analyze content first, then save parsed MCQs.');
      return;
    }

    if (bulkParsed.length > 15) {
      toast.error('You can upload at most 15 questions at once.');
      return;
    }

    const resolveParsedContext = (item: ParsedBulkMcq) => {
      const fallbackFromSelection = selectedHierarchy
        ? selectedHierarchy.kind === 'section'
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
            }
        : null;

      const itemContext = normalizeParsedHierarchyContext({
        subject: item.subject,
        part: item.part,
        chapter: item.chapter,
        section: item.section,
        topic: item.topic,
      });

      const resolvedSubject = String(itemContext.subject || fallbackFromSelection?.subject || form.subject || 'general')
        .trim()
        .toLowerCase();
      const isFlatTopicSubject = FLAT_TOPIC_SUBJECTS.has(resolvedSubject);

      if (isFlatTopicSubject) {
        const resolvedTopic = String(itemContext.topic || itemContext.section || fallbackFromSelection?.topic || fallbackFromSelection?.section || form.topic || form.section || 'General Topic').trim();
        return {
          subject: resolvedSubject,
          part: '',
          chapter: '',
          section: String(itemContext.section || fallbackFromSelection?.section || resolvedTopic).trim(),
          topic: resolvedTopic,
        };
      }

      const resolvedPart = String(itemContext.part || fallbackFromSelection?.part || form.part || 'part1').trim().toLowerCase();
      const resolvedChapter = String(itemContext.chapter || fallbackFromSelection?.chapter || form.chapter || 'General').trim();
      const resolvedSection = String(itemContext.section || itemContext.topic || fallbackFromSelection?.section || form.section || 'General').trim();
      const resolvedTopic = String(itemContext.topic || fallbackFromSelection?.topic || `${resolvedChapter} - ${resolvedSection}`).trim();

      return {
        subject: resolvedSubject,
        part: resolvedPart === 'part2' ? 'part2' : 'part1',
        chapter: resolvedChapter,
        section: resolvedSection,
        topic: resolvedTopic,
      };
    };

    let previewLabel = 'Mixed parsed hierarchy';
    if (selectedHierarchy) {
      previewLabel = hierarchyLabel(selectedHierarchy);
    } else if (bulkParsed[0]?.subject) {
      previewLabel = `${bulkParsed[0].subject}${bulkParsed.length > 1 ? ' (and others)' : ''}`;
    }

    if (!window.confirm(`Save ${bulkParsed.length} MCQ(s)?\nTarget: ${previewLabel}\n\nContinue?`)) {
      return;
    }

    try {
      setBulkUploading(true);

      for (const item of bulkParsed) {
        const contextPayload = resolveParsedContext(item);
        const optionMedia = item.options.map((text, idx) => ({
          key: String.fromCharCode(65 + idx),
          text,
          image: parsedDataUrlToImage(item.optionImageDataUrls?.[idx], `option-${idx + 1}-image`),
        }));

        await apiRequest('/api/admin/mcqs', {
          method: 'POST',
          body: JSON.stringify({
            ...contextPayload,
            question: item.question,
            questionImageUrl: item.questionImageUrl,
            questionImage: parsedDataUrlToImage(item.questionImageDataUrl, 'question-image'),
            options: item.options,
            optionMedia,
            answer: item.answer,
            tip: item.tip,
            explanationText: item.tip,
            explanationImage: parsedDataUrlToImage(item.explanationImageDataUrl, 'explanation-image'),
            shortTrickText: '',
            shortTrickImage: null,
            difficulty: item.difficulty,
          }),
        }, authToken);
      }

      toast.success(`${bulkParsed.length} MCQ(s) uploaded successfully.`);
      setBulkInput('');
      setBulkFile(null);
      setBulkParsed([]);
      setBulkParseErrors([]);
      if (selectedHierarchy) {
        await loadSectionMcqs(authToken, selectedHierarchy);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Bulk upload failed.');
    } finally {
      setBulkUploading(false);
    }
  };

  const updateParsedMcq = (index: number, updater: (item: ParsedBulkMcq) => ParsedBulkMcq) => {
    setBulkParsed((previous) => previous.map((item, idx) => (idx === index ? updater(item) : item)));
  };

  const updateParsedOption = (mcqIndex: number, optionIndex: number, value: string) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      options[optionIndex] = value;
      return { ...item, options };
    });
  };

  const addParsedOption = (mcqIndex: number) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      if (options.length >= 5) return item;
      options.push('');
      return { ...item, options };
    });
  };

  const removeParsedOption = (mcqIndex: number, optionIndex: number) => {
    updateParsedMcq(mcqIndex, (item) => {
      const options = [...(item.options || [])];
      if (options.length <= 2) return item;
      options.splice(optionIndex, 1);
      const optionImageDataUrls = Array.isArray(item.optionImageDataUrls) ? [...item.optionImageDataUrls] : [];
      if (optionImageDataUrls.length > optionIndex) {
        optionImageDataUrls.splice(optionIndex, 1);
      }
      return {
        ...item,
        options,
        optionImageDataUrls,
      };
    });
  };

  const removeParsedMcq = (mcqIndex: number) => {
    setBulkParsed((previous) => previous.filter((_, idx) => idx !== mcqIndex));
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

  const assignSubscriptionByEmail = async () => {
    if (!authToken) return;

    if (!assignPlanForm.email.trim() || !assignPlanForm.planId.trim()) {
      toast.error('User email and plan are required.');
      return;
    }

    try {
      setIsAssigningPlan(true);
      await apiRequest('/api/admin/subscriptions/assign', {
        method: 'POST',
        body: JSON.stringify({
          email: assignPlanForm.email.trim(),
          planId: assignPlanForm.planId,
          status: assignPlanForm.status,
          paymentReference: `admin-${Date.now()}`,
        }),
      }, authToken);

      toast.success('Subscription assigned successfully.');
      await loadAdminData(authToken);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not assign subscription.');
    } finally {
      setIsAssigningPlan(false);
    }
  };

  const resetPracticeForm = () => {
    setPracticeForm(emptyPracticeForm());
    setPracticeQuestionUpload(null);
    setPracticeSolutionUpload(null);
  };

  const savePracticeQuestion = async () => {
    if (!authToken) return;

    if (!practiceForm.subject.trim()) {
      toast.error('Subject is required.');
      return;
    }

    if (practiceQuestionUpload && !isSupportedPracticeFile(practiceQuestionUpload)) {
      toast.error('Question file must be JPG, PNG, PDF, DOC, or DOCX.');
      return;
    }

    if (practiceSolutionUpload && !isSupportedPracticeFile(practiceSolutionUpload)) {
      toast.error('Solution file must be JPG, PNG, PDF, DOC, or DOCX.');
      return;
    }

    if (practiceQuestionUpload && practiceQuestionUpload.size > PRACTICE_FILE_MAX_BYTES) {
      toast.error('Question file exceeds 8MB limit.');
      return;
    }

    if (practiceSolutionUpload && practiceSolutionUpload.size > PRACTICE_FILE_MAX_BYTES) {
      toast.error('Solution file exceeds 8MB limit.');
      return;
    }

    let questionFilePayload = practiceForm.questionFile || null;
    let solutionFilePayload = practiceForm.solutionFile || null;

    try {
      if (practiceQuestionUpload) {
        questionFilePayload = {
          name: practiceQuestionUpload.name,
          mimeType: practiceQuestionUpload.type || 'application/octet-stream',
          size: practiceQuestionUpload.size,
          dataUrl: await fileToDataUrl(practiceQuestionUpload),
        };
      }

      if (practiceSolutionUpload) {
        solutionFilePayload = {
          name: practiceSolutionUpload.name,
          mimeType: practiceSolutionUpload.type || 'application/octet-stream',
          size: practiceSolutionUpload.size,
          dataUrl: await fileToDataUrl(practiceSolutionUpload),
        };
      }
    } catch {
      toast.error('Could not read uploaded file. Please try again.');
      return;
    }

    if (!practiceForm.questionText.trim() && !questionFilePayload) {
      toast.error('Provide question text or upload a question file.');
      return;
    }

    if (!practiceForm.solutionText.trim() && !solutionFilePayload) {
      toast.error('Provide solution text or upload a solution file.');
      return;
    }

    const payload = {
      subject: practiceForm.subject.toLowerCase().trim(),
      difficulty: practiceForm.difficulty,
      questionText: practiceForm.questionText.trim(),
      questionFile: questionFilePayload,
      solutionText: practiceForm.solutionText.trim(),
      solutionFile: solutionFilePayload,
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
    const previousSubmission = questionSubmissions.find((item) => item.id === submissionId) || null;

    setQuestionSubmissions((prev) => prev.map((item) => {
      if (item.id !== submissionId) return item;
      const existingReasons = Array.isArray(item.moderation?.reasons) ? item.moderation?.reasons : [];
      return {
        ...item,
        status,
        reviewNotes: notes,
        reviewedAt: new Date().toISOString(),
        moderation: {
          ...item.moderation,
          result: status,
          reasons: existingReasons,
        },
      };
    }));
    setCollapsedReviewedSubmissionIds((prev) => ({ ...prev, [submissionId]: true }));

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
      if (previousSubmission) {
        setQuestionSubmissions((prev) => prev.map((item) => (item.id === submissionId ? previousSubmission : item)));
      }
      setCollapsedReviewedSubmissionIds((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, submissionId)) return prev;
        const next = { ...prev };
        delete next[submissionId];
        return next;
      });
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
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="flex min-h-screen items-center justify-center p-5">
          <button
            type="button"
            onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            className="fixed right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 shadow-md transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
            aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Card>
            <CardContent className="py-8">Loading admin panel...</CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!authToken) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <button
          type="button"
          onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          className="fixed right-4 top-4 z-50 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 shadow-md transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
          aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {themeMode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        <div className="flex min-h-screen items-center justify-center p-5">
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
      </div>
    );
  }

  if (isQuestionBankView) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />
        <div className="relative z-10 min-h-screen p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[1700px] space-y-4 sm:space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1>Question Bank Explorer</h1>
              <p className="text-sm text-muted-foreground">Browse all MCQs by Subject, Chapter, and Section/Topic.</p>
            </div>
            <Button variant="outline" onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}>
              Back to Admin Dashboard
            </Button>
          </header>

          <div className="grid gap-4 lg:grid-cols-[280px_320px_320px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {bankTree.map((subject) => (
                  <button
                    type="button"
                    key={subject.key}
                    onClick={() => {
                      setBankSubjectKey(subject.key);
                      setBankChapterKey('');
                      setBankSectionKey('');
                      setBankMcqs([]);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankSubjectKey === subject.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{subject.label}</span>
                      <Badge variant="outline">{subject.count}</Badge>
                    </div>
                  </button>
                ))}
                {!bankTree.length ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No subjects available yet.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Chapters</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {!activeBankSubject ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a subject first.
                  </div>
                ) : null}
                {(activeBankSubject?.chapters || []).map((chapter) => (
                  <button
                    type="button"
                    key={chapter.key}
                    onClick={() => {
                      setBankChapterKey(chapter.key);
                      setBankSectionKey('');
                      setBankMcqs([]);
                    }}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankChapterKey === chapter.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{chapter.label}</span>
                      <Badge variant="outline">{chapter.count}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sections / Topics</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[70vh] space-y-2 overflow-auto">
                {!activeBankSubject ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a subject first.
                  </div>
                ) : null}
                {activeBankSubject && !activeBankChapter ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Select a chapter first.
                  </div>
                ) : null}
                {(activeBankChapter?.sections || []).map((section) => (
                  <button
                    type="button"
                    key={section.key}
                    onClick={() => setBankSectionKey(section.key)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${bankSectionKey === section.key ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{section.label}</span>
                      <Badge variant="outline">{section.count}</Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>MCQs</CardTitle>
                <CardDescription>
                  {activeBankSubject?.label || '-'} / {activeBankChapter?.label || '-'} / {activeBankSection?.label || '-'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[70vh] overflow-auto">
                {!activeBankSection ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    Select a section/topic to load MCQs.
                  </div>
                ) : null}
                {bankLoading ? <p className="text-sm text-muted-foreground">Loading MCQs...</p> : null}
                {!bankLoading && activeBankSection && !bankMcqs.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No MCQs found for this section/topic.
                  </div>
                ) : null}
                {bankMcqs.map((item, idx) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm space-y-1.5">
                    <p className="font-medium">Q{idx + 1}. {item.question}</p>
                    {item.options.map((option, optionIdx) => (
                      <p key={`${item.id}-opt-${optionIdx}`} className="text-muted-foreground">
                        {String.fromCharCode(65 + optionIdx)}) {option}
                      </p>
                    ))}
                    <p>Answer: <span className="font-medium">{item.answer}</span></p>
                    {item.tip ? <p className="text-muted-foreground">Explanation: {item.tip}</p> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
    );
  }

  if (isPracticeBoardBankView) {
    return (
      <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />
        <div className="relative z-10 min-h-screen p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[1700px] space-y-4 sm:space-y-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1>Practice Board Question Bank</h1>
              <p className="text-sm text-muted-foreground">Browse conceptual questions by subject and open attached files directly.</p>
            </div>
            <Button variant="outline" onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}>
              Back to Admin Dashboard
            </Button>
          </header>

          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle>Subjects</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[72vh] space-y-2 overflow-auto">
                {practiceQuestionsBySubject.map((entry) => (
                  <button
                    type="button"
                    key={entry.subject}
                    onClick={() => setPracticeBankSubjectKey(entry.subject)}
                    className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activePracticeBankSubject?.subject === entry.subject ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{entry.subject}</span>
                      <Badge variant="outline">{entry.questions.length}</Badge>
                    </div>
                  </button>
                ))}
                {!practiceQuestionsBySubject.length ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No practice board questions found.
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Questions</CardTitle>
                <CardDescription>
                  {activePracticeBankSubject?.subject || 'Select a subject'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[72vh] overflow-auto">
                <Input
                  placeholder="Search by text, difficulty, or file name..."
                  value={practiceQuery}
                  onChange={(e) => setPracticeQuery(e.target.value)}
                />

                {practiceBankVisibleQuestions.map((item, idx) => (
                  <div key={item.id} className="rounded-md border p-3 text-sm space-y-2">
                    <p className="font-medium">Q{idx + 1}. {item.questionText || '(File-based question)'}</p>
                    <p className="text-xs text-muted-foreground">Difficulty: {item.difficulty || 'Medium'}</p>

                    {item.questionFile ? (
                      <div className="rounded-md bg-slate-50 p-2 text-xs space-y-1">
                        <p>Question file: {item.questionFile.name}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openPracticeFile(item.questionFile)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPracticeFile(item.questionFile)}>Download</Button>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-md bg-emerald-50/60 p-2">
                      <p className="text-xs uppercase tracking-wide text-emerald-700">Solution</p>
                      <p className="mt-1 whitespace-pre-wrap text-xs text-slate-700">{item.solutionText || '(File-only solution)'}</p>
                    </div>

                    {item.solutionFile ? (
                      <div className="rounded-md bg-slate-50 p-2 text-xs space-y-1">
                        <p>Solution file: {item.solutionFile.name}</p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => openPracticeFile(item.solutionFile)}>View</Button>
                          <Button size="sm" variant="outline" onClick={() => downloadPracticeFile(item.solutionFile)}>Download</Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!practiceBankVisibleQuestions.length ? (
                  <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                    No questions found for this subject.
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-shell min-h-screen bg-gradient-to-br from-slate-100 via-cyan-50 to-indigo-100 text-slate-900 transition-colors dark:from-[#060b1b] dark:via-[#1b1642] dark:to-[#062a33] dark:text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_16%_18%,rgba(56,189,248,0.16),transparent_40%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.18),transparent_35%),radial-gradient(circle_at_78%_80%,rgba(20,184,166,0.14),transparent_40%)] dark:bg-[radial-gradient(circle_at_15%_20%,rgba(56,189,248,0.18),transparent_38%),radial-gradient(circle_at_80%_10%,rgba(168,85,247,0.26),transparent_36%),radial-gradient(circle_at_75%_78%,rgba(45,212,191,0.22),transparent_42%)]" />

      <div
        className={`fixed inset-0 z-30 bg-slate-900/45 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isMobileSidebarOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={() => setIsMobileSidebarOpen(false)}
      />

      <aside
        className={`admin-sidebar fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-300/70 bg-white/80 px-3 py-4 shadow-[0_16px_45px_rgba(15,23,42,0.15)] backdrop-blur-xl transition-all duration-300 ease-out dark:border-white/10 dark:bg-slate-950/60 dark:shadow-[0_20px_45px_rgba(3,8,30,0.55)] ${isSidebarExpanded ? 'w-72' : 'w-20'} ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className={`mb-5 flex items-center ${isSidebarExpanded ? 'justify-between' : 'justify-center'}`}>
          {isSidebarExpanded ? (
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">NET360 Admin</h1>
              <p className="text-xs text-slate-600 dark:text-slate-300">Control center</p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={toggleSidebar}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
            aria-label={isSidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <span className="hidden lg:inline-flex">
              {isSidebarExpanded ? <PanelLeftClose className="h-4.5 w-4.5" /> : <PanelLeftOpen className="h-4.5 w-4.5" />}
            </span>
            <span className="inline-flex lg:hidden">
              <X className="h-4.5 w-4.5" />
            </span>
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {ADMIN_SECTION_META.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.section;
            return (
              <button
                type="button"
                key={item.section}
                onClick={() => navigateToSection(item.section)}
                title={!isSidebarExpanded ? item.label : undefined}
                className={`admin-nav-item group flex h-11 w-full items-center rounded-xl border px-3 text-sm transition-all duration-200 ${isSidebarExpanded ? 'justify-start gap-2.5' : 'justify-center'} ${isActive
                  ? 'border-cyan-400/40 bg-gradient-to-r from-cyan-500/25 to-indigo-500/25 text-slate-900 shadow-[0_8px_25px_rgba(14,116,144,0.22)] dark:text-white'
                  : 'border-slate-300/70 bg-white/65 text-slate-700 hover:border-cyan-300/45 hover:bg-cyan-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:hover:bg-white/10'}
                `}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-700 dark:text-cyan-200' : 'text-slate-500 dark:text-slate-300'}`} />
                {isSidebarExpanded ? <span className="truncate">{item.label}</span> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <main className={`admin-main relative z-10 px-3 py-4 transition-[margin-left] duration-300 sm:px-5 lg:px-8 lg:py-6 ${isSidebarExpanded ? 'lg:ml-72' : 'lg:ml-20'}`}>
        <div className="admin-content mx-auto w-full max-w-[1700px] space-y-5">
          <header className="admin-header-panel rounded-2xl border border-slate-300/70 bg-white/75 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.12)] backdrop-blur-md dark:border-white/15 dark:bg-white/10 dark:shadow-[0_20px_50px_rgba(8,20,46,0.45)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-300/70 bg-white/80 text-slate-700 transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                  aria-hidden="true"
                >
                  <img
                    src={ADMIN_BRAND_LOGO_SRC}
                    alt=""
                    className="h-6 w-6 rounded-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">NET360 Admin Management</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300">Manage users and MCQs from this separate panel</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setThemeMode((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                  className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-300/70 bg-white/80 px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-white dark:border-white/15 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20"
                  aria-label={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  title={themeMode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                >
                  {themeMode === 'dark' ? <Sun className="h-4 w-4 shrink-0" /> : <Moon className="h-4 w-4 shrink-0" />}
                  <span className="hidden text-xs sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
                </button>
                <Button variant="outline" className="border-slate-300/70 bg-white/70 text-slate-800 hover:bg-white dark:border-white/25 dark:bg-white/10 dark:text-slate-100 dark:hover:bg-white/20" onClick={logout}>Logout</Button>
              </div>
            </div>
          </header>

          {activeSection === 'dashboard' ? (
            <>
              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-cyan-200"><Gauge className="h-4 w-4" />System Overview</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Metric title="Registered Users" value={String(overview?.usersCount || 0)} icon={Users} tone="from-cyan-500/30 to-blue-500/20" />
                  <Metric title="Question Bank" value={String(overview?.mcqCount || 0)} icon={Boxes} tone="from-violet-500/35 to-fuchsia-500/20" onClick={openQuestionBankWindow} />
                  <Metric title="Practice Board Question Bank" value={String(practiceQuestions.length)} icon={BookCheck} tone="from-indigo-500/35 to-cyan-500/20" onClick={openPracticeBoardBankWindow} />
                  <Metric title="Attempts" value={String(overview?.attemptsCount || 0)} icon={BarChart3} tone="from-pink-500/35 to-rose-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-violet-200"><UserCog className="h-4 w-4" />User Management</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Average Score" value={`${overview?.averageScore || 0}%`} icon={Activity} tone="from-blue-500/30 to-cyan-500/20" />
                  <Metric title="Pending Signup Requests" value={String(overview?.pendingSignupRequests || 0)} icon={ClipboardList} tone="from-amber-500/30 to-orange-500/20" />
                  <Metric title="Approved Requests" value={String(signupRequests.filter((item) => item.status === 'approved').length)} icon={FileCheck2} tone="from-emerald-500/30 to-teal-500/20" />
                  <Metric title="Completed Signups" value={String(signupRequests.filter((item) => item.status === 'completed').length)} icon={Users} tone="from-violet-500/25 to-blue-500/20" />
                  <Metric title="Recovery Requests" value={String(overview?.recoveryRequestCount || 0)} icon={ShieldAlert} tone="from-pink-500/25 to-red-500/20" />
                  <Metric title="Tracked Users" value={String(subscriptionOverview?.totalUsers || 0)} icon={UserCog} tone="from-cyan-500/25 to-indigo-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-fuchsia-200"><FileQuestion className="h-4 w-4" />Content Management</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Pending User Submissions" value={String(overview?.pendingQuestionSubmissions || 0)} icon={ClipboardList} tone="from-amber-500/30 to-yellow-500/20" />
                  <Metric title="Pending Premium Requests" value={String(overview?.pendingPremiumRequests || 0)} icon={Sparkles} tone="from-fuchsia-500/30 to-violet-500/20" />
                  <Metric title="Approved Submissions" value={String(questionSubmissions.filter((item) => item.status === 'approved').length)} icon={FileCheck2} tone="from-emerald-500/30 to-cyan-500/20" />
                  <Metric title="Rejected Submissions" value={String(questionSubmissions.filter((item) => item.status === 'rejected').length)} icon={ShieldAlert} tone="from-rose-500/30 to-red-500/20" />
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-slate-700 dark:text-teal-200"><CreditCard className="h-4 w-4" />Analytics</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <Metric title="Active Subscriptions" value={String(subscriptionOverview?.activeUsers || 0)} icon={CreditCard} tone="from-emerald-500/30 to-cyan-500/20" />
                  <Metric title="Expired/Inactive" value={String(subscriptionOverview?.expiredUsers || 0)} icon={Activity} tone="from-rose-500/30 to-orange-500/20" />
                </div>
              </section>

              <Card className="rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_45px_rgba(6,10,40,0.45)] backdrop-blur-xl">
                <CardHeader>
                  <CardTitle>Password Recovery Snapshot</CardTitle>
                  <CardDescription className="text-slate-300">Quick delivery status overview for recent recovery activity.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Badge className="bg-emerald-500 text-white">sent: {overview?.recoveryStatusCounts?.sent || 0}</Badge>
                  <Badge className="bg-amber-500 text-white">partial: {overview?.recoveryStatusCounts?.partial || 0}</Badge>
                  <Badge className="bg-rose-500 text-white">failed: {overview?.recoveryStatusCounts?.failed || 0}</Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">not_found: {overview?.recoveryStatusCounts?.not_found || 0}</Badge>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-white/20 bg-white/10 shadow-[0_20px_45px_rgba(6,10,40,0.45)] backdrop-blur-xl">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>System Status</CardTitle>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 border-white/25 bg-white/10 text-slate-100 hover:bg-white/20"
                      onClick={() => void refreshSystemStatus()}
                      disabled={isRefreshingSystemStatus}
                    >
                      {isRefreshingSystemStatus ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                      {isRefreshingSystemStatus ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                  <CardDescription className="text-slate-300">Live backend connectivity check for AI mentor services.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                  <Badge className={systemStatus?.openai?.configured ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}>
                    OpenAI: {systemStatus?.openai?.configured ? 'Configured' : 'Missing key'}
                  </Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">Model: {systemStatus?.openai?.model || 'unknown'}</Badge>
                  <Badge className="border border-white/20 bg-slate-900/30 text-slate-100">Key source: {systemStatus?.openai?.keySource || 'missing'}</Badge>
                </CardContent>
              </Card>
            </>
          ) : null}

          <Tabs
            value={activeSection}
            onValueChange={(value) => navigateToSection(value as AdminSection)}
            className="w-full min-w-0 space-y-4"
          >
            <div className="hidden" />

        <TabsContent value="dashboard" className="hidden" />

        <TabsContent value="system-config" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>Secure Configuration Management</CardTitle>
                  <CardDescription>Add, update, or remove API keys and runtime variables encrypted at rest.</CardDescription>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void refreshConfigVariables()}
                  disabled={isRefreshingConfigVariables}
                >
                  {isRefreshingConfigVariables ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
                  {isRefreshingConfigVariables ? 'Refreshing...' : 'Refresh List'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="config-key">Key (e.g. OPENAI_API_KEY)</Label>
                  <Input
                    id="config-key"
                    value={configForm.key}
                    onChange={(e) => setConfigForm((prev) => ({ ...prev, key: e.target.value.toUpperCase() }))}
                    placeholder="OPENAI_API_KEY"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="config-secret-mode">Type</Label>
                  <Select
                    value={configForm.isSecret ? 'secret' : 'plain'}
                    onValueChange={(value) => setConfigForm((prev) => ({ ...prev, isSecret: value === 'secret' }))}
                  >
                    <SelectTrigger id="config-secret-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="secret">Secret (masked)</SelectItem>
                      <SelectItem value="plain">Plain config</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="config-value">Value</Label>
                <Textarea
                  id="config-value"
                  value={configForm.value}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, value: e.target.value }))}
                  placeholder="Paste secure value"
                  className="min-h-[100px]"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="config-description">Description (optional)</Label>
                <Input
                  id="config-description"
                  value={configForm.description}
                  onChange={(e) => setConfigForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="What this key/config is used for"
                />
              </div>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void saveConfigVariable()} disabled={isSavingConfigVariable}>
                  {isSavingConfigVariable ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  {isSavingConfigVariable ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>

              <div className="rounded-lg border">
                <div className="grid grid-cols-1 gap-3 p-3 text-sm md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] md:items-center">
                  <p className="font-medium">Key</p>
                  <p className="font-medium">Value Preview</p>
                  <p className="font-medium">Updated By</p>
                  <p className="font-medium text-right">Actions</p>
                </div>

                {(configVariables || []).map((item) => (
                  <div key={item.key} className="grid grid-cols-1 gap-3 border-t p-3 text-sm md:grid-cols-[1.2fr_1fr_0.8fr_0.8fr] md:items-center">
                    <div>
                      <p className="font-medium text-slate-900">{item.key}</p>
                      {item.description ? <p className="text-xs text-muted-foreground">{item.description}</p> : null}
                      <p className="text-xs text-muted-foreground">{item.isSecret ? 'Secret' : 'Plain'}{item.updatedAt ? ` • ${new Date(item.updatedAt).toLocaleString()}` : ''}</p>
                    </div>
                    <p className="font-mono text-xs break-all text-slate-700">{item.valuePreview || '-'}</p>
                    <p className="text-xs text-muted-foreground">{item.updatedByEmail || '-'}</p>
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-rose-200 text-rose-700 hover:bg-rose-50"
                        onClick={() => void deleteConfigVariable(item.key)}
                        disabled={isDeletingConfigVariable === item.key}
                      >
                        {isDeletingConfigVariable === item.key ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                        {isDeletingConfigVariable === item.key ? 'Deleting...' : 'Delete'}
                      </Button>
                    </div>
                  </div>
                ))}

                {!configVariables.length ? (
                  <div className="border-t px-3 py-6 text-center text-sm text-muted-foreground">
                    No configuration values stored yet.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="support-chat" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Live Support Conversations</CardTitle>
              <CardDescription>View student messages in real time and reply directly from admin panel.</CardDescription>
              <div className="flex justify-end gap-2">
                {adminDesktopAlertsEnabled ? (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setAdminDesktopAlertsPreference(false)}>
                    Desktop Alerts: On
                  </Button>
                ) : (
                  <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => void enableAdminDesktopAlerts()}>
                    Enable Desktop Alerts
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 lg:grid-cols-[300px_1fr]">
                <div className="admin-support-list space-y-2 rounded-lg border p-2">
                  <Input
                    value={supportConversationQuery}
                    onChange={(e) => setSupportConversationQuery(e.target.value)}
                    placeholder="Search by name, email, mobile, or message"
                  />

                  <div className="max-h-[500px] space-y-2 overflow-auto">
                  {!filteredSupportConversations.length ? (
                    <p className="p-2 text-sm text-muted-foreground">No support conversations yet.</p>
                  ) : null}
                  {filteredSupportConversations.map((conversation) => (
                    <button
                      key={conversation.userId}
                      type="button"
                      onClick={() => setSelectedSupportUserId(conversation.userId)}
                      className={`admin-support-conversation w-full rounded-md border px-2.5 py-2 text-left transition ${
                        selectedSupportUserId === conversation.userId
                          ? 'admin-support-conversation-active border-indigo-300 bg-indigo-50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="line-clamp-1 text-sm font-medium">{conversation.userName || conversation.email}</p>
                        {conversation.unreadForAdmin > 0 ? (
                          <Badge className="admin-support-unread-badge bg-rose-600 text-white">{conversation.unreadForAdmin}</Badge>
                        ) : null}
                      </div>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{conversation.email || 'No email'}</p>
                      <p className="admin-support-conversation-preview mt-1 line-clamp-2 text-xs text-slate-600">{conversation.lastMessageText || 'No message text'}</p>
                    </button>
                  ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="admin-support-header rounded-lg border p-3">
                    <p className="text-sm font-medium">{activeSupportUser?.name || 'Select a conversation'}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeSupportUser?.email || ''}
                      {activeSupportUser?.mobileNumber ? ` • ${activeSupportUser.mobileNumber}` : ''}
                    </p>
                  </div>

                  <div className="admin-support-banner rounded-md border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-[11px] text-emerald-800">
                    Secure chat channel active. Messages and files are protected in transit.
                  </div>

                  <div className="admin-support-thread max-h-[420px] space-y-2 overflow-auto rounded-lg border bg-slate-50 p-3">
                    {isSupportThreadLoading ? <p className="text-xs text-muted-foreground">Loading thread...</p> : null}
                    {!supportMessages.length ? <p className="text-xs text-muted-foreground">No messages in this thread.</p> : null}
                    {supportMessages.map((item) => (
                      <div
                        key={item.id}
                        className={`admin-support-bubble max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                          item.senderRole === 'admin'
                            ? 'admin-support-bubble-admin ml-auto bg-indigo-600 text-white'
                            : 'admin-support-bubble-user mr-auto border bg-white text-slate-700'
                        }`}
                      >
                        {item.messageType === 'file' && item.attachment ? (
                          <div className="admin-support-attachment space-y-1">
                            <p>{item.text || 'Shared a file'}</p>
                            <a href={item.attachment.dataUrl} download={item.attachment.name} className="text-xs underline underline-offset-2">
                              {item.attachment.name}
                            </a>
                          </div>
                        ) : (
                          <p>{item.text}</p>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1">
                          {ADMIN_SUPPORT_REACTIONS.map((emoji) => (
                            <button
                              key={`${item.id}-${emoji}`}
                              type="button"
                              className="admin-support-reaction-button rounded border bg-white/80 px-1.5 py-0.5 text-[11px] text-slate-800"
                              onClick={() => void reactToSupportMessage(item.id, emoji)}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                        {Array.isArray(item.reactions) && item.reactions.length ? (
                          <p className={`admin-support-bubble-meta mt-1 text-[10px] ${item.senderRole === 'admin' ? 'text-indigo-100' : 'text-slate-500'}`}>
                            {item.reactions.map((reaction) => reaction.emoji).join(' ')}
                          </p>
                        ) : null}
                        <p className={`admin-support-bubble-meta mt-1 text-[10px] ${item.senderRole === 'admin' ? 'text-indigo-100' : 'text-slate-400'}`}>
                          {item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-end gap-2">
                    <Textarea
                      value={supportReplyText}
                      onChange={(e) => setSupportReplyText(e.target.value)}
                      placeholder="Type support reply"
                      className="min-h-[82px]"
                      disabled={!selectedSupportUserId}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void sendSupportReply();
                        }
                      }}
                    />
                    <div className="flex flex-col gap-2">
                      <Button type="button" variant="outline" className="h-10" onClick={() => supportReplyFileInputRef.current?.click()} disabled={!selectedSupportUserId || isSendingSupportReply}>
                        File
                      </Button>
                      <input
                        ref={supportReplyFileInputRef}
                        type="file"
                        accept={ADMIN_SUPPORT_ATTACHMENT_ACCEPT}
                        className="hidden"
                        onChange={(e) => void onSupportReplyFileSelected(e)}
                      />
                      <Button
                        className="h-10"
                        onClick={() => void sendSupportReply()}
                        disabled={isSendingSupportReply || !selectedSupportUserId || (!supportReplyText.trim() && !supportReplyAttachment)}
                      >
                        {isSendingSupportReply ? 'Sending...' : 'Send'}
                      </Button>
                    </div>
                  </div>
                  {supportReplyAttachment ? (
                    <div className="admin-support-attachment-preview rounded-md border bg-slate-50 px-3 py-2 text-xs">
                      <p className="font-medium">Attached: {supportReplyAttachment.name}</p>
                      <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setSupportReplyAttachment(null)}>
                        Remove File
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Create Account (Admin)</CardTitle>
              <CardDescription>Create student accounts directly without signup token flow.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="admin-create-first-name">First Name</Label>
                  <Input
                    id="admin-create-first-name"
                    value={createUserForm.firstName}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-last-name">Last Name</Label>
                  <Input
                    id="admin-create-last-name"
                    value={createUserForm.lastName}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-email">Email</Label>
                  <Input
                    id="admin-create-email"
                    type="email"
                    value={createUserForm.email}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="student@example.com"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-mobile">Mobile Number</Label>
                  <Input
                    id="admin-create-mobile"
                    value={createUserForm.mobileNumber}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, mobileNumber: e.target.value }))}
                    placeholder="+923001234567"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-password">Temporary Password</Label>
                  <Input
                    id="admin-create-password"
                    type="password"
                    value={createUserForm.password}
                    onChange={(e) => setCreateUserForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="At least 8 characters"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => void fillGeneratedTemporaryPassword()}>
                      Generate Temporary Password
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => void copyTemporaryPassword()}>
                      Copy Password
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="admin-create-plan">Initial Plan (Optional)</Label>
                  <Select
                    value={createUserForm.planId}
                    onValueChange={(value) => setCreateUserForm((prev) => ({ ...prev, planId: value }))}
                  >
                    <SelectTrigger id="admin-create-plan">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(subscriptionOverview?.plans || []).map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                      ))}
                      {!(subscriptionOverview?.plans || []).length ? <SelectItem value="basic_monthly">Basic Plan</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={createUserForm.activatePlan}
                  onChange={(e) => setCreateUserForm((prev) => ({ ...prev, activatePlan: e.target.checked }))}
                />
                Activate selected plan immediately after account creation
              </label>

              <div>
                <Button onClick={() => void createUserAccount()} disabled={isCreatingUser}>
                  {isCreatingUser ? 'Creating Account...' : 'Create Account'}
                </Button>
              </div>
            </CardContent>
          </Card>

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
                    <p className="text-xs text-muted-foreground">Mobile: {user.mobileNumber || 'N/A'}</p>
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
              <CardDescription>Verify transaction details + proof, approve to generate code, then send it in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-2">
                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">New / Pending Requests</h4>
                    <Badge variant="outline">{pendingSignupRequests.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-auto">
                    {pendingSignupRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 space-y-2 transition-all duration-300 ease-out">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm">User: {[request.firstName, request.lastName].filter(Boolean).join(' ').trim() || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Email: {request.email}</p>
                            <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Payment Method: {request.paymentMethod.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">Transaction ID: {request.paymentTransactionId}</p>
                            <p className="text-xs text-muted-foreground">{request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}</p>
                          </div>
                          <Badge variant="default">Pending</Badge>
                        </div>

                        {request.paymentProof ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                            >
                              View Proof
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                            >
                              Download Proof
                            </Button>
                          </div>
                        ) : null}

                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void approveSignupRequest(request)}>Approve</Button>
                        </div>
                      </div>
                    ))}
                    {!pendingSignupRequests.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No pending payment requests.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold">Completed Requests</h4>
                    <Badge variant="outline">{completedSignupRequests.length}</Badge>
                  </div>
                  <div className="space-y-2 max-h-[520px] overflow-auto">
                    {completedSignupRequests.map((request) => (
                      <div key={request.id} className="rounded-lg border p-3 space-y-2 transition-all duration-300 ease-out">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm">User: {[request.firstName, request.lastName].filter(Boolean).join(' ').trim() || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Email: {request.email}</p>
                            <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">Payment Method: {request.paymentMethod.toUpperCase()}</p>
                            <p className="text-xs text-muted-foreground">Transaction ID: {request.paymentTransactionId}</p>
                            <p className="text-xs text-muted-foreground">{request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}</p>
                            {request.codeSentAt ? <p className="text-xs text-muted-foreground">Completed: {new Date(request.codeSentAt).toLocaleString()}</p> : null}
                          </div>
                          <Badge className="bg-emerald-600 text-white">Completed</Badge>
                        </div>

                        {request.paymentProof ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                            >
                              View Proof
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 px-2 text-[11px]"
                              onClick={() => void openPaymentProof(`/api/admin/signup-requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `signup-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                            >
                              Download Proof
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    {!completedSignupRequests.length ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        No completed requests yet.
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="premium-requests" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Premium Subscription Management</CardTitle>
              <CardDescription>Verify premium payments, generate activation codes, and send directly in-app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="premium-request-status">Status</Label>
                  <Select value={premiumRequestStatusFilter} onValueChange={setPremiumRequestStatusFilter}>
                    <SelectTrigger id="premium-request-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="premium-request-search">Search</Label>
                  <Input
                    id="premium-request-search"
                    value={premiumRequestQuery}
                    onChange={(e) => setPremiumRequestQuery(e.target.value)}
                    placeholder="Search by email, plan, transaction ID, or contact"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-auto">
                {premiumRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">Email: {request.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Plan: {request.planName || request.planId}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Payment Method: {request.paymentMethod.toUpperCase()}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Transaction ID: {request.paymentTransactionId}
                        </p>
                        <p className="text-xs text-muted-foreground">Mobile: {request.mobileNumber || 'N/A'}</p>
                        <div className="mt-1">
                          <Badge
                            variant="outline"
                            className={request.codeDeliveryStatus === 'sent' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-amber-300 bg-amber-50 text-amber-700'}
                          >
                            {request.codeDeliveryStatus === 'sent'
                              ? `Sent In-App${request.codeSentAt ? ` • ${new Date(request.codeSentAt).toLocaleString()}` : ''}`
                              : 'Pending Send'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown time'}
                        </p>
                      </div>
                      <Badge variant={request.status === 'pending' ? 'default' : 'outline'}>{request.status}</Badge>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {request.paymentProof ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void openPaymentProof(`/api/admin/subscriptions/requests/${request.id}/payment-proof`, request.paymentProof?.name || `premium-proof-${request.id}.dat`, request.paymentProof?.dataUrl, false)}
                          >
                            View Proof
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void openPaymentProof(`/api/admin/subscriptions/requests/${request.id}/payment-proof?download=1`, request.paymentProof?.name || `premium-proof-${request.id}.dat`, request.paymentProof?.dataUrl, true)}
                          >
                            Download Proof
                          </Button>
                        </>
                      ) : null}

                      {issuedPremiumTokens[request.id] ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void copyToken(issuedPremiumTokens[request.id])}
                          >
                            Copy Code
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-[11px]"
                            onClick={() => void sendCodeInApp(request.id, 'premium')}
                          >
                            Send Code
                          </Button>
                        </>
                      ) : null}
                    </div>

                    {issuedPremiumTokens[request.id] ? (
                      <div className="rounded-md bg-emerald-50 border border-emerald-200 px-2 py-1 text-xs text-emerald-700">
                        Generated token: <strong>{issuedPremiumTokens[request.id]}</strong>
                      </div>
                    ) : null}

                    {request.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => void approvePremiumRequest(request)}>Approve + Generate Token</Button>
                        <Button size="sm" variant="outline" onClick={() => void rejectPremiumRequest(request)}>Reject</Button>
                      </div>
                    ) : null}
                  </div>
                ))}

                {!premiumRequests.length ? (
                  <p className="text-sm text-muted-foreground">No premium requests matched the current filter.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="password-recovery" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Password Recovery Requests</CardTitle>
              <CardDescription>Track automatic in-app password recovery verification and token generation activity.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-[220px_1fr]">
                <div className="space-y-1">
                  <Label htmlFor="password-recovery-status">Status</Label>
                  <Select value={passwordRecoveryStatusFilter} onValueChange={setPasswordRecoveryStatusFilter}>
                    <SelectTrigger id="password-recovery-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="not_found">Not Found</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="password-recovery-search">Search</Label>
                  <Input
                    id="password-recovery-search"
                    value={passwordRecoveryQuery}
                    onChange={(e) => setPasswordRecoveryQuery(e.target.value)}
                    placeholder="Search by identifier, name, email, or mobile"
                  />
                </div>
              </div>

              <div className="space-y-2 max-h-[520px] overflow-auto">
                {passwordRecoveryRequests.map((request) => (
                  <div key={request.id} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm">{request.userName || request.identifier}</p>
                        <p className="text-xs text-muted-foreground">User ID: {request.userId || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Email: {request.email || 'N/A'} | Mobile: {request.mobileNumber || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">Matched by: {request.matchedBy.toUpperCase()} | Request: {request.createdAt ? new Date(request.createdAt).toLocaleString() : 'Unknown'}</p>
                      </div>
                      <Badge variant={request.recoveryStatus === 'sent' ? 'default' : 'outline'}>{request.recoveryStatus}</Badge>
                    </div>

                    <p className="text-xs text-slate-500">Token is generated and shown directly in-app after successful verification.</p>
                  </div>
                ))}

                {!passwordRecoveryRequests.length ? (
                  <p className="text-sm text-muted-foreground">No recovery requests matched the current filter.</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcqs" className="space-y-4">
          <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Syllabus Browser (Admin)</CardTitle>
                <CardDescription>
                  Select Subject / Part / Chapter / Section, or choose Quantitative Mathematics/Design Aptitude topics.
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[860px] overflow-auto">
                <Preparation
                  showStartTestButton={false}
                  onSelectSection={(payload) => void handleSectionSelection(payload)}
                  onSelectFlatTopic={(payload) => void handleFlatTopicSelection(payload)}
                />
              </CardContent>
            </Card>

            <div className="min-w-0 space-y-4">
              <Card className="min-w-0">
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle>Section MCQ Editor</CardTitle>
                      <CardDescription>
                        {selectedHierarchy
                          ? selectedHierarchy.kind === 'section'
                            ? `${selectedHierarchy.subject} / ${selectedHierarchy.part} / ${selectedHierarchy.chapterTitle} / ${selectedHierarchy.sectionTitle}`
                            : `${selectedHierarchy.subject} / ${selectedHierarchy.sectionTitle}`
                          : 'Pick a section from the syllabus browser first.'}
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsSectionEditorOpen((prev) => !prev)}
                      aria-expanded={isSectionEditorOpen}
                    >
                      {isSectionEditorOpen ? 'Close Section MCQ Editor' : 'Open Section MCQ Editor'}
                    </Button>
                  </div>
                </CardHeader>
                <div
                  className={`overflow-hidden transition-all duration-300 ease-in-out ${isSectionEditorOpen ? 'max-h-[2600px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                <CardContent className="space-y-3 border-t border-slate-200/60 pt-4 dark:border-white/10">
                  <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 text-xs text-indigo-800">
                    Step 1: choose subject/chapter/section from the syllabus browser. Step 2: edit or add MCQs here. Step 3: manage the selected section in the bank below.
                  </div>

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

                  <div className="space-y-3 rounded-lg border border-indigo-200/70 bg-indigo-50/25 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-indigo-900">Upload MCQs</p>
                        <p className="text-xs text-muted-foreground">Subject, question, options, media, answer, and explanation controls.</p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsUploadMcqsOpen((prev) => !prev)}
                        aria-expanded={isUploadMcqsOpen}
                      >
                        {isUploadMcqsOpen ? 'Close Upload MCQs' : 'Open Upload MCQs'}
                      </Button>
                    </div>

                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${isUploadMcqsOpen ? 'max-h-[2200px] opacity-100' : 'max-h-0 opacity-0'}`}
                    >
                      <div className="space-y-3 border-t border-indigo-200/70 pt-3 dark:border-indigo-300/20">
                        <div className="space-y-3 rounded-lg border border-indigo-200 bg-white/70 p-3 dark:border-indigo-300/30 dark:bg-white/5">
                          <div>
                            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">Document Parser</p>
                            <p className="text-xs text-muted-foreground">
                              Upload PDF/DOC/DOCX/TXT or paste MCQs, then click Parse / Analyze Document to auto-fill structured MCQ fields.
                            </p>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label htmlFor="mcq-bulk-document">Document Upload</Label>
                              <Input
                                id="mcq-bulk-document"
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                              />
                              {bulkFile ? (
                                <p className="text-xs text-muted-foreground">Selected: {bulkFile.name}</p>
                              ) : (
                                <p className="text-xs text-muted-foreground">No file selected.</p>
                              )}
                            </div>

                            <div className="space-y-1.5">
                              <Label htmlFor="mcq-bulk-raw-text">Raw MCQ Text (optional)</Label>
                              <Textarea
                                id="mcq-bulk-raw-text"
                                value={bulkInput}
                                onChange={(e) => setBulkInput(e.target.value)}
                                className="min-h-[96px]"
                                placeholder="Paste MCQs here if you do not want to upload a file"
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button type="button" onClick={() => void analyzeBulkMcqs()} disabled={bulkProcessing}>
                              {bulkProcessing ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Parsing...
                                </>
                              ) : 'Parse / Analyze Document'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setBulkInput('');
                                setBulkFile(null);
                                setBulkParsed([]);
                                setBulkParseErrors([]);
                              }}
                            >
                              Clear Parser
                            </Button>
                          </div>

                          {bulkParseErrors.length ? (
                            <div className="space-y-1 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
                              {bulkParseErrors.map((error, idx) => (
                                <p key={`bulk-parse-error-${idx}`}>• {error}</p>
                              ))}
                            </div>
                          ) : null}

                          {bulkParsed.length ? (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">
                                  Parsed preview: {bulkParsed.length} MCQ(s). Review/edit before uploading.
                                </p>
                                <Button type="button" onClick={() => void uploadBulkMcqs()} disabled={bulkUploading}>
                                  {bulkUploading ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Uploading MCQs...
                                    </>
                                  ) : `Upload MCQs (${bulkParsed.length})`}
                                </Button>
                              </div>

                              <div className="space-y-3 max-h-[620px] overflow-auto pr-1">
                                {bulkParsed.map((item, mcqIndex) => (
                                  <div key={`bulk-parsed-item-${mcqIndex}`} className="space-y-3 rounded-lg border border-indigo-200/80 bg-indigo-50/30 p-3 dark:border-indigo-300/30 dark:bg-indigo-500/10">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">Parsed MCQ #{mcqIndex + 1}</p>
                                      <Button type="button" size="sm" variant="outline" onClick={() => removeParsedMcq(mcqIndex)}>
                                        Remove
                                      </Button>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <Label>Subject</Label>
                                        <Input value={item.subject || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, subject: e.target.value }))} placeholder="e.g. mathematics" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Part</Label>
                                        <Input value={item.part || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, part: e.target.value }))} placeholder="part1 or part2" />
                                      </div>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-3">
                                      <div className="space-y-1">
                                        <Label>Chapter</Label>
                                        <Input value={item.chapter || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, chapter: e.target.value }))} />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Section / Topic</Label>
                                        <Input value={item.section || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, section: e.target.value }))} />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Topic (optional override)</Label>
                                        <Input value={item.topic || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, topic: e.target.value }))} />
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <Label>Question Text</Label>
                                      <Textarea value={item.question} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, question: e.target.value }))} className="min-h-[84px]" />
                                    </div>

                                    <div className="space-y-1">
                                      <Label>Question Image URL (if present)</Label>
                                      <Input value={item.questionImageUrl || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, questionImageUrl: e.target.value }))} placeholder="https://..." />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between gap-2">
                                        <Label>Options (A-E)</Label>
                                        <Button type="button" size="sm" variant="outline" onClick={() => addParsedOption(mcqIndex)} disabled={(item.options || []).length >= 5}>
                                          Add Option
                                        </Button>
                                      </div>
                                      <div className="space-y-2">
                                        {(item.options || []).map((option, optionIndex) => (
                                          <div key={`bulk-option-${mcqIndex}-${optionIndex}`} className="grid gap-2 md:grid-cols-[80px_1fr_auto] md:items-center">
                                            <Label>Option {String.fromCharCode(65 + optionIndex)}</Label>
                                            <Input value={option} onChange={(e) => updateParsedOption(mcqIndex, optionIndex, e.target.value)} />
                                            <Button
                                              type="button"
                                              variant="outline"
                                              size="sm"
                                              onClick={() => removeParsedOption(mcqIndex, optionIndex)}
                                              disabled={(item.options || []).length <= 2}
                                            >
                                              Remove
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="space-y-1">
                                        <Label>Correct Answer</Label>
                                        <Input value={item.answer} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, answer: e.target.value }))} placeholder="A / 1 / exact option text" />
                                      </div>
                                      <div className="space-y-1">
                                        <Label>Difficulty</Label>
                                        <Select value={item.difficulty || 'Medium'} onValueChange={(value: 'Easy' | 'Medium' | 'Hard') => updateParsedMcq(mcqIndex, (current) => ({ ...current, difficulty: value }))}>
                                          <SelectTrigger><SelectValue /></SelectTrigger>
                                          <SelectContent>
                                            <SelectItem value="Easy">Easy</SelectItem>
                                            <SelectItem value="Medium">Medium</SelectItem>
                                            <SelectItem value="Hard">Hard</SelectItem>
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <Label>Explanation / Short Trick</Label>
                                      <Textarea value={item.tip || ''} onChange={(e) => updateParsedMcq(mcqIndex, (current) => ({ ...current, tip: e.target.value }))} className="min-h-[80px]" />
                                    </div>

                                    <div className="grid gap-2 md:grid-cols-2">
                                      <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                        Question Image: {item.questionImageDataUrl ? 'Detected (embedded image data)' : item.questionImageUrl ? 'Detected (URL reference)' : 'Not detected'}
                                      </div>
                                      <div className="rounded-md border border-dashed border-indigo-300/70 px-2 py-1.5 text-xs text-muted-foreground">
                                        Explanation Image: {item.explanationImageDataUrl ? 'Detected' : 'Not detected'}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
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
                          <Label htmlFor="mcq-question-image-upload">Question Image (optional)</Label>
                          <Input
                            id="mcq-question-image-upload"
                            type="file"
                            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              if (!file) return;
                              if (!isSupportedMcqImage(file)) {
                                toast.error('Unsupported image format. Use JPG, PNG, or WEBP.');
                                e.currentTarget.value = '';
                                return;
                              }
                              if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                toast.error('Image is too large. Maximum size is 5 MB.');
                                e.currentTarget.value = '';
                                return;
                              }
                              void fileToMcqImage(file)
                                .then((image) => setForm((prev) => ({ ...prev, questionImage: image })))
                                .catch(() => toast.error('Could not read selected image.'));
                              e.currentTarget.value = '';
                            }}
                          />
                          {form.questionImage ? (
                            <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                              <span>{form.questionImage.name}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setForm((prev) => ({ ...prev, questionImage: null }))}
                              >
                                Remove
                              </Button>
                            </div>
                          ) : null}
                        </div>

                        <div className="space-y-2">
                          <Label>Options (text and/or image)</Label>
                          <div className="space-y-2">
                            {form.optionMedia.map((option, optionIdx) => (
                              <div key={`option-${option.key}`} className="space-y-2 rounded-md border p-2">
                                <div className="grid gap-2 md:grid-cols-[80px_1fr] md:items-center">
                                  <Label>Option {option.key}</Label>
                                  <Input
                                    value={option.text}
                                    placeholder={`Option ${option.key} text`}
                                    onChange={(e) => {
                                      const nextValue = e.target.value;
                                      setForm((prev) => {
                                        const optionMedia = [...prev.optionMedia];
                                        optionMedia[optionIdx] = { ...optionMedia[optionIdx], text: nextValue };
                                        return { ...prev, optionMedia };
                                      });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1.5">
                                  <Input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0] || null;
                                      if (!file) return;
                                      if (!isSupportedMcqImage(file)) {
                                        toast.error('Unsupported image format. Use JPG, PNG, or WEBP.');
                                        e.currentTarget.value = '';
                                        return;
                                      }
                                      if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                        toast.error('Image is too large. Maximum size is 5 MB.');
                                        e.currentTarget.value = '';
                                        return;
                                      }
                                      void fileToMcqImage(file)
                                        .then((image) => {
                                          setForm((prev) => {
                                            const optionMedia = [...prev.optionMedia];
                                            optionMedia[optionIdx] = { ...optionMedia[optionIdx], image };
                                            return { ...prev, optionMedia };
                                          });
                                        })
                                        .catch(() => toast.error('Could not read selected image.'));
                                      e.currentTarget.value = '';
                                    }}
                                  />
                                  {option.image ? (
                                    <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                      <span>{option.image.name}</span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                          setForm((prev) => {
                                            const optionMedia = [...prev.optionMedia];
                                            optionMedia[optionIdx] = { ...optionMedia[optionIdx], image: null };
                                            return { ...prev, optionMedia };
                                          });
                                        }}
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ))}
                          </div>
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

                        <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-3">
                          <p className="text-sm font-medium text-indigo-900">Explanation / Short Trick (optional)</p>

                          <div className="space-y-1.5">
                            <Label>Text</Label>
                            <Textarea
                              value={form.explanationText}
                              onChange={(e) => setForm((prev) => ({ ...prev, explanationText: e.target.value, shortTrickText: '' }))}
                              className="min-h-[110px]"
                              placeholder="Write explanation, short trick, formula, steps, or reasoning"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label>Image</Label>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => explanationImageInputRef.current?.click()}
                              >
                                Upload Image
                              </Button>
                              <Input
                                ref={explanationImageInputRef}
                                type="file"
                                className="hidden"
                                accept="image/jpeg,image/png,image/webp,image/svg+xml,image/gif,.jpg,.jpeg,.png,.webp,.svg,.gif"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] || null;
                                  if (!file) return;
                                  if (!isSupportedMcqImage(file)) {
                                    toast.error('Unsupported image format. Use JPG, PNG, WEBP, SVG, or GIF.');
                                    e.currentTarget.value = '';
                                    return;
                                  }
                                  if (file.size > MCQ_IMAGE_MAX_BYTES) {
                                    toast.error('Image is too large. Maximum size is 5 MB.');
                                    e.currentTarget.value = '';
                                    return;
                                  }
                                  void fileToMcqImage(file)
                                    .then((image) => setForm((prev) => ({ ...prev, explanationImage: image, shortTrickImage: null })))
                                    .catch(() => toast.error('Could not read selected image.'));
                                  e.currentTarget.value = '';
                                }}
                              />
                              <p className="text-xs text-muted-foreground">Supported: JPG, PNG, WEBP, SVG, GIF</p>
                            </div>

                            {form.explanationImage ? (
                              <div className="flex items-center justify-between rounded border bg-muted/20 px-2 py-1 text-xs">
                                <span>{form.explanationImage.name}</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setForm((prev) => ({ ...prev, explanationImage: null }))}
                                >
                                  Remove
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => void saveMcq()} disabled={!selectedHierarchy || isSavingMcq}>
                            {isSavingMcq ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : form.id ? 'Update MCQ' : 'Add MCQs'}
                          </Button>
                          <Button variant="outline" onClick={resetForm}>Clear</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                </div>
              </Card>

              <Card className="min-w-0">
                <CardHeader>
                  <CardTitle>Section MCQ Bank</CardTitle>
                  <CardDescription>
                    {selectedHierarchy
                      ? 'Edit or remove questions for the selected section/topic.'
                      : 'Select a section/topic in the Section MCQ Editor above to load MCQs.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    placeholder="Search MCQs in this view"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={!selectedHierarchy}
                  />
                  <div className="space-y-2 max-h-[460px] overflow-auto">
                    {selectedHierarchy ? filteredMcqs.map((item) => (
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
                              questionImage: item.questionImage || null,
                              optionMedia: Array.isArray(item.optionMedia) && item.optionMedia.length
                                ? item.optionMedia.map((option, optionIdx) => ({
                                  key: String(option.key || String.fromCharCode(65 + optionIdx)).toUpperCase(),
                                  text: String(option.text || ''),
                                  image: option.image || null,
                                }))
                                : [
                                  { key: 'A', text: String(item.options?.[0] || ''), image: null },
                                  { key: 'B', text: String(item.options?.[1] || ''), image: null },
                                  { key: 'C', text: String(item.options?.[2] || ''), image: null },
                                  { key: 'D', text: String(item.options?.[3] || ''), image: null },
                                ],
                              answer: item.answerKey || item.answer,
                              explanationText: item.explanationText || item.shortTrickText || item.tip || '',
                              explanationImage: item.explanationImage || item.shortTrickImage || null,
                              shortTrickText: '',
                              shortTrickImage: null,
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
                    )) : null}
                    {!selectedHierarchy ? (
                      <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                        Section/topic not selected yet. Use the Section MCQ Editor above first.
                      </div>
                    ) : null}
                    {selectedHierarchy && !filteredMcqs.length ? (
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
              <CardTitle>Assign Plan Directly (Admin)</CardTitle>
              <CardDescription>Activate or update a subscription by user email without token or user-side request.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-[1.3fr_1fr_1fr_auto] md:items-end">
              <div className="space-y-1">
                <Label htmlFor="assign-plan-email">User Email</Label>
                <Input
                  id="assign-plan-email"
                  type="email"
                  value={assignPlanForm.email}
                  onChange={(e) => setAssignPlanForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="student@example.com"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="assign-plan-id">Plan</Label>
                <Select
                  value={assignPlanForm.planId}
                  onValueChange={(value) => setAssignPlanForm((prev) => ({ ...prev, planId: value }))}
                >
                  <SelectTrigger id="assign-plan-id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(subscriptionOverview?.plans || []).map((plan) => (
                      <SelectItem key={plan.id} value={plan.id}>{plan.name}</SelectItem>
                    ))}
                    {!(subscriptionOverview?.plans || []).length ? <SelectItem value="basic_monthly">Basic Plan</SelectItem> : null}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="assign-plan-status">Status</Label>
                <Select
                  value={assignPlanForm.status}
                  onValueChange={(value) => setAssignPlanForm((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger id="assign-plan-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <AlertDialog open={isAssignPlanConfirmOpen} onOpenChange={setIsAssignPlanConfirmOpen}>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={
                      isAssigningPlan
                      || !assignPlanForm.email.trim()
                      || !assignPlanForm.planId.trim()
                    }
                  >
                    {isAssigningPlan ? 'Assigning...' : 'Assign Plan'}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Subscription Assignment</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will overwrite the current subscription for {assignPlanForm.email.trim() || 'this user'}.
                      New plan: {selectedDirectAssignPlanName} ({assignPlanForm.status}).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isAssigningPlan}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isAssigningPlan}
                      onClick={() => {
                        setIsAssignPlanConfirmOpen(false);
                        void assignSubscriptionByEmail();
                      }}
                    >
                      Confirm Assign
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>

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
              <CardHeader
                className="cursor-pointer"
                role="button"
                tabIndex={0}
                onClick={() => setIsPracticeEditorOpen((prev) => !prev)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsPracticeEditorOpen((prev) => !prev);
                  }
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle>Practice Board Question Editor</CardTitle>
                    <CardDescription>
                      Add conceptual questions using text, optional file uploads, or both.
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-expanded={isPracticeEditorOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPracticeEditorOpen((prev) => !prev);
                    }}
                  >
                    {isPracticeEditorOpen ? 'Close Practice Board Editor' : 'Open Practice Board Editor'}
                  </Button>
                </div>
              </CardHeader>
              <div
                className={`overflow-hidden transition-all duration-300 ease-in-out ${isPracticeEditorOpen ? 'max-h-[1400px] opacity-100' : 'max-h-0 opacity-0'}`}
              >
              <CardContent className="space-y-3 border-t border-slate-200/60 pt-4 dark:border-white/10">
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
                  <Label>Upload Question File (optional)</Label>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setPracticeQuestionUpload(e.target.files?.[0] || null)}
                  />
                  {practiceQuestionUpload ? (
                    <p className="text-xs text-muted-foreground">Selected: {practiceQuestionUpload.name}</p>
                  ) : null}
                  {!practiceQuestionUpload && practiceForm.questionFile?.name ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Current file: {practiceForm.questionFile.name}</span>
                      <button
                        type="button"
                        className="text-blue-600 underline underline-offset-2"
                        onClick={() => setPracticeForm((prev) => ({ ...prev, questionFile: null }))}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
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
                  <Label>Upload Solution File (optional)</Label>
                  <Input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,.doc,.docx,image/jpeg,image/png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(e) => setPracticeSolutionUpload(e.target.files?.[0] || null)}
                  />
                  {practiceSolutionUpload ? (
                    <p className="text-xs text-muted-foreground">Selected: {practiceSolutionUpload.name}</p>
                  ) : null}
                  {!practiceSolutionUpload && practiceForm.solutionFile?.name ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Current file: {practiceForm.solutionFile.name}</span>
                      <button
                        type="button"
                        className="text-blue-600 underline underline-offset-2"
                        onClick={() => setPracticeForm((prev) => ({ ...prev, solutionFile: null }))}
                      >
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void savePracticeQuestion()}>
                    {practiceForm.id ? 'Update' : 'Add'} Practice Question
                  </Button>
                  <Button variant="outline" onClick={resetPracticeForm}>Clear</Button>
                </div>
              </CardContent>
              </div>
            </Card>

            <Card className="min-w-0">
              <CardHeader>
                <CardTitle>Practice Board Question Bank</CardTitle>
                <CardDescription>Edit or remove existing conceptual questions.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Search by subject/difficulty/question/file..."
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
                            difficulty: item.difficulty || 'Medium',
                            questionText: item.questionText || '',
                            questionFile: item.questionFile || null,
                            solutionText: item.solutionText || '',
                            solutionFile: item.solutionFile || null,
                          });
                          setPracticeQuestionUpload(null);
                          setPracticeSolutionUpload(null);
                        }}
                      >
                        <p className="line-clamp-2 text-sm">{item.questionText || '(File-based question)'}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.subject} • {item.difficulty}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Question file: {item.questionFile?.name || 'None'} | Solution file: {item.solutionFile?.name || 'None'}
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
                {filteredQuestionSubmissions.map((item) => {
                  const isCollapsedToSummary = Boolean(collapsedReviewedSubmissionIds[item.id]) && item.status !== 'pending';

                  return (
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

                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsedToSummary ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'}`}
                      >
                        <div className="rounded-md border border-emerald-200/60 bg-emerald-50/40 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium">{item.submittedByName || 'Anonymous'}</p>
                            <Badge className={item.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}>
                              {item.status === 'approved' ? 'Approved' : 'Rejected'}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.submittedByEmail || (item.submittedByUserId ? `UserId: ${item.submittedByUserId}` : item.actorKey || 'No identifier')}
                            {item.reviewedAt ? ` • Reviewed ${new Date(item.reviewedAt).toLocaleString()}` : ''}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsedToSummary ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-[2600px] opacity-100'}`}
                      >
                        <div className="space-y-3">
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
                                <div
                                  key={`${item.id}-${file.name}`}
                                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                                >
                                  <span className="min-w-0 truncate">{file.name} • {file.mimeType}</span>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (!openDataUrlPreview(file.dataUrl)) {
                                          toast.error('Could not open attachment preview.');
                                        }
                                      }}
                                    >
                                      View
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        if (!downloadDataUrlFile(file.dataUrl, file.name || 'attachment')) {
                                          toast.error('Could not download attachment.');
                                        }
                                      }}
                                    >
                                      Download
                                    </Button>
                                  </div>
                                </div>
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
                      </div>
                    </div>
                  );
                })}

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
      </main>
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
  tone,
  onClick,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br ${tone} shadow-[0_18px_40px_rgba(15,23,42,0.12)] backdrop-blur-xl transition-all duration-300 dark:border-white/20 dark:shadow-[0_18px_40px_rgba(4,10,38,0.5)] ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_24px_44px_rgba(15,23,42,0.16)] dark:hover:shadow-[0_26px_50px_rgba(2,8,32,0.62)]' : ''}`}
      onClick={onClick}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.42),transparent_45%)] opacity-90 dark:bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.2),transparent_45%)] dark:opacity-80" />
      <CardContent className="relative pt-4">
        <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300/70 bg-white/70 dark:border-white/25 dark:bg-white/15">
          <Icon className="h-4 w-4 text-slate-800 dark:text-white" />
        </div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-100/90">{title}</p>
        <p className="text-4xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-300/55 dark:bg-white/20">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-500 via-violet-500 to-pink-500 dark:from-cyan-300 dark:via-violet-300 dark:to-pink-300 transition-all duration-500 group-hover:w-[82%]" />
        </div>
      </CardContent>
    </Card>
  );
}
