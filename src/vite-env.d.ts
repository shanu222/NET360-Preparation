/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_MOBILE_API_BASE_URL?: string;
  readonly VITE_FORCE_LOCAL_API?: string;
  readonly VITE_DISABLE_LOCAL_API_FALLBACK?: string;
  readonly VITE_ENABLE_PUSH_NOTIFICATIONS?: string;
  readonly VITE_ADMIN_ONLY?: string;
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
