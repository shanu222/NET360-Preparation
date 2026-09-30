import { useEffect, useState } from 'react';
import { buildUrl } from './api';
export type SitePromoSlot = 'loginBanner' | 'featuredAd';

type SitePromoUrls = Partial<Record<SitePromoSlot, string>>;

const CACHE_KEY = 'net360-site-promo-images-v1';

function readCache(): SitePromoUrls {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as SitePromoUrls) : {};
  } catch {
    return {};
  }
}

let memory: SitePromoUrls | null = null;
let inFlight: Promise<SitePromoUrls> | null = null;

async function fetchSitePromoImages(): Promise<SitePromoUrls> {
  if (memory) return memory;
  if (!inFlight) {
    inFlight = (async () => {
      const res = await fetch(buildUrl('/api/public/site-promo-images'), { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error(`site-promo-images HTTP ${res.status}`);
      const data = (await res.json()) as { images?: Record<string, { path?: string } | null> };
      const next: SitePromoUrls = {};
      for (const slot of ['loginBanner', 'featuredAd'] as SitePromoSlot[]) {
        const path = String(data.images?.[slot]?.path || '').trim();
        if (path) next[slot] = buildUrl(path);
      }
      memory = next;
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage failures in private mode / quota limits.
      }
      return next;
    })().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/** Admin-managed promo image URLs. Missing slots keep the bundled default image. */
export function useSitePromoImages(): SitePromoUrls {
  const [urls, setUrls] = useState<SitePromoUrls>(() => memory || readCache());

  useEffect(() => {
    let cancelled = false;
    fetchSitePromoImages()
      .then((next) => {
        if (!cancelled) setUrls(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return urls;
}
