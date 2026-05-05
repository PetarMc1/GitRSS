import type { GithubCommit } from "./github.js";
import { githubConditionalRequest } from "./githubClient.js";
import { getRedisClient } from "./redisClient.js";
import { getDeepRefreshDays } from "../config/env.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";

const ghCommitsPerPage = 100;
//a hot page is called the first page of commits (most recent commits)
const hotPageTTL = 300;
const maxNotifsEvents = 200;
const SECONDS_PER_DAY = 86_400;

//ms in one day
//used for calculating deep refresh
const msPerDay = 86_400_000;

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

type CachedCommitPage = {
  commits: GithubCommit[];
  lastFetched: string;
};

type CommitSyncMetadata = {
  pageCount: number;
  initializedAt: string;
  syncedAt: string;
};

function normalizeCommit(rawCommit: RawGithubCommit): GithubCommit {
  return {
    id: rawCommit.sha,
    title: rawCommit.commit.message,
    author: rawCommit.commit.author.name,
    date: rawCommit.commit.author.date,
    url: rawCommit.html_url,
  };
}

function dedupeByCommitId(commits: GithubCommit[]): GithubCommit[] {
  const uniqueCommits = new Map<string, GithubCommit>();

  for (const commit of commits) {
    if (!uniqueCommits.has(commit.id)) {
      uniqueCommits.set(commit.id, commit);
    }
  }

  return Array.from(uniqueCommits.values());
}

function getRepoScope(owner: string, repo: string, branch?: string): string {
  return branch ? `${owner}/${repo}:branch:${branch}` : `${owner}/${repo}`;
}

function getCommitDataKey(repoScope: string, page: number): string {
  return `data:${repoScope}:commits:page:${page}`;
}

function getCommitEtagKey(repoScope: string, page: number): string {
  return `etag:${repoScope}:commits:page:${page}`;
}

function getCommitMetadataKey(repoScope: string): string {
  return `meta:${repoScope}:commits`;
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

async function persistCommitPage(
  repoScope: string,
  page: number,
  commits: GithubCommit[],
  lastFetched: string,
  etag?: string,
): Promise<void> {
  const redis = await getRedisClient();
  const ttl = getPageTtlSeconds(page);
  const pageKey = getCommitDataKey(repoScope, page);
  const etagKey = getCommitEtagKey(repoScope, page);
  const dedupedCommits = dedupeByCommitId(commits).slice(0, ghCommitsPerPage);
  const pagePayload = JSON.stringify({
    commits: dedupedCommits,
    lastFetched,
  } satisfies CachedCommitPage);

  const tx = redis.multi().set(pageKey, pagePayload, { EX: ttl });

  if (etag) {
    tx.set(etagKey, etag, { EX: ttl });
  }

  await tx.exec();
}

async function fetchCommitPageFromGithub(
  owner: string,
  repo: string,
  page: number,
  etag?: string,
  branch?: string,
): Promise<{
  status: "ok" | "not-modified";
  commits?: GithubCommit[];
  etag?: string;
}> {
  const response = await githubConditionalRequest<RawGithubCommit[]>({
    path: `/repos/${owner}/${repo}/commits`,
    query: {
      ...(branch ? { sha: branch } : {}),
      per_page: String(ghCommitsPerPage),
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

  return {
    status: "ok",
    commits: dedupeByCommitId(response.data.map(normalizeCommit)).slice(
      0,
      ghCommitsPerPage,
    ),
    ...(response.etag ? { etag: response.etag } : {}),
  };
}

function arePagesEqual(left: GithubCommit[], right: GithubCommit[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((commit, index) => commit.id === right[index]?.id);
}

function mergeCommitPages(pages: GithubCommit[][]): GithubCommit[] {
  const seen = new Set<string>();
  const merged: GithubCommit[] = [];

  for (const page of pages) {
    for (const commit of page) {
      if (seen.has(commit.id)) {
        continue;
      }

      seen.add(commit.id);
      merged.push(commit);
    }
  }

  return merged;
}

function chunkCommits(commits: GithubCommit[]): GithubCommit[][] {
  const chunks: GithubCommit[][] = [];

  for (let start = 0; start < commits.length; start += ghCommitsPerPage) {
    chunks.push(commits.slice(start, start + ghCommitsPerPage));
  }

  return chunks;
}

async function readCachedPage(
  repoScope: string,
  page: number,
): Promise<CachedCommitPage | undefined> {
  return readJson<CachedCommitPage>(getCommitDataKey(repoScope, page));
}

async function readPageEtag(
  repoScope: string,
  page: number,
): Promise<string | undefined> {
  return readCacheValue(getCommitEtagKey(repoScope, page));
}

async function writeMetadata(
  repoScope: string,
  pageCount: number,
): Promise<void> {
  const existing = await readMetadata(repoScope);
  await writeJson(
    getCommitMetadataKey(repoScope),
    {
      pageCount,
      initializedAt: existing?.initializedAt ?? new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    } satisfies CommitSyncMetadata,
    getColdPageTtlSeconds(),
  );
}

async function readMetadata(
  repoScope: string,
): Promise<CommitSyncMetadata | undefined> {
  return readJson<CommitSyncMetadata>(getCommitMetadataKey(repoScope));
}

function getDeepRefreshThresholdMs(): number {
  return getDeepRefreshDays() * msPerDay;
}

function isDeepRefreshDue(lastFetched: string): boolean {
  return (
    Date.now() - new Date(lastFetched).getTime() >= getDeepRefreshThresholdMs()
  );
}

function getDisplacedCommits(
  previousPage: GithubCommit[],
  currentPage: GithubCommit[],
): GithubCommit[] {
  const currentCommitIds = new Set(currentPage.map((commit) => commit.id));
  return previousPage.filter((commit) => !currentCommitIds.has(commit.id));
}

function composePage(
  previousOverflow: GithubCommit[],
  currentPage: GithubCommit[],
): { page: GithubCommit[]; overflow: GithubCommit[] } {
  const combined: GithubCommit[] = [];
  const seen = new Set<string>();

  for (const commit of [...previousOverflow, ...currentPage]) {
    if (seen.has(commit.id)) {
      continue;
    }

    seen.add(commit.id);
    combined.push(commit);
  }

  return {
    page: dedupeByCommitId(combined.slice(0, ghCommitsPerPage)),
    overflow: combined.slice(ghCommitsPerPage),
  };
}

async function syncCommitPage(
  owner: string,
  repo: string,
  repoScope: string,
  page: number,
  options: {
    forceEtagCheck: boolean;
    branch?: string;
  },
): Promise<{ commits: GithubCommit[]; changed: boolean }> {
  const cachedPage = await readCachedPage(repoScope, page);
  const cachedCommits = cachedPage?.commits;
  const lastFetched = cachedPage?.lastFetched;

  if (
    page > 1 &&
    cachedPage &&
    !options.forceEtagCheck &&
    lastFetched &&
    !isDeepRefreshDue(lastFetched)
  ) {
    await recordSyncEvent(repoScope, "cache-hit", { page });
    logger.info("Commit cache hit", { repoScope, page });
    return { commits: cachedPage.commits, changed: false };
  }

  await recordSyncEvent(repoScope, "cache-miss", { page });
  logger.info("Commit cache miss", { repoScope, page });

  const cachedEtag = await readPageEtag(repoScope, page);

  try {
    const result = await fetchCommitPageFromGithub(
      owner,
      repo,
      page,
      cachedEtag,
      options.branch,
    );
    const now = new Date().toISOString();

    if (result.status === "not-modified") {
      if (!cachedCommits) {
        throw new HttpError(
          500,
          `GitHub returned 304 for commits page ${page} without cached data.`,
        );
      }

      await recordSyncEvent(repoScope, "etag-hit", { page });
      logger.info("Commit ETag hit", { repoScope, page });
      await persistCommitPage(
        repoScope,
        page,
        cachedCommits,
        now,
        result.etag ?? cachedEtag,
      );
      return { commits: cachedCommits, changed: false };
    }

    await recordSyncEvent(repoScope, "etag-miss", { page });
    logger.info("Commit ETag miss", { repoScope, page });
    const commits = result.commits ?? [];
    await persistCommitPage(
      repoScope,
      page,
      commits,
      now,
      result.etag ?? cachedEtag,
    );
    return {
      commits,
      changed: !cachedCommits || !arePagesEqual(cachedCommits, commits),
    };
  } catch (error) {
    if (
      error instanceof HttpError &&
      error.statusCode === 429 &&
      cachedCommits
    ) {
      logger.warn("Using cached commit page after rate limit", {
        repoScope,
        page,
      });
      return { commits: cachedCommits, changed: false };
    }

    if (cachedEtag) {
      logger.warn("Commit page ETag validation failed, retrying without ETag", {
        repoScope,
        page,
        message: error instanceof Error ? error.message : String(error),
      });

      const retryResult = await fetchCommitPageFromGithub(
        owner,
        repo,
        page,
        undefined,
        options.branch,
      );
      const now = new Date().toISOString();

      if (retryResult.status === "not-modified") {
        if (!cachedCommits) {
          throw new HttpError(
            500,
            `GitHub returned 304 for commits page ${page} without cached data.`,
          );
        }

        await recordSyncEvent(repoScope, "etag-hit", { page });
        logger.info("Commit ETag hit", { repoScope, page });
        await persistCommitPage(
          repoScope,
          page,
          cachedCommits,
          now,
          retryResult.etag ?? cachedEtag,
        );
        return { commits: cachedCommits, changed: false };
      }

      await recordSyncEvent(repoScope, "etag-miss", { page });
      logger.info("Commit ETag miss", { repoScope, page });
      const commits = retryResult.commits ?? [];
      await persistCommitPage(
        repoScope,
        page,
        commits,
        now,
        retryResult.etag ?? cachedEtag,
      );
      return {
        commits,
        changed: !cachedCommits || !arePagesEqual(cachedCommits, commits),
      };
    }

    throw error;
  }
}

async function performInitialSync(
  owner: string,
  repo: string,
  repoScope: string,
  branch?: string,
): Promise<GithubCommit[]> {
  logger.info("Commit sync start", { repoScope, mode: "initial" });
  await recordSyncEvent(repoScope, "sync-start", { mode: "initial" });

  const pages: GithubCommit[][] = [];
  let page = 1;

  while (true) {
    const result = await fetchCommitPageFromGithub(
      owner,
      repo,
      page,
      undefined,
      branch,
    );
    const commits = result.commits ?? [];
    const now = new Date().toISOString();

    pages.push(commits);
    await persistCommitPage(repoScope, page, commits, now, result.etag);

    if (commits.length < ghCommitsPerPage) {
      break;
    }

    page += 1;
  }

  await writeMetadata(repoScope, pages.length);
  await recordSyncEvent(repoScope, "sync-end", {
    mode: "initial",
    pageCount: pages.length,
  });
  logger.info("Commit sync end", {
    repoScope,
    mode: "initial",
    pageCount: pages.length,
  });
  return mergeCommitPages(pages);
}

async function performIncrementalSync(
  owner: string,
  repo: string,
  repoScope: string,
  metadata: CommitSyncMetadata,
  branch?: string,
): Promise<GithubCommit[]> {
  logger.info("Commit sync start", {
    repoScope,
    mode: "incremental",
    pageCount: metadata.pageCount,
  });
  await recordSyncEvent(repoScope, "sync-start", {
    mode: "incremental",
    pageCount: metadata.pageCount,
  });

  const cachedPageOne = await readCachedPage(repoScope, 1);
  const hotPageResult = await syncCommitPage(owner, repo, repoScope, 1, {
    forceEtagCheck: true,
    ...(branch ? { branch } : {}),
  });

  const basePages: GithubCommit[][] = [hotPageResult.commits];
  let overflow = cachedPageOne
    ? getDisplacedCommits(cachedPageOne.commits, hotPageResult.commits)
    : [];
  let highestKnownPage = metadata.pageCount;

  for (let page = 2; page <= metadata.pageCount; page += 1) {
    const cachedPage = await readCachedPage(repoScope, page);

    const pageResult = await syncCommitPage(owner, repo, repoScope, page, {
      forceEtagCheck: !cachedPage,
      ...(branch ? { branch } : {}),
    });

    const composed = composePage(overflow, pageResult.commits);
    basePages.push(composed.page);
    overflow = composed.overflow;

    if (!cachedPage && pageResult.commits.length < ghCommitsPerPage) {
      highestKnownPage = page;
      break;
    }

    highestKnownPage = Math.max(highestKnownPage, page);
  }

  if (overflow.length > 0) {
    basePages.push(...chunkCommits(overflow));
  }

  await writeMetadata(repoScope, highestKnownPage);
  await recordSyncEvent(repoScope, "sync-end", {
    mode: "incremental",
    pageCount: highestKnownPage,
  });
  logger.info("Commit sync end", {
    repoScope,
    mode: "incremental",
    pageCount: highestKnownPage,
  });

  return mergeCommitPages(basePages);
}

export async function fetchCachedCommits(
  owner: string,
  repo: string,
  branch?: string,
): Promise<GithubCommit[]> {
  const repoScope = getRepoScope(owner, repo, branch);
  const metadata = await readMetadata(repoScope);

  if (!metadata) {
    return performInitialSync(owner, repo, repoScope, branch);
  }

  return performIncrementalSync(owner, repo, repoScope, metadata, branch);
}
