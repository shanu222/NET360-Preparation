import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eraser, Maximize2, PenLine, RefreshCcw } from 'lucide-react';
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast, showNeutralToast, handleApiError, audienceFriendlyError } from '../lib/userToast';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { apiRequest, downloadBinary, API_BASE } from '../lib/api';
import { logNativeEvent } from '../lib/nativeDiagnostics';
import {
  downloadDataUrlFile as downloadDataUrlFileSafe,
  openDataUrlPreview,
} from '../lib/filePreview';

type Tool = 'pen' | 'eraser';

interface DrawPoint {
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  points: DrawPoint[];
  color: string;
}

interface BoardQuestion {
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

const RANDOM_QUESTION_CACHE_KEY = 'net360-practice-board-random-v1';
const QUESTION_BANK_CACHE_KEY = 'net360-practice-board-bank-v1';
const SESSION_SEEN_KEY = 'net360-practice-board-seen-v1';

function readCachedQuestion(): BoardQuestion | null {
  try {
    const raw = localStorage.getItem(RANDOM_QUESTION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BoardQuestion;
  } catch {
    return null;
  }
}

function writeCachedQuestion(question: BoardQuestion | null) {
  try {
    if (!isUsableBoardQuestion(question)) return;
    localStorage.setItem(RANDOM_QUESTION_CACHE_KEY, JSON.stringify(question));
  } catch {
    // Ignore localStorage restrictions.
  }
}

function readCachedQuestionBank(): BoardQuestion[] {
  try {
    const raw = localStorage.getItem(QUESTION_BANK_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as BoardQuestion[] : [];
  } catch {
    return [];
  }
}

function writeCachedQuestionBank(questions: BoardQuestion[]) {
  try {
    localStorage.setItem(QUESTION_BANK_CACHE_KEY, JSON.stringify(questions || []));
  } catch {
    // Ignore localStorage restrictions.
  }
}

function isUsableBoardQuestion(question: BoardQuestion | null | undefined): question is BoardQuestion {
  if (!question?.id) return false;
  return Boolean(
    String(question.questionText || '').trim()
    || question.questionFile?.dataUrl
    || question.questionFile?.name,
  );
}

function readSessionSeenIds(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_SEEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).slice(-200) : [];
  } catch {
    return [];
  }
}

function writeSessionSeenIds(ids: string[]) {
  try {
    sessionStorage.setItem(SESSION_SEEN_KEY, JSON.stringify(ids.slice(-200)));
  } catch {
    // Ignore sessionStorage restrictions.
  }
}

function rememberSeenQuestion(id: string) {
  const next = [...new Set([...readSessionSeenIds(), String(id || '').trim()].filter(Boolean))].slice(-200);
  writeSessionSeenIds(next);
  return next;
}

function isImageMimeType(mimeType?: string | null, fileName?: string | null) {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime.startsWith('image/') && mime !== 'image/svg+xml') return true;
  return /\.(png|jpe?g|jpg|webp|gif)$/i.test(String(fileName || ''));
}

function buildRandomQuestionQuery(excludeIds: string[] = []) {
  const unique = [...new Set(excludeIds.map((id) => String(id || '').trim()).filter(Boolean))].slice(0, 80);
  const params = new URLSearchParams();
  if (unique.length) params.set('excludeId', unique[unique.length - 1]);
  if (unique.length > 1) params.set('excludeIds', unique.join(','));
  const query = params.toString();
  return query ? `?${query}` : '';
}

const practiceBoardMediaCache = new Map<string, Promise<string>>();

function practiceBoardApiPath(raw?: string | null) {
  const value = String(raw || '').trim();
  if (!value || value.startsWith('data:') || value.startsWith('blob:')) return '';
  try {
    const path = /^https?:\/\//i.test(value)
      ? `${new URL(value).pathname}${new URL(value).search}`
      : (value.startsWith('/') ? value : `/${value}`);
    return path.startsWith('/api/') ? path : '';
  } catch {
    return '';
  }
}

function loadPracticeBoardMediaSrc(raw?: string | null): Promise<string> {
  const resolved = resolvePracticeBoardMediaSrc(raw);
  if (!resolved) return Promise.resolve('');
  if (resolved.startsWith('data:') || resolved.startsWith('blob:')) return Promise.resolve(resolved);
  const apiPath = practiceBoardApiPath(raw) || practiceBoardApiPath(resolved);
  if (!apiPath) return Promise.resolve(resolved);
  const cached = practiceBoardMediaCache.get(apiPath);
  if (cached) return cached;
  const pending = downloadBinary(apiPath)
    .then(({ blob }) => {
      if (!blob || blob.size < 8) throw new Error('empty practice board file');
      return URL.createObjectURL(blob);
    })
    .catch((error) => {
      practiceBoardMediaCache.delete(apiPath);
      throw error;
    });
  practiceBoardMediaCache.set(apiPath, pending);
  return pending;
}

async function requestRandomBoardQuestion(excludeIds: string[] = []): Promise<BoardQuestion | null> {
  const payload = await apiRequest<{ question: BoardQuestion }>(
    `/api/practice-board/questions/random${buildRandomQuestionQuery(excludeIds)}`,
    { retryCount: 0, timeoutMs: 12_000 },
  );
  const question = isUsableBoardQuestion(payload?.question) ? payload.question : null;
  if (question) prefetchBoardQuestionMedia(question);
  return question;
}

function prefetchBoardQuestionMedia(question: BoardQuestion | null | undefined) {
  if (!isUsableBoardQuestion(question)) return;
  for (const file of [question.questionFile, question.solutionFile]) {
    const raw = file?.dataUrl;
    if (!raw) continue;
    if (!isImageMimeType(file?.mimeType, file?.name) && !String(raw).includes('/files/')) continue;
    void loadPracticeBoardMediaSrc(raw).catch(() => undefined);
  }
}

let warmQuestionPromise: Promise<BoardQuestion | null> | null = null;

export function warmPracticeBoardQuestion() {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('view') === 'question-bank') {
    return Promise.resolve(null);
  }
  if (!warmQuestionPromise) {
    warmQuestionPromise = requestRandomBoardQuestion(readSessionSeenIds()).catch(() => null);
  }
  return warmQuestionPromise;
}

function consumeWarmedQuestion() {
  const pending = warmQuestionPromise;
  warmQuestionPromise = null;
  return pending;
}

if (typeof window !== 'undefined') {
  void warmPracticeBoardQuestion();
}

function resolvePracticeBoardMediaSrc(dataUrl?: string | null) {
  const raw = String(dataUrl || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || /^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith('/') ? raw : `/${raw}`;
  return `${String(API_BASE || '').replace(/\/$/, '')}${path}`;
}

function openDataUrlFile(file?: { dataUrl?: string | null } | null) {
  const src = resolvePracticeBoardMediaSrc(file?.dataUrl);
  if (!src) return;
  if (src.startsWith('data:')) {
    if (!openDataUrlPreview(src)) {
      showErrorToast('Could not open file preview.');
    }
    return;
  }
  window.open(src, '_blank', 'noopener,noreferrer');
}

function downloadDataUrlFile(file?: { dataUrl?: string | null; name?: string | null } | null) {
  const src = resolvePracticeBoardMediaSrc(file?.dataUrl);
  if (!src) return;
  if (src.startsWith('data:')) {
    const downloaded = downloadDataUrlFileSafe(src, String(file?.name || 'practice-file'));
    if (!downloaded) {
      showErrorToast('Could not download this file.');
    }
    return;
  }
  window.open(src, '_blank', 'noopener,noreferrer');
}

function PracticeBoardImage({
  src,
  alt,
  onOpenFullSize,
  frameClassName,
}: {
  src: string;
  alt: string;
  onOpenFullSize: (loadedSrc: string) => void;
  frameClassName: string;
}) {
  const [displaySrc, setDisplaySrc] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setDisplaySrc('');
    void loadPracticeBoardMediaSrc(src)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setFailed(true);
          return;
        }
        setDisplaySrc(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (failed) {
    return (
      <p className="mt-3 text-sm text-slate-700 dark:text-slate-200">
        Question image could not be displayed. Tap Next Question to load another.
      </p>
    );
  }

  if (!displaySrc) {
    return (
      <div className={`mt-3 flex min-h-28 w-full items-center justify-center rounded-xl border bg-white px-4 py-6 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-200 ${frameClassName}`}>
        Loading question…
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenFullSize(displaySrc)}
      className={`group relative mt-3 block w-full max-w-full overflow-hidden rounded-xl border bg-white text-left shadow-sm transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 active:brightness-95 dark:border-slate-600 dark:bg-slate-900 ${frameClassName}`}
      aria-label={`View ${alt} full size`}
    >
      <img
        src={displaySrc}
        alt={alt}
        className="mx-auto block h-auto max-h-[min(46vh,360px)] w-full object-contain"
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-slate-950/55 to-transparent" />
      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold tracking-wide text-slate-800 shadow-md ring-1 ring-black/5">
        <Maximize2 className="h-3.5 w-3.5 text-indigo-600" />
        Full size
      </span>
    </button>
  );
}

const LIGHT_PEN_PRIMARY = { name: 'Black', value: '#111827' };
const DARK_PEN_PRIMARY = { name: 'White', value: '#f8fafc' };

const SHARED_PEN_COLORS = [
  { name: 'Blue', value: '#1d4ed8' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Green', value: '#15803d' },
  { name: 'Purple', value: '#7e22ce' },
];

export function PracticeBoard() {
  const isQuestionBankView = new URLSearchParams(window.location.search).get('view') === 'question-bank';
  const [activeQuestion, setActiveQuestion] = useState<BoardQuestion | null>(() => {
    const cached = readCachedQuestion();
    return isUsableBoardQuestion(cached) ? cached : null;
  });
  const [showAnswer, setShowAnswer] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(() => !isUsableBoardQuestion(readCachedQuestion()));
  const [questionBankLoading, setQuestionBankLoading] = useState(false);
  const [questionBankQuery, setQuestionBankQuery] = useState('');
  const [questionBankSubject, setQuestionBankSubject] = useState('');
  const [questionBankQuestions, setQuestionBankQuestions] = useState<BoardQuestion[]>([]);
  const [tool, setTool] = useState<Tool>('pen');
  const [isDarkMode, setIsDarkMode] = useState(() => document.documentElement.classList.contains('dark'));
  const [fullSizeImage, setFullSizeImage] = useState<{ src: string; title: string; alt: string } | null>(null);

  const penColors = useMemo(
    () => [isDarkMode ? DARK_PEN_PRIMARY : LIGHT_PEN_PRIMARY, ...SHARED_PEN_COLORS],
    [isDarkMode],
  );

  const [penColor, setPenColor] = useState(() =>
    document.documentElement.classList.contains('dark') ? DARK_PEN_PRIMARY.value : LIGHT_PEN_PRIMARY.value,
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);
  const currentIdRef = useRef(activeQuestion?.id || '');
  const preloadRef = useRef<BoardQuestion | null>(null);
  const preloadInFlightRef = useRef<Promise<BoardQuestion | null> | null>(null);
  const advancingRef = useRef(false);

  const formatSubjectLabel = useCallback((subject: string) => {
    const normalized = String(subject || '').trim().toLowerCase();
    if (!normalized) return 'General';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }, []);

  const questionBankBySubject = useMemo(() => {
    const grouped = new Map<string, BoardQuestion[]>();
    questionBankQuestions.forEach((item) => {
      const key = String(item.subject || 'general').trim().toLowerCase() || 'general';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    });

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([subject, questions]) => ({
        subject,
        questions,
      }));
  }, [questionBankQuestions]);

  const activeQuestionBankSubject = useMemo(() => {
    if (!questionBankBySubject.length) return null;
    return questionBankBySubject.find((item) => item.subject === questionBankSubject) || questionBankBySubject[0];
  }, [questionBankBySubject, questionBankSubject]);

  const visibleQuestionBankItems = useMemo(() => {
    const items = activeQuestionBankSubject?.questions || [];
    if (!questionBankQuery.trim()) return items;
    const needle = questionBankQuery.toLowerCase();
    return items.filter((item) => {
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
  }, [activeQuestionBankSubject, questionBankQuery]);

  useEffect(() => {
    const root = document.documentElement;
    const updateThemeState = () => {
      setIsDarkMode(root.classList.contains('dark'));
    };

    updateThemeState();
    const observer = new MutationObserver(updateThemeState);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const hasCurrentColor = penColors.some((color) => color.value === penColor);
    if (!hasCurrentColor) {
      setPenColor(penColors[0].value);
    }
  }, [penColor, penColors]);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    strokesRef.current.forEach((stroke) => {
      if (!stroke.points.length) return;
      ctx.beginPath();
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#ffffff' : stroke.color;
      ctx.lineWidth = stroke.tool === 'eraser' ? 24 : 3;
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i += 1) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ratio = window.devicePixelRatio || 1;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (!width || !height) return;

    const nextWidth = Math.floor(width * ratio);
    const nextHeight = Math.floor(height * ratio);
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;

    canvas.width = nextWidth;
    canvas.height = nextHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    redrawCanvas();
  }, [redrawCanvas]);

  const getPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = getPoint(event);
    if (!point) return;

    isDrawingRef.current = true;
    const stroke: Stroke = { tool, points: [point], color: tool === 'eraser' ? '#ffffff' : penColor };
    currentStrokeRef.current = stroke;
    strokesRef.current.push(stroke);

    event.currentTarget.setPointerCapture(event.pointerId);
    redrawCanvas();
  }, [getPoint, penColor, redrawCanvas, tool]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !currentStrokeRef.current) return;
    const point = getPoint(event);
    if (!point) return;

    currentStrokeRef.current.points.push(point);
    redrawCanvas();
  }, [getPoint, redrawCanvas]);

  const endDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
  }, []);

  const clearBoard = useCallback(() => {
    isDrawingRef.current = false;
    currentStrokeRef.current = null;
    strokesRef.current = [];
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      }
    }
    redrawCanvas();
  }, [redrawCanvas]);

  const applyQuestion = useCallback((question: BoardQuestion) => {
    currentIdRef.current = question.id;
    rememberSeenQuestion(question.id);
    prefetchBoardQuestionMedia(question);
    setActiveQuestion(question);
    writeCachedQuestion(question);
    setShowAnswer(false);
    logNativeEvent('practice-board', 'random-question-loaded', {
      hasQuestion: true,
      subject: question.subject || '',
    });
  }, []);

  const ensurePreload = useCallback(async () => {
    if (preloadRef.current && preloadRef.current.id !== currentIdRef.current) return preloadRef.current;
    if (preloadInFlightRef.current) return preloadInFlightRef.current;

    const promise = requestRandomBoardQuestion(readSessionSeenIds())
      .then(async (question) => {
        if (question && question.id !== currentIdRef.current) return question;
        return requestRandomBoardQuestion([currentIdRef.current].filter(Boolean));
      })
      .then((question) => {
        if (question && question.id !== currentIdRef.current) {
          preloadRef.current = question;
          prefetchBoardQuestionMedia(question);
        }
        return question;
      })
      .catch(() => null)
      .finally(() => {
        if (preloadInFlightRef.current === promise) preloadInFlightRef.current = null;
      });

    preloadInFlightRef.current = promise;
    return promise;
  }, []);

  const reportQuestionLoadError = useCallback((error: unknown, fallbackQuestion?: BoardQuestion | null) => {
    const status = Number((error as { status?: number })?.status || 0);
    const message = String((error as Error)?.message || '').toLowerCase();
    const isEmptyBank = status === 404 || message.includes('no practice board question');
    const isSlowNetwork = !isEmptyBank && (
      message.includes('timeout')
      || message.includes('took too long')
      || message.includes('network error')
      || message.includes('failed to fetch')
      || (error as { code?: string })?.code === 'REQUEST_TIMEOUT'
    );
    logNativeEvent('practice-board', 'random-question-failed', {
      message: (error as Error)?.message || String(error),
      fallbackToCache: Boolean(fallbackQuestion),
    }, 'error');
    return { isEmptyBank, isSlowNetwork };
  }, []);

  const goToNextQuestion = useCallback(async () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    const currentId = currentIdRef.current;
    try {
      const ready = preloadRef.current && preloadRef.current.id !== currentId
        ? preloadRef.current
        : null;
      if (ready) {
        preloadRef.current = null;
        applyQuestion(ready);
        void ensurePreload();
        return;
      }

      if (preloadInFlightRef.current) {
        const incoming = await preloadInFlightRef.current;
        if (incoming && incoming.id !== currentIdRef.current) {
          preloadRef.current = null;
          applyQuestion(incoming);
          void ensurePreload();
          return;
        }
      }

      setLoadingQuestion(true);
      const next = await requestRandomBoardQuestion(readSessionSeenIds());
      if (next) {
        applyQuestion(next);
        void ensurePreload();
        return;
      }
      const fallback = await requestRandomBoardQuestion([currentIdRef.current].filter(Boolean));
      if (fallback) {
        applyQuestion(fallback);
        void ensurePreload();
        return;
      }
      showErrorToast('Could not load a practice board question. Please try again.');
    } catch (error) {
      const cached = isUsableBoardQuestion(readCachedQuestion()) ? readCachedQuestion() : null;
      const { isEmptyBank, isSlowNetwork } = reportQuestionLoadError(error, cached);
      if (isEmptyBank) {
        if (!activeQuestion) setActiveQuestion(null);
        return;
      }
      if (cached && cached.id !== currentId) {
        applyQuestion(cached);
        showWarningToast('Could not load due to slow internet. Showing your last available question.');
        return;
      }
      showErrorToast(isSlowNetwork
        ? 'Could not load due to slow internet. Please try again.'
        : 'Could not load a practice board question. Please try again.');
    } finally {
      setLoadingQuestion(false);
      advancingRef.current = false;
    }
  }, [activeQuestion, applyQuestion, ensurePreload, reportQuestionLoadError]);

  const fetchQuestionBank = useCallback(async () => {
    setQuestionBankLoading(true);
    try {
      const payload = await apiRequest<{ questions: BoardQuestion[] }>(
        '/api/practice-board/questions?limit=500',
        { retryCount: 1, retryDelayMs: 600, timeoutMs: 20_000 },
      );
      const questions = payload?.questions || [];
      setQuestionBankQuestions(questions);
      writeCachedQuestionBank(questions);
      logNativeEvent('practice-board', 'question-bank-loaded', {
        count: Array.isArray(payload?.questions) ? payload.questions.length : 0,
      });
    } catch (error) {
      const cached = readCachedQuestionBank();
      logNativeEvent('practice-board', 'question-bank-failed', {
        message: (error as Error)?.message || String(error),
        fallbackToCache: cached.length,
      }, 'error');
      if (cached.length) {
        setQuestionBankQuestions(cached);
        showWarningToast('Could not load due to slow internet. Showing cached questions.');
        return;
      }
      const status = Number((error as { status?: number })?.status || 0);
      const message = String((error as Error)?.message || '').toLowerCase();
      const isSlowNetwork = status !== 404 && (
        message.includes('timeout')
        || message.includes('took too long')
        || message.includes('network error')
        || message.includes('failed to fetch')
        || (error as { code?: string })?.code === 'REQUEST_TIMEOUT'
      );
      setQuestionBankQuestions([]);
      showErrorToast(isSlowNetwork
        ? 'Could not load due to slow internet. Please try again.'
        : 'Could not load practice board questions. Please try again.');
    } finally {
      setQuestionBankLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isQuestionBankView) {
      void fetchQuestionBank();
      return;
    }

    let cancelled = false;
    const cached = isUsableBoardQuestion(readCachedQuestion()) ? readCachedQuestion() : null;
    if (cached) {
      currentIdRef.current = cached.id;
      rememberSeenQuestion(cached.id);
      prefetchBoardQuestionMedia(cached);
    }

    (async () => {
      try {
        const warmed = await (consumeWarmedQuestion() || requestRandomBoardQuestion(readSessionSeenIds()));
        if (cancelled) return;

        if (cached) {
          if (isUsableBoardQuestion(warmed) && warmed.id !== cached.id) {
            preloadRef.current = warmed;
            prefetchBoardQuestionMedia(warmed);
          }
          if (!preloadRef.current) void ensurePreload();
          return;
        }

        if (isUsableBoardQuestion(warmed)) {
          applyQuestion(warmed);
          void ensurePreload();
          return;
        }

        const first = await requestRandomBoardQuestion(readSessionSeenIds());
        if (cancelled) return;
        if (first) {
          applyQuestion(first);
          void ensurePreload();
          return;
        }
        setActiveQuestion(null);
      } catch (error) {
        if (cancelled) return;
        const { isEmptyBank, isSlowNetwork } = reportQuestionLoadError(error, cached);
        if (isEmptyBank) {
          if (!cached) setActiveQuestion(null);
          return;
        }
        if (cached) {
          void ensurePreload();
          return;
        }
        showErrorToast(isSlowNetwork
          ? 'Could not load due to slow internet. Please try again.'
          : 'Could not load a practice board question. Please try again.');
      } finally {
        if (!cancelled) setLoadingQuestion(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyQuestion, ensurePreload, fetchQuestionBank, isQuestionBankView, reportQuestionLoadError]);

  useEffect(() => {
    resizeCanvas();
    const onResize = () => resizeCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resizeCanvas]);

  const questionFile = useMemo(() => activeQuestion?.questionFile || null, [activeQuestion]);
  const solutionFile = useMemo(() => activeQuestion?.solutionFile || null, [activeQuestion]);
  const questionText = String(activeQuestion?.questionText || '').trim();
  const solutionText = String(activeQuestion?.solutionText || '').trim();
  const questionImage = questionFile && isImageMimeType(questionFile.mimeType, questionFile.name) ? questionFile : null;
  const solutionImage = solutionFile && isImageMimeType(solutionFile.mimeType, solutionFile.name) ? solutionFile : null;

  useEffect(() => {
    setFullSizeImage(null);
  }, [activeQuestion?.id]);

  if (isQuestionBankView) {
    return (
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1>Practice Board Question Bank</h1>
            <p className="text-muted-foreground">Browse conceptual questions by subject and open files directly.</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.delete('view');
              window.location.href = url.toString();
            }}
          >
            Back to Practice Board
          </Button>
        </div>

        <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Subjects</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[62vh] space-y-2 overflow-auto sm:max-h-[68vh]">
              {questionBankBySubject.map((group) => (
                <button
                  type="button"
                  key={group.subject}
                  onClick={() => setQuestionBankSubject(group.subject)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm ${activeQuestionBankSubject?.subject === group.subject ? 'bg-indigo-50 border-indigo-300' : 'hover:bg-muted'}`}
                >
                  <div className="flex items-center justify-between">
                    <span>{formatSubjectLabel(group.subject)}</span>
                    <span className="text-xs text-muted-foreground">{group.questions.length}</span>
                  </div>
                </button>
              ))}
              {!questionBankBySubject.length && !questionBankLoading ? (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  No questions found.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Questions</CardTitle>
              <CardDescription>{formatSubjectLabel(activeQuestionBankSubject?.subject || 'general')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[62vh] overflow-auto sm:max-h-[68vh]">
              <Input
                value={questionBankQuery}
                onChange={(event) => setQuestionBankQuery(event.target.value)}
                placeholder="Search by text, difficulty, or file name..."
              />
              {questionBankLoading ? <p className="text-sm text-muted-foreground">Loading question bank...</p> : null}

              {visibleQuestionBankItems.map((item, index) => (
                <article key={item.id} className="rounded-xl border border-indigo-100 bg-white p-3 space-y-2">
                  <p className="font-medium">Q{index + 1}. {item.questionText || '(File-based question)'}</p>
                  <p className="text-xs text-muted-foreground">Difficulty: {item.difficulty || 'Medium'}</p>

                  {item.questionFile ? (
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p>Question file: {item.questionFile.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openDataUrlFile(item.questionFile)}>View</Button>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => downloadDataUrlFile(item.questionFile)}>Download</Button>
                      </div>
                    </div>
                  ) : null}

                  <div className="rounded-md bg-emerald-50/70 p-2">
                    <p className="text-[11px] uppercase tracking-wide text-emerald-700">Solution</p>
                    <p className="whitespace-pre-wrap text-xs text-slate-700">{item.solutionText || '(File-only solution)'}</p>
                  </div>

                  {item.solutionFile ? (
                    <div className="rounded-md bg-slate-50 p-2 text-xs">
                      <p>Solution file: {item.solutionFile.name}</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openDataUrlFile(item.solutionFile)}>View</Button>
                        <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => downloadDataUrlFile(item.solutionFile)}>Download</Button>
                      </div>
                    </div>
                  ) : null}
                </article>
              ))}

              {!questionBankLoading && !visibleQuestionBankItems.length ? (
                <div className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">
                  No questions found for this subject.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <h1>Practice Board</h1>
        <p className="text-muted-foreground">Solve one random question at a time on a full digital whiteboard.</p>
      </div>

      <Card className="rounded-2xl border-indigo-100 bg-white/95 shadow-[0_10px_22px_rgba(98,113,202,0.10)] dark:border-slate-700 dark:bg-slate-900/90">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-indigo-950 dark:text-slate-100">Question</CardTitle>
              <CardDescription>
                {activeQuestion
                  ? `${formatSubjectLabel(activeQuestion.subject)} • ${activeQuestion.difficulty}`
                  : loadingQuestion
                    ? 'Loading question…'
                    : 'No question available.'}
              </CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                className="w-full border-indigo-300 bg-white text-indigo-700 hover:bg-indigo-50 sm:w-auto"
                variant="outline"
                onClick={() => setShowAnswer((prev) => !prev)}
                disabled={!activeQuestion}
              >
                {showAnswer ? 'Hide Answer' : 'View Answer'}
              </Button>
              <Button
                className="w-full bg-gradient-to-r from-indigo-600 to-violet-500 text-white sm:w-auto"
                onClick={() => void goToNextQuestion()}
                disabled={!activeQuestion && loadingQuestion}
              >
                {loadingQuestion && !activeQuestion ? 'Loading...' : 'Next Question'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-indigo-100 bg-slate-50/60 p-4 dark:border-slate-600 dark:bg-slate-800/80">
            {questionText ? (
              <p className="whitespace-pre-wrap text-base text-slate-800 dark:text-slate-100 sm:text-lg">{questionText}</p>
            ) : loadingQuestion ? (
              <p className="text-base text-slate-800 dark:text-slate-100 sm:text-lg">Loading question…</p>
            ) : !activeQuestion ? (
              <p className="text-base text-slate-800 dark:text-slate-100 sm:text-lg">Question bank is empty right now.</p>
            ) : !questionImage && !questionFile ? (
              <p className="text-base text-slate-800 dark:text-slate-100 sm:text-lg">This question has no visible text. Tap Next Question.</p>
            ) : null}
            {questionImage ? (
              <PracticeBoardImage
                src={questionImage.dataUrl}
                alt="Question"
                frameClassName="border-indigo-100"
                onOpenFullSize={(loadedSrc) =>
                  setFullSizeImage({
                    src: loadedSrc,
                    title: 'Question',
                    alt: 'Question',
                  })
                }
              />
            ) : questionFile ? (
                <div className="mt-3 rounded-md border border-indigo-100 bg-white p-2 text-xs text-slate-600">
                  <p>Question file: {questionFile.name}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openDataUrlFile(questionFile)}>View</Button>
                    <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => downloadDataUrlFile(questionFile)}>Download</Button>
                  </div>
                </div>
            ) : null}
          </div>

          {showAnswer && activeQuestion ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-700/50 dark:bg-emerald-950/40">
              <p className="text-xs uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Answer</p>
              {solutionText ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">{solutionText}</p>
              ) : !solutionImage ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800 dark:text-slate-100">
                  No text answer provided for this question.
                </p>
              ) : null}
              {solutionImage ? (
                <PracticeBoardImage
                  src={solutionImage.dataUrl}
                  alt="Answer"
                  frameClassName="border-emerald-200"
                  onOpenFullSize={(loadedSrc) =>
                    setFullSizeImage({
                      src: loadedSrc,
                      title: 'Answer',
                      alt: 'Answer',
                    })
                  }
                />
              ) : solutionFile ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-white p-2 text-xs text-slate-600">
                    <p>Solution file: {solutionFile.name}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => openDataUrlFile(solutionFile)}>View</Button>
                      <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => downloadDataUrlFile(solutionFile)}>Download</Button>
                    </div>
                  </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(fullSizeImage)} onOpenChange={(open) => { if (!open) setFullSizeImage(null); }}>
        <DialogContent className="net360-fullscreen-media gap-0 overflow-hidden border-0 bg-slate-950 p-0 text-white shadow-none [&>button]:text-white [&>button]:hover:bg-white/10 [&>button]:hover:text-white">
          <div className="shrink-0 border-b border-white/10 px-4 py-3 pr-14 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <DialogTitle className="text-sm font-semibold tracking-wide text-white">
              {fullSizeImage?.title || 'Preview'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-300">
              Tap outside or press Esc to close
            </DialogDescription>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.18),transparent_58%),#020617] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {fullSizeImage ? (
              <img
                src={fullSizeImage.src}
                alt={fullSizeImage.alt}
                className="max-h-full max-w-full object-contain"
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <Card className="rounded-2xl border-indigo-100 bg-white/96 shadow-[0_12px_24px_rgba(98,113,202,0.10)]">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-indigo-950">Digital Whiteboard</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={tool === 'pen' ? 'default' : 'outline'}
                className={tool === 'pen' ? 'bg-indigo-600 text-white' : 'border-indigo-200'}
                onClick={() => setTool('pen')}
              >
                <PenLine className="h-4 w-4" />
                Pen
              </Button>
              <Button
                variant={tool === 'eraser' ? 'default' : 'outline'}
                className={tool === 'eraser' ? 'bg-indigo-600 text-white' : 'border-indigo-200'}
                onClick={() => setTool('eraser')}
              >
                <Eraser className="h-4 w-4" />
                Eraser
              </Button>
              <div className="flex items-center gap-1 rounded-md border border-indigo-200 bg-white px-2 py-1">
                {penColors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    title={color.name}
                    aria-label={`Use ${color.name} pen color`}
                    onClick={() => {
                      setTool('pen');
                      setPenColor(color.value);
                    }}
                    className={`h-6 w-6 rounded-full border ${penColor === color.value ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-slate-300'}`}
                    style={{ backgroundColor: color.value }}
                  />
                ))}
              </div>
              <Button variant="outline" className="border-indigo-200" onClick={clearBoard}>
                <RefreshCcw className="h-4 w-4" />
                Clear Board
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={containerRef}
            className="relative h-[44vh] min-h-[230px] w-full overflow-hidden rounded-xl border border-slate-200 bg-white sm:h-[52vh] sm:min-h-[300px] lg:h-[58vh] lg:min-h-[360px]"
          >
            <canvas
              ref={canvasRef}
              className="touch-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endDrawing}
              onPointerCancel={endDrawing}
              onPointerLeave={endDrawing}
              aria-label="Digital writing board"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
