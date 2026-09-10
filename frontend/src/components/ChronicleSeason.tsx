import type { ChallengeRunRead } from '../api/types';
import {
  formatClearTime,
  formatRankPercent,
  groupEntriesByLayer,
  layerSummary,
} from '../lib/chronicle';
import { rankColor } from '../lib/palette';
import { formatDateTime } from '../lib/time';
import ChallengeAttempt from './ChallengeAttempt';
import StatusMessage from './StatusMessage';
import SectionHead from './ui/SectionHead';
import StatBox from './ui/StatBox';

const LAYERS = [1, 2, 3, 4, 5, 6, 7];

const EMPTY = '—';

interface ChronicleSeasonProps {
  run: ChallengeRunRead;
  mode: 'shiyu' | 'assault';
  layered: boolean;
  label: string;
  current: boolean;
  agentName: (gameId: number) => string;
  bangbooName: (gameId: number | null) => string | null;
}

export default function ChronicleSeason({
  run,
  mode,
  layered,
  label,
  current,
  agentName,
  bangbooName,
}: ChronicleSeasonProps) {
  const played = run.entries.length > 0;
  const stars = layerSummary(run.entries);
  const groups = groupEntriesByLayer(run.entries);

  return (
    <section className="ne-season ne-cut ne-cut-xl">
      <header className="ne-season-head">
        <span className={current ? 'ne-season-tag is-current' : 'ne-season-tag'}>{label}</span>

        <div className="ne-season-window">
          <span className="ne-value">{formatWindow(run.begin_time, run.end_time)}</span>
          <span className="ne-label ne-label-sm">Sincronizado {formatDateTime(run.synced_at)}</span>
        </div>

        {layered && run.rating && (
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
          <StatBox
            size="lg"
            label="Score"
            value={played ? run.score : EMPTY}
            note={`de ${run.max_score}`}
          />
          <StatBox
            size="lg"
            label="Estrellas"
            value={played ? `★ ${run.total_stars}` : EMPTY}
            note="ganadas"
            color={played ? 'var(--accent)' : undefined}
          />
          <StatBox
            size="lg"
            label="Ranking"
            value={played ? formatRankPercent(run.rank_percent) : EMPTY}
            note="percentil global"
          />
          <StatBox
            size="lg"
            label="Tiempo"
            value={played ? formatClearTime(run.clear_time_seconds) : EMPTY}
            note="combate total"
          />
        </div>
      </header>

      <div className="ne-season-body">
        {layered && (
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

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function formatWindow(begin: string | null, end: string | null): string {
  const from = shortDate(begin, false);
  const to = shortDate(end, true);
  if (!from && !to) return EMPTY;
  return `${from || EMPTY} — ${to || EMPTY}`;
}

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
