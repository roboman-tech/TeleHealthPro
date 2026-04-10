/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Omit in dev to use the Vite proxy (same-origin session cookies). */
  readonly VITE_API_URL?: string
  readonly VITE_DEV_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
