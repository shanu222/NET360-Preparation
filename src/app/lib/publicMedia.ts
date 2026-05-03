/**
 * Public marketing/media assets are served from S3 (or CloudFront), not bundled in the web/APK build.
 *
 * Set `VITE_PUBLIC_MEDIA_BASE_URL` to your bucket or CDN prefix (no trailing slash), e.g.
 * `https://net360-media.s3.ap-south-1.amazonaws.com/static`
 *
 * Optional overrides (full URLs): `VITE_BRAND_LOGO_URL`, `VITE_USER_GUIDE_VIDEO_URL`
 *
 * Server exposes the same defaults via GET /api/public/media-config (PUBLIC_* env vars).
 */

function trimSlash(input: string): string {
  return input.replace(/\/+$/, '');
}

/** Base URL for objects under the static prefix in S3 (no trailing slash). */
export function getPublicMediaBaseUrl(): string {
  return trimSlash(String(import.meta.env.VITE_PUBLIC_MEDIA_BASE_URL || '').trim());
}

/**
 * Resolve a path relative to the media base, e.g. `schools/smme.png`.
 * When no base is configured, returns a root-relative URL for local dev (still expects assets elsewhere).
 */
export function publicMediaUrl(relativePath: string): string {
  const path = relativePath.replace(/^\/+/, '');
  const base = getPublicMediaBaseUrl();
  if (!base) {
    return `/${path}`;
  }
  return `${base}/${path}`;
}

export function brandLogoUrl(): string {
  const override = String(import.meta.env.VITE_BRAND_LOGO_URL || '').trim();
  if (override) return override;
  return publicMediaUrl('brand/net360-logo.png');
}

export function userGuideVideoUrl(): string {
  const override = String(import.meta.env.VITE_USER_GUIDE_VIDEO_URL || '').trim();
  if (override) return override;
  return publicMediaUrl('videos/net360-guide.mp4');
}

export function loginBannerImageUrl(): string {
  const override = String(import.meta.env.VITE_LOGIN_BANNER_URL || '').trim();
  if (override) return override;
  return publicMediaUrl('images/login-banner.png');
}

export function appPromoImageUrl(): string {
  const override = String(import.meta.env.VITE_APP_PROMO_IMAGE_URL || '').trim();
  if (override) return override;
  return publicMediaUrl('images/app-promo.png');
}
