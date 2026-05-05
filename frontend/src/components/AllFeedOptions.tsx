import type { AllFeedState } from '../types';
import { StateFilter } from './StateFilter';

interface Props {
  value: AllFeedState;
  onChange: (value: AllFeedState) => void;
}

const TOGGLES: { key: 'commits' | 'issues' | 'pulls' | 'releases'; label: string }[] = [
  { key: 'commits', label: 'Commits' },
  { key: 'issues', label: 'Issues' },
  { key: 'pulls', label: 'Pull Requests' },
  { key: 'releases', label: 'Releases' },
];

export function AllFeedOptions({ value, onChange }: Props) {
  const toggle = (key: 'commits' | 'issues' | 'pulls' | 'releases') => {
    onChange({ ...value, [key]: !value[key] });
  };

  return (
    <div className="filter-group">
      <span className="label">Include</span>
      <div className="checkbox-group">
        {TOGGLES.map((opt) => (
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

      {value.issues && (
        <StateFilter
          label="Issues Status"
          value={value.issuesState}
          onChange={(s) => onChange({ ...value, issuesState: s })}
        />
      )}

      {value.pulls && (
        <StateFilter
          label="Pull Requests Status"
          value={value.pullsState}
          onChange={(s) => onChange({ ...value, pullsState: s })}
        />
      )}
    </div>
  );
}
