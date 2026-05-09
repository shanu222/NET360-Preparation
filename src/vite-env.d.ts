/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Alias for dashboards that used the wrong name (e.g. Vercel). Prefer `VITE_API_URL`. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_FIREBASE_API_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_APP_ID?: string;
  readonly VITE_ENABLE_PUSH_NOTIFICATIONS?: string;
  readonly VITE_ADMIN_ONLY?: string;
  /** S3 or CloudFront base for object keys (no trailing slash). Prefer over VITE_PUBLIC_MEDIA_BASE_URL. */
  readonly VITE_S3_BASE_URL?: string;
  readonly VITE_PUBLIC_MEDIA_BASE_URL?: string;
  /** If `"true"` in production, allow same-origin fallbacks for built-in media (keep dist copies; not typical). */
  readonly VITE_MEDIA_LOCAL_FALLBACK?: string;
  readonly VITE_BRAND_LOGO_URL?: string;
  readonly VITE_USER_GUIDE_VIDEO_URL?: string;
  readonly VITE_LOGIN_BANNER_URL?: string;
  readonly VITE_APP_PROMO_IMAGE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.webp' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}
