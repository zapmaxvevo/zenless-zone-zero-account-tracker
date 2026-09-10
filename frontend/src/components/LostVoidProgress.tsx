import type { ReactNode } from 'react';
import type { LostVoidRead } from '../api/types';

const EMPTY = '—';

export default function LostVoidProgress({ data }: { data: LostVoidRead }) {
  return (
    <div className="ne-grid-void">
      <VoidTile
        label="Licencia del Vacío"
        value={<span className="ne-figure ne-figure-lg">Nv. {data.license_level}</span>}
        note="Progresión permanente"
      />

      <VoidTile
        label="Log de exploración"
        value={<Fraction done={data.exploration_log} total={data.max_exploration_log} />}
        bar={ratio(data.exploration_log, data.max_exploration_log)}
        note={`${percent(data.exploration_log, data.max_exploration_log)}% completado`}
      />

      <VoidTile
        label="Comisiones"
        value={<Fraction done={data.commissions_done} total={data.commissions_total} />}
        bar={ratio(data.commissions_done, data.commissions_total)}
        note={`${Math.max(0, data.commissions_total - data.commissions_done)} pendientes`}
      />

      <VoidTile
        label="Desafío definitivo"
        value={
          <span className="ne-figure ne-figure-lg ne-accent">{data.ultimate_challenge_score}</span>
        }
        note={`Score · ${data.ultimate_challenge_tier || EMPTY}`}
      />

      <VoidTile
        label="Datos recolectados"
        value={<span className="ne-figure ne-figure-lg">{data.data_collected}</span>}
        note="Total histórico"
      />
    </div>
  );
}

function Fraction({ done, total }: { done: number; total: number }) {
  return (
    <span className="ne-void-value">
      <span className="ne-figure ne-figure-lg">{done}</span>
      <span className="ne-value" style={{ color: 'var(--text-dim)' }}>
        / {total}
      </span>
    </span>
  );
}

interface VoidTileProps {
  label: string;
  value: ReactNode;
  bar?: number;
  note: string;
}

function VoidTile({ label, value, bar, note }: VoidTileProps) {
  return (
    <div className="ne-tile ne-cut ne-cut-md">
      <span className="ne-label ne-label-sm">{label}</span>
      {value}
      {bar !== undefined && (
        <span className="ne-bar ne-bar-lg">
          <span style={{ width: `${bar * 100}%` }} />
        </span>
      )}
      <span className="ne-label">{note}</span>
    </div>
  );
}

function ratio(done: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, done / total));
}

function percent(done: number, total: number): number {
  return Math.round(ratio(done, total) * 100);
}
