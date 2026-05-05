import { githubPaginatedRequest } from './githubClient.js';
import { fetchCachedCommits } from './githubCommitCache.js';

const GITHUB_ITEMS_PER_PAGE = 100;

export type GithubCommit = {
  id: string;
  title: string;
  author: string;
  date: string;
  url: string;
};

export type GithubIssue = {
  id: string;
  title: string;
  author: string;
  date: string;
  url: string;
};

export type GithubPullRequest = {
  id: string;
  title: string;
  author: string;
  date: string;
  url: string;
};

export type GithubRelease = {
  id: string;
  title: string;
  tag: string;
  date: string;
  url: string;
};

type RawGithubIssue = {
  id: number;
  html_url: string;
  title: string;
  updated_at: string;
  user: { login: string };
  pull_request?: { url: string };
};

type RawGithubPullRequest = {
  id: number;
  html_url: string;
  title: string;
  updated_at: string;
  user: { login: string };
};

type RawGithubRelease = {
  id: number;
  html_url: string;
  name: string | null;
  tag_name: string;
  published_at: string | null;
  draft: boolean;
};

export async function fetchCommitsForBranch(
  owner: string,
  repo: string,
  options: {
    branch?: string;
  },
): Promise<GithubCommit[]> {
  return fetchCachedCommits(owner, repo, options.branch);
}

export async function fetchIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<GithubIssue[]> {
  const rawIssues = await githubPaginatedRequest<RawGithubIssue>({
    path: `/repos/${owner}/${repo}/issues`,
    query: {
      state,
    },
  }, { perPage: GITHUB_ITEMS_PER_PAGE, maxPages: 1 });

  return rawIssues
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      id: String(issue.id),
      title: issue.title,
      author: issue.user.login,
      date: issue.updated_at,
      url: issue.html_url,
    }));
}

export async function fetchPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all'): Promise<GithubPullRequest[]> {
  const rawPulls = await githubPaginatedRequest<RawGithubPullRequest>({
    path: `/repos/${owner}/${repo}/pulls`,
    query: {
      state,
      sort: 'updated',
      direction: 'desc',
    },
  }, { perPage: GITHUB_ITEMS_PER_PAGE, maxPages: 1 });

  return rawPulls.map((pull) => ({
    id: String(pull.id),
    title: pull.title,
    author: pull.user.login,
    date: pull.updated_at,
    url: pull.html_url,
  }));
}

export async function fetchReleases(owner: string, repo: string): Promise<GithubRelease[]> {
  const rawReleases = await githubPaginatedRequest<RawGithubRelease>({
    path: `/repos/${owner}/${repo}/releases`,
  }, { perPage: GITHUB_ITEMS_PER_PAGE, maxPages: 1 });

  return rawReleases
    .filter((release) => !release.draft && !!release.published_at)
    .map((release) => ({
      id: String(release.id),
      title: release.name || release.tag_name,
      tag: release.tag_name,
      date: release.published_at as string,
      url: release.html_url,
    }));
}
