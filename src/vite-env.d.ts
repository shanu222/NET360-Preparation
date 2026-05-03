/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_ENABLE_PUSH_NOTIFICATIONS?: string;
  readonly VITE_ADMIN_ONLY?: string;
  /** S3 or CloudFront base for static marketing images/video (no trailing slash). */
  readonly VITE_PUBLIC_MEDIA_BASE_URL?: string;
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
