import type { ReactNode } from 'react';

interface StatBoxProps {
  label: string;
  value: ReactNode;
  note?: string;
  color?: string;
  size?: 'md' | 'lg';
}

export default function StatBox({ label, value, note, color, size = 'md' }: StatBoxProps) {
  return (
    <div className="ne-stat-box">
      <span className="ne-label ne-label-sm">{label}</span>
      <span
        className={size === 'lg' ? 'ne-value ne-value-lg' : 'ne-value'}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      {note !== undefined && <span className="ne-label ne-label-sm">{note}</span>}
    </div>
  );
}
