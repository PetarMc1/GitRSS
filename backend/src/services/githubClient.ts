import { getGithubToken } from "../config/env.js";
import { updateGithubRateLimitSnapshot } from "./githubRateLimitState.js";
import { HttpError } from "../utils/http.js";
import { logger } from "../utils/logger.js";

type GithubRequestOptions = {
  path: string;
  query?: Record<string, string | undefined>;
};

export type GithubConditionalResponse<T> =
  | {
      status: "ok";
      data: T;
      etag?: string;
    }
  | {
      status: "not-modified";
      etag?: string;
    };

const githubApiBaseURL = "https://api.github.com";
const githubApiUserAgent = "PetarMc1/GitRSS 1.0";

function buildGithubUrl(options: GithubRequestOptions): string {
  const url = new URL(options.path, githubApiBaseURL);

  for (const [key, value] of Object.entries(options.query || {})) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

function getRateLimitErrorMessage(response: Response): string {
  const resetRaw = response.headers.get("x-ratelimit-reset");
  if (!resetRaw) {
    return "GitHub API rate limit exceeded. Try again later.";
  }

  const resetEpoch = Number(resetRaw) * 1000;
  if (Number.isNaN(resetEpoch)) {
    return "GitHub API rate limit exceeded. Try again later.";
  }

  const resetTime = new Date(resetEpoch).toISOString();
  return `GitHub API rate limit exceeded. Try again after ${resetTime}.`;
}

function getRateLimitRetryAfterSeconds(response: Response): string | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    return retryAfter;
  }

  const resetRaw = response.headers.get("x-ratelimit-reset");
  if (!resetRaw) {
    return undefined;
  }

  const resetEpochMs = Number(resetRaw) * 1000;
  if (Number.isNaN(resetEpochMs)) {
    return undefined;
  }

  const secondsUntilReset = Math.max(
    0,
    Math.ceil((resetEpochMs - Date.now()) / 1000),
  );
  return String(secondsUntilReset);
}

export function buildGithubHeaders(): Record<string, string> {
  const token = getGithubToken();

  return {
    Accept: "application/vnd.github+json",
    "User-Agent": githubApiUserAgent,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function githubConditionalRequest<T>(
  options: GithubRequestOptions & { etag?: string },
): Promise<GithubConditionalResponse<T>> {
  const requestUrl = buildGithubUrl(options);

  const response = await fetch(requestUrl, {
    headers: {
      ...buildGithubHeaders(),
      ...(options.etag ? { "If-None-Match": options.etag } : {}),
    },
  });

  updateGithubRateLimitSnapshot(response.headers);

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
  if (
    response.status === 429 ||
    (response.status === 403 && rateLimitRemaining === "0")
  ) {
    const retryAfter = getRateLimitRetryAfterSeconds(response);
    logger.warn("GitHub rate limit triggered", {
      url: requestUrl,
      status: response.status,
      retryAfter,
      resetAt: response.headers.get("x-ratelimit-reset"),
    });
    throw new HttpError(
      429,
      getRateLimitErrorMessage(response),
      retryAfter ? { "Retry-After": retryAfter } : undefined,
    );
  }

  if (response.status === 304) {
    return {
      status: "not-modified",
      ...(response.headers.get("etag")
        ? { etag: response.headers.get("etag") as string }
        : {}),
    };
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error("GitHub request failed", {
      url: requestUrl,
      status: response.status,
    });
    throw new HttpError(
      response.status,
      `GitHub API request failed (${response.status}): ${body}`,
    );
  }

  return {
    status: "ok",
    data: (await response.json()) as T,
    ...(response.headers.get("etag")
      ? { etag: response.headers.get("etag") as string }
      : {}),
  };
}

export async function githubRequest<T>(
  options: GithubRequestOptions,
): Promise<T> {
  const requestUrl = buildGithubUrl(options);

  const response = await fetch(requestUrl, {
    headers: buildGithubHeaders(),
  });

  updateGithubRateLimitSnapshot(response.headers);

  const rateLimitRemaining = response.headers.get("x-ratelimit-remaining");
  if (
    response.status === 429 ||
    (response.status === 403 && rateLimitRemaining === "0")
  ) {
    const retryAfter = getRateLimitRetryAfterSeconds(response);
    logger.warn("GitHub rate limit triggered", {
      url: requestUrl,
      status: response.status,
      retryAfter,
      resetAt: response.headers.get("x-ratelimit-reset"),
    });
    throw new HttpError(
      429,
      getRateLimitErrorMessage(response),
      retryAfter ? { "Retry-After": retryAfter } : undefined,
    );
  }

  if (!response.ok) {
    const body = await response.text();
    logger.error("GitHub request failed", {
      url: requestUrl,
      status: response.status,
    });
    throw new HttpError(
      response.status,
      `GitHub API request failed (${response.status}): ${body}`,
    );
  }

  return (await response.json()) as T;
}

export async function githubPaginatedRequest<T>(
  options: GithubRequestOptions,
  config?: {
    perPage?: number;
    maxPages?: number;
  },
): Promise<T[]> {
  const results: T[] = [];
  const perPage = String(Math.min(config?.perPage ?? 100, 100));
  const maxPages = config?.maxPages ?? 1;

  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await githubRequest<T[]>({
      ...options,
      query: {
        ...options.query,
        per_page: perPage,
        page: String(page),
      },
    });

    results.push(...batch);

    if (batch.length < Number(perPage)) {
      break;
    }
  }

  return results;
}
