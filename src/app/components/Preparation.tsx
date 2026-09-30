import { useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast, showNeutralToast, handleApiError, audienceFriendlyError } from '../lib/userToast';
import { resolveLaunchAuthToken } from '../lib/api';
import {
  bearerForLaunchUrl,
  formatStudentTokenDebugPreview,
  hasResolvableStudentAuth,
  readPersistedStudentAccessToken,
  resolveSnapshotStudentAuthToken,
} from '../lib/authSession';
import { waitUntilAuthHydrated, waitUntilClientAuthToken } from '../lib/authTiming';
import { SubjectKey, getSubjectLabel } from '../lib/mcq';
import { dedupeNormalizedStrings, normalizeHierarchyLabel } from '../lib/hierarchyDedup';
import { formatTestStartFailureToast } from '../lib/testStartToast';
import { navigateToExamSameTab } from '../lib/examWindowLaunch';
import { useAppData } from '../context/AppDataContext';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { PremiumLockScreen } from './subscription/PremiumLockScreen';
import { isNativeRuntime as isNativePlatformRuntime } from '../lib/nativeDiagnostics';
import { PremiumCountdownBadge } from './subscription/PremiumCountdownBadge';
import {
  FLAT_TOPIC_TABS as SHARED_FLAT_TOPIC_TABS,
  RAW_COMPUTER_SCIENCE_SYLLABUS,
  RAW_INTELLIGENCE_SYLLABUS,
  RAW_SYLLABUS,
} from '../../../shared/syllabusCatalog.js';

type AcademicPart = 'part1' | 'part2';
type TabKey = SubjectKey;
type PartStructuredSubjectKey = 'mathematics' | 'physics' | 'english' | 'biology' | 'chemistry';

export interface ChapterItem {
  id: string;
  title: string;
  sections: string[];
}

export interface PartItem {
  label: string;
  chapters: ChapterItem[];
}

/** Mobile Safari/Chrome (not Capacitor). Same-tab exam launch avoids a blank popup tab while the session API runs. */
function isMobileBrowserRuntime() {
  if (typeof window === 'undefined') return false;
  const native = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  if (native) return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function uniqueSections(sections: string[]) {
  return dedupeNormalizedStrings(sections);
}

function dedupeChaptersByTitle(chapters: ChapterItem[]) {
  const chapterMap = new Map<string, ChapterItem>();

  (chapters || []).forEach((chapter) => {
    const title = String(chapter?.title || '').trim();
    if (!title) return;
    const titleKey = normalizeHierarchyLabel(title);
    const currentSections = uniqueSections(Array.isArray(chapter?.sections) ? chapter.sections : []);

    if (!chapterMap.has(titleKey)) {
      chapterMap.set(titleKey, {
        id: String(chapter?.id || titleKey),
        title,
        sections: currentSections,
      });
      return;
    }

    const existing = chapterMap.get(titleKey)!;
    const existingSections = uniqueSections(existing.sections);
    const mergedSections = uniqueSections([...existingSections, ...currentSections]);

    // Keep the chapter record that already contains the fuller section list.
    const preferIncoming = currentSections.length > existingSections.length;
    chapterMap.set(titleKey, {
      id: preferIncoming ? String(chapter?.id || existing.id) : existing.id,
      title: preferIncoming ? title : existing.title,
      sections: mergedSections,
    });
  });

  return Array.from(chapterMap.values());
}

function normalizePartItem(partItem: PartItem): PartItem {
  return {
    label: partItem.label,
    chapters: dedupeChaptersByTitle(Array.isArray(partItem.chapters) ? partItem.chapters : []),
  };
}

const subjectTabs: SubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry', 'computer-science', 'intelligence'];
const PART_STRUCTURED_SUBJECTS: PartStructuredSubjectKey[] = ['mathematics', 'physics', 'english', 'biology', 'chemistry'];
const tabItems: Array<{ key: TabKey; label: string }> = [
  { key: 'mathematics', label: 'Mathematics' },
  { key: 'physics', label: 'Physics' },
  { key: 'english', label: 'English' },
  { key: 'biology', label: 'Biology' },
  { key: 'chemistry', label: 'Chemistry' },
  { key: 'computer-science', label: 'Computer Science' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'quantitative-mathematics', label: 'Quantitative Mathematics' },
  { key: 'design-aptitude', label: 'Design Aptitude' },
];

const tabTriggerToneByKey: Record<TabKey, { idle: string; active: string }> = {
  mathematics: {
    idle: 'border-indigo-200 bg-indigo-50/80 text-indigo-700 hover:bg-indigo-100',
    active: 'data-[state=active]:from-indigo-600 data-[state=active]:to-violet-500 data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)]',
  },
  physics: {
    idle: 'border-cyan-200 bg-cyan-50/80 text-cyan-700 hover:bg-cyan-100',
    active: 'data-[state=active]:from-cyan-600 data-[state=active]:to-blue-500 data-[state=active]:shadow-[0_12px_24px_rgba(8,145,178,0.35)]',
  },
  english: {
    idle: 'border-rose-200 bg-rose-50/80 text-rose-700 hover:bg-rose-100',
    active: 'data-[state=active]:from-rose-600 data-[state=active]:to-pink-500 data-[state=active]:shadow-[0_12px_24px_rgba(225,29,72,0.32)]',
  },
  biology: {
    idle: 'border-emerald-200 bg-emerald-50/80 text-emerald-700 hover:bg-emerald-100',
    active: 'data-[state=active]:from-emerald-600 data-[state=active]:to-teal-500 data-[state=active]:shadow-[0_12px_24px_rgba(5,150,105,0.33)]',
  },
  chemistry: {
    idle: 'border-amber-200 bg-amber-50/80 text-amber-700 hover:bg-amber-100',
    active: 'data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:shadow-[0_12px_24px_rgba(245,158,11,0.34)]',
  },
  'computer-science': {
    idle: 'border-sky-200 bg-sky-50/80 text-sky-700 hover:bg-sky-100',
    active: 'data-[state=active]:from-sky-600 data-[state=active]:to-indigo-500 data-[state=active]:shadow-[0_12px_24px_rgba(14,116,144,0.34)]',
  },
  intelligence: {
    idle: 'border-violet-200 bg-violet-50/80 text-violet-700 hover:bg-violet-100',
    active: 'data-[state=active]:from-violet-600 data-[state=active]:to-fuchsia-500 data-[state=active]:shadow-[0_12px_24px_rgba(124,58,237,0.34)]',
  },
  'quantitative-mathematics': {
    idle: 'border-fuchsia-200 bg-fuchsia-50/80 text-fuchsia-700 hover:bg-fuchsia-100',
    active: 'data-[state=active]:from-fuchsia-600 data-[state=active]:to-violet-500 data-[state=active]:shadow-[0_12px_24px_rgba(192,38,211,0.34)]',
  },
  'design-aptitude': {
    idle: 'border-purple-200 bg-purple-50/80 text-purple-700 hover:bg-purple-100',
    active: 'data-[state=active]:from-purple-600 data-[state=active]:to-indigo-500 data-[state=active]:shadow-[0_12px_24px_rgba(124,58,237,0.34)]',
  },
};

const PREPARATION_TAB_WIDTH_CLASS =
  'max-w-[min(100%,11rem)] sm:max-w-[13rem] md:max-w-[15rem] lg:max-w-none';

const syllabusToneBySubject: Record<
  SubjectKey,
  {
    partIdle: string;
    partHover: string;
    partActive: string;
    partShadow: string;
    chapterIdle: string;
    chapterHover: string;
    chapterActive: string;
    chapterAccent: string;
    sectionHover: string;
    sectionActive: string;
    sectionShadow: string;
    panelSurface: string;
  }
> = {
  mathematics: {
    partIdle: 'border-indigo-200/80 bg-indigo-50/45',
    partHover: 'hover:border-indigo-300 hover:bg-indigo-50/85',
    partActive: 'from-indigo-600 to-violet-500',
    partShadow: 'shadow-[0_14px_24px_rgba(79,70,229,0.3)]',
    chapterIdle: 'border-indigo-100 bg-white',
    chapterHover: 'hover:border-indigo-200 hover:bg-indigo-50/35',
    chapterActive: 'border-indigo-300/80 bg-indigo-50/75 shadow-[0_10px_18px_rgba(99,102,241,0.16)]',
    chapterAccent: 'text-indigo-700',
    sectionHover: 'hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-900',
    sectionActive: 'from-indigo-600 to-violet-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(79,70,229,0.28)]',
    panelSurface: 'border-indigo-200 bg-indigo-50/35',
  },
  physics: {
    partIdle: 'border-cyan-200/80 bg-cyan-50/45',
    partHover: 'hover:border-cyan-300 hover:bg-cyan-50/85',
    partActive: 'from-cyan-600 to-blue-500',
    partShadow: 'shadow-[0_14px_24px_rgba(8,145,178,0.3)]',
    chapterIdle: 'border-cyan-100 bg-white',
    chapterHover: 'hover:border-cyan-200 hover:bg-cyan-50/35',
    chapterActive: 'border-cyan-300/80 bg-cyan-50/75 shadow-[0_10px_18px_rgba(14,116,144,0.16)]',
    chapterAccent: 'text-cyan-700',
    sectionHover: 'hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-900',
    sectionActive: 'from-cyan-600 to-blue-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(8,145,178,0.28)]',
    panelSurface: 'border-cyan-200 bg-cyan-50/35',
  },
  english: {
    partIdle: 'border-rose-200/80 bg-rose-50/45',
    partHover: 'hover:border-rose-300 hover:bg-rose-50/85',
    partActive: 'from-rose-600 to-pink-500',
    partShadow: 'shadow-[0_14px_24px_rgba(225,29,72,0.3)]',
    chapterIdle: 'border-rose-100 bg-white',
    chapterHover: 'hover:border-rose-200 hover:bg-rose-50/35',
    chapterActive: 'border-rose-300/80 bg-rose-50/75 shadow-[0_10px_18px_rgba(225,29,72,0.14)]',
    chapterAccent: 'text-rose-700',
    sectionHover: 'hover:border-rose-300 hover:bg-rose-50 hover:text-rose-900',
    sectionActive: 'from-rose-600 to-pink-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(225,29,72,0.26)]',
    panelSurface: 'border-rose-200 bg-rose-50/35',
  },
  biology: {
    partIdle: 'border-emerald-200/80 bg-emerald-50/45',
    partHover: 'hover:border-emerald-300 hover:bg-emerald-50/85',
    partActive: 'from-emerald-600 to-teal-500',
    partShadow: 'shadow-[0_14px_24px_rgba(5,150,105,0.3)]',
    chapterIdle: 'border-emerald-100 bg-white',
    chapterHover: 'hover:border-emerald-200 hover:bg-emerald-50/35',
    chapterActive: 'border-emerald-300/80 bg-emerald-50/75 shadow-[0_10px_18px_rgba(5,150,105,0.14)]',
    chapterAccent: 'text-emerald-700',
    sectionHover: 'hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-900',
    sectionActive: 'from-emerald-600 to-teal-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(5,150,105,0.26)]',
    panelSurface: 'border-emerald-200 bg-emerald-50/35',
  },
  chemistry: {
    partIdle: 'border-amber-200/80 bg-amber-50/45',
    partHover: 'hover:border-amber-300 hover:bg-amber-50/85',
    partActive: 'from-amber-500 to-orange-500',
    partShadow: 'shadow-[0_14px_24px_rgba(245,158,11,0.3)]',
    chapterIdle: 'border-amber-100 bg-white',
    chapterHover: 'hover:border-amber-200 hover:bg-amber-50/35',
    chapterActive: 'border-amber-300/80 bg-amber-50/75 shadow-[0_10px_18px_rgba(245,158,11,0.15)]',
    chapterAccent: 'text-amber-700',
    sectionHover: 'hover:border-amber-300 hover:bg-amber-50 hover:text-amber-900',
    sectionActive: 'from-amber-500 to-orange-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(245,158,11,0.26)]',
    panelSurface: 'border-amber-200 bg-amber-50/35',
  },
  'computer-science': {
    partIdle: 'border-sky-200/80 bg-sky-50/45',
    partHover: 'hover:border-sky-300 hover:bg-sky-50/85',
    partActive: 'from-sky-600 to-indigo-500',
    partShadow: 'shadow-[0_14px_24px_rgba(14,116,144,0.3)]',
    chapterIdle: 'border-sky-100 bg-white',
    chapterHover: 'hover:border-sky-200 hover:bg-sky-50/35',
    chapterActive: 'border-sky-300/80 bg-sky-50/75 shadow-[0_10px_18px_rgba(14,116,144,0.15)]',
    chapterAccent: 'text-sky-700',
    sectionHover: 'hover:border-sky-300 hover:bg-sky-50 hover:text-sky-900',
    sectionActive: 'from-sky-600 to-indigo-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(14,116,144,0.26)]',
    panelSurface: 'border-sky-200 bg-sky-50/35',
  },
  intelligence: {
    partIdle: 'border-violet-200/80 bg-violet-50/45',
    partHover: 'hover:border-violet-300 hover:bg-violet-50/85',
    partActive: 'from-violet-600 to-fuchsia-500',
    partShadow: 'shadow-[0_14px_24px_rgba(124,58,237,0.3)]',
    chapterIdle: 'border-violet-100 bg-white',
    chapterHover: 'hover:border-violet-200 hover:bg-violet-50/35',
    chapterActive: 'border-violet-300/80 bg-violet-50/75 shadow-[0_10px_18px_rgba(124,58,237,0.15)]',
    chapterAccent: 'text-violet-700',
    sectionHover: 'hover:border-violet-300 hover:bg-violet-50 hover:text-violet-900',
    sectionActive: 'from-violet-600 to-fuchsia-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(124,58,237,0.26)]',
    panelSurface: 'border-violet-200 bg-violet-50/35',
  },
  'quantitative-mathematics': {
    partIdle: 'border-fuchsia-200/80 bg-fuchsia-50/45',
    partHover: 'hover:border-fuchsia-300 hover:bg-fuchsia-50/85',
    partActive: 'from-fuchsia-600 to-violet-500',
    partShadow: 'shadow-[0_14px_24px_rgba(192,38,211,0.3)]',
    chapterIdle: 'border-fuchsia-100 bg-white',
    chapterHover: 'hover:border-fuchsia-200 hover:bg-fuchsia-50/35',
    chapterActive: 'border-fuchsia-300/80 bg-fuchsia-50/75 shadow-[0_10px_18px_rgba(192,38,211,0.15)]',
    chapterAccent: 'text-fuchsia-700',
    sectionHover: 'hover:border-fuchsia-300 hover:bg-fuchsia-50 hover:text-fuchsia-900',
    sectionActive: 'from-fuchsia-600 to-violet-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(192,38,211,0.26)]',
    panelSurface: 'border-fuchsia-200 bg-fuchsia-50/35',
  },
  'design-aptitude': {
    partIdle: 'border-purple-200/80 bg-purple-50/45',
    partHover: 'hover:border-purple-300 hover:bg-purple-50/85',
    partActive: 'from-purple-600 to-indigo-500',
    partShadow: 'shadow-[0_14px_24px_rgba(124,58,237,0.3)]',
    chapterIdle: 'border-purple-100 bg-white',
    chapterHover: 'hover:border-purple-200 hover:bg-purple-50/35',
    chapterActive: 'border-purple-300/80 bg-purple-50/75 shadow-[0_10px_18px_rgba(124,58,237,0.15)]',
    chapterAccent: 'text-purple-700',
    sectionHover: 'hover:border-purple-300 hover:bg-purple-50 hover:text-purple-900',
    sectionActive: 'from-purple-600 to-indigo-500',
    sectionShadow: 'shadow-[0_10px_18px_rgba(124,58,237,0.26)]',
    panelSurface: 'border-purple-200 bg-purple-50/35',
  },
};

export const FLAT_TOPIC_TABS: Record<'quantitative-mathematics' | 'design-aptitude', { title: string; topics: string[] }> = SHARED_FLAT_TOPIC_TABS;

const FLAT_TAB_SUBJECT_FALLBACKS: Record<'quantitative-mathematics' | 'design-aptitude', SubjectKey[]> = {
  'quantitative-mathematics': ['mathematics'],
  'design-aptitude': ['english', 'physics', 'mathematics'],
};

export const COMPUTER_SCIENCE_SYLLABUS: ChapterItem[] = dedupeChaptersByTitle(RAW_COMPUTER_SCIENCE_SYLLABUS as ChapterItem[]);
export const INTELLIGENCE_SYLLABUS: ChapterItem[] = dedupeChaptersByTitle(RAW_INTELLIGENCE_SYLLABUS as ChapterItem[]);
const typedRawSyllabus = RAW_SYLLABUS as Record<PartStructuredSubjectKey, Record<AcademicPart, PartItem>>;
export const SYLLABUS: Record<PartStructuredSubjectKey, Record<AcademicPart, PartItem>> = {
  mathematics: {
    part1: normalizePartItem(typedRawSyllabus.mathematics.part1),
    part2: normalizePartItem(typedRawSyllabus.mathematics.part2),
  },
  physics: {
    part1: normalizePartItem(typedRawSyllabus.physics.part1),
    part2: normalizePartItem(typedRawSyllabus.physics.part2),
  },
  english: {
    part1: normalizePartItem(typedRawSyllabus.english.part1),
    part2: normalizePartItem(typedRawSyllabus.english.part2),
  },
  biology: {
    part1: normalizePartItem(typedRawSyllabus.biology.part1),
    part2: normalizePartItem(typedRawSyllabus.biology.part2),
  },
  chemistry: {
    part1: normalizePartItem(typedRawSyllabus.chemistry.part1),
    part2: normalizePartItem(typedRawSyllabus.chemistry.part2),
  },
};

interface PreparationProps {
  showStartTestButton?: boolean;
  onSelectSection?: (payload: {
    subject: SubjectKey;
    part?: AcademicPart;
    chapterTitle: string;
    sectionTitle: string;
  }) => void;
  onSelectFlatTopic?: (payload: {
    tabKey: 'quantitative-mathematics' | 'design-aptitude';
    subject: 'quantitative-mathematics' | 'design-aptitude';
    topicTitle: string;
  }) => void;
}

export function Preparation({ showStartTestButton = true, onSelectSection, onSelectFlatTopic }: PreparationProps = {}) {
  const { attempts, startTestSession } = useAppData();
  const { token: authContextToken, user, loading: authLoading } = useAuth();
  const { surface, me, loading: subLoading } = useSubscription();
  const preparationAccessAllowed = Boolean(
    me?.paidServices?.preparation?.allowed
    || (me?.preparationAccess?.allowed && me?.preparationAccess?.source !== 'legacy')
    || (surface?.allowed && (surface?.source === 'global' || surface?.source === 'manual')),
  );
  const authLoadingRef = useRef(authLoading);
  authLoadingRef.current = authLoading;
  const tokenRef = useRef(authContextToken);
  const userRef = useRef(user);
  tokenRef.current = authContextToken;
  userRef.current = user;
  const authReady = !authLoading && hasResolvableStudentAuth(authContextToken, user);
  const difficultyLevels: Array<'Easy' | 'Medium' | 'Hard'> = ['Easy', 'Medium', 'Hard'];
  const [selectedSubject, setSelectedSubject] = useState<TabKey>('mathematics');
  const [selectedPartBySubject, setSelectedPartBySubject] = useState<Record<PartStructuredSubjectKey, AcademicPart | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, AcademicPart | null>)
  ));

  const [selectedChapterBySubject, setSelectedChapterBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));

  const [selectedSectionBySubject, setSelectedSectionBySubject] = useState<Record<PartStructuredSubjectKey, string | null>>(() => (
    PART_STRUCTURED_SUBJECTS.reduce((acc, subject) => {
      acc[subject] = null;
      return acc;
    }, {} as Record<PartStructuredSubjectKey, string | null>)
  ));
  const [selectedComputerScienceChapterId, setSelectedComputerScienceChapterId] = useState<string | null>(null);
  const [selectedComputerScienceSection, setSelectedComputerScienceSection] = useState<string | null>(null);
  const [selectedIntelligenceChapterId, setSelectedIntelligenceChapterId] = useState<string | null>(null);
  const [selectedIntelligenceSection, setSelectedIntelligenceSection] = useState<string | null>(null);
  const [launchingSectionKey, setLaunchingSectionKey] = useState<string | null>(null);
  const launchingRef = useRef(false);
  const mobileSectionStartRetryRef = useRef(0);
  const mobileFlatStartRetryRef = useRef(0);
  const [difficultyMenuKey, setDifficultyMenuKey] = useState<string | null>(null);
  const [selectedFlatTopicByTab, setSelectedFlatTopicByTab] = useState<Record<'quantitative-mathematics' | 'design-aptitude', string | null>>({
    'quantitative-mathematics': null,
    'design-aptitude': null,
  });

  const normalizeProgressKey = (value: string) => normalizeHierarchyLabel(String(value || '').trim());

  const completedSectionKeys = useMemo(() => {
    const keys = new Set<string>();
    (attempts || []).forEach((attempt) => {
      const attemptSubject = String(attempt?.subject || '').trim();
      const attemptTopic = normalizeProgressKey(String(attempt?.topic || ''));
      if (!attemptSubject || !attemptTopic) return;
      keys.add(`${attemptSubject}::${attemptTopic}`);
    });
    return keys;
  }, [attempts]);

  const isSectionCompleted = (subject: SubjectKey, sectionTitle: string) => (
    completedSectionKeys.has(`${subject}::${normalizeProgressKey(sectionTitle)}`)
  );

  const getChapterProgressPercent = (subject: SubjectKey, sections: string[]) => {
    const totalSections = Array.isArray(sections) ? sections.length : 0;
    if (!totalSections) return 0;
    const completedSections = sections.filter((section) => isSectionCompleted(subject, section)).length;
    return Math.round((completedSections / totalSections) * 100);
  };

  const resolveLaunchToken = async () => resolveLaunchAuthToken(authContextToken);

  const openExamWindow = (params: { sessionId: string; token: string }) => {
    const { sessionId, token: authToken } = params;
    const urlAuth = bearerForLaunchUrl(authToken);

    localStorage.setItem(
      'net360-exam-launch',
      JSON.stringify({
        sessionId,
        testType: 'topic',
        ...(urlAuth ? { authToken: urlAuth } : {}),
        launchedAt: Date.now(),
      }),
    );

    const url = urlAuth
      ? `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=topic&authToken=${encodeURIComponent(urlAuth)}`
      : `/exam-interface?sessionId=${encodeURIComponent(sessionId)}&testType=topic`;

    navigateToExamSameTab(url);
  };

  const handleStartSectionTest = async (payload: {
    subject: SubjectKey;
    part?: AcademicPart;
    chapterTitle: string;
    sectionTitle: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
  }) => {
    if (launchingRef.current || !authReady) return;
    launchingRef.current = true;

    const mobileBrowser = isMobileBrowserRuntime();
    const clientTokenWaitMs = mobileBrowser ? 12_000 : 6_000;

    await waitUntilAuthHydrated(() => authLoadingRef.current);
    if (!readPersistedStudentAccessToken() && !tokenRef.current && !userRef.current) {
      showErrorToast('Please login first to start a section test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }
    await waitUntilClientAuthToken(
      () => resolveSnapshotStudentAuthToken(tokenRef.current, userRef.current),
      clientTokenWaitMs,
    );
    if (!resolveSnapshotStudentAuthToken(tokenRef.current, userRef.current)) {
      if (import.meta.env.DEV) {
        console.warn('Auth not ready yet');
      }
      showErrorToast('Please login first to start a section test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const authToken = await resolveLaunchToken();
    if (!authToken) {
      showErrorToast('Please login first to start a section test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const isMobileLikeRuntime =
      isNativeRuntime || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (import.meta.env.DEV) {
      console.log(
        '[Preparation] Token before startTestSession:',
        formatStudentTokenDebugPreview(),
        readPersistedStudentAccessToken() ? '(jwt in storage)' : '(cookie or pending)',
      );
    }

    if (mobileBrowser) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const launchKey = `${payload.subject}|${payload.part || ''}|${payload.chapterTitle}|${payload.sectionTitle}|${payload.difficulty}`;

    try {
      setLaunchingSectionKey(launchKey);
      const session = await startTestSession({
        subject: payload.subject,
        difficulty: payload.difficulty,
        topic: payload.sectionTitle,
        mode: 'topic',
        questionCount: 25,
        part: payload.part || '',
        chapter: payload.chapterTitle,
        section: payload.sectionTitle,
        authTokenHint: authToken,
      });

      mobileSectionStartRetryRef.current = 0;
      const launchToken = (await resolveLaunchToken()) || authToken;
      openExamWindow({ sessionId: session.id, token: launchToken });
      showSuccessToast('Section test launched.');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Section test start error:', error);
      }
      const msg = error instanceof Error ? error.message : '';
      if (
        isMobileLikeRuntime
        && mobileSectionStartRetryRef.current === 0
        && !/login|authentication|Missing authentication|sign in/i.test(msg)
      ) {
        mobileSectionStartRetryRef.current = 1;
        setLaunchingSectionKey(null);
        launchingRef.current = false;
        showNeutralToast('Retrying test start…');
        window.setTimeout(() => {
          void handleStartSectionTest(payload);
        }, 500);
        return;
      }
      mobileSectionStartRetryRef.current = 0;
      showErrorToast(formatTestStartFailureToast(error));
    } finally {
      setLaunchingSectionKey(null);
      launchingRef.current = false;
    }
  };

  const handleStartFlatTopicTest = async (
    tabKey: 'quantitative-mathematics' | 'design-aptitude',
    topicTitle: string,
    difficulty: 'Easy' | 'Medium' | 'Hard',
  ) => {
    if (launchingRef.current || !authReady) return;
    launchingRef.current = true;

    const mobileBrowser = isMobileBrowserRuntime();
    const clientTokenWaitMs = mobileBrowser ? 12_000 : 6_000;

    await waitUntilAuthHydrated(() => authLoadingRef.current);
    if (!readPersistedStudentAccessToken() && !tokenRef.current && !userRef.current) {
      showErrorToast('Please login first to start a topic test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }
    await waitUntilClientAuthToken(
      () => resolveSnapshotStudentAuthToken(tokenRef.current, userRef.current),
      clientTokenWaitMs,
    );
    if (!resolveSnapshotStudentAuthToken(tokenRef.current, userRef.current)) {
      if (import.meta.env.DEV) {
        console.warn('Auth not ready yet');
      }
      showErrorToast('Please login first to start a topic test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const authToken = await resolveLaunchToken();
    if (!authToken) {
      showErrorToast('Please login first to start a topic test from Preparation Materials.');
      launchingRef.current = false;
      return;
    }

    const isNativeRuntime = Boolean((window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
    const isMobileLikeRuntime =
      isNativeRuntime || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

    if (import.meta.env.DEV) {
      console.log(
        '[Preparation] Token before startTestSession (flat topic):',
        formatStudentTokenDebugPreview(),
        readPersistedStudentAccessToken() ? '(jwt in storage)' : '(cookie or pending)',
      );
    }

    if (mobileBrowser) {
      await new Promise((r) => setTimeout(r, 200));
    }

    const launchKey = `${tabKey}|${topicTitle}|${difficulty}`;
    const candidateSubjects = FLAT_TAB_SUBJECT_FALLBACKS[tabKey];
    let lastError: unknown = null;

    try {
      setLaunchingSectionKey(launchKey);

      for (const candidateSubject of candidateSubjects) {
        try {
          const session = await startTestSession({
            subject: candidateSubject,
            difficulty,
            topic: topicTitle,
            mode: 'topic',
            questionCount: 25,
            authTokenHint: authToken,
          });

          mobileFlatStartRetryRef.current = 0;
          const launchToken = (await resolveLaunchToken()) || authToken;
          openExamWindow({ sessionId: session.id, token: launchToken });
          showSuccessToast('Topic test launched.');
          return;
        } catch (error) {
          lastError = error;
        }
      }

      throw lastError instanceof Error ? lastError : new Error('No questions available for this topic.');
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Topic test start error:', error);
      }
      const msg = error instanceof Error ? error.message : '';
      if (
        isMobileLikeRuntime
        && mobileFlatStartRetryRef.current === 0
        && !/login|authentication|Missing authentication|sign in/i.test(msg)
      ) {
        mobileFlatStartRetryRef.current = 1;
        setLaunchingSectionKey(null);
        launchingRef.current = false;
        showNeutralToast('Retrying test start…');
        window.setTimeout(() => {
          void handleStartFlatTopicTest(tabKey, topicTitle, difficulty);
        }, 500);
        return;
      }
      mobileFlatStartRetryRef.current = 0;
      showErrorToast(formatTestStartFailureToast(error));
    } finally {
      setLaunchingSectionKey(null);
      launchingRef.current = false;
    }
  };

  if (!user) {
    return (
      <div className="space-y-4">
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Sign in to browse syllabus and topic tests.</p>
      </div>
    );
  }

  if (subLoading) {
    return (
      <div className="space-y-4">
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Loading subscription…</p>
      </div>
    );
  }

  if (!preparationAccessAllowed) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1>Preparation Materials</h1>
            <p className="text-muted-foreground">Syllabus browser by subject, part, chapter, and section</p>
          </div>
          <PremiumCountdownBadge />
        </div>
        <PremiumLockScreen
          title="Unlock preparation tools"
          description={isNativePlatformRuntime()
            ? 'Your free plan includes MCQs on the practice board. Preparation materials and topic tests require an active trial or premium subscription.'
            : 'Your free plan includes MCQs on the practice board. Subscribe to Preparation Material to unlock preparation materials and topic tests.'}
        />
      </div>
    );
  }

  const showMobilePreparingOverlay = isMobileBrowserRuntime() && Boolean(launchingSectionKey);

  return (
    <div className="space-y-6">
      {showMobilePreparingOverlay ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-[2px]"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="mx-4 max-w-sm rounded-xl border border-indigo-200/80 bg-card px-6 py-5 shadow-lg">
            <p className="text-center text-base font-semibold text-foreground">Preparing your test…</p>
            <p className="mt-2 text-center text-sm text-muted-foreground">Please wait while we start your session.</p>
          </div>
        </div>
      ) : null}

      <div>
        <h1>Preparation Materials</h1>
        <p className="text-muted-foreground">Syllabus browser by subject, part, chapter, and section</p>
      </div>

      <Tabs value={selectedSubject} onValueChange={(value) => setSelectedSubject(value as TabKey)}>
        <div className="net360-horizontal-scroll net360-swipe-row -mx-1 px-1 pb-1">
          <TabsList className="inline-flex h-auto min-w-max flex-nowrap gap-1.5 rounded-2xl border border-indigo-200/80 bg-gradient-to-r from-[#eef2ff] via-[#f1ecff] to-[#f5f8ff] p-1.5 shadow-[0_8px_18px_rgba(79,70,229,0.14)] lg:min-w-0 lg:flex-wrap lg:justify-center">
            {tabItems.map((tab) => (
              <TabsTrigger
                key={tab.key}
                value={tab.key}
                onClick={() => {
                  setSelectedSubject(tab.key);
                  if (import.meta.env.DEV) {
                    console.log('Selected Subject:', tab.key);
                  }
                }}
                className={`!flex-none min-h-[2.55rem] rounded-xl border border-indigo-200/90 bg-white/88 px-3 py-1.5 text-center text-[12px] font-semibold leading-tight tracking-[0.01em] text-slate-700 whitespace-normal break-words transition-all duration-300 ease-out hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800 hover:shadow-[0_8px_16px_rgba(79,70,229,0.16)] data-[state=active]:-translate-y-0.5 data-[state=active]:!border-transparent data-[state=active]:!bg-gradient-to-r data-[state=active]:!text-white data-[state=active]:shadow-[0_12px_24px_rgba(79,70,229,0.35)] sm:text-sm ${PREPARATION_TAB_WIDTH_CLASS} ${tabTriggerToneByKey[tab.key].active} ${selectedSubject === tab.key ? 'bg-gradient-to-r from-indigo-600 to-violet-500 !text-white border-indigo-600 shadow-[0_10px_22px_rgba(79,70,229,0.32)] scale-[1.02]' : ''}`}
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabItems.map((tab) => {
          if (tab.key === 'quantitative-mathematics' || tab.key === 'design-aptitude') {
            const flatKey: 'quantitative-mathematics' | 'design-aptitude' = tab.key;
            const content = FLAT_TOPIC_TABS[flatKey];
            const selectedFlatTopic = selectedFlatTopicByTab[flatKey];
            return (
              <TabsContent key={flatKey} value={flatKey} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{content.title}</CardTitle>
                    <CardDescription>Topic list (no chapter structure for this section)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {content.topics.map((topic) => (
                        <li key={topic}>
                          <button
                            type="button"
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-200 ${selectedFlatTopic === topic ? 'border-transparent bg-gradient-to-r from-indigo-600 to-violet-500 text-white shadow-[0_10px_18px_rgba(79,70,229,0.3)]' : 'border-indigo-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-900'}`}
                            onClick={() => {
                              setSelectedFlatTopicByTab((prev) => ({ ...prev, [flatKey]: topic }));
                              onSelectFlatTopic?.({
                                tabKey: flatKey,
                                subject: flatKey,
                                topicTitle: topic,
                              });
                            }}
                          >
                            {topic}
                          </button>

                          {showStartTestButton && !onSelectFlatTopic && selectedFlatTopic === topic ? (
                            <div className="mt-2 rounded-lg border border-indigo-200 bg-white p-3">
                              <Button
                                className="bg-gradient-to-r from-indigo-600 to-violet-500 text-white"
                                disabled={Boolean(launchingSectionKey) || !authReady}
                                onClick={() => {
                                  const baseKey = `${flatKey}|${topic}`;
                                  setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                }}
                              >
                                {launchingSectionKey?.startsWith(`${flatKey}|${topic}|`) ? 'Starting...' : 'Start Test'}
                              </Button>

                              {difficultyMenuKey === `${flatKey}|${topic}` ? (
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                  {difficultyLevels.map((difficulty) => {
                                    const currentLaunchKey = `${flatKey}|${topic}|${difficulty}`;
                                    return (
                                      <Button
                                        key={difficulty}
                                        type="button"
                                        variant="outline"
                                        disabled={Boolean(launchingSectionKey) || !authReady}
                                        onClick={() => {
                                          setDifficultyMenuKey(null);
                                          void handleStartFlatTopicTest(flatKey, topic, difficulty);
                                        }}
                                      >
                                        {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                      </Button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          if (tab.key === 'computer-science' || tab.key === 'intelligence') {
            const subject: SubjectKey = tab.key;
            const chapterOnlySyllabus = subject === 'computer-science' ? COMPUTER_SCIENCE_SYLLABUS : INTELLIGENCE_SYLLABUS;
            const tone = syllabusToneBySubject[subject];
            const selectedChapterId = subject === 'computer-science' ? selectedComputerScienceChapterId : selectedIntelligenceChapterId;
            const selectedSection = subject === 'computer-science' ? selectedComputerScienceSection : selectedIntelligenceSection;
            const setSelectedChapter = subject === 'computer-science' ? setSelectedComputerScienceChapterId : setSelectedIntelligenceChapterId;
            const setSelectedSection = subject === 'computer-science' ? setSelectedComputerScienceSection : setSelectedIntelligenceSection;
            return (
              <TabsContent key={subject} value={subject} className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>{getSubjectLabel(subject)} Syllabus</CardTitle>
                    <CardDescription>Chapter and section structure (no part split).</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {chapterOnlySyllabus.map((chapter) => {
                        const active = selectedChapterId === chapter.id;
                        return (
                          <div
                            key={chapter.id}
                            className={`rounded-xl border transition-all duration-300 ease-out ${active ? tone.chapterActive : `${tone.chapterIdle} ${tone.chapterHover}`} ${!active ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_15px_rgba(15,23,42,0.07)]' : ''}`}
                          >
                            <button
                              type="button"
                              className="w-full p-3 text-left transition-transform duration-200 active:scale-[0.995]"
                              onClick={() => {
                                setSelectedChapter((prev) => (prev === chapter.id ? null : chapter.id));
                                setSelectedSection(null);
                                if (import.meta.env.DEV) {
                                  console.log('Selected Chapter:', chapter.title);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-indigo-950">{chapter.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{chapter.sections.length} sections</p>
                                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 ease-out"
                                      style={{ width: `${getChapterProgressPercent(subject, chapter.sections)}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">{getChapterProgressPercent(subject, chapter.sections)}% completed</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 transition-transform ${active ? `rotate-90 ${tone.chapterAccent}` : 'text-slate-500'}`} />
                              </div>
                            </button>

                            {active ? (
                              <div className={`border-t px-3 pb-3 pt-2 ${tone.panelSurface}`}>
                                <ul className="space-y-2 text-sm">
                                  {chapter.sections.map((section) => (
                                    <li key={section}>
                                      <button
                                        type="button"
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-300 ease-out active:scale-[0.99] ${selectedSection === `${chapter.id}::${section}` ? `border-transparent bg-gradient-to-r ${tone.sectionActive} text-white ${tone.sectionShadow}` : `border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 ${tone.sectionHover} hover:shadow-[0_8px_14px_rgba(15,23,42,0.07)]`}`}
                                        onClick={() => {
                                          setSelectedSection(`${chapter.id}::${section}`);
                                          if (import.meta.env.DEV) {
                                            console.log('Selected Section:', section);
                                          }
                                          onSelectSection?.({
                                            subject,
                                            chapterTitle: chapter.title,
                                            sectionTitle: section,
                                          });
                                        }}
                                      >
                                        <span className="flex min-w-0 items-center justify-between gap-2">
                                          <span className="min-w-0 whitespace-normal break-words">{section}</span>
                                          {isSectionCompleted(subject, section) ? (
                                            <span
                                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] ${selectedSection === `${chapter.id}::${section}` ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}
                                              title="Completed"
                                            >
                                              ✓
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>

                                      {showStartTestButton && selectedSection === `${chapter.id}::${section}` ? (
                                        <div className={`mt-2 rounded-lg border bg-white p-3 ${tone.panelSurface}`}>
                                          <Button
                                            className={`bg-gradient-to-r ${tone.sectionActive} text-white transition-all duration-200 hover:brightness-105`}
                                            disabled={Boolean(launchingSectionKey) || !authReady}
                                            onClick={() => {
                                              const baseKey = `${subject}||${chapter.title}|${section}`;
                                              setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                            }}
                                          >
                                            {launchingSectionKey?.startsWith(`${subject}||${chapter.title}|${section}|`) ? 'Starting...' : 'Start Test'}
                                          </Button>

                                          {difficultyMenuKey === `${subject}||${chapter.title}|${section}` ? (
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                              {difficultyLevels.map((difficulty) => {
                                                const currentLaunchKey = `${subject}||${chapter.title}|${section}|${difficulty}`;
                                                return (
                                                  <Button
                                                    key={difficulty}
                                                    type="button"
                                                    variant="outline"
                                                    disabled={Boolean(launchingSectionKey) || !authReady}
                                                    onClick={() => {
                                                      setDifficultyMenuKey(null);
                                                      void handleStartSectionTest({
                                                        subject,
                                                        chapterTitle: chapter.title,
                                                        sectionTitle: section,
                                                        difficulty,
                                                      });
                                                    }}
                                                  >
                                                    {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                                  </Button>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            );
          }

          const subject = tab.key as PartStructuredSubjectKey;
          const tone = syllabusToneBySubject[subject];
          const selectedPart = selectedPartBySubject[subject];
          const currentPart = selectedPart ? SYLLABUS[subject][selectedPart] : null;
          const selectedChapterId = selectedChapterBySubject[subject];
          return (
            <TabsContent key={subject} value={subject} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{getSubjectLabel(subject)} Syllabus</CardTitle>
                  <CardDescription>Select Part 1 or Part 2, then choose a chapter to view all sections.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    {(['part1', 'part2'] as AcademicPart[]).map((part) => {
                      const isSelected = selectedPart === part;
                      const chapterCount = SYLLABUS[subject][part].chapters.length;
                      return (
                        <button
                          key={`${subject}-${part}`}
                          type="button"
                          onClick={() => {
                            setSelectedPartBySubject((prev) => ({ ...prev, [subject]: part }));
                            setSelectedChapterBySubject((prev) => ({ ...prev, [subject]: null }));
                            setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: null }));
                            if (import.meta.env.DEV) {
                              console.log('Selected Part:', part);
                            }
                          }}
                          className={`rounded-xl border p-3 text-left transition-all duration-300 ease-out active:scale-[0.99] ${isSelected ? `border-transparent bg-gradient-to-r ${tone.partActive} text-white ${tone.partShadow}` : `${tone.partIdle} ${tone.partHover} hover:-translate-y-0.5 hover:shadow-[0_10px_16px_rgba(15,23,42,0.08)]`}`}
                        >
                          <p className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-indigo-950'}`}>{SYLLABUS[subject][part].label}</p>
                          <p className={`mt-1 text-xs ${isSelected ? 'text-indigo-100' : 'text-slate-500'}`}>{chapterCount} chapters</p>
                        </button>
                      );
                    })}
                  </div>

                  {!selectedPart ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">Select Part 1 or Part 2 to continue.</div>
                  ) : !currentPart?.chapters.length ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">No chapters added yet for this part.</div>
                  ) : (
                    <div className="space-y-3">
                      {currentPart.chapters.map((chapter) => {
                        const active = selectedChapterId === chapter.id;
                        return (
                          <div
                            key={chapter.id}
                            className={`rounded-xl border transition-all duration-300 ease-out ${active ? tone.chapterActive : `${tone.chapterIdle} ${tone.chapterHover}`} ${!active ? 'hover:-translate-y-0.5 hover:shadow-[0_8px_15px_rgba(15,23,42,0.07)]' : ''}`}
                          >
                            <button
                              type="button"
                              className="w-full p-3 text-left transition-transform duration-200 active:scale-[0.995]"
                              onClick={() => {
                                setSelectedChapterBySubject((prev) => ({
                                  ...prev,
                                  [subject]: prev[subject] === chapter.id ? null : chapter.id,
                                }));
                                setSelectedSectionBySubject((prev) => ({ ...prev, [subject]: null }));
                                if (import.meta.env.DEV) {
                                  console.log('Selected Chapter:', chapter.title);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-indigo-950">{chapter.title}</p>
                                  <p className="mt-1 text-xs text-slate-500">{chapter.sections.length} sections</p>
                                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 ease-out"
                                      style={{ width: `${getChapterProgressPercent(subject, chapter.sections)}%` }}
                                    />
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-500">{getChapterProgressPercent(subject, chapter.sections)}% completed</p>
                                </div>
                                <ChevronRight className={`h-4 w-4 transition-transform ${active ? `rotate-90 ${tone.chapterAccent}` : 'text-slate-500'}`} />
                              </div>
                            </button>

                            {active ? (
                              <div className={`border-t px-3 pb-3 pt-2 ${tone.panelSurface}`}>
                                <ul className="space-y-2 text-sm">
                                  {chapter.sections.map((section) => (
                                    <li key={section}>
                                      <button
                                        type="button"
                                        className={`w-full rounded-lg border px-3 py-2 text-left transition-all duration-300 ease-out active:scale-[0.99] ${selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? `border-transparent bg-gradient-to-r ${tone.sectionActive} text-white ${tone.sectionShadow}` : `border-slate-200/80 bg-white text-slate-700 hover:-translate-y-0.5 ${tone.sectionHover} hover:shadow-[0_8px_14px_rgba(15,23,42,0.07)]`}`}
                                        onClick={() => {
                                          const selection = {
                                            subject,
                                            part: selectedPart,
                                            chapterTitle: chapter.title,
                                            sectionTitle: section,
                                          };
                                          setSelectedSectionBySubject((prev) => ({
                                            ...prev,
                                            [subject]: `${chapter.id}::${section}`,
                                          }));
                                          if (import.meta.env.DEV) {
                                            console.log('Selected Section:', section);
                                          }
                                          onSelectSection?.(selection);
                                        }}
                                      >
                                        <span className="flex min-w-0 items-center justify-between gap-2">
                                          <span className="min-w-0 whitespace-normal break-words">{section}</span>
                                          {isSectionCompleted(subject, section) ? (
                                            <span
                                              className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full text-[11px] ${selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? 'bg-white/20 text-white' : 'bg-emerald-500 text-white'}`}
                                              title="Completed"
                                            >
                                              ✓
                                            </span>
                                          ) : null}
                                        </span>
                                      </button>

                                      {showStartTestButton && selectedSectionBySubject[subject] === `${chapter.id}::${section}` ? (
                                        <div className={`mt-2 rounded-lg border bg-white p-3 ${tone.panelSurface}`}>
                                          <Button
                                            className={`bg-gradient-to-r ${tone.sectionActive} text-white transition-all duration-200 hover:brightness-105`}
                                            disabled={Boolean(launchingSectionKey) || !authReady}
                                            onClick={() => {
                                              const baseKey = `${subject}|${selectedPart}|${chapter.title}|${section}`;
                                              setDifficultyMenuKey((prev) => (prev === baseKey ? null : baseKey));
                                            }}
                                          >
                                            {launchingSectionKey?.startsWith(`${subject}|${selectedPart}|${chapter.title}|${section}|`) ? 'Starting...' : 'Start Test'}
                                          </Button>

                                          {difficultyMenuKey === `${subject}|${selectedPart}|${chapter.title}|${section}` ? (
                                            <div className="mt-2 grid grid-cols-3 gap-2">
                                              {difficultyLevels.map((difficulty) => {
                                                const currentLaunchKey = `${subject}|${selectedPart}|${chapter.title}|${section}|${difficulty}`;
                                                return (
                                                  <Button
                                                    key={difficulty}
                                                    type="button"
                                                    variant="outline"
                                                    disabled={Boolean(launchingSectionKey) || !authReady}
                                                    onClick={() => {
                                                      setDifficultyMenuKey(null);
                                                      void handleStartSectionTest({
                                                        subject,
                                                        part: selectedPart,
                                                        chapterTitle: chapter.title,
                                                        sectionTitle: section,
                                                        difficulty,
                                                      });
                                                    }}
                                                  >
                                                    {launchingSectionKey === currentLaunchKey ? 'Starting...' : difficulty}
                                                  </Button>
                                                );
                                              })}
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : null}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
