import { buildUrl } from './api';

export type PublicMediaConfigApi = {
  mediaBaseUrl?: string;
  s3BaseUrl?: string;
  brandLogoUrl?: string;
  userGuideVideoUrl?: string;
  loginBannerUrl?: string;
  appPromoImageUrl?: string;
  schoolsPathPrefix?: string;
  mediaAssetVersion?: string;
  faviconUrl?: string;
};

type RuntimeOverrides = {
  brandLogoUrl?: string;
  userGuideVideoUrl?: string;
  loginBannerUrl?: string;
  appPromoImageUrl?: string;
  schoolsPathPrefix?: string;
};

let runtimeS3Base = '';
let runtimeMediaAssetVersion = '';
let overrides: RuntimeOverrides = {};
let fetchInFlight: Promise<void> | null = null;
let mediaConfigFetchFinished = false;

function trimSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

export function applyPublicMediaConfigFromApi(data: PublicMediaConfigApi | null | undefined): void {
  if (!data || typeof data !== 'object') return;
  const s3 = trimSlash(String(data.s3BaseUrl || data.mediaBaseUrl || '').trim());
  if (s3) {
    runtimeS3Base = s3;
  }
  const mv = String(data.mediaAssetVersion || '').trim();
  if (mv) {
    runtimeMediaAssetVersion = mv;
  }
  const brand = String(data.brandLogoUrl || '').trim();
  const guide = String(data.userGuideVideoUrl || '').trim();
  const banner = String(data.loginBannerUrl || '').trim();
  const promo = String(data.appPromoImageUrl || '').trim();
  const schools = String(data.schoolsPathPrefix || '').trim();
  overrides = {
    brandLogoUrl: brand || undefined,
    userGuideVideoUrl: guide || undefined,
    loginBannerUrl: banner || undefined,
    appPromoImageUrl: promo || undefined,
    schoolsPathPrefix: schools || undefined,
  };
}

export function getRuntimeS3BaseOverride(): string {
  return runtimeS3Base;
}

export function getRuntimeMediaAssetVersion(): string {
  return runtimeMediaAssetVersion;
}

export function getRuntimeMediaOverrides(): Readonly<RuntimeOverrides> {
  return overrides;
}

/**
 * Loads authoritative media endpoints from the API (same bucket as uploads).
 * Safe to call from multiple roots (student App, AdminApp, TestInterface); concurrent calls share one request.
 */
export async function fetchAndApplyPublicMediaConfig(): Promise<void> {
  if (fetchInFlight) {
    await fetchInFlight;
    return;
  }
  if (mediaConfigFetchFinished) return;

  fetchInFlight = (async () => {
    try {
      const res = await fetch(buildUrl('/api/public/media-config'), {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
      });
      if (!res.ok) {
        if (import.meta.env.DEV) {
          console.warn('[net360/media-config] HTTP', res.status);
        }
        return;
      }
      const data = (await res.json()) as PublicMediaConfigApi;
      applyPublicMediaConfigFromApi(data);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[net360/media-config] fetch failed', err);
      }
    } finally {
      mediaConfigFetchFinished = true;
    }
  })();

  try {
    await fetchInFlight;
  } finally {
    fetchInFlight = null;
  }
}

/** Dev-only diagnostics — never log secrets; trim long URLs. */
export function logMediaLoadFailure(scope: string, detail: { url?: string; message?: string }): void {
  if (!import.meta.env.DEV) return;
  const raw = String(detail.url || '').trim();
  const safeUrl = raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
  console.warn(`[net360/media-load:${scope}]`, safeUrl || '(no url)', detail.message || '');
}
