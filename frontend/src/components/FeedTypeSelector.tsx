import type { FeedType } from '../types';

interface Props {
  value: FeedType;
  onChange: (feedType: FeedType) => void;
}

const FEED_TYPES: { value: FeedType; label: string }[] = [
  { value: 'commits', label: 'Commits' },
  { value: 'issues', label: 'Issues' },
  { value: 'pulls', label: 'Pull Requests' },
  { value: 'releases', label: 'Releases' },
  { value: 'all', label: 'Combined' },
];

export function FeedTypeSelector({ value, onChange }: Props) {
  return (
    <div className="field">
      <span className="label">Feed Type</span>
      <div className="tab-group">
        {FEED_TYPES.map((type) => (
          <button
            key={type.value}
            className={`tab ${value === type.value ? 'tab--active' : ''}`}
            onClick={() => onChange(type.value)}
            type="button"
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>
  );
}
