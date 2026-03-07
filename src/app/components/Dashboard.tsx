import { type ComponentType, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Flame,
  Target,
  Clock3,
  BookOpen,
  Brain,
  Calculator,
  FileText,
  Trophy,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Progress } from './ui/progress';
import { useAppData } from '../context/AppDataContext';
import { apiRequest } from '../lib/api';

interface DashboardProps {
  onNavigate: (section: string) => void;
}

const TEST_DATE = new Date('2026-06-30T00:00:00');

interface LiveUpdateItem {
  title: string;
  subtitle: string;
  url: string;
}

const FALLBACK_UPDATES: LiveUpdateItem[] = [
  {
    title: 'NUST Undergraduate Admissions',
    subtitle: 'Open the official portal for latest announcements and deadlines.',
    url: 'https://ugadmissions.nust.edu.pk/',
  },
];

export function Dashboard({ onNavigate }: DashboardProps) {
  const { mcqsBySubject, attempts, profile } = useAppData();
  const [liveUpdates, setLiveUpdates] = useState<LiveUpdateItem[]>(FALLBACK_UPDATES);
  const [updatesStatus, setUpdatesStatus] = useState<'live' | 'cache' | 'stale-cache' | 'fallback'>('fallback');

  const daysUntilNET = useMemo(() => {
    const userTestDate = profile.testDate ? new Date(profile.testDate) : TEST_DATE;
    const targetDate = Number.isNaN(userTestDate.getTime()) ? TEST_DATE : userTestDate;
    const now = new Date();
    const diffMs = targetDate.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
  }, [profile.testDate]);

  const firstName = profile.firstName?.trim() || 'Student';

  const metrics = useMemo(() => {
    const questionPool = mcqsBySubject.mathematics.length + mcqsBySubject.physics.length + mcqsBySubject.english.length;
    const attemptedQuestions = attempts.reduce((sum, attempt) => sum + attempt.totalQuestions, 0);
    const accuracy = attempts.length
      ? Math.round(attempts.reduce((sum, attempt) => sum + attempt.score, 0) / attempts.length)
      : 0;
    const totalHours = attempts.reduce((sum, attempt) => sum + attempt.durationMinutes, 0) / 60;

    const streakDays = (() => {
      if (!attempts.length) return 0;

      const uniqueDays = new Set(
        attempts.map((attempt) => {
          const date = new Date(attempt.attemptedAt);
          return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        }),
      );

      let streak = 0;
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);

      while (true) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
        if (!uniqueDays.has(key)) break;
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }

      return streak;
    })();

    const overallProgress = questionPool
      ? Math.min(100, Math.round((attemptedQuestions / questionPool) * 100))
      : 0;

    return {
      attemptedQuestions,
      accuracy,
      totalHours,
      streakDays,
      overallProgress,
    };
  }, [attempts, mcqsBySubject]);

  const subjectStats = useMemo(() => {
    const config = [
      { key: 'mathematics' as const, label: 'Mathematics', badge: 'from-violet-500 to-violet-400', bar: 'bg-violet-500' },
      { key: 'physics' as const, label: 'Physics', badge: 'from-cyan-500 to-blue-400', bar: 'bg-cyan-500' },
      { key: 'english' as const, label: 'English', badge: 'from-amber-400 to-orange-300', bar: 'bg-amber-500' },
    ];

    return config.map((subject) => {
      const total = mcqsBySubject[subject.key].length;
      const attempted = attempts
        .filter((attempt) => attempt.subject === subject.key)
        .reduce((sum, attempt) => sum + attempt.totalQuestions, 0);

      const progress = total ? Math.min(100, Math.round((attempted / total) * 100)) : 0;

      return {
        ...subject,
        attempted,
        total,
        progress,
        remaining: Math.max(0, total - attempted),
      };
    });
  }, [attempts, mcqsBySubject]);

  const weekChart = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const dailyCounts = labels.map((_, dayIndex) => {
      const current = new Date(start);
      current.setDate(start.getDate() + dayIndex);
      const next = new Date(current);
      next.setDate(current.getDate() + 1);

      return attempts.filter((attempt) => {
        const date = new Date(attempt.attemptedAt);
        return date >= current && date < next;
      }).length;
    });

    const maxCount = Math.max(1, ...dailyCounts);
    return dailyCounts.map((value, index) => ({
      label: labels[index],
      value,
      height: 18 + Math.round((value / maxCount) * 68),
    }));
  }, [attempts]);

  useEffect(() => {
    let cancelled = false;

    const loadUpdates = async () => {
      try {
        const payload = await apiRequest<{
          source: 'live' | 'cache' | 'stale-cache';
          updates: LiveUpdateItem[];
        }>('/api/public/nust-updates');

        if (cancelled) return;

        const safeItems = Array.isArray(payload.updates) && payload.updates.length
          ? payload.updates.slice(0, 6)
          : FALLBACK_UPDATES;

        setLiveUpdates(safeItems);
        setUpdatesStatus(payload.source || 'cache');
      } catch {
        if (cancelled) return;
        setLiveUpdates(FALLBACK_UPDATES);
        setUpdatesStatus('fallback');
      }
    };

    void loadUpdates();
    const timer = window.setInterval(() => {
      void loadUpdates();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="px-1">
        <h1 className="text-2xl sm:text-[30px] text-indigo-950">Welcome back, {firstName}!</h1>
        <p className="text-sm text-slate-500">Stay consistent, your NUST dream is getting closer every day.</p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-[#4a60ff] via-[#6a73ff] to-[#9f7cf8] text-white shadow-[0_18px_40px_rgba(84,104,246,0.35)]">
        <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.5fr_1fr] lg:items-center">
          <div className="relative overflow-hidden rounded-2xl border border-white/25 bg-white/10 p-4 backdrop-blur-sm">
            <div className="absolute -right-16 -top-24 h-40 w-40 rounded-full bg-cyan-200/30 blur-2xl" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 border-white/80 bg-gradient-to-br from-white/20 to-white/5 text-center shadow-[inset_0_0_30px_rgba(255,255,255,0.2)]">
                <div>
                  <p className="text-3xl font-semibold leading-none">{daysUntilNET}</p>
                  <p className="text-sm text-blue-100">Days</p>
                </div>
              </div>
              <div>
                <p className="mb-1 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-2 py-1 text-xs">
                  <Calendar className="w-3.5 h-3.5" /> NET 2026 Countdown
                </p>
                <p className="text-3xl leading-tight">{daysUntilNET} Days</p>
                <p className="text-sm text-indigo-100">Stay focused and keep practicing!</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <MetricCard icon={BookOpen} label="Questions Solved" value={metrics.attemptedQuestions.toLocaleString()} />
            <MetricCard icon={Flame} label="Daily Streak" value={`${metrics.streakDays} Days`} />
            <MetricCard icon={Target} label="Accuracy" value={`${metrics.accuracy}%`} />
            <MetricCard icon={Clock3} label="Study Time" value={`${metrics.totalHours.toFixed(1)} hrs`} />
          </div>
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        {subjectStats.map((subject) => (
          <article key={subject.key} className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
            <div className={`mb-3 flex items-center justify-between rounded-xl bg-gradient-to-r px-3 py-2 text-white ${subject.badge}`}>
              <p className="font-medium">{subject.label}</p>
              <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs">{subject.progress}%</span>
            </div>
            <div className="mb-2 flex items-center justify-between text-sm text-slate-700">
              <p>Progress: <strong>{subject.progress}%</strong></p>
              <p className="text-xs text-slate-500">{subject.attempted}/{subject.total} Questions</p>
            </div>
            <Progress
              value={subject.progress}
              className="h-2 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-transparent"
            />
            <div className={`-mt-2 h-2 rounded-full ${subject.bar}`} style={{ width: `${subject.progress}%` }} />
            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{subject.remaining} Questions Remaining</span>
              <span>{subject.total}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="inline-flex items-center gap-2 font-medium text-indigo-950"><Trophy className="h-4 w-4" /> Great progress! Keep it up!</p>
          <span className="text-sm font-semibold text-indigo-950">{metrics.overallProgress}%</span>
        </div>
        <Progress value={metrics.overallProgress} className="h-2 bg-slate-200 [&>[data-slot=progress-indicator]]:bg-indigo-700" />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.65fr_1fr]">
        <div className="space-y-3">
          <h3 className="px-1 text-xl text-indigo-950">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <QuickActionCard icon={Sparkles} title="Start Practice" tone="from-cyan-100 to-white" onClick={() => onNavigate('preparation')} />
            <QuickActionCard icon={FileText} title="Mock Test" tone="from-indigo-100 to-white" onClick={() => onNavigate('tests')} />
            <QuickActionCard icon={Brain} title="AI Tutor" tone="from-sky-100 to-white" onClick={() => onNavigate('ai-mentor')} />
            <QuickActionCard icon={Calculator} title="Merit Predictor" tone="from-amber-100 to-white" onClick={() => onNavigate('merit-calculator')} />
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-white/90 p-4 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-base text-indigo-950">This Week Performance</h4>
              <span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">7D</span>
            </div>
            <div className="grid grid-cols-7 items-end gap-2 rounded-xl bg-slate-50 p-3">
              {weekChart.map((point) => (
                <div key={point.label} className="text-center">
                  <div
                    className="mx-auto w-5 rounded-md bg-gradient-to-t from-indigo-600 to-violet-400"
                    style={{ height: `${point.height}px` }}
                  />
                  <p className="mt-2 text-[11px] text-slate-500">{point.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {subjectStats.map((subject) => (
                <div key={`${subject.key}-legend`} className="flex items-center gap-3 text-sm">
                  <span className={`h-2.5 w-2.5 rounded-full ${subject.bar}`} />
                  <span className="w-24 text-slate-700">{subject.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${subject.bar}`} style={{ width: `${subject.progress}%` }} />
                  </div>
                  <span className="w-9 text-right text-slate-600">{subject.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xl text-indigo-950">Latest Updates</h3>
            <span className="rounded-full bg-indigo-50 px-2 py-1 text-[11px] text-indigo-700">
              {updatesStatus === 'live' ? 'LIVE' : updatesStatus === 'cache' ? 'CACHE' : updatesStatus === 'stale-cache' ? 'STALE' : 'FALLBACK'}
            </span>
          </div>
          <div className="rounded-2xl border border-indigo-100 bg-white/90 p-2 shadow-[0_10px_25px_rgba(98,113,202,0.11)]">
            {liveUpdates.map((item) => (
              <UpdateItem key={`${item.title}-${item.url}`} title={item.title} subtitle={item.subtitle} href={item.url} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/35 bg-white/80 p-3 text-slate-800 shadow-sm">
      <div className="mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  tone,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  tone: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border border-indigo-100 bg-gradient-to-br ${tone} p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(88,103,195,0.18)]`}
    >
      <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-indigo-700 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-indigo-950">{title}</p>
    </button>
  );
}

function UpdateItem({ title, subtitle, href }: { title: string; subtitle: string; href?: string }) {
  return (
    <a
      href={href || '#'}
      target="_blank"
      rel="noreferrer"
      className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition hover:bg-indigo-50/70"
    >
      <div>
        <p className="text-sm font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-slate-400" />
    </a>
  );
}
