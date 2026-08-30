import type { ElementKey } from './elements';
import { elementKey } from './elements';

const NEUTRAL = 'var(--border-strong)';

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

const RANKS: Record<string, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
  I: 'var(--rank-s)',
};

export function elementColor(element: string | null | undefined): string {
  const key = elementKey(element);
  return key === null ? NEUTRAL : ELEMENTS[key];
}

export function elementsColor(elements: readonly string[] | null | undefined): string {
  return elementColor(elements?.[0]);
}

export function rankColor(rank: string | null | undefined): string {
  if (!rank) return NEUTRAL;
  return RANKS[rank.toUpperCase()] ?? NEUTRAL;
}

export function rarityColor(rarity: number | null | undefined): string {
  const letter: Record<number, string> = { 2: 'B', 3: 'A', 4: 'S' };
  return rankColor(rarity == null ? null : letter[rarity]);
}

export type Grade = 'S' | 'A' | 'B' | 'C';

const GRADE_COLORS: Record<Grade, string> = {
  S: 'var(--rank-s)',
  A: 'var(--rank-a)',
  B: 'var(--rank-b)',
  C: '#7a808f',
};

export function grade(score: number): Grade {
  if (score >= 88) return 'S';
  if (score >= 72) return 'A';
  if (score >= 50) return 'B';
  return 'C';
}

export function gradeColor(score: number): string {
  return GRADE_COLORS[grade(score)];
}

export function gradeLetterColor(letter: Grade): string {
  return GRADE_COLORS[letter];
}

export function gradeLabel(score: number): string {
  return `Rango ${grade(score)}`;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '??';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
