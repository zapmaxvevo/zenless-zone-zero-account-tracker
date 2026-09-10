import type { ChronicleImportResponse, ChronicleImportWrite } from './chronicle';
import type { FetchLike } from './hoyolab';

export const DEFAULT_TRACKER_URL = 'http://127.0.0.1:8000';

export const STORAGE_KEYS = {
  trackerUrl: 'trackerUrl',
  frontendUrl: 'frontendUrl',
  apiToken: 'apiToken',
  accountKeys: 'accountKeys',
  lastImport: 'lastImport',
  rosterSnapshot: 'rosterSnapshot',
} as const;

export interface TrackerSettings {
  trackerUrl: string;
  /** Opcional: sólo hace falta si el backend tiene `ZZZ_API_TOKEN` seteado. */
  apiToken?: string;
  /** La key de propiedad de la cuenta que se está importando, si ya la tenemos. */
  accountKey?: string;
}

/** Las keys de cuenta guardadas, una por UID: `{ "1500000001": "zzk_…" }`. */
export type AccountKeys = Record<string, string>;

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Las claves de `storage.sync` que hay que leer para armar un import. */
export const SETTINGS_KEYS = [
  STORAGE_KEYS.trackerUrl,
  STORAGE_KEYS.frontendUrl,
  STORAGE_KEYS.apiToken,
  STORAGE_KEYS.accountKeys,
] as const;

export interface StoredSettings {
  trackerUrl: string;
  frontendUrl: string;
  apiToken: string;
  accountKeys: AccountKeys;
}

/** Lo que devolvió `storage.sync.get(SETTINGS_KEYS)`, normalizado: storage puede tener basura. */
export function parseSettings(stored: Record<string, unknown>): StoredSettings {
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  return {
    trackerUrl: text(stored[STORAGE_KEYS.trackerUrl]),
    frontendUrl: text(stored[STORAGE_KEYS.frontendUrl]),
    apiToken: text(stored[STORAGE_KEYS.apiToken]),
    accountKeys: parseAccountKeys(stored[STORAGE_KEYS.accountKeys]),
  };
}

/** Lee el mapa de keys de storage descartando cualquier cosa que no sea `uid -> string`. */
export function parseAccountKeys(value: unknown): AccountKeys {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const keys: AccountKeys = {};
  for (const [uid, key] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key === 'string' && key.trim()) keys[uid] = key.trim();
  }
  return keys;
}

export function accountKeyFor(keys: AccountKeys, uid: string): string | undefined {
  return keys[uid];
}

/** El mapa con la key de ese UID al día: la rotada reemplaza a la vieja, que ya está muerta. */
export function withAccountKey(keys: AccountKeys, uid: string, key: string): AccountKeys {
  const trimmed = key.trim();
  if (!trimmed) return keys;
  return { ...keys, [uid]: trimmed };
}

/**
 * El mapa de keys que queda después de un import. Sin `account_key` en la respuesta devuelve
 * la MISMA referencia, que es como quien llama sabe que no hay nada que escribir.
 */
export function accountKeysAfterImport(
  keys: AccountKeys,
  uid: string,
  response: Pick<ChronicleImportResponse, 'account_key'>,
): AccountKeys {
  const rotated = typeof response.account_key === 'string' ? response.account_key.trim() : '';
  return rotated ? withAccountKey(keys, uid, rotated) : keys;
}

export function withoutAccountKey(keys: AccountKeys, uid: string): AccountKeys {
  const rest = { ...keys };
  delete rest[uid];
  return rest;
}

export function importUrl(baseUrl: string, uid: string): string {
  return `${normalizeBaseUrl(baseUrl)}/accounts/${encodeURIComponent(uid)}/chronicle/import`;
}

// La ruta del SPA es /account/:uid (singular); /accounts/... es la API JSON del backend.
export function accountUrl(frontendBaseUrl: string, uid: string, accountKey?: string): string {
  const url = `${normalizeBaseUrl(frontendBaseUrl)}/account/${encodeURIComponent(uid)}`;
  // La key va en el fragmento, no en el query: el fragmento no llega al servidor ni a sus logs.
  return accountKey ? `${url}#key=${encodeURIComponent(accountKey)}` : url;
}

export class TrackerError extends Error {
  readonly status: number;
  /** El `code` estable del backend, si lo mandó; `''` cuando el cuerpo sólo trae `detail`. */
  readonly code: string;

  constructor(status: number, detail: string, code = '') {
    super(detail);
    this.name = 'TrackerError';
    this.status = status;
    this.code = code;
  }
}

/**
 * El texto del 403: la cuenta ya tiene dueño y este navegador no tiene su key. Dice cómo
 * conseguirla, porque reintentar no sirve —el backend no escribió nada ni emitió key nueva.
 */
export function ownedAccountHelp(uid: string, sentKey = false): string {
  // Si mandamos key y aun así rebotó, o la rotaron en el servidor o nunca fue de este UID.
  const problem = sentKey
    ? `El UID ${uid} tiene dueño y la key guardada acá ya no sirve: la rotaron en el servidor ` +
      'o es de otra cuenta.'
    : `El UID ${uid} ya tiene dueño y este navegador no tiene su key.`;
  return (
    `${problem} Si la key vigente está en otra instalación, copiala desde sus opciones ` +
    '(Keys de cuenta) y pegala en las de acá. Si la perdiste del todo, la única salida es ' +
    `\`zzz-tracker rotate-key ${uid}\` en el servidor.`
  );
}

/**
 * El `detail` de un error del backend, como texto. FastAPI lo manda como string en los errores
 * propios y como lista de `{loc, msg, …}` cuando falla la validación del schema.
 */
export function extractDetail(body: unknown): string {
  if (typeof body !== 'object' || body === null) return '';
  const { detail } = body as { detail?: unknown };
  if (typeof detail === 'string') return detail.trim();
  if (!Array.isArray(detail)) return '';
  return detail
    .map((item) => (item as { msg?: unknown } | null)?.msg)
    .filter((msg): msg is string => typeof msg === 'string' && msg.trim() !== '')
    .map((msg) => msg.trim())
    .join(', ');
}

/** El texto que ve el usuario cuando el import falla, a partir de lo que devolvió el backend. */
export function importErrorMessage(args: {
  status: number;
  uid: string;
  detail?: string;
  code?: string;
  sentKey?: boolean;
}): string {
  if (args.status === 403) {
    const reason = args.detail ? `${args.detail} ` : '';
    return `${reason}${ownedAccountHelp(args.uid, args.sentKey === true)}`;
  }
  return args.detail || `El tracker respondió ${args.status}.`;
}

export async function postChronicleImport(args: {
  settings: TrackerSettings;
  uid: string;
  payload: ChronicleImportWrite;
  fetchFn?: FetchLike;
}): Promise<ChronicleImportResponse> {
  const doFetch = args.fetchFn ?? (fetch as unknown as FetchLike);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // El Bearer es opcional: `Bearer ` vacío fallaría como token inválido, no como token ausente.
  if (args.settings.apiToken?.trim()) {
    headers.authorization = `Bearer ${args.settings.apiToken.trim()}`;
  }
  // Sin key, una cuenta libre se reclama y sale una key; una con dueño da 403 (docs/OWNERSHIP.md).
  const accountKey = args.settings.accountKey?.trim() ?? '';
  if (accountKey) headers['x-account-key'] = accountKey;
  let response;
  try {
    response = await doFetch(importUrl(args.settings.trackerUrl, args.uid), {
      method: 'POST',
      headers,
      body: JSON.stringify(args.payload),
    });
  } catch {
    throw new TrackerError(0, `No se pudo conectar con el tracker en ${args.settings.trackerUrl}.`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.status >= 400) {
    const detail = extractDetail(body);
    const rawCode = (body as { code?: unknown } | null)?.code;
    const code = typeof rawCode === 'string' ? rawCode : '';
    throw new TrackerError(
      response.status,
      importErrorMessage({
        status: response.status,
        uid: args.uid,
        detail,
        code,
        sentKey: Boolean(accountKey),
      }),
      code,
    );
  }
  return (body ?? {}) as ChronicleImportResponse satisfies ChronicleImportResponse;
}
