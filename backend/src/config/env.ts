import dotenv from 'dotenv';
import { HttpError } from '../utils/http.js';

dotenv.config();

function parsePort(rawPort: string | undefined): number {
  if (!rawPort) {
    return 4000;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new HttpError(500, 'Invalid PORT value in environment configuration.');
  }

  return port;
}

function parseGithubToken(rawGithubToken: string | undefined): string | undefined {
  const githubToken = rawGithubToken?.trim();
  if (!githubToken) {
    return undefined;
  }

  return githubToken.replace(/^Bearer\s+/i, '');
}

function parseRedisUrl(rawRedisUrl: string | undefined): string | undefined {
  const redisUrl = rawRedisUrl?.trim();
  return redisUrl ? redisUrl : undefined;
}

function parseDeepRefreshDays(rawDeepRefreshDays: string | undefined): number {
  if (!rawDeepRefreshDays) {
    return 5;
  }

  const deepRefreshDays = Number(rawDeepRefreshDays);
  if (!Number.isInteger(deepRefreshDays) || deepRefreshDays <= 0) {
    throw new HttpError(500, 'Invalid DEEP_REFRESH_DAYS value in environment configuration.');
  }

  return deepRefreshDays;
}

function parseAdminPassword(rawAdminPassword: string | undefined): string | undefined {
  const adminPassword = rawAdminPassword?.trim();
  return adminPassword ? adminPassword : undefined;
}

export function getServerPort(): number {
  return parsePort(process.env.PORT);
}

export function getGithubToken(): string | undefined {
  return parseGithubToken(process.env.GITHUB_TOKEN);
}

export function getRedisUrl(): string | undefined {
  return parseRedisUrl(process.env.REDIS_URL);
}

export function getDeepRefreshDays(): number {
  return parseDeepRefreshDays(process.env.DEEP_REFRESH_DAYS);
}

export function getAdminPassword(): string | undefined {
  return parseAdminPassword(process.env.ADMIN_PASSWORD);
}
