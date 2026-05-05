import { type Request, type Router as ExpressRouter, Router } from "express";
import { getAdminPassword, getDeepRefreshDays } from "../config/env.js";
import { getGithubRateLimitSnapshot } from "../services/githubRateLimitState.js";
import { getRedisClient, isRedisAvailable } from "../services/redisClient.js";
import { getRecentRequests } from "../services/requestAudit.js";
import { HttpError } from "../utils/http.js";

type CachedCommitPage = {
  commits: Array<{ id: string }>;
  lastFetched: string;
};

type CachePageEntry = {
  key: string;
  repoScope: string;
  page: number;
  isDeepCached: boolean;
  commitCount: number;
  lastFetched: string;
  ttlSeconds: number;
};

type RepoCacheBreakdownEntry = {
  repoScope: string;
  deepCachedPages: number;
  nonDeepCachedPages: number;
  totalPages: number;
  deepTtlSeconds: number | null;
  nonDeepTtlSeconds: number | null;
};

const CACHE_PAGE_KEY_RE = /^data:(.+):commits:page:(\d+)$/;
const maxAdminLoginAttempts = 5;
const adminBlockWindow = 15 * 60 * 1000;

const adminRouter: ExpressRouter = Router();
const adminAttemptState = new Map<
  string,
  { failures: number; blockedUntil: number | null }
>();

function requireAdminPasswordSet(): string {
  const configuredPassword = getAdminPassword();
  if (!configuredPassword) {
    throw new HttpError(503, "ADMIN_PASSWORD is not configured on the server.");
  }

  return configuredPassword;
}

function readProvidedPassword(req: Request): string | undefined {
  const headerPassword = req.header("x-admin-password")?.trim();
  return headerPassword || undefined;
}

function getRequestIp(req: Request): string {
  return req.ip || "unknown";
}

function getRetryAfterSeconds(blockedUntil: number): string {
  return String(Math.max(1, Math.ceil((blockedUntil - Date.now()) / 1000)));
}

function assertNotRateLimited(req: Request): void {
  const state = adminAttemptState.get(getRequestIp(req));
  if (!state?.blockedUntil) {
    return;
  }

  if (state.blockedUntil <= Date.now()) {
    adminAttemptState.delete(getRequestIp(req));
    return;
  }

  throw new HttpError(
    429,
    "Too many invalid admin password attempts. Try again later.",
    {
      "Retry-After": getRetryAfterSeconds(state.blockedUntil),
    },
  );
}

function recordFailedAttempt(req: Request): void {
  const ip = getRequestIp(req);
  const current = adminAttemptState.get(ip);
  const failures = (current?.failures ?? 0) + 1;

  if (failures >= maxAdminLoginAttempts) {
    adminAttemptState.set(ip, {
      failures,
      blockedUntil: Date.now() + adminBlockWindow,
    });
    return;
  }

  adminAttemptState.set(ip, {
    failures,
    blockedUntil: null,
  });
}

function clearFailedAttempts(req: Request): void {
  adminAttemptState.delete(getRequestIp(req));
}

function assertAdminAuth(req: Request): void {
  assertNotRateLimited(req);

  const configuredPassword = requireAdminPasswordSet();
  const providedPassword = readProvidedPassword(req);

  if (!providedPassword || providedPassword !== configuredPassword) {
    recordFailedAttempt(req);
    throw new HttpError(401, "Invalid admin password.");
  }

  clearFailedAttempts(req);
}

function parseLimit(rawLimit: unknown, fallback: number): number {
  if (typeof rawLimit !== "string") {
    return fallback;
  }

  const parsed = Number(rawLimit);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 100);
}

async function readCachePages(): Promise<CachePageEntry[]> {
  const redis = await getRedisClient();
  const pages: CachePageEntry[] = [];

  for await (const key of redis.scanIterator({
    MATCH: "data:*:commits:page:*",
    COUNT: 100,
  })) {
    const match = CACHE_PAGE_KEY_RE.exec(key);
    if (!match) {
      continue;
    }

    const repoScope = match[1];
    const page = Number(match[2]);
    if (!repoScope || !Number.isInteger(page) || page <= 0) {
      continue;
    }

    const [rawPage, ttlSeconds] = await Promise.all([
      redis.get(key),
      redis.ttl(key),
    ]);
    if (!rawPage) {
      continue;
    }

    const parsed = JSON.parse(rawPage) as CachedCommitPage;
    pages.push({
      key,
      repoScope,
      page,
      isDeepCached: page > 1,
      commitCount: parsed.commits.length,
      lastFetched: parsed.lastFetched,
      ttlSeconds,
    });
  }

  return pages.sort(
    (left, right) =>
      Date.parse(right.lastFetched) - Date.parse(left.lastFetched),
  );
}

function buildRepoCacheBreakdown(
  cachePages: CachePageEntry[],
): RepoCacheBreakdownEntry[] {
  const byRepo = new Map<string, RepoCacheBreakdownEntry>();

  for (const page of cachePages) {
    const existing = byRepo.get(page.repoScope);
    if (!existing) {
      byRepo.set(page.repoScope, {
        repoScope: page.repoScope,
        deepCachedPages: page.isDeepCached ? 1 : 0,
        nonDeepCachedPages: page.isDeepCached ? 0 : 1,
        totalPages: 1,
        deepTtlSeconds:
          page.isDeepCached && page.ttlSeconds >= 0 ? page.ttlSeconds : null,
        nonDeepTtlSeconds:
          !page.isDeepCached && page.ttlSeconds >= 0 ? page.ttlSeconds : null,
      });
      continue;
    }

    existing.totalPages += 1;
    if (page.isDeepCached) {
      existing.deepCachedPages += 1;
      if (page.ttlSeconds >= 0) {
        existing.deepTtlSeconds =
          existing.deepTtlSeconds === null
            ? page.ttlSeconds
            : Math.max(existing.deepTtlSeconds, page.ttlSeconds);
      }
    } else {
      existing.nonDeepCachedPages += 1;
      if (page.ttlSeconds >= 0) {
        existing.nonDeepTtlSeconds =
          existing.nonDeepTtlSeconds === null
            ? page.ttlSeconds
            : Math.max(existing.nonDeepTtlSeconds, page.ttlSeconds);
      }
    }
  }

  return Array.from(byRepo.values()).sort((left, right) => {
    if (right.totalPages !== left.totalPages) {
      return right.totalPages - left.totalPages;
    }

    return left.repoScope.localeCompare(right.repoScope);
  });
}

async function countKeys(pattern: string): Promise<number> {
  const redis = await getRedisClient();
  let count = 0;

  for await (const _key of redis.scanIterator({ MATCH: pattern, COUNT: 100 })) {
    count += 1;
  }

  return count;
}

adminRouter.post("/login", (req, res) => {
  assertNotRateLimited(req);

  const configuredPassword = requireAdminPasswordSet();
  const providedPassword =
    typeof req.body?.password === "string"
      ? req.body.password.trim()
      : undefined;

  if (!providedPassword || providedPassword !== configuredPassword) {
    recordFailedAttempt(req);
    throw new HttpError(401, "Invalid admin password.");
  }

  clearFailedAttempts(req);

  res.status(200).json({ ok: true });
});

adminRouter.get("/overview", async (req, res) => {
  assertAdminAuth(req);

  const requestsLimit = parseLimit(req.query.requests, 10);
  const githubRateLimit = getGithubRateLimitSnapshot();
  const redisAvailable = await isRedisAvailable();

  if (!redisAvailable) {
    res.status(503).json({
      status: "degraded",
      message:
        "Cache service (Redis) is unavailable. Cache data cannot be retrieved.",
    });
    return;
  }

  const [cachePages, etagKeys, metadataKeys, notificationsKeys] =
    await Promise.all([
      readCachePages(),
      countKeys("etag:*:commits:page:*"),
      countKeys("meta:*:commits"),
      countKeys("notifications:*:sync"),
    ]);

  const deepPages = cachePages.filter((entry) => entry.isDeepCached);
  const nonDeepPages = cachePages.filter((entry) => !entry.isDeepCached);
  const repoBreakdown = buildRepoCacheBreakdown(cachePages);

  const dataPages = cachePages.length;
  const deepCachedPages = deepPages.length;
  const nonDeepCachedPages = nonDeepPages.length;

  res.status(200).json({
    generatedAt: new Date().toISOString(),
    redisAvailable: true,
    deepRefreshDays: getDeepRefreshDays(),
    githubRateLimit,
    recentRequests: getRecentRequests(requestsLimit),
    cache: {
      summary: {
        dataPages,
        deepCachedPages,
        nonDeepCachedPages,
        etagKeys,
        metadataKeys,
        notificationsKeys,
      },
      pages: cachePages,
      deepPages,
      nonDeepPages,
      repoBreakdown,
    },
  });
});

export { adminRouter };
