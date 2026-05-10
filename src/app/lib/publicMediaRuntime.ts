import { buildUrl } from './api';
import { isNativeRuntime, logNativeEvent } from './nativeDiagnostics';

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
const MEDIA_CONFIG_CACHE_KEY = 'net360-media-config-cache-v1';

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
  try {
    localStorage.setItem(
      MEDIA_CONFIG_CACHE_KEY,
      JSON.stringify({
        s3BaseUrl: runtimeS3Base || '',
        mediaAssetVersion: runtimeMediaAssetVersion || '',
        ...overrides,
      }),
    );
  } catch {
    // Ignore storage failures in private mode / quota limits.
  }
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
    const endpoint = buildUrl('/api/public/media-config');
    let resolved = false;
    const attemptFetch = async (attempt: number) => {
      const res = await fetch(endpoint, {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`media-config HTTP ${res.status}`);
      }
      const data = (await res.json()) as PublicMediaConfigApi;
      applyPublicMediaConfigFromApi(data);
      logNativeEvent('media', 'config-loaded', {
        attempt,
        endpoint,
        hasS3Base: Boolean(runtimeS3Base),
      });
      resolved = true;
      return;
    };

    try {
      let lastError: unknown = null;
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await attemptFetch(attempt);
          return;
        } catch (error) {
          lastError = error;
          if (attempt < 3) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, attempt * 700));
          }
        }
      }
      throw lastError || new Error('media-config unknown fetch failure');
    } catch (err) {
      if (isNativeRuntime()) {
        try {
          const cachedRaw = localStorage.getItem(MEDIA_CONFIG_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw) as PublicMediaConfigApi;
            applyPublicMediaConfigFromApi(cached);
            logNativeEvent('media', 'config-cache-fallback', {
              endpoint,
              hasS3Base: Boolean(runtimeS3Base),
            }, 'warn');
            resolved = true;
            return;
          }
        } catch {
          // No valid cache fallback.
        }
      }
      if (import.meta.env.DEV) {
        console.warn('[net360/media-config] fetch failed', err);
      }
      logNativeEvent('media', 'config-fetch-failed', {
        endpoint,
        message: (err as Error)?.message || String(err),
      }, 'error');
    } finally {
      if (resolved) {
        mediaConfigFetchFinished = true;
      }
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
