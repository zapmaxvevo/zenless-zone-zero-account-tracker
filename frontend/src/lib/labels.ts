/** Traducciones de los valores que Enka publica en inglés; si aparece uno nuevo, se muestra crudo. */

import type { AgentSource } from '../api/types';
import type { ElementKey } from './elements';
import { elementKey } from './elements';

/** Por atributo canónico, no por clave cruda: los alias los resuelve `elements.ts`. */
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

/** De dónde salió un agente. `enka` es el import por defecto y la UI no lo marca. */
const SOURCES: Record<AgentSource, string> = {
  enka: 'Enka',
  hoyolab: 'HoYoLAB',
  manual: 'Manual',
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

/** ZZZ rankea por letra, no por estrellas, y la escala llega hasta 4: no hay rareza 5. */
const RARITIES: Record<number, string> = { 2: 'B', 3: 'A', 4: 'S' };

/** Los índices que usa Enka; el 4 no existe. */
export const SKILL_KEYS = ['0', '1', '2', '3', '5', '6'];

export function elementLabel(element: string): string {
  const key = elementKey(element);
  return key === null ? element : ELEMENTS[key];
}

export function sourceLabel(source: AgentSource): string {
  return SOURCES[source];
}

export function professionLabel(profession: string | null): string | null {
  if (!profession) return null;
  return PROFESSIONS[profession] ?? profession;
}

export function skillLabel(key: string): string {
  return SKILLS[key] ?? `Habilidad ${key}`;
}

/**
 * Rango del juego: S, A o B.
 *
 * Vale igual para agentes, W-Engines y discos — los tres usan la misma escala 2..4.
 * Un valor fuera de ella se muestra crudo en vez de inventarle una letra.
 */
export function rarityLabel(rarity: number | null): string | null {
  if (rarity === null) return null;
  return RARITIES[rarity] ?? `R${rarity}`;
}

/** Los códigos de servidor que devuelve el backend (ver `storage/models.py`). */
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

/** Nombre resuelto por el backend, con el id crudo como respaldo. */
export function nameOr(name: string | null, prefix: string, id: number): string {
  return name ?? `${prefix} ${id}`;
}
