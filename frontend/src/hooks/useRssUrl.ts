import { API_BASE } from '../config';
import type { AllFeedState, CommitFiltersState, FeedType } from '../types';

export function buildRssUrl(
  repo: string,
  feedType: FeedType,
  commitFilters: CommitFiltersState,
  allFeed: AllFeedState,
): string {
  const trimmed = repo.trim();
  const params = new URLSearchParams({ repo: trimmed });

  if (feedType === 'commits') {
    const branches = commitFilters.branches.trim();
    if (branches) params.set('branches', branches);
  }

  if (feedType === 'all') {
    if (allFeed.commits) params.set('commits', 'true');
    if (allFeed.issues) params.set('issues', 'true');
    if (allFeed.pulls) params.set('pulls', 'true');
    if (allFeed.releases) params.set('releases', 'true');
  }

  return `${API_BASE}/rss/${feedType}?${params.toString()}`;
}
