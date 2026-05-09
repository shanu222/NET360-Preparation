/**
 * S3/CDN media URLs — MongoDB stores object keys; the client builds absolute URLs with `getMediaUrl(key)`.
 *
 * Built-in UI keys (ship under `public/` for fallback; mirror to S3 via `npm run media:upload-s3`):
 *   - schools/<slug>.png — NUST Schools & Campuses (see `NUSTSchoolsCampuses.tsx`)
 *   - images/login-banner.png, images/app-promo.png — Profile
 *   - videos/net360-guide.mp4 — Profile user guide
 *
 * **Source of truth:** `GET /api/public/media-config` (applied on app load via `fetchAndApplyPublicMediaConfig`).
 * Bootstrap until the API responds: `VITE_S3_BASE_URL` or `VITE_PUBLIC_MEDIA_BASE_URL` (no hardcoded bucket in the bundle).
 *
 * **Production build:** `npm run build` removes heavy copies of this media from `dist/` (see
 * `strip-bundled-cdn-media-from-dist.mjs`) — keep objects on S3 (`npm run media:upload-s3`).
 *
 * **Local fallbacks** (`/schools/…`, etc.): Vite dev only, or `VITE_MEDIA_LOCAL_FALLBACK=true` for emergency prod debugging.
 *
 * Optional full-URL overrides per asset: `VITE_BRAND_LOGO_URL`, `VITE_USER_GUIDE_VIDEO_URL`, … (API overrides win when set).
 *
 * Server: `GET /api/public/media-config` includes `s3BaseUrl`, per-asset URLs, and `mediaAssetVersion` for cache busting.
 */

import {
  getRuntimeMediaAssetVersion,
  getRuntimeMediaOverrides,
  getRuntimeS3BaseOverride,
} from './publicMediaRuntime';

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

/**
 * Append deployment media version for cache busting on keys resolved to absolute HTTPS URLs only.
 * Skips signed URLs and relative same-origin paths.
 */
function appendGlobalMediaVersion(url: string): string {
  const mv = getRuntimeMediaAssetVersion().trim();
  if (!mv || !url || /^(data:|blob:)/i.test(url)) return url;
  if (!/^https?:\/\//i.test(url)) return url;
  if (shouldSkipGlobalMediaVersionQuery(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}mv=${encodeURIComponent(mv)}`;
}

function resolveSchoolsUrl(key: string): string | null {
  const prefix = getRuntimeMediaOverrides().schoolsPathPrefix;
  if (!prefix || !key.startsWith('schools/')) return null;
  const rest = key.slice('schools/'.length);
  if (!rest) return null;
  return `${trimSlash(prefix)}/${encodeS3KeySegments(rest)}`;
}

/**
 * Same-origin `public/` fallbacks only in dev, unless `VITE_MEDIA_LOCAL_FALLBACK=true`.
 * Production relies on S3 after the post-build strip removes bundled marketing media from `dist/`.
 */
export function shouldUseLocalMediaFallback(): boolean {
  if (import.meta.env.DEV) return true;
  return String(import.meta.env.VITE_MEDIA_LOCAL_FALLBACK || '').toLowerCase() === 'true';
}

/** Public S3 (or CloudFront) origin for keys — no trailing slash. API override first, then Vite env (no default host). */
export function getS3BaseUrl(): string {
  const fromApi = getRuntimeS3BaseOverride().trim();
  if (fromApi) return trimSlash(fromApi);
  const fromEnv = String(
    import.meta.env.VITE_S3_BASE_URL || import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL || '',
  ).trim();
  return trimSlash(fromEnv);
}

/**
 * Resolve stored media for `<img>` / `<video>` `src`.
 * `http(s)`, `data:`, `blob:` → unchanged; otherwise treated as S3 key (leading slashes stripped).
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
  const base = getS3BaseUrl();
  if (!base) return appendGlobalMediaVersion(`/${encodeS3KeySegments(key)}`);
  return appendGlobalMediaVersion(`${trimSlash(base)}/${encodeS3KeySegments(key)}`);
}

/** @deprecated Prefer getMediaUrl — same behavior for bucket-relative paths. */
export function publicMediaUrl(relativePath: string): string {
  return getMediaUrl(relativePath);
}

/** Same origin list as getS3BaseUrl (legacy name). */
export function getPublicMediaBaseUrl(): string {
  return getS3BaseUrl();
}

/** Student app + admin: same-origin `public/net360-logo.png`. API / env full-URL overrides apply first. */
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
  return getMediaUrl('videos/net360-guide.mp4');
}

export function loginBannerImageUrl(): string {
  const fromApi = getRuntimeMediaOverrides().loginBannerUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_LOGIN_BANNER_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  return getMediaUrl('images/login-banner.png');
}

/** Bumped when replacing `images/app-promo.png` on S3 (same key) so browsers skip stale cache. */
const APP_PROMO_ASSET_VERSION_DEFAULT = '20260510';

export function appPromoImageUrl(): string {
  const fromApi = getRuntimeMediaOverrides().appPromoImageUrl;
  if (fromApi) return appendGlobalMediaVersion(fromApi);
  const override = String(import.meta.env.VITE_APP_PROMO_IMAGE_URL || '').trim();
  if (override) return appendGlobalMediaVersion(override);
  const base = getMediaUrl('images/app-promo.png');
  const rev = String(import.meta.env.VITE_APP_PROMO_ASSET_VERSION || APP_PROMO_ASSET_VERSION_DEFAULT).trim();
  if (!base || !rev) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${encodeURIComponent(rev)}`;
}
