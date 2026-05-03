import { getGithubToken } from '../config/env.js';

export type GithubRateLimitSnapshot = {
  available: boolean;
  limit: number | null;
  remaining: number | null;
  used: number | null;
  resetAt: string | null;
  resetsInSeconds: number | null;
  authenticated: boolean;
  source: 'live-headers' | 'unavailable';
};

let githubRateLimitSnapshot: GithubRateLimitSnapshot = {
  available: false,
  limit: null,
  remaining: null,
  used: null,
  resetAt: null,
  resetsInSeconds: null,
  authenticated: Boolean(getGithubToken()),
  source: 'unavailable',
};

function parseHeaderInt(headers: Headers, name: string): number | null {
  const rawValue = headers.get(name);
  if (!rawValue) {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

export function updateGithubRateLimitSnapshot(headers: Headers): void {
  const limit = parseHeaderInt(headers, 'x-ratelimit-limit');
  const remaining = parseHeaderInt(headers, 'x-ratelimit-remaining');
  const used = parseHeaderInt(headers, 'x-ratelimit-used');
  const reset = parseHeaderInt(headers, 'x-ratelimit-reset');
  const resetAtMs = reset !== null ? reset * 1000 : null;

  githubRateLimitSnapshot = {
    available: limit !== null || remaining !== null || used !== null || reset !== null,
    limit,
    remaining,
    used,
    resetAt: resetAtMs !== null ? new Date(resetAtMs).toISOString() : null,
    resetsInSeconds: resetAtMs !== null ? Math.max(0, Math.ceil((resetAtMs - Date.now()) / 1000)) : null,
    authenticated: Boolean(getGithubToken()),
    source: 'live-headers',
  };
}

export function getGithubRateLimitSnapshot(): GithubRateLimitSnapshot {
  return {
    ...githubRateLimitSnapshot,
    authenticated: Boolean(getGithubToken()),
  };
}
