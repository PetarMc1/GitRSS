import { API_BASE } from '../config';
import type { AllFeedState, CommitFiltersState, FeedType, ItemState } from '../types';

export function buildRssUrl(
  repo: string,
  feedType: FeedType,
  commitFilters: CommitFiltersState,
  allFeed: AllFeedState,
  issuesState: ItemState,
  pullsState: ItemState,
): string {
  const trimmed = repo.trim();
  const params = new URLSearchParams({ repo: trimmed });

  if (feedType === 'commits') {
    const branches = commitFilters.branches.trim();
    if (branches) params.set('branches', branches);
  }

  if (feedType === 'issues' && issuesState !== 'all') {
    params.set('state', issuesState);
  }

  if (feedType === 'pulls' && pullsState !== 'all') {
    params.set('state', pullsState);
  }

  if (feedType === 'all') {
    if (allFeed.commits) params.set('commits', 'true');
    if (allFeed.issues) {
      params.set('issues', 'true');
      if (allFeed.issuesState !== 'all') params.set('issues_state', allFeed.issuesState);
    }
    if (allFeed.pulls) {
      params.set('pulls', 'true');
      if (allFeed.pullsState !== 'all') params.set('pulls_state', allFeed.pullsState);
    }
    if (allFeed.releases) params.set('releases', 'true');
  }

  return `${API_BASE}/rss/${feedType}?${params.toString()}`;
}
