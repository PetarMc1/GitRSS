import type { AllFeedState } from '../types';

interface Props {
  value: AllFeedState;
  onChange: (value: AllFeedState) => void;
}

const OPTIONS: { key: keyof AllFeedState; label: string }[] = [
  { key: 'commits', label: 'Commits' },
  { key: 'issues', label: 'Issues' },
  { key: 'pulls', label: 'Pull Requests' },
  { key: 'releases', label: 'Releases' },
];

export function AllFeedOptions({ value, onChange }: Props) {
  const toggle = (key: keyof AllFeedState) => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="filter-group">
      <span className="label">Include</span>
      <div className="checkbox-group">
        {OPTIONS.map((opt) => (
          <label key={opt.key} className="checkbox-label">
            <input
              type="checkbox"
              checked={value[opt.key]}
              onChange={() => toggle(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
