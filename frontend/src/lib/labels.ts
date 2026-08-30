import type { ElementKey } from './elements';
import { elementKey } from './elements';

const ELEMENTS: Record<ElementKey, string> = {
  Physics: 'Físico',
  Fire: 'Fuego',
  Ice: 'Hielo',
  Electric: 'Eléctrico',
  Ether: 'Éter',
  Frost: 'Escarcha',
  AuricInk: 'Tinta áurica',
  Assault: 'Embestida',
  Wind: 'Viento',
  Lumiflux: 'Lumiflujo',
};

const PROFESSIONS: Record<string, string> = {
  Attack: 'Ataque',
  Stun: 'Aturdimiento',
  Anomaly: 'Anomalía',
  Support: 'Apoyo',
  Defense: 'Defensa',
  Rupture: 'Ruptura',
};

const SKILLS: Record<string, string> = {
  '0': 'Ataque básico',
  '1': 'Habilidad especial',
  '2': 'Esquiva',
  '3': 'Ataque en cadena',
  '5': 'Habilidad central',
  '6': 'Asistencia',
};

const RARITIES: Record<number, string> = { 2: 'B', 3: 'A', 4: 'S' };

export const SKILL_KEYS = ['0', '1', '2', '3', '5', '6'];

export function elementLabel(element: string): string {
  const key = elementKey(element);
  return key === null ? element : ELEMENTS[key];
}

export function professionLabel(profession: string | null): string | null {
  if (!profession) return null;
  return PROFESSIONS[profession] ?? profession;
}

export function skillLabel(key: string): string {
  return SKILLS[key] ?? `Habilidad ${key}`;
}

export function rarityLabel(rarity: number | null): string | null {
  if (rarity === null) return null;
  return RARITIES[rarity] ?? `R${rarity}`;
}

const SPECIAL_RANKS: Record<number, string> = { 1551: 'I' };

export function agentRankLabel(rarity: number | null, gameId: number): string | null {
  return SPECIAL_RANKS[gameId] ?? rarityLabel(rarity);
}

const REGIONS: Record<string, string> = {
  prod_gf_us: 'América',
  prod_gf_jp: 'Asia',
  prod_gf_eu: 'Europa',
  prod_gf_sg: 'TW/HK/MO',
  prod_gf_cn: 'China',
};

export function regionLabel(region: string | null | undefined): string | null {
  if (!region) return null;
  return REGIONS[region] ?? region;
}

export function nameOr(name: string | null, prefix: string, id: number): string {
  return name ?? `${prefix} ${id}`;
}
