export type FeedType = 'commits' | 'issues' | 'pulls' | 'releases' | 'all';

export type ItemState = 'all' | 'open' | 'closed';

export interface CommitFiltersState {
  branches: string;
}

export interface AllFeedState {
  commits: boolean;
  issues: boolean;
  issuesState: ItemState;
  pulls: boolean;
  pullsState: ItemState;
  releases: boolean;
}
