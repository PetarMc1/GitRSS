import { type Response, Router, type Router as ExpressRouter } from 'express';
import {
  fetchCommitsForBranch,
  fetchIssues,
  fetchPullRequests,
  fetchReleases,
  type GithubCommit,
  type GithubIssue,
  type GithubPullRequest,
  type GithubRelease,
} from '../services/github.js';
import type { RssItem } from '../types/rss.js';
import { HttpError } from '../utils/http.js';
import { logger } from '../utils/logger.js';
import { generateRssXml } from '../utils/rss.js';
import { isHttpError } from '../utils/http.js';
import { parseBaseGithubQuery, parseCommitFilters, parseItemState } from '../utils/validation.js';

const rssRouter: ExpressRouter = Router();

function sendRss(res: Response, xml: string, options?: { download?: boolean; filename?: string }): void {
  if (options?.download) {
    const fileName = options.filename ?? 'feed.xml';
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  } else {
    res.setHeader('Content-Type', 'text/xml; charset=utf-8');
    res.removeHeader('Content-Disposition');
  }

  res.status(200).send(xml);
}

function isDownloadRequested(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on', 'ture'].includes(value.toLowerCase());
}

async function sendCachedRss(
  endpointType: 'commits' | 'issues' | 'pulls' | 'releases' | 'all',
  rawQuery: Record<string, unknown>,
  res: Response,
  next: (error: unknown) => void,
  buildXml: () => Promise<string>,
): Promise<void> {
  const shouldDownload = isDownloadRequested(rawQuery.download);
  const ownerValue = typeof rawQuery.owner === 'string' ? rawQuery.owner : 'unknown-owner';
  const repoValue = typeof rawQuery.repo === 'string' ? rawQuery.repo : 'unknown-repo';
  const filename = `${ownerValue}-${repoValue}-${endpointType}.xml`;
  logger.info('RSS request', { endpointType, shouldDownload });

  try {
    const xml = await buildXml();
    sendRss(res, xml, {
      download: shouldDownload,
      filename,
    });
  } catch (error) {
    next(error);
  }
}

function firstLine(input: string): string {
  return input.split('\n')[0]?.trim() || input;
}

function toIsoDate(value: string): Date {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function sortItemsByDateDesc(items: RssItem[]): RssItem[] {
  return [...items].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

function isEnabled(value: unknown): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeCommitItem(commit: GithubCommit): RssItem {
  return {
    title: `[Commit] ${firstLine(commit.title)}`,
    link: commit.url,
    guid: `commit-${commit.id}`,
    pubDate: toIsoDate(commit.date),
    description: `Author: ${commit.author}`,
  };
}

function normalizeIssueItem(issue: GithubIssue): RssItem {
  return {
    title: `[Issue] ${issue.title}`,
    link: issue.url,
    guid: `issue-${issue.id}`,
    pubDate: toIsoDate(issue.date),
    description: `Author: ${issue.author}`,
  };
}

function normalizePullItem(pull: GithubPullRequest): RssItem {
  return {
    title: `[Pull] ${pull.title}`,
    link: pull.url,
    guid: `pull-${pull.id}`,
    pubDate: toIsoDate(pull.date),
    description: `Author: ${pull.author}`,
  };
}

function normalizeReleaseItem(release: GithubRelease): RssItem {
  return {
    title: `[Release] ${release.title}`,
    link: release.url,
    guid: `release-${release.id}`,
    pubDate: toIsoDate(release.date),
    description: `Tag: ${release.tag}`,
  };
}

rssRouter.get('/commits', async (req, res, next) => {
  await sendCachedRss('commits', req.query as Record<string, unknown>, res, next, async () => {
    const filters = parseCommitFilters(req.query as Record<string, unknown>);
    const targetBranches: Array<string | undefined> = filters.branches ?? [undefined];

    const allCommits = await Promise.all(
      targetBranches.map(async (targetBranch) => {
        const commits = await fetchCommitsForBranch(filters.owner, filters.repo, {
          ...(targetBranch ? { branch: targetBranch } : {}),
        });

        return commits.map((commit) => ({
          ...commit,
          _sourceBranch: targetBranch ?? 'default',
        }));
      }),
    );

    const dedupedById = new Map<string, (typeof allCommits)[number][number]>();
    for (const branchCommits of allCommits) {
      for (const commit of branchCommits) {
        if (!dedupedById.has(commit.id)) {
          dedupedById.set(commit.id, commit);
        }
      }
    }

    const items: RssItem[] = Array.from(dedupedById.values()).map((commit) => {
      const title = firstLine(commit.title);
      const branchLabel = commit._sourceBranch;

      return {
        title,
        link: commit.url,
        guid: commit.id,
        pubDate: toIsoDate(commit.date),
        description: `Author: ${commit.author} | Branch: ${branchLabel}`,
      };
    });

    return generateRssXml({
      title: `GitHub Commits RSS - ${filters.owner}/${filters.repo}`,
      description: 'Recent repository commits',
      link: `https://github.com/${filters.owner}/${filters.repo}/commits`,
      items: sortItemsByDateDesc(items),
    });
  });
});

rssRouter.get('/issues', async (req, res, next) => {
  await sendCachedRss('issues', req.query as Record<string, unknown>, res, next, async () => {
    const rawQuery = req.query as Record<string, unknown>;
    const query = parseBaseGithubQuery(rawQuery);
    const state = parseItemState(rawQuery);
    const issues = await fetchIssues(query.owner, query.repo, state);

    const items: RssItem[] = issues.map((issue) => ({
      title: issue.title,
      link: issue.url,
      guid: `issue-${issue.id}`,
      pubDate: toIsoDate(issue.date),
      description: `Author: ${issue.author}`,
    }));

    return generateRssXml({
      title: `GitHub Issues RSS - ${query.owner}/${query.repo}`,
      description: 'Repository issues',
      link: `https://github.com/${query.owner}/${query.repo}/issues`,
      items: sortItemsByDateDesc(items),
    });
  });
});

rssRouter.get('/pulls', async (req, res, next) => {
  await sendCachedRss('pulls', req.query as Record<string, unknown>, res, next, async () => {
    const rawQuery = req.query as Record<string, unknown>;
    const query = parseBaseGithubQuery(rawQuery);
    const state = parseItemState(rawQuery);
    const pulls = await fetchPullRequests(query.owner, query.repo, state);

    const items: RssItem[] = pulls.map((pull) => ({
      title: pull.title,
      link: pull.url,
      guid: `pull-${pull.id}`,
      pubDate: toIsoDate(pull.date),
      description: `Author: ${pull.author}`,
    }));

    return generateRssXml({
      title: `GitHub Pull Requests RSS - ${query.owner}/${query.repo}`,
      description: 'Repository pull requests',
      link: `https://github.com/${query.owner}/${query.repo}/pulls`,
      items: sortItemsByDateDesc(items),
    });
  });
});

rssRouter.get('/releases', async (req, res, next) => {
  await sendCachedRss('releases', req.query as Record<string, unknown>, res, next, async () => {
    const query = parseBaseGithubQuery(req.query as Record<string, unknown>);
    const releases = await fetchReleases(query.owner, query.repo);

    const items: RssItem[] = releases.map((release) => ({
      title: release.title,
      link: release.url,
      guid: `release-${release.id}`,
      pubDate: toIsoDate(release.date),
      description: `Tag: ${release.tag}`,
    }));

    return generateRssXml({
      title: `GitHub Releases RSS - ${query.owner}/${query.repo}`,
      description: 'Repository releases',
      link: `https://github.com/${query.owner}/${query.repo}/releases`,
      items: sortItemsByDateDesc(items),
    });
  });
});

rssRouter.get('/all', async (req, res, next) => {
  await sendCachedRss('all', req.query as Record<string, unknown>, res, next, async () => {
    const rawQuery = req.query as Record<string, unknown>;
    const query = parseBaseGithubQuery(rawQuery);

    const includeCommits = isEnabled(rawQuery.commits);
    const includeIssues = isEnabled(rawQuery.issues);
    const includePulls = isEnabled(rawQuery.pulls);
    const includeReleases = isEnabled(rawQuery.releases);

    if (!includeCommits && !includeIssues && !includePulls && !includeReleases) {
      throw new HttpError(
        400,
        'Select at least one feed type using commits=true, issues=true, pulls=true, or releases=true.',
      );
    }

    const tasks: Array<Promise<RssItem[]>> = [];

    if (includeCommits) {
      tasks.push(fetchCommitsForBranch(query.owner, query.repo, {}).then((commits) => commits.map(normalizeCommitItem)));
    }

    if (includeIssues) {
      const issuesState = parseItemState({ state: rawQuery.issues_state });
      tasks.push(fetchIssues(query.owner, query.repo, issuesState).then((issues) => issues.map(normalizeIssueItem)));
    }

    if (includePulls) {
      const pullsState = parseItemState({ state: rawQuery.pulls_state });
      tasks.push(fetchPullRequests(query.owner, query.repo, pullsState).then((pulls) => pulls.map(normalizePullItem)));
    }

    if (includeReleases) {
      tasks.push(fetchReleases(query.owner, query.repo).then((releases) => releases.map(normalizeReleaseItem)));
    }

    const itemGroups = await Promise.all(tasks);
    const items: RssItem[] = itemGroups.flat();

    return generateRssXml({
      title: `GitHub Activity RSS - ${query.owner}/${query.repo}`,
      description: 'Commits, issues, pull requests, and releases',
      link: `https://github.com/${query.owner}/${query.repo}`,
      items: sortItemsByDateDesc(items),
    });
  });
});

export { rssRouter };
