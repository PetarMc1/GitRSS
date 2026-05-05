import { fetchCachedCommits, fetchCachedData } from "./githubDataCache.js";

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

export async function fetchIssues(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
): Promise<GithubIssue[]> {
  const allItems = await fetchCachedData<any>({
    owner,
    repo,
    type: "issues",
    path: `/repos/${owner}/${repo}/issues`,
    query: { state },
    queryIdentifier: state,
    normalizer: (raw: unknown) => {
      const issue = raw as RawGithubIssue;
      // Filter out pull requests from issues endpoint
      if (issue.pull_request) {
        return null;
      }
      return {
        id: String(issue.id),
        title: issue.title,
        author: issue.user.login,
        date: issue.updated_at,
        url: issue.html_url,
      };
    },
  });

  return allItems.filter((item): item is GithubIssue => item !== null);
}

export async function fetchPullRequests(
  owner: string,
  repo: string,
  state: "open" | "closed" | "all" = "all",
): Promise<GithubPullRequest[]> {
  return fetchCachedData<GithubPullRequest>({
    owner,
    repo,
    type: "pulls",
    path: `/repos/${owner}/${repo}/pulls`,
    query: {
      state,
      sort: "updated",
      direction: "desc",
    },
    queryIdentifier: state,
    normalizer: (raw: unknown) => {
      const pull = raw as RawGithubPullRequest;
      return {
        id: String(pull.id),
        title: pull.title,
        author: pull.user.login,
        date: pull.updated_at,
        url: pull.html_url,
      };
    },
  });
}

export async function fetchReleases(
  owner: string,
  repo: string,
): Promise<GithubRelease[]> {
  const allItems = await fetchCachedData<any>({
    owner,
    repo,
    type: "releases",
    path: `/repos/${owner}/${repo}/releases`,
    normalizer: (raw: unknown) => {
      const release = raw as RawGithubRelease;
      // Filter out draft and unpublished releases
      if (release.draft || !release.published_at) {
        return null;
      }
      return {
        id: String(release.id),
        title: release.name || release.tag_name,
        tag: release.tag_name,
        date: release.published_at,
        url: release.html_url,
      };
    },
  });

  return allItems.filter((item): item is GithubRelease => item !== null);
}
