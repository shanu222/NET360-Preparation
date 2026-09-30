import { useEffect, useState } from 'react';
import { buildUrl } from './api';

export interface OnlineClassesContent {
  cardBadge: string;
  cardTitle: string;
  cardDescription: string;
  pageTitle: string;
  description: string;
  registrationMessage: string;
  classDetails: string;
  ctaText: string;
}

export interface OnlineClassesRegistration {
  registered: boolean;
  registeredAt: string | null;
  fullName: string;
  phone: string;
  city: string;
  targetProgram: string;
  note: string;
}

export const DEFAULT_ONLINE_CLASSES: OnlineClassesContent = {
  cardBadge: 'Live online classes',
  cardTitle: 'Online Classes with NUST Alumni',
  cardDescription:
    'Register for live online classes taught by experts, NUST alumni, and NUST gold medalists.',
  pageTitle: 'Online Classes',
  description:
    'Join NET360 live online classes and prepare for NET with instructors who have been through NUST themselves — subject experts, alumni, and gold medalists.',
  registrationMessage:
    'Share your details below. Our team will contact you on WhatsApp with the class schedule and joining instructions.',
  classDetails:
    'Live interactive sessions covering NET Mathematics, Physics, English, and Intelligence. Small groups, recorded recaps, and weekly practice assignments. Exact timetable is shared after registration.',
  ctaText: 'Register now',
};

function mergeSection(defaults: OnlineClassesContent, value: unknown): OnlineClassesContent {
  if (!value || typeof value !== 'object') return { ...defaults };
  const source = value as Record<string, unknown>;
  const next = { ...defaults };
  for (const key of Object.keys(defaults) as Array<keyof OnlineClassesContent>) {
    if (typeof source[key] === 'string') next[key] = source[key] as string;
  }
  return next;
}

export function mergeOnlineClassesContent(value: unknown): OnlineClassesContent {
  return mergeSection(DEFAULT_ONLINE_CLASSES, value);
}

const CACHE_KEY = 'net360-online-classes-v1';

function readCache(): OnlineClassesContent {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return mergeOnlineClassesContent(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeOnlineClassesContent(null);
  }
}

export async function fetchOnlineClassesContent(): Promise<OnlineClassesContent> {
  const res = await fetch(buildUrl('/api/public/online-classes'), { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`online-classes HTTP ${res.status}`);
  const data = (await res.json()) as { content?: unknown };
  const content = mergeOnlineClassesContent(data.content);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(content));
  } catch {
    // Ignore storage failures in private mode / quota limits.
  }
  return content;
}

/** Admin-managed Online Classes copy, falling back to built-in defaults. */
export function useOnlineClassesContent(): OnlineClassesContent {
  const [content, setContent] = useState<OnlineClassesContent>(() => readCache());

  useEffect(() => {
    let cancelled = false;
    fetchOnlineClassesContent()
      .then((next) => {
        if (!cancelled) setContent(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return content;
}
