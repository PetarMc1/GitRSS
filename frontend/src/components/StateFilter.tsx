import type { ItemState } from '../types';

interface Props {
  label: string;
  value: ItemState;
  onChange: (value: ItemState) => void;
}

const OPTIONS: { value: ItemState; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];

export function StateFilter({ label, value, onChange }: Props) {
  return (
    <div className="filter-group">
      <div className="field">
        <span className="label">{label}</span>
        <div className="tab-group">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`tab ${value === opt.value ? 'tab--active' : ''}`}
              onClick={() => onChange(opt.value)}
              type="button"
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
