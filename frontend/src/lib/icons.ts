/**
 * Iconos del juego bajados de la wiki (ver `scripts/fetch_wiki_icons.py`).
 *
 * Vite resuelve los PNG a URLs con hash en build, así que se importan de una
 * sola vez y se buscan por clave. Las claves de entrada son las que publica
 * Enka —las mismas que traduce `labels.ts`—, no los nombres de archivo.
 */

const FILES = import.meta.glob('../assets/icons/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** `../assets/icons/element/fire.png` -> `element/fire` */
const BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [
    path.replace('../assets/icons/', '').replace('.png', ''),
    url,
  ]),
);

/** Un icono que no está bajado no rompe la página: se dibuja sin imagen. */
function lookup(group: string, key: string | null): string | null {
  if (!key) return null;
  return BY_KEY[`${group}/${key}`] ?? null;
}

/** Atributo del agente. Enka dice `Physics` y `AuricInk`; el archivo, `physics` y `auric-ink`. */
export function elementIcon(element: string): string | null {
  return lookup('element', element.replace(/(?<=.)([A-Z])/g, '-$1').toLowerCase());
}

/** Especialidad: `Attack`, `Stun`, `Anomaly`, `Support`, `Defense`, `Rupture`. */
export function professionIcon(profession: string | null): string | null {
  return lookup('profession', profession && profession.toLowerCase());
}

/** Rango por rareza numérica, con la misma escala 2..4 = B/A/S que `rarityLabel`. */
export function rankIcon(rarity: number | null): string | null {
  const letter: Record<number, string> = { 2: 'b', 3: 'a', 4: 's' };
  return lookup('rank', rarity === null ? null : (letter[rarity] ?? null));
}

/** Tipo de ataque: `Slash`, `Strike`, `Pierce`. */
export function attackIcon(attack: string | null): string | null {
  return lookup('attack', attack && attack.toLowerCase());
}

/** Habilidad por el índice de Enka, en el mismo orden que `SKILL_KEYS`. */
const SKILL_FILES: Record<string, string> = {
  '0': 'basic-attack',
  '1': 'special-attack',
  '2': 'dodge',
  '3': 'chain-attack',
  '5': 'core-skill',
  '6': 'assist',
};

export function skillIcon(key: string): string | null {
  return lookup('skill', SKILL_FILES[key] ?? null);
}
