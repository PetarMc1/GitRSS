/**
 * Base URL of the GitRSS backend.
 * Empty string → requests are relative → Vite proxy handles them in dev.
 * Non-empty (e.g. http://localhost:4000) → requests go directly to that origin.
 */
export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';
