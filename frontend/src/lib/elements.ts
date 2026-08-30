/**
 * Un nombre canónico por atributo, venga de donde venga el dato.
 *
 * El mismo atributo llega con nombres distintos según la fuente: Enka publica `Elec`,
 * `FireFrost`, `AuricEther` y `ZhenZhenAssault` en el `ElementTypes` de sus datos estáticos
 * —los sub-atributos van primeros y son los que mandan—, mientras que HoYoLAB manda códigos
 * numéricos (`"203"`). Antes esas claves se traducían por separado en `palette.ts`,
 * `labels.ts`, `icons.ts` y la tabla suelta de `ChallengeAttempt.tsx`, y las que ninguna
 * conocía —Eléctrico entre ellas— caían en el gris neutro.
 *
 * Todo lo que pinta, etiqueta o ilustra un atributo pasa primero por `elementKey()`: un
 * atributo nuevo se agrega acá una sola vez y las cuatro tablas lo heredan.
 */

/** Los atributos que la app sabe dibujar, incluidos los sub-atributos. */
export type ElementKey =
  | 'Physics'
  | 'Fire'
  | 'Ice'
  | 'Electric'
  | 'Ether'
  | 'Frost'
  | 'AuricInk'
  | 'Assault'
  | 'Wind'
  | 'Lumiflux';

/** Claves crudas, ya sin separadores y en minúscula. Un alias nuevo se agrega acá. */
const ALIASES: Record<string, ElementKey> = {
  physics: 'Physics',
  fire: 'Fire',
  ice: 'Ice',
  elec: 'Electric',
  electric: 'Electric',
  ether: 'Ether',
  frost: 'Frost',
  firefrost: 'Frost',
  auricink: 'AuricInk',
  auricether: 'AuricInk',
  assault: 'Assault',
  zhenzhenassault: 'Assault',
  wind: 'Wind',
  lumen: 'Lumiflux',
  lumiflux: 'Lumiflux',
};

/**
 * Los códigos de `element_type` que manda HoYoLAB.
 *
 * Salen de las capturas de la cuenta y de `tests/fixtures/hoyolab_*.json`. El de Viento
 * todavía no apareció en ninguna, así que no se inventa: un código desconocido cae en el
 * gris neutro y el chip se dibuja igual.
 *
 * HoYoLAB manda el sub-atributo aparte, en `sub_element_type` (1 Escarcha, 2 Tinta áurica,
 * 4 Embestida), pero el backend todavía no lo propaga; hasta que lo haga, un agente de
 * sub-atributo llega al Chronicle con el color de su elemento padre.
 */
const BY_CODE: Record<string, ElementKey> = {
  '200': 'Physics',
  '201': 'Fire',
  '202': 'Ice',
  '203': 'Electric',
  '205': 'Ether',
  '300': 'Lumiflux',
};

/** El atributo canónico, o `null` si es uno que la app todavía no conoce. */
export function elementKey(element: string | null | undefined): ElementKey | null {
  if (!element) return null;
  const raw = element.trim();
  const byCode = BY_CODE[raw];
  if (byCode) return byCode;
  return ALIASES[raw.replace(/[^a-zA-Z]/g, '').toLowerCase()] ?? null;
}
