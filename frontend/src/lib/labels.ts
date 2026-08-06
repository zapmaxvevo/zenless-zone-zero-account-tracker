/** Traducciones de los valores que Enka publica en inglés; si aparece uno nuevo, se muestra crudo. */

const ELEMENTS: Record<string, string> = {
  Physics: 'Físico',
  Fire: 'Fuego',
  Ice: 'Hielo',
  Electric: 'Eléctrico',
  Ether: 'Éter',
  AuricInk: 'Tinta áurica',
  Frost: 'Escarcha',
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

const RARITIES: Record<number, string> = { 2: 'B', 3: 'A', 4: 'S', 5: 'S' };

/** Los índices que usa Enka; el 4 no existe. */
export const SKILL_KEYS = ['0', '1', '2', '3', '5', '6'];

export function elementLabel(element: string): string {
  return ELEMENTS[element] ?? element;
}

export function professionLabel(profession: string | null): string | null {
  if (!profession) return null;
  return PROFESSIONS[profession] ?? profession;
}

export function skillLabel(key: string): string {
  return SKILLS[key] ?? `Habilidad ${key}`;
}

/** Rango del juego (S/A/B); Enka usa 4 para S en agentes y 5 en W-Engines. */
export function rarityLabel(rarity: number | null): string | null {
  if (rarity === null) return null;
  return RARITIES[rarity] ?? `R${rarity}`;
}

/** Nombre resuelto por el backend, con el id crudo como respaldo. */
export function nameOr(name: string | null, prefix: string, id: number): string {
  return name ?? `${prefix} ${id}`;
}
