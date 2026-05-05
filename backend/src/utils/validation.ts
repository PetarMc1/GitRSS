import { HttpError } from './http.js';

export type BaseGithubQuery = {
  owner: string;
  repo: string;
};

export type CommitFilters = BaseGithubQuery & {
  branches?: string[];
};

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return [value];
  }

  return [];
}

export function parseBaseGithubQuery(rawQuery: Record<string, unknown>): BaseGithubQuery {
  const repoQuery = asNonEmptyString(rawQuery.repo);

  if (!repoQuery) {
    throw new HttpError(400, 'Query parameter repo is required. Use owner/repo format.');
  }

  if (!repoQuery.includes('/')) {
    throw new HttpError(400, 'Invalid repo format. Use repo=owner/repo (e.g. repo=octocat/Hello-World).');
  }

  const [parsedOwner, parsedRepo] = repoQuery.split('/');
  const owner = parsedOwner?.trim();
  const repo = parsedRepo?.trim();

  if (!owner || !repo) {
    throw new HttpError(400, 'Invalid repo format. Use repo=owner/repo (e.g. repo=octocat/Hello-World).');
  }

  return { owner, repo };
}

const validItemStates = ['open', 'closed', 'all'] as const;
export type ItemState = (typeof validItemStates)[number];

export function parseItemState(rawQuery: Record<string, unknown>): ItemState {
  const value = rawQuery.state;
  if (typeof value === 'string' && (validItemStates as readonly string[]).includes(value.toLowerCase())) {
    return value.toLowerCase() as ItemState;
  }
  return 'all';
}

export function parseCommitFilters(rawQuery: Record<string, unknown>): CommitFilters {
  const base = parseBaseGithubQuery(rawQuery);
  const branchesCsv = asNonEmptyString(rawQuery.branches);
  const branchesArray = asStringArray(rawQuery['branches[]'])
    .flatMap((part) => part.split(','))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const branchesFromCsv = branchesCsv
    ? branchesCsv
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
    : [];

  const branches = branchesFromCsv.length > 0 ? branchesFromCsv : branchesArray.length > 0 ? branchesArray : undefined;

  return {
    ...base,
    ...(branches ? { branches } : {}),
  };
}
