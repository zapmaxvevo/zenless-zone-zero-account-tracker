import type { AgentRead, DriveDiscRead, StatRead } from '../api/types';

export type SubKey =
  'crit' | 'critdmg' | 'atkp' | 'atk' | 'pen' | 'ap' | 'hpp' | 'hp' | 'defp' | 'def';

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

const KEY_SUBS: Record<string, readonly SubKey[]> = {
  Attack: ['crit', 'critdmg', 'atkp', 'pen'],
  Stun: ['atkp', 'crit', 'critdmg', 'atk'],
  Anomaly: ['ap', 'atkp', 'pen', 'crit'],
  Support: ['atkp', 'crit', 'critdmg', 'ap'],
  Defense: ['defp', 'hpp', 'atkp', 'crit'],
  Rupture: ['atkp', 'crit', 'critdmg', 'atk'],
};

const DEFAULT_KEYS = KEY_SUBS.Attack;

const DISC_CEILING = 55;

const SLOTS = 6;

export function subKey(stat: Pick<StatRead, 'prop_id' | 'name'>): SubKey | null {
  const byId = BY_PROP_ID[stat.prop_id];
  if (byId) return byId;
  return BY_NAME[(stat.name ?? '').toLowerCase()] ?? null;
}

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

export function effectiveRolls(stat: Pick<StatRead, 'rolls'>): number {
  return Math.max(0, stat.rolls);
}

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

export function discFill(score: number): number {
  return Math.min(100, Math.round((score / DISC_CEILING) * 100));
}

export function discGrade(score: number): 'S' | 'A' | 'B' | 'C' {
  if (score >= 42) return 'S';
  if (score >= 32) return 'A';
  if (score >= 22) return 'B';
  return 'C';
}

export function buildScore(discs: readonly DriveDiscRead[], profession: string | null): number {
  const total = discs.reduce((sum, disc) => sum + discScore(disc, profession), 0);
  return Math.min(100, Math.round((total / (SLOTS * DISC_CEILING)) * 100));
}

export interface ScoredAgent {
  agent: AgentRead;
  score: number;
}

export function rosterScore(agent: AgentRead): number {
  const level = Math.min(60, Math.max(0, agent.level)) / 60;
  const discs = Math.min(SLOTS, Math.max(0, agent.disc_count)) / SLOTS;
  const engine = agent.wengine ? 1 : 0;
  const mindscape = Math.min(6, Math.max(0, agent.mindscape_level)) / 6;
  const weighted = discs * 0.5 + level * 0.28 + engine * 0.14 + mindscape * 0.08;
  return Math.round(weighted * 100);
}
