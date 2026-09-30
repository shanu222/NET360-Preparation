import { useEffect, useState } from 'react';
import { apiRequest } from './api';

const FEED_PATH = '/api/public/nust-admissions-feed';

type FeedDate = {
  title?: string;
  registration?: string;
  testDate?: string;
};

type FeedPayload = {
  source?: string;
  sessionLabel?: string;
  dates?: FeedDate[];
};

export type NustNetCycle = {
  year: number | null;
  countdownDate: Date | null;
};

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function netYearFromText(value: string): number | null {
  const match = value.match(/NET[-\s]?(20\d{2})/i);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 2020 && year <= 2100 ? year : null;
}

function calendarDates(value: string): Date[] {
  const results: Date[] = [];
  const pattern = /\b(\d{1,2})?\s*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:\s+(20\d{2}))?/gi;
  for (const match of value.matchAll(pattern)) {
    const year = match[3] ? Number(match[3]) : null;
    if (!year) continue;
    const month = MONTH_INDEX[match[2].slice(0, 3).toLowerCase()];
    const day = match[1] ? Number(match[1]) : 1;
    if (month == null || day < 1 || day > 31) continue;
    const date = new Date(year, month, day);
    if (!Number.isNaN(date.getTime())) results.push(date);
  }
  return results;
}

/** Year and next test day come only from the public NUST admissions feed. */
export function resolveNustNetCycle(payload: FeedPayload, now = new Date()): NustNetCycle {
  if (payload.source === 'seed') return { year: null, countdownDate: null };
  const sessionYear = netYearFromText(String(payload.sessionLabel || ''));
  const texts = (Array.isArray(payload.dates) ? payload.dates : [])
    .flatMap((row) => [row.title, row.registration, row.testDate].map((part) => String(part || '')).filter(Boolean));
  let year = sessionYear;
  if (!year) {
    for (const text of texts) {
      const found = netYearFromText(text);
      if (found && (!year || found > year)) year = found;
    }
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const upcoming = texts
    .flatMap((text) => calendarDates(text))
    .filter((date) => date.getTime() >= startOfToday)
    .sort((left, right) => left.getTime() - right.getTime());
  return { year, countdownDate: upcoming[0] ?? null };
}

export function daysUntil(target: Date, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function useNustNetCycle(): NustNetCycle {
  const [cycle, setCycle] = useState<NustNetCycle>({ year: null, countdownDate: null });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const payload = await apiRequest<FeedPayload>(FEED_PATH);
        if (!cancelled) setCycle(resolveNustNetCycle(payload));
      } catch {
        if (!cancelled) setCycle((current) => current);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return cycle;
}
