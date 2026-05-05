import { githubConditionalRequest } from "./githubClient.js";
import { getRedisClient } from "./redisClient.js";
import { getDeepRefreshDays } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";

const SECONDS_PER_DAY = 86_400;
const msPerDay = 86_400_000;
const maxNotifsEvents = 200;

// a hot page is the first page of results
// it has a shorter TTL since new commits/issues/PRs/releases appear on the first page and we want to keep it fresh
const hotPageTTL = 300; // 5 minutes
const ghItemsPerPage = 100;

export type CacheableItem = {
  id: string;
  title: string;
  author: string;
  date: string;
  url: string;
};

export type GithubCommit = {
  id: string;
  title: string;
  author: string;
  date: string;
  url: string;
};

type RawGithubCommit = {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: {
      name: string;
      date: string;
    };
  };
};

type CachedItemPage<T> = {
  items: T[];
  lastFetched: string;
};

type DataSyncMetadata = {
  pageCount: number;
  initializedAt: string;
  syncedAt: string;
};

function getRepoScope(owner: string, repo: string, type: string, query?: string): string {
  const queryPart = query ? `:${query}` : "";
  return `${owner}/${repo}:${type}${queryPart}`;
}

function getDataKey(repoScope: string, page: number): string {
  return `data:${repoScope}:page:${page}`;
}

function getEtagKey(repoScope: string, page: number): string {
  return `etag:${repoScope}:page:${page}`;
}

function getMetadataKey(repoScope: string): string {
  return `meta:${repoScope}`;
}

function getSyncNotificationsKey(repoScope: string): string {
  return `notifications:${repoScope}:sync`;
}

function getPageTtlSeconds(page: number): number {
  return page === 1 ? hotPageTTL : getColdPageTtlSeconds();
}

function getColdPageTtlSeconds(): number {
  return getDeepRefreshDays() * SECONDS_PER_DAY;
}

function shouldStoreEtag(page: number): boolean {
  // only store etag for hot/latest page
  return page === 1;
}

async function readCacheValue(key: string): Promise<string | undefined> {
  const redis = await getRedisClient();
  const value = await redis.get(key);
  return value ?? undefined;
}

async function writeCacheValue(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  const redis = await getRedisClient();
  if (ttlSeconds !== undefined) {
    await redis.set(key, value, { EX: ttlSeconds });
  } else {
    await redis.set(key, value);
  }
}

async function readJson<T>(key: string): Promise<T | undefined> {
  const value = await readCacheValue(key);
  if (!value) {
    return undefined;
  }

  return JSON.parse(value) as T;
}

async function writeJson<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  await writeCacheValue(key, JSON.stringify(value), ttlSeconds);
}

async function recordSyncEvent(
  repoScope: string,
  event:
    | "sync-start"
    | "sync-end"
    | "cache-hit"
    | "cache-miss"
    | "etag-hit"
    | "etag-miss",
  details?: Record<string, unknown>,
): Promise<void> {
  const redis = await getRedisClient();
  const notificationKey = getSyncNotificationsKey(repoScope);
  const payload = JSON.stringify({
    event,
    at: new Date().toISOString(),
    ...(details ?? {}),
  });

  await redis
    .multi()
    .lPush(notificationKey, payload)
    .lTrim(notificationKey, 0, maxNotifsEvents - 1)
    .expire(notificationKey, getColdPageTtlSeconds())
    .exec();
}

async function persistDataPage<T extends CacheableItem>(
  repoScope: string,
  page: number,
  items: T[],
  lastFetched: string,
  etag?: string,
): Promise<void> {
  const redis = await getRedisClient();
  const ttl = getPageTtlSeconds(page);
  const pageKey = getDataKey(repoScope, page);
  const etagKey = getEtagKey(repoScope, page);

  const pagePayload = JSON.stringify({
    items: items.slice(0, ghItemsPerPage),
    lastFetched,
  } satisfies CachedItemPage<T>);

  const tx = redis.multi().set(pageKey, pagePayload, { EX: ttl });

  if (etag && shouldStoreEtag(page)) {
    tx.set(etagKey, etag, { EX: ttl });
  }

  await tx.exec();
}

async function fetchDataPageFromGithub<T>(
  path: string,
  query: Record<string, string | undefined>,
  page: number,
  etag?: string,
  normalizer?: (raw: unknown) => T | null,
): Promise<{
  status: "ok" | "not-modified";
  items?: T[];
  etag?: string;
}> {
  const response = await githubConditionalRequest<unknown[]>({
    path,
    query: {
      ...query,
      per_page: String(ghItemsPerPage),
      page: String(page),
    },
    ...(etag ? { etag } : {}),
  });

  if (response.status === "not-modified") {
    return {
      status: "not-modified",
      ...(response.etag ? { etag: response.etag } : {}),
    };
  }

  const items = (response.data ?? [])
    .map(normalizer ? (x) => normalizer(x) : (x) => (x as T))
    .filter((item): item is T => item !== null);

  return {
    status: "ok",
    items: items.slice(0, ghItemsPerPage),
    ...(response.etag ? { etag: response.etag } : {}),
  };
}

function areItemsEqual<T extends CacheableItem>(
  left: T[],
  right: T[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => item.id === right[index]?.id);
}

function dedupeById<T extends CacheableItem>(items: T[]): T[] {
  const uniqueItems = new Map<string, T>();

  for (const item of items) {
    if (!uniqueItems.has(item.id)) {
      uniqueItems.set(item.id, item);
    }
  }

  return Array.from(uniqueItems.values());
}

async function readCachedPage<T extends CacheableItem>(
  repoScope: string,
  page: number,
): Promise<CachedItemPage<T> | undefined> {
  return readJson<CachedItemPage<T>>(getDataKey(repoScope, page));
}

async function readPageEtag(
  repoScope: string,
  page: number,
): Promise<string | undefined> {
  return readCacheValue(getEtagKey(repoScope, page));
}

async function writeMetadata(
  repoScope: string,
  pageCount: number,
): Promise<void> {
  const existing = await readMetadata(repoScope);
  await writeJson(
    getMetadataKey(repoScope),
    {
      pageCount,
      initializedAt: existing?.initializedAt ?? new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    } satisfies DataSyncMetadata,
    getColdPageTtlSeconds(),
  );
}

async function readMetadata(
  repoScope: string,
): Promise<DataSyncMetadata | undefined> {
  return readJson<DataSyncMetadata>(getMetadataKey(repoScope));
}

function getDeepRefreshThresholdMs(): number {
  return getDeepRefreshDays() * msPerDay;
}

function isDeepRefreshDue(lastFetched: string): boolean {
  return (
    Date.now() - new Date(lastFetched).getTime() >= getDeepRefreshThresholdMs()
  );
}

async function syncDataPage<T extends CacheableItem>(
  path: string,
  queryParams: Record<string, string | undefined>,
  repoScope: string,
  page: number,
  options: {
    forceEtagCheck: boolean;
    normalizer?: (raw: unknown) => T | null;
  },
): Promise<{ items: T[]; changed: boolean }> {
  const cachedPage = await readCachedPage<T>(repoScope, page);
  const cachedItems = cachedPage?.items;
  const lastFetched = cachedPage?.lastFetched;

  if (
    page > 1 &&
    cachedPage &&
    !options.forceEtagCheck &&
    lastFetched &&
    !isDeepRefreshDue(lastFetched)
  ) {
    await recordSyncEvent(repoScope, "cache-hit", { page });
    logger.info("Data cache hit", { repoScope, page });
    return { items: cachedPage.items, changed: false };
  }

  await recordSyncEvent(repoScope, "cache-miss", { page });
  logger.info("Data cache miss", { repoScope, page });

  const cachedEtag = shouldStoreEtag(page)
    ? await readPageEtag(repoScope, page)
    : undefined;

  try {
    const result = await fetchDataPageFromGithub<T>(
      path,
      queryParams,
      page,
      cachedEtag,
      options.normalizer,
    );
    const now = new Date().toISOString();

    if (result.status === "not-modified") {
      if (!cachedItems) {
        throw new HttpError(
          500,
          `GitHub returned 304 for data page ${page} without cached data.`,
        );
      }

      await recordSyncEvent(repoScope, "etag-hit", { page });
      logger.info("Data ETag hit", { repoScope, page });
      await persistDataPage(
        repoScope,
        page,
        cachedItems,
        now,
        result.etag ?? cachedEtag,
      );
      return { items: cachedItems, changed: false };
    }

    await recordSyncEvent(repoScope, "etag-miss", { page });
    logger.info("Data ETag miss", { repoScope, page });
    const items = dedupeById(result.items ?? []);
    await persistDataPage(
      repoScope,
      page,
      items,
      now,
      shouldStoreEtag(page) ? result.etag ?? cachedEtag : undefined,
    );
    return {
      items,
      changed: !cachedItems || !areItemsEqual(cachedItems, items),
    };
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.statusCode === 429 &&
      cachedItems
    ) {
      logger.warn("Using cached data page after rate limit", {
        repoScope,
        page,
      });
      return { items: cachedItems, changed: false };
    }

    if (cachedEtag && shouldStoreEtag(page)) {
      logger.warn("Data page ETag validation failed, retrying without ETag", {
        repoScope,
        page,
        message: error instanceof Error ? error.message : String(error),
      });

      const retryResult = await fetchDataPageFromGithub<T>(
        path,
        queryParams,
        page,
        undefined,
        options.normalizer,
      );
      const now = new Date().toISOString();

      if (retryResult.status === "not-modified") {
        if (!cachedItems) {
          throw new HttpError(
            500,
            `GitHub returned 304 for data page ${page} without cached data.`,
          );
        }

        await recordSyncEvent(repoScope, "etag-hit", { page });
        logger.info("Data ETag hit", { repoScope, page });
        await persistDataPage(
          repoScope,
          page,
          cachedItems,
          now,
          retryResult.etag ?? cachedEtag,
        );
        return { items: cachedItems, changed: false };
      }

      await recordSyncEvent(repoScope, "etag-miss", { page });
      logger.info("Data ETag miss", { repoScope, page });
      const items = dedupeById(retryResult.items ?? []);
      await persistDataPage(
        repoScope,
        page,
        items,
        now,
        shouldStoreEtag(page) ? retryResult.etag ?? cachedEtag : undefined,
      );
      return {
        items,
        changed: !cachedItems || !areItemsEqual(cachedItems, items),
      };
    }

    throw error;
  }
}

async function performInitialSync<T extends CacheableItem>(
  path: string,
  queryParams: Record<string, string | undefined>,
  repoScope: string,
  options: { normalizer?: (raw: unknown) => T | null },
): Promise<T[]> {
  logger.info("Data sync start", { repoScope, mode: "initial" });
  await recordSyncEvent(repoScope, "sync-start", { mode: "initial" });

  const pages: T[][] = [];
  let page = 1;

  while (true) {
    const result = await fetchDataPageFromGithub<T>(
      path,
      queryParams,
      page,
      undefined,
      options.normalizer,
    );
    const items = dedupeById(result.items ?? []);
    const now = new Date().toISOString();

    pages.push(items);
    await persistDataPage(
      repoScope,
      page,
      items,
      now,
      shouldStoreEtag(page) ? result.etag : undefined,
    );

    if (items.length < ghItemsPerPage) {
      break;
    }

    page += 1;
  }

  await writeMetadata(repoScope, pages.length);
  await recordSyncEvent(repoScope, "sync-end", {
    mode: "initial",
    pageCount: pages.length,
  });
  logger.info("Data sync end", {
    repoScope,
    mode: "initial",
    pageCount: pages.length,
  });

  return pages.flat();
}

function normalizeCommit(raw: unknown): GithubCommit {
  const r = raw as RawGithubCommit;
  return {
    id: r.sha,
    title: r.commit.message,
    author: r.commit.author.name,
    date: r.commit.author.date,
    url: r.html_url,
  };
}

export async function fetchCachedCommits(
  owner: string,
  repo: string,
  branch?: string,
): Promise<GithubCommit[]> {
  return fetchCachedData<GithubCommit>({
    owner,
    repo,
    type: "commits",
    path: `/repos/${owner}/${repo}/commits`,
    query: branch ? { sha: branch } : {},
    ...(branch !== undefined ? { queryIdentifier: branch } : {}),
    normalizer: normalizeCommit,
  });
}

export async function fetchCachedData<T extends CacheableItem>(
  options: {
    owner: string;
    repo: string;
    type: string;
    path: string;
    query?: Record<string, string | undefined>;
    queryIdentifier?: string;
    normalizer?: (raw: unknown) => T | null;
  },
): Promise<T[]> {
  const repoScope = getRepoScope(
    options.owner,
    options.repo,
    options.type,
    options.queryIdentifier,
  );
  const metadata = await readMetadata(repoScope);

  if (!metadata) {
    const normalizerOpt = options.normalizer !== undefined
      ? { normalizer: options.normalizer }
      : {};
    return performInitialSync(
      options.path,
      options.query ?? {},
      repoScope,
      normalizerOpt,
    );
  }

  logger.info("Data sync start", {
    repoScope,
    mode: "incremental",
    pageCount: metadata.pageCount,
  });
  await recordSyncEvent(repoScope, "sync-start", {
    mode: "incremental",
    pageCount: metadata.pageCount,
  });

  const basePages: T[][] = [];

  for (let page = 1; page <= metadata.pageCount; page += 1) {
    const pageResult = await syncDataPage<T>(
      options.path,
      options.query ?? {},
      repoScope,
      page,
      {
        forceEtagCheck: page === 1,
        ...(options.normalizer !== undefined ? { normalizer: options.normalizer } : {}),
      },
    );

    basePages.push(pageResult.items);
  }

  await writeMetadata(repoScope, basePages.length);
  await recordSyncEvent(repoScope, "sync-end", {
    mode: "incremental",
    pageCount: basePages.length,
  });
  logger.info("Data sync end", {
    repoScope,
    mode: "incremental",
    pageCount: basePages.length,
  });

  return basePages.flat();
}
