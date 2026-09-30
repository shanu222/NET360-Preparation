import { useEffect, useState } from 'react';
import { buildUrl } from './api';
export type StandardPlanKey = 'tests' | 'preparation' | 'community';

export interface StandardPlanContent {
  title: string;
  description: string;
  price: number;
  duration: string;
}

export interface VideosPlanContent {
  title: string;
  description: string;
  badge: string;
  duration: string;
  regularPrice: number;
  offerPrice: number;
  /** YYYY-MM-DD; the offer ends at the start of this day (Pakistan time). Empty = no offer. */
  offerEndsOn: string;
  offerLabel: string;
  promoText: string;
  promoDetails: string;
}

export interface MentorPlanContent {
  title: string;
  description: string;
  statusLabel: string;
  available: boolean;
  price: number;
  duration: string;
}

export interface SubscriptionPlansContent {
  pageTitle: string;
  pageSubtitle: string;
  sectionTitle: string;
  sectionSubtitle: string;
  tests: StandardPlanContent;
  preparation: StandardPlanContent;
  community: StandardPlanContent;
  videos: VideosPlanContent;
  mentor: MentorPlanContent;
}

export const DEFAULT_SUBSCRIPTION_PLANS: SubscriptionPlansContent = {
  pageTitle: 'Subscription',
  pageSubtitle: 'Choose one or more services. Every plan gives you 6 months of access.',
  sectionTitle: 'Choose your services',
  sectionSubtitle: 'Select the services you want. Your total updates automatically.',
  tests: {
    title: 'Tests',
    description: 'Full-length mocks, subject tests, and adaptive practice.',
    price: 1000,
    duration: '6 months',
  },
  preparation: {
    title: 'Preparation Material',
    description: 'Chapter-wise notes and topic tests across the NET syllabus.',
    price: 1000,
    duration: '6 months',
  },
  community: {
    title: 'Community',
    description: 'Study partners, quiz battles, discussion rooms, and messaging.',
    price: 1000,
    duration: '6 months',
  },
  videos: {
    title: 'Videos',
    description: 'Syllabus-aligned video lectures for every NET subject.',
    badge: 'New lessons daily',
    duration: '6 months',
    regularPrice: 6000,
    offerPrice: 3000,
    offerEndsOn: '2026-12-01',
    offerLabel: '50% OFF',
    promoText:
      'Video lessons are being uploaded daily, with the complete video library scheduled to be available by 1 December 2026. Subscribe now and get 50% OFF the regular video subscription price.',
    promoDetails:
      'Subscribe before 1 December 2026 for PKR 3,000 for 6 months. From 1 December 2026, the regular price will be PKR 6,000 for 6 months.',
  },
  mentor: {
    title: 'AI Smart Study Mentor',
    description: 'Personal AI study guidance. Not available for purchase yet.',
    statusLabel: 'Coming Soon',
    available: false,
    price: 0,
    duration: '6 months',
  },
};

function mergeSection<T extends object>(defaults: T, value: unknown): T {
  if (!value || typeof value !== 'object') return { ...defaults };
  const source = value as Record<string, unknown>;
  const next = { ...defaults } as Record<string, unknown>;
  for (const [key, fallback] of Object.entries(defaults)) {
    const candidate = source[key];
    if (typeof fallback === 'number') {
      const num = Number(candidate);
      if (candidate !== undefined && candidate !== null && candidate !== '' && Number.isFinite(num) && num >= 0) next[key] = num;
    } else if (typeof fallback === 'boolean') {
      if (typeof candidate === 'boolean') next[key] = candidate;
    } else if (typeof candidate === 'string') {
      next[key] = candidate;
    }
  }
  return next as T;
}

/** Fills any missing or invalid field with the built-in default. */
export function mergeSubscriptionPlans(value: unknown): SubscriptionPlansContent {
  const source = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const { tests, preparation, community, videos, mentor, ...page } = DEFAULT_SUBSCRIPTION_PLANS;
  return {
    ...mergeSection(page, source),
    tests: mergeSection(tests, source.tests),
    preparation: mergeSection(preparation, source.preparation),
    community: mergeSection(community, source.community),
    videos: mergeSection(videos, source.videos),
    mentor: mergeSection(mentor, source.mentor),
  };
}

export function videosOfferEndsAt(videos: VideosPlanContent): Date | null {
  const day = videos.offerEndsOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isVideosOfferActive(videos: VideosPlanContent, now = Date.now()): boolean {
  const endsAt = videosOfferEndsAt(videos);
  return Boolean(endsAt && now < endsAt.getTime() && videos.offerPrice < videos.regularPrice);
}

const CACHE_KEY = 'net360-subscription-plans-v1';

function readCache(): SubscriptionPlansContent {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return mergeSubscriptionPlans(raw ? JSON.parse(raw) : null);
  } catch {
    return mergeSubscriptionPlans(null);
  }
}

export async function fetchSubscriptionPlans(): Promise<SubscriptionPlansContent> {
  const res = await fetch(buildUrl('/api/public/subscription-plans'), { method: 'GET', cache: 'no-store' });
  if (!res.ok) throw new Error(`subscription-plans HTTP ${res.status}`);
  const data = (await res.json()) as { plans?: unknown };
  const plans = mergeSubscriptionPlans(data.plans);
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(plans));
  } catch {
    // Ignore storage failures in private mode / quota limits.
  }
  return plans;
}

/** Admin-managed subscription content, falling back to the built-in defaults. */
export function useSubscriptionPlans(): SubscriptionPlansContent {
  const [plans, setPlans] = useState<SubscriptionPlansContent>(() => readCache());

  useEffect(() => {
    let cancelled = false;
    fetchSubscriptionPlans()
      .then((next) => {
        if (!cancelled) setPlans(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return plans;
}
