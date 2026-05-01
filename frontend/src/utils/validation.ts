import type { AllFeedState, FeedType } from '../types';

export function validateRepo(repo: string): string | null {
  const trimmed = repo.trim();
  if (!trimmed) return 'Repository is required.';
  if (!/^[^/\s]+\/[^/\s]+$/.test(trimmed)) {
    return 'Repository must be in owner/repo format (e.g. PetarMc1/GitRSS).';
  }
  return null;
}

export function validateAllFeed(allFeed: AllFeedState): string | null {
  const anySelected = allFeed.commits || allFeed.issues || allFeed.pulls || allFeed.releases;
  return anySelected ? null : 'Select at least one content type for the combined feed.';
}

export function validateForm(
  repo: string,
  feedType: FeedType,
  allFeed: AllFeedState,
): string | null {
  return validateRepo(repo) ?? (feedType === 'all' ? validateAllFeed(allFeed) : null);
}
