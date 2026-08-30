import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import type { ChallengeMode, ChallengeRunRead } from '../api/types';
import { MODE_DEADLY_ASSAULT, MODE_SHIYU_DEFENSE } from '../api/types';
import ChallengeAttempt from '../components/ChallengeAttempt';
import ChronicleNav from '../components/ChronicleNav';
import StatusMessage from '../components/StatusMessage';
import Hero from '../components/ui/Hero';
import SectionHead from '../components/ui/SectionHead';
import { useApi } from '../hooks/useApi';
import {
  formatClearTime,
  formatRankPercent,
  groupEntriesByLayer,
  groupRunsByMode,
  layerSummary,
} from '../lib/chronicle';
import { nameOr } from '../lib/labels';
import { rankColor } from '../lib/palette';
import { useSync } from '../lib/syncContext';
import { formatDateTime } from '../lib/time';
import '../styles/chronicle.css';

export type ChronicleMode = 'shiyu' | 'assault';

interface ChroniclePageProps {
  mode: ChronicleMode;
}

interface Spec {
  apiMode: ChallengeMode;
  watermark: string;
  title: string;
  subtitle: string;
  current: string;
  previous: string;
  /** Shiyu se juega por capas; Asalto es un jefe por intento. */
  layered: boolean;
}

const SPECS: Record<ChronicleMode, Spec> = {
  shiyu: {
    apiMode: MODE_SHIYU_DEFENSE,
    watermark: 'SHIYU',
    title: 'Defensa Shiyu',
    subtitle: 'Temporada actual y anterior · intentos agrupados por capa',
    current: 'Temporada actual',
    previous: 'Temporada anterior',
    layered: true,
  },
  assault: {
    apiMode: MODE_DEADLY_ASSAULT,
    watermark: 'ASALTO',
    title: 'Asalto Mortal',
    subtitle: 'Ciclo actual y anterior · un jefe por intento',
    current: 'Ciclo actual',
    previous: 'Ciclo anterior',
    layered: false,
  },
};

/** Shiyu tiene siete capas fijas: las que no se jugaron también son dato (regla 11). */
const LAYERS = [1, 2, 3, 4, 5, 6, 7];

/** Lo que se muestra cuando la temporada volvió sin un intento. */
const EMPTY = '—';

export default function ChroniclePage({ mode }: ChroniclePageProps) {
  const uid = useParams().uid ?? '';
  const spec = SPECS[mode];
  const { version } = useSync();

  const account = useApi(() => api.getAccount(uid), `${uid}:${version}`);
  const runs = useApi(
    () => api.listChallenges(uid, spec.apiMode),
    `${uid}:${spec.apiMode}:${version}`,
  );
  const bangboos = useApi(() => api.listBangboos(uid), `${uid}:${version}`);
  // El catálogo solo aporta nombres: si no está bajado, los agentes quedan con su game id.
  const catalog = useApi(() => api.catalogAgents(), 'catalog');

  const seasons = useMemo(
    () => groupRunsByMode(runs.data?.items ?? [], spec.apiMode),
    [runs.data, spec.apiMode],
  );

  const agentName = useMemo(() => {
    const names = new Map(catalog.data?.items.map((agent) => [agent.game_id, agent.name]) ?? []);
    return (gameId: number) => nameOr(names.get(gameId) ?? null, 'Agente', gameId);
  }, [catalog.data]);

  const bangbooName = useMemo(() => {
    const names = new Map(bangboos.data?.items.map((boo) => [boo.game_id, boo.name]) ?? []);
    return (gameId: number | null) => (gameId === null ? null : (names.get(gameId) ?? null));
  }, [bangboos.data]);

  const empty = !runs.loading && !runs.error && seasons.length === 0;

  function reload() {
    account.reload();
    runs.reload();
    bangboos.reload();
  }

  return (
    <div className="ne-stack">
      <ChronicleNav uid={uid} account={account.data} onSynced={reload} empty={empty} />

      <Hero size="sm" watermark={spec.watermark}>
        <span className="ne-eyebrow">HoYoLAB Chronicle // UID {uid}</span>
        <h2 className="ne-display ne-display-lg">{spec.title}</h2>
        <span className="ne-label ne-label-lg">{spec.subtitle}</span>
      </Hero>

      {runs.loading && <StatusMessage kind="loading">Cargando el Chronicle…</StatusMessage>}

      {!runs.loading && runs.error && (
        <StatusMessage kind="error" onRetry={runs.reload}>
          {runs.error}
        </StatusMessage>
      )}

      {empty && (
        <StatusMessage kind="empty">
          No hay temporadas guardadas de este modo. HoYoLAB solo publica la actual y la anterior:
          sincronizá el Chronicle para traerlas.
        </StatusMessage>
      )}

      {seasons.map((run, index) => (
        <Season
          key={run.id}
          run={run}
          spec={spec}
          mode={mode}
          current={index === 0}
          agentName={agentName}
          bangbooName={bangbooName}
        />
      ))}
    </div>
  );
}

interface SeasonProps {
  run: ChallengeRunRead;
  spec: Spec;
  mode: ChronicleMode;
  current: boolean;
  agentName: (gameId: number) => string;
  bangbooName: (gameId: number | null) => string | null;
}

function Season({ run, spec, mode, current, agentName, bangbooName }: SeasonProps) {
  const played = run.entries.length > 0;
  const stars = layerSummary(run.entries);
  const groups = groupEntriesByLayer(run.entries);

  return (
    <section className="ne-season ne-cut ne-cut-xl">
      <header className="ne-season-head">
        <span className={current ? 'ne-season-tag is-current' : 'ne-season-tag'}>
          {current ? spec.current : spec.previous}
        </span>

        <div className="ne-season-window">
          <span className="ne-value">{formatWindow(run.begin_time, run.end_time)}</span>
          <span className="ne-label ne-label-sm">Sincronizado {formatDateTime(run.synced_at)}</span>
        </div>

        {spec.layered && run.rating && (
          <div className="ne-season-rating">
            <div className="ne-season-rating-body">
              <span
                className="ne-figure ne-season-figure"
                style={{ color: rankColor(run.rating.replace('+', '')) }}
              >
                {run.rating}
              </span>
              <span className="ne-label ne-label-sm">Rating global</span>
            </div>
            <span className="ne-slash" aria-hidden="true" />
          </div>
        )}

        <div className="ne-grid-stats ne-season-stats">
          <StatBox label="Score" value={played ? run.score : EMPTY} note={`de ${run.max_score}`} />
          <StatBox
            label="Estrellas"
            value={played ? `★ ${run.total_stars}` : EMPTY}
            note="ganadas"
            color={played ? 'var(--accent)' : undefined}
          />
          <StatBox
            label="Ranking"
            value={played ? formatRankPercent(run.rank_percent) : EMPTY}
            note="percentil global"
          />
          <StatBox
            label="Tiempo"
            value={played ? formatClearTime(run.clear_time_seconds) : EMPTY}
            note="combate total"
          />
        </div>
      </header>

      <div className="ne-season-body">
        {spec.layered && (
          <div className="ne-season-layers">
            {LAYERS.map((layer) => {
              const won = stars[layer];
              return (
                <span
                  key={layer}
                  className={
                    won === undefined
                      ? 'ne-layer is-empty ne-cut ne-cut-sm'
                      : 'ne-layer ne-cut ne-cut-sm'
                  }
                >
                  <span className="ne-layer-index">{pad(layer)}</span>
                  <span className="ne-layer-stars">★ {won ?? 0}</span>
                </span>
              );
            })}
          </div>
        )}

        {!played && (
          <StatusMessage kind="empty">
            Esta temporada volvió sin datos: la cuenta no jugó este ciclo. Apenas haya un intento
            registrado, aparece acá con la sincronización.
          </StatusMessage>
        )}

        {groups.map((group) => (
          <div key={group.layerIndex ?? 'sin-capa'}>
            {group.layerIndex !== null && (
              <SectionHead small title={`Capa ${pad(group.layerIndex)}`} />
            )}
            <div className="ne-attempts">
              {group.entries.map((entry) => (
                <ChallengeAttempt
                  key={entry.position}
                  entry={entry}
                  mode={mode}
                  agentName={agentName}
                  bangbooName={bangbooName(entry.bangboo_id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface StatBoxProps {
  label: string;
  value: string | number;
  note: string;
  color?: string;
}

function StatBox({ label, value, note, color }: StatBoxProps) {
  return (
    <div className="ne-stat-box">
      <span className="ne-label ne-label-sm">{label}</span>
      <span className="ne-value ne-value-lg" style={color ? { color } : undefined}>
        {value}
      </span>
      <span className="ne-label ne-label-sm">{note}</span>
    </div>
  );
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Ventana de la temporada, corta y en mayúsculas: `16 JUL — 16 AGO 2026`. */
function formatWindow(begin: string | null, end: string | null): string {
  const from = shortDate(begin, false);
  const to = shortDate(end, true);
  if (!from && !to) return EMPTY;
  return `${from || EMPTY} — ${to || EMPTY}`;
}

/**
 * Fecha corta del huso del navegador, sin los conectores del castellano.
 *
 * `es-AR` devuelve `16-jul` y `16 de jul de 2026`; el diseño las quiere como `16 JUL`.
 */
function shortDate(iso: string | null, withYear: boolean): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const text = date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
    year: withYear ? 'numeric' : undefined,
  });
  return text
    .replace(/\sde\s/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\./g, '')
    .toUpperCase();
}
