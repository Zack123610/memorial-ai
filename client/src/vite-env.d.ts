/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API origin, e.g. https://api.example.com. Empty = same origin (dev proxy). */
  readonly VITE_API_BASE?: string;
  /** Socket.IO origin. Defaults to VITE_API_BASE. */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
