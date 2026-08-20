/**
 * Score de build: cuánto aportan los discos de un agente a lo que ese agente necesita.
 *
 * El modelo sale del diseño de New Eridu (ver docs/DESIGN.md): cada subestadística vale
 * según lo difícil que es sacarla, y solo cuenta entera si es una de las cuatro que le
 * sirven a la especialidad del agente; las demás suman un cuarto. Es una heurística para
 * ordenar el roster de un vistazo, no una simulación de daño.
 */

import type { AgentRead, DriveDiscRead, StatRead } from '../api/types';

/** Las claves con las que trabaja el modelo, agnósticas del id de Enka. */
export type SubKey =
  'crit' | 'critdmg' | 'atkp' | 'atk' | 'pen' | 'ap' | 'hpp' | 'hp' | 'defp' | 'def';

/** Cuánto vale una tirada de cada subestadística. */
const WEIGHTS: Record<SubKey, number> = {
  crit: 2.0,
  critdmg: 1.0,
  atkp: 1.0,
  atk: 0.33,
  pen: 1.0,
  ap: 0.66,
  hpp: 0.4,
  hp: 0.2,
  defp: 0.4,
  def: 0.2,
};

/** Los prop id de Enka para las subestadísticas de disco (ver `data/static/property.json`). */
const BY_PROP_ID: Record<number, SubKey> = {
  11102: 'hpp',
  11103: 'hp',
  12102: 'atkp',
  12103: 'atk',
  13102: 'defp',
  13103: 'def',
  20103: 'crit',
  21103: 'critdmg',
  23103: 'pen',
  23203: 'pen',
  31203: 'ap',
};

/** Respaldo por nombre crudo de Enka, por si aparece un id nuevo de la misma propiedad. */
const BY_NAME: Record<string, SubKey> = {
  crit: 'crit',
  critdmg: 'critdmg',
  atk_ratio: 'atkp',
  atk: 'atk',
  hpmax_ratio: 'hpp',
  hpmax: 'hp',
  def_ratio: 'defp',
  def: 'def',
  penratio: 'pen',
  pendelta: 'pen',
  elementmystery: 'ap',
};

/**
 * Las cuatro subestadísticas que suman entero según la especialidad.
 *
 * `Rupture` no existía cuando se hizo el diseño: se le asignan las de `Stun`, que es la
 * especialidad con la que comparte el foco en romper la defensa.
 */
const KEY_SUBS: Record<string, readonly SubKey[]> = {
  Attack: ['crit', 'critdmg', 'atkp', 'pen'],
  Stun: ['atkp', 'crit', 'critdmg', 'atk'],
  Anomaly: ['ap', 'atkp', 'pen', 'crit'],
  Support: ['atkp', 'crit', 'critdmg', 'ap'],
  Defense: ['defp', 'hpp', 'atkp', 'crit'],
  Rupture: ['atkp', 'crit', 'critdmg', 'atk'],
};

const DEFAULT_KEYS = KEY_SUBS.Attack;

/** Lo que rinde un disco muy bueno: fija el 100% de la barra y el máximo del build. */
const DISC_CEILING = 55;

const SLOTS = 6;

export function subKey(stat: Pick<StatRead, 'prop_id' | 'name'>): SubKey | null {
  const byId = BY_PROP_ID[stat.prop_id];
  if (byId) return byId;
  return BY_NAME[(stat.name ?? '').toLowerCase()] ?? null;
}

/** Las cuatro que le suman a esta especialidad. */
export function keySubs(profession: string | null): readonly SubKey[] {
  return (profession && KEY_SUBS[profession]) || DEFAULT_KEYS;
}

export function isKeySub(
  stat: Pick<StatRead, 'prop_id' | 'name'>,
  profession: string | null,
): boolean {
  const key = subKey(stat);
  return key !== null && keySubs(profession).includes(key);
}

/**
 * Tiradas efectivas de una subestadística.
 *
 * Enka publica en `rolls` las mejoras posteriores; la tirada inicial no se cuenta ahí, así
 * que el modelo suma una.
 */
export function effectiveRolls(stat: Pick<StatRead, 'rolls'>): number {
  return Math.max(0, stat.rolls) + 1;
}

/** Score crudo de un disco, en la escala del diseño (un disco excelente ronda 55). */
export function discScore(disc: DriveDiscRead, profession: string | null): number {
  const keys = keySubs(profession);
  const raw = disc.substats.reduce((total, stat) => {
    const key = subKey(stat);
    if (key === null) return total;
    const weight = WEIGHTS[key] * (keys.includes(key) ? 1 : 0.25);
    return total + effectiveRolls(stat) * weight;
  }, 0);
  return Math.round(raw * 6);
}

/** Cuánto de la barra llena un disco, de 0 a 100. */
export function discFill(score: number): number {
  return Math.min(100, Math.round((score / DISC_CEILING) * 100));
}

/** Nota de un disco. Los cortes son los del diseño, sobre el score crudo. */
export function discGrade(score: number): 'S' | 'A' | 'B' | 'C' {
  if (score >= 42) return 'S';
  if (score >= 32) return 'A';
  if (score >= 22) return 'B';
  return 'C';
}

/**
 * Score de build de 0 a 100: los seis discos contra seis discos excelentes.
 *
 * Un slot vacío no se saltea, cuenta cero: media build es media nota.
 */
export function buildScore(discs: readonly DriveDiscRead[], profession: string | null): number {
  const total = discs.reduce((sum, disc) => sum + discScore(disc, profession), 0);
  return Math.min(100, Math.round((total / (SLOTS * DISC_CEILING)) * 100));
}

/** El score de un agente del roster, que llega sin el detalle de sus discos. */
export interface ScoredAgent {
  agent: AgentRead;
  score: number;
}

/**
 * Aproximación para el roster: sin los discos, el score sale del nivel, el mindscape y
 * cuántos discos tiene equipados. Se reemplaza por `buildScore` en cuanto hay detalle.
 */
export function rosterScore(agent: AgentRead): number {
  const level = Math.min(60, Math.max(0, agent.level)) / 60;
  const discs = Math.min(SLOTS, Math.max(0, agent.disc_count)) / SLOTS;
  const engine = agent.wengine ? 1 : 0;
  const mindscape = Math.min(6, Math.max(0, agent.mindscape_level)) / 6;
  const weighted = discs * 0.5 + level * 0.28 + engine * 0.14 + mindscape * 0.08;
  return Math.round(weighted * 100);
}
