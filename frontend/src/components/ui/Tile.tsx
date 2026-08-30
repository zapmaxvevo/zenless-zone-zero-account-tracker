import type { ReactNode } from 'react';

interface TileProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: 'panel' | 'ink';
  noteColor?: string;
}

export default function Tile({ label, value, note, tone = 'panel', noteColor }: TileProps) {
  return (
    <div className={`ne-tile ne-cut ne-cut-md${tone === 'ink' ? ' ne-tile-ink' : ''}`}>
      <span className="ne-label ne-label-sm">{label}</span>
      <span className="ne-figure ne-figure-lg">{value}</span>
      {note !== undefined && note !== null && (
        <span className="ne-label" style={noteColor ? { color: noteColor } : undefined}>
          {note}
        </span>
      )}
    </div>
  );
}
