import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KEY_PREFIX,
  consumeKeyFromUrl,
  forgetKey,
  keyFromHash,
  looksLikeKey,
  normalizeKey,
  readKey,
  saveKey,
  storageKey,
  subscribe,
} from './accountKey';

const UID = '1300000000';
const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const entries = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
  return entries;
}

function stubBlockedStorage(): void {
  vi.stubGlobal('localStorage', {
    getItem: () => null,
    setItem: () => {
      throw new Error('storage bloqueado');
    },
    removeItem: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('guardar la key', () => {
  it('la guarda bajo el uid al que pertenece y la vuelve a leer', () => {
    const entries = stubStorage();

    expect(saveKey(UID, KEY)).toBe(true);

    expect(entries.get(storageKey(UID))).toBe(KEY);
    expect(readKey(UID)).toBe(KEY);
    expect(readKey('1300000001')).toBeNull();
  });

  it('recorta lo pegado y descarta lo que quede vacío', () => {
    stubStorage();

    expect(saveKey(UID, `  ${KEY}\n`)).toBe(true);
    expect(readKey(UID)).toBe(KEY);

    expect(saveKey(UID, '   ')).toBe(false);
    expect(readKey(UID)).toBe(KEY);
  });

  it('olvida la key de un uid sin tocar la de otro', () => {
    stubStorage();
    saveKey(UID, KEY);
    saveKey('1300000001', `${KEY_PREFIX}otra`);

    forgetKey(UID);

    expect(readKey(UID)).toBeNull();
    expect(readKey('1300000001')).toBe(`${KEY_PREFIX}otra`);
  });

  it('avisa que no pudo guardar cuando el navegador bloquea el storage', () => {
    stubBlockedStorage();

    expect(saveKey(UID, KEY)).toBe(false);
    expect(readKey(UID)).toBeNull();
  });

  it('sin storage se comporta como alguien que no tiene la key, no rompe', () => {
    vi.stubGlobal('localStorage', undefined);

    expect(readKey(UID)).toBeNull();
    expect(saveKey(UID, KEY)).toBe(false);
    expect(() => forgetKey(UID)).not.toThrow();
  });

  it('avisa a los suscriptores cuando la key cambia', () => {
    stubStorage();
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    saveKey(UID, KEY);
    forgetKey(UID);
    unsubscribe();
    saveKey(UID, KEY);

    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('forma de la key', () => {
  it('reconoce la key que emite el backend y rechaza cualquier otra cosa', () => {
    expect(looksLikeKey(KEY)).toBe(true);
    expect(looksLikeKey(`  ${KEY}  `)).toBe(true);
    expect(looksLikeKey(KEY_PREFIX)).toBe(false);
    expect(looksLikeKey('v2_CAISDGM5')).toBe(false);
    expect(looksLikeKey('')).toBe(false);
  });

  it('normaliza a null lo que no sirve para mandar en un header', () => {
    expect(normalizeKey(` ${KEY} `)).toBe(KEY);
    expect(normalizeKey('  ')).toBeNull();
  });
});

describe('el fragmento con el que la extensión abre la app', () => {
  it('lee la key del #key= y deja pasar cualquier otro fragmento', () => {
    expect(keyFromHash(`#key=${KEY}`)).toBe(KEY);
    expect(keyFromHash(`key=${KEY}`)).toBe(KEY);
    expect(keyFromHash('#seccion=discos')).toBeNull();
    expect(keyFromHash('#key=')).toBeNull();
    expect(keyFromHash('')).toBeNull();
  });

  it('consume la key, la guarda para el uid abierto y limpia la URL', () => {
    stubStorage();
    const replaced: string[] = [];

    const consumed = consumeKeyFromUrl(
      UID,
      { pathname: `/account/${UID}`, search: '', hash: `#key=${KEY}` },
      (next) => replaced.push(next),
    );

    expect(consumed).toBe(KEY);
    expect(readKey(UID)).toBe(KEY);
    expect(replaced).toEqual([`/account/${UID}`]);
  });

  it('conserva la query al limpiar y no toca la URL si no venía key', () => {
    stubStorage();
    const replaced: string[] = [];

    consumeKeyFromUrl(
      UID,
      { pathname: `/account/${UID}/agents`, search: '?orden=score', hash: `#key=${KEY}` },
      (next) => replaced.push(next),
    );
    consumeKeyFromUrl(UID, { pathname: `/account/${UID}`, search: '', hash: '#nada' }, (next) =>
      replaced.push(next),
    );

    expect(replaced).toEqual([`/account/${UID}/agents?orden=score`]);
  });

  it('limpia la URL igual cuando no hay uid al que atribuirle la key', () => {
    stubStorage();
    const replaced: string[] = [];

    const consumed = consumeKeyFromUrl(
      '',
      { pathname: '/', search: '', hash: `#key=${KEY}` },
      (next) => replaced.push(next),
    );

    expect(consumed).toBeNull();
    expect(replaced).toEqual(['/']);
  });
});
