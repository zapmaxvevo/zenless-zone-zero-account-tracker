import { elementKey } from './elements';

const FILES = import.meta.glob('../assets/icons/*/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const BY_KEY: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [
    path.replace('../assets/icons/', '').replace('.png', ''),
    url,
  ]),
);

function lookup(group: string, key: string | null): string | null {
  if (!key) return null;
  return BY_KEY[`${group}/${key}`] ?? null;
}

export function elementIcon(element: string): string | null {
  const key = elementKey(element);
  return lookup('element', key && key.replace(/(?<=.)([A-Z])/g, '-$1').toLowerCase());
}

export function professionIcon(profession: string | null): string | null {
  return lookup('profession', profession && profession.toLowerCase());
}

export function rankIcon(rank: string | null): string | null {
  return lookup('rank', rank && rank.toLowerCase());
}

export function attackIcon(attack: string | null): string | null {
  return lookup('attack', attack && attack.toLowerCase());
}

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
