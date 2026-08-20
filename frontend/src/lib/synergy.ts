/**
 * Sinergia de un equipo, con lo poco que la API sabe de él.
 *
 * No hay datos de daño, de buffs ni de rotación: lo único que el roster publica de los tres
 * miembros son sus elementos y su especialidad. Dos agentes del mismo elemento resuenan,
 * tres especialidades distintas se cubren entre sí y un slot vacío se paga. Es una lectura
 * de un vistazo, no una evaluación del equipo.
 */

import type { AgentRead } from '../api/types';
import { elementLabel, professionLabel } from './labels';
import { TEAM_SLOTS } from './teams';

export type SynergyLevel = 'Alta' | 'Media' | 'Baja';

export interface Synergy {
  /** `null` cuando el roster no trae ni elementos ni especialidades: no hay con qué opinar. */
  level: SynergyLevel | null;
  /** El porqué del nivel: el elemento que resuena, la especialidad repetida o el slot libre. */
  detail: string | null;
  /** Lo que se muestra: `Alta · Hielo x2`, `Media`, `Baja · Slot vacío`, `—`. */
  label: string;
}

interface Repeat {
  value: string;
  count: number;
}

/** El valor que más se repite, o `null` si están todos una sola vez. */
function repeated(values: readonly string[]): Repeat | null {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let top: Repeat | null = null;
  for (const [value, count] of counts) {
    if (count > 1 && (top === null || count > top.count)) top = { value, count };
  }
  return top;
}

function build(level: SynergyLevel | null, detail: string | null): Synergy {
  if (level === null) return { level, detail: null, label: '—' };
  return { level, detail, label: detail ? `${level} · ${detail}` : level };
}

/**
 * La sinergia de los miembros presentes de un equipo.
 *
 * Resonar suma el doble que cubrir los roles: un elemento repetido es un bonus real del
 * juego, mientras que tres especialidades distintas son apenas un equipo bien armado.
 */
export function teamSynergy(members: readonly AgentRead[]): Synergy {
  if (members.length < TEAM_SLOTS.length) return build('Baja', 'Slot vacío');

  const elements = members
    .map((member) => member.elements[0])
    .filter((element): element is string => Boolean(element));
  const professions = members
    .map((member) => member.profession)
    .filter((profession): profession is string => profession !== null);

  if (elements.length === 0 && professions.length === 0) return build(null, null);

  const resonance = repeated(elements);
  const overlap = repeated(professions);
  const covered = overlap === null && professions.length === members.length;

  const points = (resonance ? 2 : 0) + (covered ? 1 : 0);
  const level: SynergyLevel = points >= 2 ? 'Alta' : points === 1 ? 'Media' : 'Baja';

  if (resonance) {
    return build(level, `${elementLabel(resonance.value)} x${resonance.count}`);
  }
  if (overlap) {
    return build(level, `${professionLabel(overlap.value) ?? overlap.value} x${overlap.count}`);
  }
  return build(level, null);
}
