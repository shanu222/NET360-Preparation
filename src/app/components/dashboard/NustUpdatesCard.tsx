import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ArrowRight, ChevronLeft, ChevronRight, Megaphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiRequest } from '../../lib/api';
import { acquireRealtimeSocket, releaseRealtimeSocket } from '../../lib/realtimeSocket';

const FEED_PATH = '/api/public/nust-admissions-feed';
const POLL_MS = 15 * 60 * 1000;
const AUTO_MS = 5000;
const MAX_SLIDES = 6;

type NustStatus = 'open' | 'closed' | 'upcoming' | 'completed' | 'info';
type FeedStatus = 'loading' | 'ready' | 'empty' | 'error';

type NustDateRow = {
  key: string;
  title: string;
  registration: string;
  testDate: string;
  status: NustStatus;
};

type NustNoticeRow = {
  key: string;
  title: string;
  subtitle: string;
  category: string;
  status: NustStatus;
};

type FeedPayload = {
  source?: string;
  dates?: Array<Partial<NustDateRow>>;
  notices?: Array<Partial<NustNoticeRow>>;
  sessionLabel?: string;
  lastUpdatedFromNust?: string | null;
  fetchedAt?: string | null;
};

type UpdateSlide = {
  id: string;
  eyebrow: string;
  title: string;
  lines: string[];
  status: NustStatus;
};

type NustUpdatesCardProps = {
  onOpenGuide: () => void;
};

const NOTICE_BLOCKLIST_PATTERNS = [
  /mathematics\s*course/i,
  /pre[\s-]*medical/i,
  /8\s*weeks?\s*(duration\s*)?course/i,
];

const STATUS_LABEL: Record<NustStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  upcoming: 'Upcoming',
  completed: 'Completed',
  info: 'Info',
};

const STATUS_BADGE: Record<NustStatus, string> = {
  open: 'bg-emerald-500 text-white',
  upcoming: 'bg-violet-500 text-white',
  closed: 'bg-rose-500 text-white',
  completed: 'bg-blue-500 text-white',
  info: 'bg-amber-500 text-white',
};

function asStatus(value: unknown): NustStatus {
  const status = String(value || '').toLowerCase();
  if (status === 'open' || status === 'closed' || status === 'upcoming' || status === 'completed' || status === 'info') {
    return status;
  }
  return 'info';
}

function cleanText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function isBlockedNotice(title: string, subtitle: string) {
  const haystack = `${title} ${subtitle}`;
  return NOTICE_BLOCKLIST_PATTERNS.some((pattern) => pattern.test(haystack));
}

function datePriority(status: NustStatus) {
  if (status === 'upcoming') return 500;
  if (status === 'open') return 480;
  if (status === 'info') return 300;
  if (status === 'completed') return 40;
  return 20;
}

function noticePriority(status: NustStatus, category: string) {
  if (status === 'upcoming' || status === 'open') return 460;
  if (status === 'closed' || status === 'completed') return status === 'completed' ? 40 : 20;
  if (category === 'net') return 440;
  if (category === 'notice' || category === 'act_sat') return 420;
  if (category === 'result') return 400;
  return 280;
}

function noticeEyebrow(category: string) {
  if (category === 'result') return 'Result Notice';
  if (category === 'act_sat') return 'ACT / SAT';
  if (category === 'net') return 'NET Update';
  return 'Important Notice';
}

function normalizeDates(rows: Array<Partial<NustDateRow>> | undefined): NustDateRow[] {
  return (rows || []).map((row, index) => ({
    key: cleanText(row?.key) || `date-${index + 1}`,
    title: cleanText(row?.title),
    registration: cleanText(row?.registration),
    testDate: cleanText(row?.testDate),
    status: asStatus(row?.status),
  })).filter((row) => row.title);
}

function normalizeNotices(rows: Array<Partial<NustNoticeRow>> | undefined): NustNoticeRow[] {
  return (rows || []).map((row, index) => ({
    key: cleanText(row?.key) || `notice-${index + 1}`,
    title: cleanText(row?.title),
    subtitle: cleanText(row?.subtitle),
    category: cleanText(row?.category) || 'notice',
    status: asStatus(row?.status),
  })).filter((row) => row.title && !isBlockedNotice(row.title, row.subtitle));
}

export function buildNustUpdateSlides(dates: NustDateRow[], notices: NustNoticeRow[]): UpdateSlide[] {
  const ranked = [
    ...dates.map((item, index) => ({
      index,
      priority: datePriority(item.status),
      slide: {
        id: `date:${item.key}`,
        eyebrow: 'Important Date',
        title: item.title,
        lines: [item.registration, item.testDate].filter(Boolean),
        status: item.status,
      } satisfies UpdateSlide,
    })),
    ...notices.map((item, index) => ({
      index: dates.length + index,
      priority: noticePriority(item.status, item.category),
      slide: {
        id: `notice:${item.key}`,
        eyebrow: noticeEyebrow(item.category),
        title: item.title,
        lines: item.subtitle ? [item.subtitle] : [],
        status: item.status,
      } satisfies UpdateSlide,
    })),
  ].sort((a, b) => b.priority - a.priority || a.index - b.index);

  const fresh = ranked.filter((item) => item.priority >= 280);
  const chosen = (fresh.length ? fresh : ranked).slice(0, MAX_SLIDES);
  const seen = new Set<string>();
  return chosen.filter((item) => {
    if (seen.has(item.slide.id)) return false;
    seen.add(item.slide.id);
    return true;
  }).map((item) => item.slide);
}

function useNustGuideFeed() {
  const { token } = useAuth();
  const [status, setStatus] = useState<FeedStatus>('loading');
  const [dates, setDates] = useState<NustDateRow[]>([]);
  const [notices, setNotices] = useState<NustNoticeRow[]>([]);
  const [sessionLabel, setSessionLabel] = useState('');

  const applyFeed = useCallback((payload: FeedPayload) => {
    if (payload.source === 'seed') {
      setStatus((current) => (current === 'ready' ? 'ready' : 'empty'));
      return;
    }
    const nextDates = normalizeDates(payload.dates);
    const nextNotices = normalizeNotices(payload.notices);
    setDates(nextDates);
    setNotices(nextNotices);
    setSessionLabel(cleanText(payload.sessionLabel));
    setStatus(nextDates.length || nextNotices.length ? 'ready' : 'empty');
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadFeed = async () => {
      try {
        const payload = await apiRequest<FeedPayload>(FEED_PATH);
        if (!cancelled) applyFeed(payload);
      } catch {
        if (!cancelled) setStatus((current) => (current === 'ready' ? 'ready' : 'error'));
      }
    };

    void loadFeed();
    const timer = window.setInterval(() => {
      void loadFeed();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadFeed();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [applyFeed]);

  useEffect(() => {
    if (!token) return undefined;
    const socket = acquireRealtimeSocket('student');
    const onSync = (data: unknown) => {
      const parsed = data && typeof data === 'object' ? data as FeedPayload & { type?: string } : {};
      if (parsed.type !== 'nust.admissions.updated') return;
      if (Array.isArray(parsed.dates) && parsed.dates.length) setDates(normalizeDates(parsed.dates));
      if (Array.isArray(parsed.notices) && parsed.notices.length) {
        const safeNotices = normalizeNotices(parsed.notices);
        if (safeNotices.length) setNotices(safeNotices);
      }
      if (parsed.sessionLabel) setSessionLabel(cleanText(parsed.sessionLabel));
      setStatus('ready');
    };
    socket.on('sync', onSync);
    return () => {
      socket.off('sync', onSync);
      releaseRealtimeSocket('student', socket);
    };
  }, [token]);

  return { status, dates, notices, sessionLabel };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return reduced;
}

function ViewGuideButton({ onOpenGuide }: { onOpenGuide: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpenGuide}
      className="mx-auto mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-700 hover:underline"
    >
      View NUST Guide
      <ArrowRight className="h-4 w-4" aria-hidden />
    </button>
  );
}

function MessageState({
  title,
  detail,
  onOpenGuide,
}: {
  title: string;
  detail: string;
  onOpenGuide: () => void;
}) {
  return (
    <>
      <div className="mt-3 min-h-[5.75rem] rounded-xl bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-400/10 px-3 py-3 sm:px-4" role="status">
        <p className="font-medium text-indigo-950">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{detail}</p>
      </div>
      <ViewGuideButton onOpenGuide={onOpenGuide} />
    </>
  );
}

function NustUpdatesCarousel({
  slides,
  onOpenGuide,
}: {
  slides: UpdateSlide[];
  onOpenGuide: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [hoverPaused, setHoverPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [selected, setSelected] = useState(0);
  const slideKey = slides.map((slide) => slide.id).join('|');
  const [viewportRef, embla] = useEmblaCarousel({
    loop: slides.length > 1,
    align: 'start',
    duration: reducedMotion ? 0 : 22,
    watchDrag: slides.length > 1,
  });

  useEffect(() => {
    if (!embla) return undefined;
    embla.reInit({
      loop: slides.length > 1,
      align: 'start',
      duration: reducedMotion ? 0 : 22,
      watchDrag: slides.length > 1,
    });
    const onSelect = () => setSelected(embla.selectedScrollSnap());
    embla.on('select', onSelect);
    embla.on('reInit', onSelect);
    onSelect();
    return () => {
      embla.off('select', onSelect);
      embla.off('reInit', onSelect);
    };
  }, [embla, reducedMotion, slideKey, slides.length]);

  useEffect(() => {
    if (!embla) return undefined;
    const onDown = () => setPointerPaused(true);
    const onUp = () => setPointerPaused(false);
    embla.on('pointerDown', onDown);
    embla.on('pointerUp', onUp);
    return () => {
      embla.off('pointerDown', onDown);
      embla.off('pointerUp', onUp);
    };
  }, [embla]);

  const paused = hoverPaused || pointerPaused || reducedMotion;

  useEffect(() => {
    if (!embla || paused || slides.length < 2) return undefined;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (document.hidden) {
          schedule();
          return;
        }
        embla.scrollNext();
      }, AUTO_MS);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [embla, paused, selected, slides.length]);

  const scrollTo = (index: number) => {
    embla?.scrollTo(index);
  };

  return (
    <div
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setHoverPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoverPaused(false);
      }}
    >
      <div className="mt-3 overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500/10 via-transparent to-violet-400/10" ref={viewportRef}>
        <div className="flex touch-pan-y">
          {slides.map((slide, index) => (
            <article
              key={slide.id}
              className="min-w-0 shrink-0 grow-0 basis-full px-3 py-3 sm:px-4"
              aria-hidden={index !== selected}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700">{slide.eyebrow}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[slide.status]}`}>
                  {STATUS_LABEL[slide.status]}
                </span>
              </div>
              <h3 className="mt-1.5 line-clamp-2 text-base font-semibold text-indigo-950">{slide.title}</h3>
              {slide.lines.length ? (
                <ul className="mt-2 space-y-1.5">
                  {slide.lines.map((line, lineIndex) => (
                    <li key={`${slide.id}-${lineIndex}`} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" aria-hidden />
                      <span className="line-clamp-2">{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {slides.length > 1 ? (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-950 transition hover:bg-indigo-50"
            aria-label="Previous NUST update"
            onClick={() => embla?.scrollPrev()}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="flex items-center" role="tablist" aria-label="NUST update slides">
            {slides.map((slide, index) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={index === selected}
                aria-label={`Show update ${index + 1} of ${slides.length}: ${slide.title}`}
                className="inline-flex h-8 w-6 items-center justify-center"
                onClick={() => scrollTo(index)}
              >
                <span className={`block h-2 rounded-full transition-all ${index === selected ? 'w-5 bg-indigo-600' : 'w-2 bg-indigo-300'}`} />
              </button>
            ))}
          </div>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-950 transition hover:bg-indigo-50"
            aria-label="Next NUST update"
            onClick={() => embla?.scrollNext()}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}

      <ViewGuideButton onOpenGuide={onOpenGuide} />
    </div>
  );
}

function NustUpdatesCardBody({ onOpenGuide }: NustUpdatesCardProps) {
  const { status, dates, notices, sessionLabel } = useNustGuideFeed();
  const slides = useMemo(() => buildNustUpdateSlides(dates, notices), [dates, notices]);
  const showLive = status === 'ready' && slides.length > 0;

  return (
    <section
      className="relative overflow-hidden rounded-2xl border border-indigo-100 bg-white shadow-[0_10px_25px_rgba(98,113,202,0.11)]"
      aria-roledescription="carousel"
      aria-label="Live NUST updates"
      data-testid="nust-updates-card"
      data-feed-status={status}
    >
      <div className="h-1 bg-gradient-to-r from-[#4a60ff] via-[#6d78ff] to-[#9f7cf8]" aria-hidden />
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="net360-icon-circle inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
              <Megaphone className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-indigo-950">NUST Updates</h2>
              {sessionLabel ? <p className="truncate text-xs text-slate-500">{sessionLabel}</p> : null}
            </div>
          </div>
          {showLive ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live
            </span>
          ) : null}
        </div>

        {status === 'loading' && slides.length === 0 ? (
          <MessageState
            title="Loading the latest NUST updates…"
            detail="Dates and notices come from the NUST Guide."
            onOpenGuide={onOpenGuide}
          />
        ) : null}

        {status === 'error' && slides.length === 0 ? (
          <MessageState
            title="NUST updates are temporarily unavailable."
            detail="Check the NUST Guide for the latest information."
            onOpenGuide={onOpenGuide}
          />
        ) : null}

        {status !== 'loading' && status !== 'error' && slides.length === 0 ? (
          <MessageState
            title="No new NUST updates"
            detail="Check the NUST Guide for the latest information."
            onOpenGuide={onOpenGuide}
          />
        ) : null}

        {slides.length > 0 ? (
          <NustUpdatesCarousel key={slideKeyOf(slides)} slides={slides} onOpenGuide={onOpenGuide} />
        ) : null}
      </div>
    </section>
  );
}

function slideKeyOf(slides: UpdateSlide[]) {
  return slides.map((slide) => slide.id).join('|');
}

type BoundaryProps = NustUpdatesCardProps & { children: ReactNode };
type BoundaryState = { failed: boolean };

class NustUpdatesBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error('NUST updates card failed:', error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="overflow-hidden rounded-2xl border border-indigo-100 bg-white p-4 shadow-[0_10px_25px_rgba(98,113,202,0.11)]" aria-label="Live NUST updates">
          <h2 className="text-base font-semibold text-indigo-950">NUST Updates</h2>
          <MessageState
            title="NUST updates are temporarily unavailable."
            detail="Check the NUST Guide for the latest information."
            onOpenGuide={this.props.onOpenGuide}
          />
        </section>
      );
    }
    return this.props.children;
  }
}

export function NustUpdatesCard({ onOpenGuide }: NustUpdatesCardProps) {
  return (
    <NustUpdatesBoundary onOpenGuide={onOpenGuide}>
      <NustUpdatesCardBody onOpenGuide={onOpenGuide} />
    </NustUpdatesBoundary>
  );
}
