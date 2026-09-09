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

/**
 * Devuelve el mapa con la key de ese UID puesta al día. La entrada está indexada por UID, así
 * que una key rotada **reemplaza** a la anterior en vez de acumularse: la vieja ya está muerta
 * en el backend y guardarla sólo serviría para mandar una key inválida en el próximo import.
 */
export function withAccountKey(keys: AccountKeys, uid: string, key: string): AccountKeys {
  const trimmed = key.trim();
  if (!trimmed) return keys;
  return { ...keys, [uid]: trimmed };
}

/**
 * El mapa de keys que queda después de un import. La respuesta trae `account_key` sólo cuando
 * la key rotó, que es cuando el import reclama una cuenta libre (`unclaimed`/`provisional`):
 * esa es la única vez que se puede leer, así que se persiste siempre. Un import con la key
 * vigente no rota y no la trae, y contra una cuenta `verified` ajena no hay respuesta que
 * mirar: es un 403. En los dos casos devuelve el mismo mapa —misma referencia— y no hay nada
 * que escribir.
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
  // La key viaja en el fragmento, no en el query: el fragmento no llega al servidor ni queda
  // en sus logs. El frontend la guarda y limpia la URL con history.replaceState.
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
 * El 403 del import significa una sola cosa: esa cuenta ya está `verified` y este navegador no
 * tiene su key. El backend no escribió nada y no emitió ninguna key nueva —desde que `verified`
 * es pegajoso, un bundle ya no desaloja al dueño—, así que el mensaje tiene que decir cómo
 * conseguir la key en vez de dejar al usuario reintentando.
 */
export function ownedAccountHelp(uid: string, sentKey = false): string {
  const problem = sentKey
    ? `El UID ${uid} tiene dueño y la key guardada acá ya no sirve: la rotaron importando ` +
      'desde otra instalación.'
    : `El UID ${uid} ya tiene dueño y este navegador no tiene su key.`;
  return (
    `${problem} Si la key vigente está en otra instalación, copiala desde sus opciones ` +
    '(Keys de cuenta) y pegala en las de acá. Si la perdiste del todo, la única salida es ' +
    `\`zzz-tracker rotate-key ${uid}\` en el servidor.`
  );
}

/**
 * El `detail` de un error del backend, como texto. FastAPI lo manda como string en los errores
 * propios, pero como **lista** de `{loc, msg, …}` cuando lo que falla es la validación del
 * schema — el 422 del import, por ejemplo, cuando la región no está en el allowlist. Sin
 * desarmar esa lista el usuario lee sólo "El tracker respondió 422." y no se entera de qué
 * rechazó el backend.
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
  // El Bearer es opcional: sólo lo exige el backend que tenga ZZZ_API_TOKEN seteado. Mandar
  // `Bearer ` vacío haría fallar a ese backend con un token inválido en vez de "falta token".
  if (args.settings.apiToken?.trim()) {
    headers.authorization = `Bearer ${args.settings.apiToken.trim()}`;
  }
  // Con la key vigente el import no rota nada. Sin ella, una cuenta libre se reclama y la key
  // rota; una cuenta ya `verified` responde 403 y no escribe nada (ver docs/OWNERSHIP.md).
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
