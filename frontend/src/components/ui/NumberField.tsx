interface NumberFieldProps {
  id: string;
  label: string;
  limits: readonly [number, number];
  value: string;
  onChange: (value: string) => void;
}

export default function NumberField({ id, label, limits, value, onChange }: NumberFieldProps) {
  return (
    <div className="field">
      <label className="ne-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={limits[0]}
        max={limits[1]}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
