/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Origin that shared links point at (e.g. https://minnal.example). Build-time; the domain is still TBD. */
  readonly VITE_PUBLIC_APP_ORIGIN?: string;
  /** Origin of core-service's public API; empty means same origin. */
  readonly VITE_API_BASE_URL?: string;
}
