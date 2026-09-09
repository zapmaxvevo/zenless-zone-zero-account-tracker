import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { isNotFound } from '../api/errors';
import ChronicleNav from '../components/ChronicleNav';
import StatusMessage from '../components/StatusMessage';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import { useSync } from '../lib/syncContext';
import '../styles/chronicle.css';

export default function LostVoidPage() {
  const uid = useParams().uid ?? '';
  const { version } = useSync();

  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const { data, error, loading, reload } = useApi(
    () =>
      api.getLostVoid(uid).catch((caught: unknown) => {
        if (isNotFound(caught)) return null;
        throw caught;
      }),
    `${uid}:${version}`,
  );

  const missing = !loading && !error && data === null;

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} onSynced={reload} empty={missing} />

      <Hero size="sm" watermark="VACÍO">
        <span className="ne-eyebrow">HoYoLAB Chronicle // UID {uid}</span>
        <h2 className="ne-display ne-display-lg">Vacío Perdido</h2>
        <span className="ne-label ne-label-lg">Progreso acumulado · sin temporadas</span>
      </Hero>

      <section className="ne-panel ne-cut ne-cut-lg">
        <SectionHead title="Progreso acumulado" />

        {loading && <StatusMessage kind="loading">Cargando el Vacío Perdido…</StatusMessage>}

        {!loading && error && (
          <StatusMessage kind="error" onRetry={reload}>
            {error}
          </StatusMessage>
        )}

        {missing && (
          <StatusMessage kind="empty">
            Esta cuenta nunca sincronizó el Vacío Perdido. Es un acumulado, no una temporada: apenas
            haya una sincronización con datos, queda guardado y ya no se pierde.
          </StatusMessage>
        )}

        {data && (
          <div className="ne-grid-void">
            <VoidTile
              label="Licencia del Vacío"
              value={<span className="ne-figure ne-figure-lg">Nv. {data.license_level}</span>}
              note="Progresión permanente"
            />

            <VoidTile
              label="Log de exploración"
              value={
                <span className="ne-void-value">
                  <span className="ne-figure ne-figure-lg">{data.exploration_log}</span>
                  <span className="ne-value" style={{ color: 'var(--text-dim)' }}>
                    / {data.max_exploration_log}
                  </span>
                </span>
              }
              bar={ratio(data.exploration_log, data.max_exploration_log)}
              note={`${percent(data.exploration_log, data.max_exploration_log)}% completado`}
            />

            <VoidTile
              label="Comisiones"
              value={
                <span className="ne-void-value">
                  <span className="ne-figure ne-figure-lg">{data.commissions_done}</span>
                  <span className="ne-value" style={{ color: 'var(--text-dim)' }}>
                    / {data.commissions_total}
                  </span>
                </span>
              }
              bar={ratio(data.commissions_done, data.commissions_total)}
              note={`${Math.max(0, data.commissions_total - data.commissions_done)} pendientes`}
            />

            <VoidTile
              label="Desafío definitivo"
              value={
                <span className="ne-figure ne-figure-lg ne-accent">
                  {data.ultimate_challenge_score}
                </span>
              }
              note={`Score · ${data.ultimate_challenge_tier || '—'}`}
            />

            <VoidTile
              label="Datos recolectados"
              value={<span className="ne-figure ne-figure-lg">{data.data_collected}</span>}
              note="Total histórico"
            />
          </div>
        )}
      </section>
    </div>
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
