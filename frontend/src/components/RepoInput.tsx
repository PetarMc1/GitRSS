interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function RepoInput({ value, onChange }: Props) {
  return (
    <div className="field">
      <label className="label" htmlFor="repo-input">
        GitHub Repository
      </label>
      <input
        id="repo-input"
        className="input"
        type="text"
        placeholder="owner/repo"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
