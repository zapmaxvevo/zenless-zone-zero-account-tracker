import type { ChallengeEntryRead, ChallengeMode, ChallengeRunRead } from '../api/types';
import { rarityLabel } from './labels';
import { formatStatValue } from './stats';

/** Una capa de Shiyu con sus pisos; `layerIndex` en null son los modos que no tienen capas. */
export interface LayerGroup {
  layerIndex: number | null;
  entries: ChallengeEntryRead[];
}

/** Lo que se muestra cuando el Chronicle no trae el dato. */
const EMPTY = '—';

/** Tiempo de limpieza legible: `'4 min 32 s'`, `'5 min'`, `'58 s'`, `'—'` si no hay. */
export function formatClearTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return EMPTY;

  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;

  if (minutes === 0) return `${rest} s`;
  if (rest === 0) return `${minutes} min`;
  return `${minutes} min ${rest} s`;
}

/**
 * Percentil de la temporada: `'Top 2,5%'`.
 *
 * El backend ya lo manda en porcentaje, así que se reescala a la convención de Enka
 * (100 = 1%) para reusar el formateo con coma decimal de `stats.ts`.
 */
export function formatRankPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) return EMPTY;
  return `Top ${formatStatValue(percent * 100, '{0:0.#%}')}`;
}

/** Las corridas de un modo, de la temporada más nueva a la más vieja; sin fecha van al final. */
export function groupRunsByMode(runs: ChallengeRunRead[], mode: ChallengeMode): ChallengeRunRead[] {
  return runs
    .filter((run) => run.mode === mode)
    .sort((left, right) => {
      const leftMs = beginMs(left);
      const rightMs = beginMs(right);
      return leftMs === rightMs ? 0 : rightMs - leftMs;
    });
}

/** Los pisos agrupados por capa, de la más alta a la más baja y por posición dentro de cada una. */
export function groupEntriesByLayer(entries: ChallengeEntryRead[]): LayerGroup[] {
  const layers = new Map<number | null, ChallengeEntryRead[]>();
  for (const entry of entries) {
    const bucket = layers.get(entry.layer_index);
    if (bucket) bucket.push(entry);
    else layers.set(entry.layer_index, [entry]);
  }

  return [...layers.entries()]
    .map(([layerIndex, group]) => ({
      layerIndex,
      entries: [...group].sort((left, right) => left.position - right.position),
    }))
    .sort((left, right) => layerOrder(right.layerIndex) - layerOrder(left.layerIndex));
}

/** Estrellas acumuladas por capa, para pintar la fila de capas jugadas. */
export function layerSummary(entries: ChallengeEntryRead[]): Record<number, number> {
  const stars: Record<number, number> = {};
  for (const entry of entries) {
    if (entry.layer_index === null) continue;
    stars[entry.layer_index] = (stars[entry.layer_index] ?? 0) + entry.stars;
  }
  return stars;
}

/** Los bangboos usan la misma escala de rangos que los agentes. */
export function bangbooRankLabel(rarity: number | null): string | null {
  return rarityLabel(rarity);
}

function beginMs(run: ChallengeRunRead): number {
  const parsed = run.begin_time ? Date.parse(run.begin_time) : Number.NaN;
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function layerOrder(layerIndex: number | null): number {
  return layerIndex ?? Number.NEGATIVE_INFINITY;
}
