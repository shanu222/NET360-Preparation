/**
 * Bundled frontend media URLs.
 * Static keys (schools/, images/, videos/, assets/) resolve to same-origin paths.
 * Absolute http(s)/data/blob URLs pass through unchanged (Mongo-stored dynamic media).
 */

import {
  getRuntimeMediaAssetVersion,
  getRuntimeMediaOverrides,
  getRuntimeS3BaseOverride,
} from './publicMediaRuntime';
import { isNativeRuntime, logNativeEvent } from './nativeDiagnostics';

function trimSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

function encodeS3KeySegments(key: string): string {
  if (!key) return '';
  return key
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

function shouldSkipGlobalMediaVersionQuery(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes('mv=')) return true;
  if (lower.includes('x-amz-')) return true;
  if (lower.includes('signature=')) return true;
  return false;
}

function appendGlobalMediaVersion(url: string): string {
  const mv = getRuntimeMediaAssetVersion().trim();
  if (!mv || !url || /^(data:|blob:)/i.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  if (shouldSkipGlobalMediaVersionQuery(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}mv=${encodeURIComponent(mv)}`;
}

/** Map logical keys to files under `public/`. */
function resolveBundledStaticPath(key: string): string | null {
  if (!key) return null;
  if (key === 'videos/net360-guide.mp4' || key === 'assets/videos/net360-guide.mp4') {
    return '/assets/videos/net360-guide.mp4';
  }
  if (
    key.startsWith('schools/')
    || key.startsWith('images/')
    || key.startsWith('assets/')
    || key === 'net360-logo.png'
    || key === 'logo.svg'
  ) {
    return `/${encodeS3KeySegments(key)}`;
  }
  return null;
}

function resolveSchoolsUrl(key: string): string | null {
  const prefix = getRuntimeMediaOverrides().schoolsPathPrefix;
  if (!prefix || !key.startsWith('schools/')) return null;
  const rest = key.slice('schools/'.length);
  if (!rest) return null;
  if (prefix.startsWith('/') && !/^https?:\/\//i.test(prefix)) {
    return `${trimSlash(prefix)}/${encodeS3KeySegments(rest)}`;
  }
  return `${trimSlash(prefix)}/${encodeS3KeySegments(rest)}`;
}

/** Always prefer bundled same-origin assets in production builds. */
export function shouldUseLocalMediaFallback(): boolean {
  return true;
}

/** Optional absolute media base. Prefer empty — use bundled same-origin assets. */
export function getS3BaseUrl(): string {
  const fromApi = getRuntimeS3BaseOverride().trim();
  if (fromApi) return trimSlash(fromApi);
  const fromEnv = String(import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL || '').trim();
  return trimSlash(fromEnv);
}

/**
 * Resolve stored media for `<img>` / `<video>` `src`.
 * `http(s)`, `data:`, `blob:` → unchanged; static keys → same-origin bundle.
 */
export function getMediaUrl(path: string | null | undefined): string {
  if (path == null) return '';
  const raw = String(path).trim();
  if (!raw) return '';
  if (/^(data:|blob:)/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return appendGlobalMediaVersion(raw);
  const key = raw.replace(/^\/+/, '');
  const schools = resolveSchoolsUrl(key);
  if (schools) return appendGlobalMediaVersion(schools);
  const bundled = resolveBundledStaticPath(key);
  if (bundled) return bundled;
  const base = getS3BaseUrl();
  if (!base) {
    if (isNativeRuntime()) {
      logNativeEvent('media', 'relative-media-key', { key }, 'info');
    }
    return appendGlobalMediaVersion(`/${encodeS3KeySegments(key)}`);
  }
  return appendGlobalMediaVersion(`${trimSlash(base)}/${encodeS3KeySegments(key)}`);
}

/** @deprecated Prefer getMediaUrl */
export function publicMediaUrl(relativePath: string): string {
  return getMediaUrl(relativePath);
}

export function getPublicMediaBaseUrl(): string {
  return getS3BaseUrl();
}

export function brandLogoUrl(): string {
  const fromApi = getRuntimeMediaOverrides().brandLogoUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_BRAND_LOGO_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  return '/net360-logo.png';
}

export function userGuideVideoUrl(): string {
  const fromApi = getRuntimeMediaOverrides().userGuideVideoUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_USER_GUIDE_VIDEO_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  return '/assets/videos/net360-guide.mp4';
}

export function loginBannerImageUrl(): string {
  const fromApi = getRuntimeMediaOverrides().loginBannerUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_LOGIN_BANNER_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  return '/images/login-banner.png';
}

const APP_PROMO_ASSET_VERSION_DEFAULT = '20260510';

export function appPromoImageUrl(): string {
  const fromApi = getRuntimeMediaOverrides().appPromoImageUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_APP_PROMO_IMAGE_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  const base = '/images/app-promo.png';
  const rev = String(import.meta.env.VITE_APP_PROMO_ASSET_VERSION || APP_PROMO_ASSET_VERSION_DEFAULT).trim();
  if (!rev) return base;
  return `${base}?v=${encodeURIComponent(rev)}`;
}
