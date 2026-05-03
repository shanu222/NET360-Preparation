/**
 * S3/CDN media URLs — MongoDB stores object keys; the client builds absolute URLs.
 *
 * Set `VITE_S3_BASE_URL` (no trailing slash), e.g.
 * `https://net360-media.s3.ap-south-1.amazonaws.com`
 *
 * Falls back to `VITE_PUBLIC_MEDIA_BASE_URL`, then the production bucket host below.
 * Optional full-URL overrides per asset: `VITE_BRAND_LOGO_URL`, `VITE_USER_GUIDE_VIDEO_URL`, …
 *
 * Server: `GET /api/public/media-config` includes `mediaBaseUrl` and `s3BaseUrl` (env `S3_BASE_URL`).
 */

const DEFAULT_S3_BASE_URL = 'https://net360-media.s3.ap-south-1.amazonaws.com';

function trimSlash(input: string): string {
  return input.replace(/\/+$/, '');
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

export function brandLogoUrl(): string {
  const override = String(import.meta.env.VITE_BRAND_LOGO_URL || '').trim();
  if (override) return override;
  return getMediaUrl('brand/net360-logo.png');
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

export function appPromoImageUrl(): string {
  const override = String(import.meta.env.VITE_APP_PROMO_IMAGE_URL || '').trim();
  if (override) return override;
  return getMediaUrl('images/app-promo.png');
}
