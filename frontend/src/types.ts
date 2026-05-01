export type FeedType = 'commits' | 'issues' | 'pulls' | 'releases' | 'all';

export interface CommitFiltersState {
  branches: string;
}

export interface AllFeedState {
  commits: boolean;
  issues: boolean;
  pulls: boolean;
  releases: boolean;
}
