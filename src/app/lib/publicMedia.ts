/**
 * S3/CDN media URLs — MongoDB stores object keys; the client builds absolute URLs with `getMediaUrl(key)`.
 *
 * Built-in UI keys (ship under `public/` for fallback; mirror to S3 via `npm run media:upload-s3`):
 *   - schools/<slug>.png — NUST Schools & Campuses (see `NUSTSchoolsCampuses.tsx`)
 *   - images/login-banner.png, images/app-promo.png — Profile
 *   - videos/net360-guide.mp4 — Profile user guide
 *
 * Other `getMediaUrl` uses: MCQ assets, community posts, avatars — keys from DB / uploads API only (no files in git).
 *
 * Set `VITE_S3_BASE_URL` (no trailing slash), e.g. `https://net360-media.s3.ap-south-1.amazonaws.com`
 *
 * **Production build:** `npm run build` removes heavy copies of this media from `dist/` (see
 * `strip-bundled-cdn-media-from-dist.mjs`) so deploy/Mobile stays small — keep objects on S3 (`npm run media:upload-s3`).
 *
 * **Local fallbacks** (`/schools/…`, etc.): Vite dev only, or `VITE_MEDIA_LOCAL_FALLBACK=true` for emergency prod debugging.
 *
 * Falls back to `VITE_PUBLIC_MEDIA_BASE_URL`, then the production bucket host below.
 * Optional full-URL overrides per asset: `VITE_BRAND_LOGO_URL` (defaults to same-origin `/net360-logo.png`), `VITE_USER_GUIDE_VIDEO_URL`, …
 *
 * Server: `GET /api/public/media-config` includes `mediaBaseUrl` and `s3BaseUrl` (env `S3_BASE_URL`).
 */

const DEFAULT_S3_BASE_URL = 'https://net360-media.s3.ap-south-1.amazonaws.com';

function trimSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

/**
 * Same-origin `public/` fallbacks only in dev, unless `VITE_MEDIA_LOCAL_FALLBACK=true`.
 * Production relies on S3 after the post-build strip removes bundled marketing media from `dist/`.
 */
export function shouldUseLocalMediaFallback(): boolean {
  if (import.meta.env.DEV) return true;
  return String(import.meta.env.VITE_MEDIA_LOCAL_FALLBACK || '').toLowerCase() === 'true';
}

/** Public S3 (or CloudFront) origin for keys — no trailing slash. */
export function getS3BaseUrl(): string {
  const fromEnv = String(
    import.meta.env.VITE_S3_BASE_URL || import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL || '',
  ).trim();
  return trimSlash(fromEnv || DEFAULT_S3_BASE_URL);
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
  if (/^https?:\/\//i.test(raw)) return raw;
  const key = raw.replace(/^\/+/, '');
  const base = getS3BaseUrl();
  if (!base) return `/${key}`;
  return `${base}/${key}`;
}

/** @deprecated Prefer getMediaUrl — same behavior for bucket-relative paths. */
export function publicMediaUrl(relativePath: string): string {
  return getMediaUrl(relativePath);
}

/** Same origin list as getS3BaseUrl (legacy name). */
export function getPublicMediaBaseUrl(): string {
  return getS3BaseUrl();
}

/** Student app + admin: same-origin `public/net360-logo.png`. Override with `VITE_BRAND_LOGO_URL` if needed. */
export function brandLogoUrl(): string {
  const override = String(import.meta.env.VITE_BRAND_LOGO_URL || '').trim();
  if (override) return override;
  return '/net360-logo.png';
}

export function userGuideVideoUrl(): string {
  const override = String(import.meta.env.VITE_USER_GUIDE_VIDEO_URL || '').trim();
  if (override) return override;
  return getMediaUrl('videos/net360-guide.mp4');
}

export function loginBannerImageUrl(): string {
  const override = String(import.meta.env.VITE_LOGIN_BANNER_URL || '').trim();
  if (override) return override;
  return getMediaUrl('images/login-banner.png');
}

/** Bumped when replacing `images/app-promo.png` on S3 (same key) so browsers skip stale cache. Override via `VITE_APP_PROMO_ASSET_VERSION`. */
const APP_PROMO_ASSET_VERSION_DEFAULT = '20260509';

export function appPromoImageUrl(): string {
  const override = String(import.meta.env.VITE_APP_PROMO_IMAGE_URL || '').trim();
  if (override) return override;
  const base = getMediaUrl('images/app-promo.png');
  const rev = String(import.meta.env.VITE_APP_PROMO_ASSET_VERSION || APP_PROMO_ASSET_VERSION_DEFAULT).trim();
  if (!base || !rev) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}v=${encodeURIComponent(rev)}`;
}
