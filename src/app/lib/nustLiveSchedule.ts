import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';

export type NustSeriesOption = {
  key: string;
  title: string;
  registration: string;
  testDate: string;
  status: string;
  label: string;
};

type FeedDate = {
  key?: string;
  title?: string;
  registration?: string;
  testDate?: string;
  status?: string;
};

type FeedPayload = {
  source?: string;
  dates?: FeedDate[];
};

export type LiveScheduleStatus = 'loading' | 'ready' | 'empty' | 'error';

const CACHE_KEY = 'net360-live-nust-series-v1';

export function canonicalSeriesKey(value: string) {
  const match = String(value || '').toLowerCase().match(/series\s*-?\s*(\d+)/);
  return match ? `series-${match[1]}` : String(value || '').trim().toLowerCase();
}

function officialWhen(item: { registration?: string; testDate?: string }) {
  const source = `${item.testDate || ''} ${item.registration || ''}`;
  const match = source.match(/\b\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\b(?:\s+onwards)?|\b[A-Za-z]{3,9}\s*[-–]\s*[A-Za-z]{3,9}\s+20\d{2}\b|\b[A-Za-z]{3,9}\s+20\d{2}\b/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : '';
}

export function seriesOptionLabel(item: { title?: string; registration?: string; testDate?: string }) {
  const title = String(item.title || '').trim();
  if (!title) return '';
  const when = officialWhen(item);
  return when ? `${title} (${when})` : title;
}

export function mapLiveNustSeries(dates: FeedDate[] | undefined, source?: string): NustSeriesOption[] {
  if (source === 'seed') return [];
  const seen = new Set<string>();
  const options: NustSeriesOption[] = [];
  for (const item of dates || []) {
    const title = String(item?.title || '').trim();
    const key = canonicalSeriesKey(String(item?.key || title));
    if (!title || !key || seen.has(key)) continue;
    seen.add(key);
    options.push({
      key,
      title,
      registration: String(item?.registration || '').trim(),
      testDate: String(item?.testDate || '').trim(),
      status: String(item?.status || '').trim(),
      label: seriesOptionLabel(item),
    });
  }
  return options;
}

function readCachedSeries(): NustSeriesOption[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as NustSeriesOption[] | null;
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.key && item.title) : [];
  } catch {
    return [];
  }
}

function writeCachedSeries(series: NustSeriesOption[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(series));
  } catch {
    /* The selector still works for this session. */
  }
}

export async function fetchLiveNustSeries(): Promise<{ status: LiveScheduleStatus; series: NustSeriesOption[] }> {
  try {
    const payload = await apiRequest<FeedPayload>('/api/public/nust-admissions-feed');
    const series = mapLiveNustSeries(payload.dates, payload.source);
    if (!series.length) {
      const cached = readCachedSeries();
      if (payload.source === 'seed' && cached.length) return { status: 'ready', series: cached };
      return { status: 'empty', series: [] };
    }
    writeCachedSeries(series);
    return { status: 'ready', series };
  } catch {
    const cached = readCachedSeries();
    if (cached.length) return { status: 'ready', series: cached };
    return { status: 'error', series: [] };
  }
}

export function useLiveNustSeries() {
  const [status, setStatus] = useState<LiveScheduleStatus>('loading');
  const [series, setSeries] = useState<NustSeriesOption[]>([]);

  const reload = useCallback(async () => {
    const result = await fetchLiveNustSeries();
    setSeries(result.series);
    setStatus(result.status);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { status, series, reload };
}
