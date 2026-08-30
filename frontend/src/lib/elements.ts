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

const BY_CODE: Record<string, ElementKey> = {
  '200': 'Physics',
  '201': 'Fire',
  '202': 'Ice',
  '203': 'Electric',
  '205': 'Ether',
  '300': 'Lumiflux',
};

export function elementKey(element: string | null | undefined): ElementKey | null {
  if (!element) return null;
  const raw = element.trim();
  const byCode = BY_CODE[raw];
  if (byCode) return byCode;
  return ALIASES[raw.replace(/[^a-zA-Z]/g, '').toLowerCase()] ?? null;
}
