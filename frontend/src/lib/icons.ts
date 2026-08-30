/**
 * Iconos del juego bajados de la wiki (ver `scripts/fetch_wiki_icons.py`).
 *
 * Vite resuelve los PNG a URLs con hash en build, así que se importan de una
 * sola vez y se buscan por clave. Las claves de entrada son las que publica
 * Enka —las mismas que traduce `labels.ts`—, no los nombres de archivo.
 */

import { elementKey } from './elements';

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

/**
 * Atributo del agente. El nombre canónico dice `AuricInk`; el archivo, `auric-ink`.
 *
 * Pasa por `elementKey` para que los alias de Enka (`Elec`, `AuricEther`) den con el mismo
 * archivo. Un atributo que la wiki todavía no ilustra se dibuja sin icono.
 */
export function elementIcon(element: string): string | null {
  const key = elementKey(element);
  return lookup('element', key && key.replace(/(?<=.)([A-Z])/g, '-$1').toLowerCase());
}

/** Especialidad: `Attack`, `Stun`, `Anomaly`, `Support`, `Defense`, `Rupture`. */
export function professionIcon(profession: string | null): string | null {
  return lookup('profession', profession && profession.toLowerCase());
}

/**
 * Rango por su letra ya resuelta (`rarityLabel` / `agentRankLabel`), no por la rareza cruda.
 *
 * El icono trae el color del rango puesto —S dorado, A violeta, B celeste—, así que un tag
 * de rango dibujado con icono no necesita teñirse aparte. Pyrois tiene su propia letra.
 */
export function rankIcon(rank: string | null): string | null {
  return lookup('rank', rank && rank.toLowerCase());
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
