import { useEffect, useState } from 'react';
import { buildUrl } from './api';
import { NET360_ADMIN_WHATSAPP } from './paymentMethods';

export interface OnlineClassesContent {
  title: string;
  description: string;
  registrationMessage: string;
}

export const DEFAULT_ONLINE_CLASSES: OnlineClassesContent = {
  title: 'Online Classes with NUST Alumni',
  description:
    'Register for live online classes taught by experts, NUST alumni, and NUST gold medalists.',
  registrationMessage:
    'Register now and our team will confirm your seat on WhatsApp.',
};

const REGISTER_WHATSAPP_FALLBACK =
  'Assalam o Alaikum NET360, I want to register for Online Classes.';

function pickText(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

export function mergeOnlineClassesContent(value: unknown): OnlineClassesContent {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    title: pickText(source.title, source.cardTitle) || DEFAULT_ONLINE_CLASSES.title,
    description: pickText(source.description, source.cardDescription) || DEFAULT_ONLINE_CLASSES.description,
    registrationMessage: pickText(source.registrationMessage) || DEFAULT_ONLINE_CLASSES.registrationMessage,
  };
}

const CACHE_KEY = 'net360-online-classes-v2';

function readCache(): OnlineClassesContent {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return mergeOnlineClassesContent(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_ONLINE_CLASSES };
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

/** Opens the existing admin WhatsApp chat used across Profile / Subscription. */
export function openOnlineClassesWhatsApp() {
  const digits = NET360_ADMIN_WHATSAPP.replace(/\D/g, '');
  window.open(
    `https://wa.me/${digits}?text=${encodeURIComponent(REGISTER_WHATSAPP_FALLBACK)}`,
    '_blank',
    'noopener,noreferrer',
  );
}
