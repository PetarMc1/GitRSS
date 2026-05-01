import type { CommitFiltersState } from '../types';

interface Props {
  value: CommitFiltersState;
  onChange: (value: CommitFiltersState) => void;
}

export function CommitFilters({ value, onChange }: Props) {
  return (
    <div className="filter-group">
      <div className="field">
        <label className="label" htmlFor="branches-input">
          Branches
          <span className="label-hint">comma-separated - leave empty for default branch</span>
        </label>
        <input
          id="branches-input"
          className="input"
          type="text"
          placeholder="main, develop, feature/xyz"
          value={value.branches}
          onChange={(e) => onChange({ ...value, branches: e.target.value })}
          spellCheck={false}
        />
      </div>
    </div>
  );
}
