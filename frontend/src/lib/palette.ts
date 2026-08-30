/**
 * El color sale del dato, nunca del gusto (regla 7 de docs/DESIGN.md).
 *
 * La clave de entrada la normaliza `elements.ts`, que acepta tanto los nombres de Enka
 * (`Fire`, `Elec`, `AuricEther`) como los códigos de HoYoLAB (`"203"`). Un valor desconocido
 * devuelve el gris de borde en vez de romper: si mañana sale un atributo nuevo, la pantalla
 * se dibuja igual.
 */

import type { AgentSource } from '../api/types';
import type { ElementKey } from './elements';
import { elementKey } from './elements';

const NEUTRAL = 'var(--border-strong)';

/**
 * Un sub-atributo comparte el color de su elemento padre: Escarcha el celeste del hielo,
 * Tinta áurica el rosa del éter y Embestida el amarillo del físico.
 */
const ELEMENTS: Record<ElementKey, string> = {
  Physics: 'var(--element-physics)',
  Fire: 'var(--element-fire)',
  Ice: 'var(--element-ice)',
  Electric: 'var(--element-electric)',
  Ether: 'var(--element-ether)',
  Frost: 'var(--element-ice)',
  AuricInk: 'var(--element-ether)',
  Assault: 'var(--element-physics)',
  Wind: 'var(--element-wind)',
  Lumiflux: 'var(--element-lumiflux)',
};

/**
 * De dónde salió un agente.
 *
 * `enka` es el import por defecto y no se marca en pantalla. De los otros dos, el que vino
 * de una sincronización viva se pinta con el verde de estado y el tipeado a mano queda en
 * gris: es metadato, no un dato del juego, así que no toca la paleta de elementos.
 */
const SOURCES: Record<AgentSource, string> = {
  enka: NEUTRAL,
  hoyolab: 'var(--green)',
  manual: 'var(--text-dim)',
};

const RANKS: Record<string, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
};

export function elementColor(element: string | null | undefined): string {
  const key = elementKey(element);
  return key === null ? NEUTRAL : ELEMENTS[key];
}

/** Color de la fuente de un agente; una fuente desconocida no inventa color. */
export function sourceColor(source: AgentSource | null | undefined): string {
  if (!source) return NEUTRAL;
  return SOURCES[source] ?? NEUTRAL;
}

/** El primero de la lista manda: define el aro, la banda y la franja de la card. */
export function elementsColor(elements: readonly string[] | null | undefined): string {
  return elementColor(elements?.[0]);
}

/** Rango por letra, ya resuelta por `rarityLabel`. */
export function rankColor(rank: string | null | undefined): string {
  if (!rank) return NEUTRAL;
  return RANKS[rank.toUpperCase()] ?? NEUTRAL;
}

/** Rango por la rareza cruda de Enka, con la misma escala 2..4 = B/A/S. */
export function rarityColor(rarity: number | null | undefined): string {
  const letter: Record<number, string> = { 2: 'B', 3: 'A', 4: 'S' };
  return rankColor(rarity == null ? null : letter[rarity]);
}

/** Nota de un build o un disco, de 0 a 100. */
export type Grade = 'S' | 'A' | 'B' | 'C';

const GRADE_COLORS: Record<Grade, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
  C: '#7a808f',
};

/** Los cortes son los del diseño: 88 / 72 / 50 sobre 100. */
export function grade(score: number): Grade {
  if (score >= 88) return 'S';
  if (score >= 72) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

export function gradeColor(score: number): string {
  return GRADE_COLORS[grade(score)];
}

/** El color de una nota ya calculada; los discos usan su propia escala (`lib/score.ts`). */
export function gradeLetterColor(letter: Grade): string {
  return GRADE_COLORS[letter];
}

export function gradeLabel(score: number): string {
  return `Rango ${grade(score)}`;
}

/** Iniciales para cuando no hay retrato: `Ellen Joe` → `EJ`, `Anby` → `AN`. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
