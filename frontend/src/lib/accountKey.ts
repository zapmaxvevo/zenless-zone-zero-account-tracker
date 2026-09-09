const STORAGE_PREFIX = 'zzz.key.';
const FRAGMENT_PARAM = 'key';

export const KEY_PREFIX = 'zzk_';

type Listener = () => void;

const listeners = new Set<Listener>();

function usableStorage(): Storage | null {
  try {
    const store = globalThis.localStorage as Storage | undefined;
    return typeof store?.getItem === 'function' ? store : null;
  } catch {
    return null;
  }
}

function notifyListeners(): void {
  for (const listener of [...listeners]) listener();
}

export function storageKey(uid: string): string {
  return `${STORAGE_PREFIX}${uid}`;
}

export function normalizeKey(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function looksLikeKey(value: string): boolean {
  const key = normalizeKey(value);
  return key !== null && key.startsWith(KEY_PREFIX) && key.length > KEY_PREFIX.length;
}

export function readKey(uid: string): string | null {
  if (!uid) return null;
  try {
    return normalizeKey(usableStorage()?.getItem(storageKey(uid)) ?? '');
  } catch {
    return null;
  }
}

export function saveKey(uid: string, value: string): boolean {
  const key = uid ? normalizeKey(value) : null;
  if (!key) return false;
  try {
    usableStorage()?.setItem(storageKey(uid), key);
  } catch {
    return false;
  }
  notifyListeners();
  return readKey(uid) === key;
}

export function forgetKey(uid: string): void {
  if (!uid) return;
  try {
    usableStorage()?.removeItem(storageKey(uid));
  } catch {
    return;
  }
  notifyListeners();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function keyFromHash(hash: string): string | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!fragment) return null;
  try {
    return normalizeKey(new URLSearchParams(fragment).get(FRAGMENT_PARAM) ?? '');
  } catch {
    return null;
  }
}

export interface UrlLike {
  pathname: string;
  search: string;
  hash: string;
}

export function consumeKeyFromUrl(
  uid: string,
  url: UrlLike,
  replaceUrl: (next: string) => void,
): string | null {
  const key = keyFromHash(url.hash);
  if (!key) return null;

  const stored = saveKey(uid, key);
  replaceUrl(`${url.pathname}${url.search}`);
  return stored ? key : null;
}
