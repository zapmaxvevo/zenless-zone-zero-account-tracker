export const HOYOLAB_BASE_URL =
  'https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz';
export const RECORD_CARD_URL =
  'https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard';
export const HOYOLAB_APP_URL = 'https://act.hoyolab.com/app/zzz-game-record/index.html';

export const ZZZ_GAME_ID = 8;
export const DEFAULT_LANGUAGE = 'en-us';

export const SCHEDULE_CURRENT = '1';
export const SCHEDULE_PREVIOUS = '2';

export const JITTER_MIN_MS = 300;
export const JITTER_MAX_MS = 800;

export type RetcodeKind =
  | 'ok'
  | 'invalid_session'
  | 'not_public'
  | 'rate_limited'
  | 'captcha'
  | 'hard_limit'
  | 'bad_params'
  | 'error';

export const RETCODES_INVALID_SESSION: readonly number[] = [-100, 10001];
export const RETCODES_NOT_PUBLIC: readonly number[] = [10102, 10104];
export const RETCODES_RATE_LIMITED: readonly number[] = [10101, -110, 1028];
// 5003 no aparece en el bundle de ZZZ (en genshin.py es "ya reclamado" de recompensas
// diarias); queda fuera de la familia captcha hasta que la fase 0 lo observe de verdad.
export const RETCODES_CAPTCHA: readonly number[] = [1034, 10035];
export const RETCODE_HARD_LIMIT = 10041;
// Parámetros mal armados: la sesión del usuario está bien, la URL que mandamos no.
export const RETCODE_BAD_PARAMS = -400005;

export function classifyRetcode(retcode: number): RetcodeKind {
  if (retcode === 0) return 'ok';
  if (retcode === RETCODE_HARD_LIMIT) return 'hard_limit';
  if (retcode === RETCODE_BAD_PARAMS) return 'bad_params';
  if (RETCODES_INVALID_SESSION.includes(retcode)) return 'invalid_session';
  if (RETCODES_NOT_PUBLIC.includes(retcode)) return 'not_public';
  if (RETCODES_RATE_LIMITED.includes(retcode)) return 'rate_limited';
  if (RETCODES_CAPTCHA.includes(retcode)) return 'captcha';
  return 'error';
}

export const STOP_KINDS: readonly RetcodeKind[] = [
  'invalid_session',
  'hard_limit',
  'rate_limited',
  'captcha',
];

export function userMessage(
  kind: RetcodeKind,
  extra: { message?: string; retcode?: number | null; traceId?: string | null } = {},
): string {
  let text: string;
  switch (kind) {
    case 'ok':
      text = 'Sin errores.';
      break;
    case 'invalid_session':
      text = 'Iniciá sesión en HoYoLAB (hoyolab.com) y volvé a importar.';
      break;
    case 'not_public':
      text = 'El Battle Chronicle de esta cuenta no está público en HoYoLAB.';
      break;
    case 'rate_limited':
      text =
        'HoYoLAB limitó las peticiones. Esperá unos minutos y reintentá; no se reintenta solo.';
      break;
    case 'captcha':
      text = 'HoYoLAB pidió un captcha. Abrí act.hoyolab.com, resolvelo y reintentá a mano.';
      break;
    case 'hard_limit':
      // Afirma qué pasó con el import, así que sólo sirve en el camino fatal (las 8 secciones
      // principales). Un corte durante las builds sube igual lo que ya trajo y arma su propio
      // texto con `SectionFailure.text`.
      text =
        'HoYoLAB cortó el acceso (retcode 10041). Se canceló el import entero; probá más tarde.';
      break;
    case 'bad_params':
      text =
        'La extensión armó mal la petición (retcode -400005). Es un bug de la extensión, ' +
        'no un problema de tu sesión de HoYoLAB: reportalo con el trace.';
      break;
    default: {
      const retcode = extra.retcode != null ? ` (retcode ${extra.retcode})` : '';
      text = `HoYoLAB devolvió un error${retcode}.`;
    }
  }
  if (extra.message) text += ` Detalle: ${extra.message}.`;
  if (extra.traceId) text += ` [trace: ${extra.traceId}]`;
  return text;
}

export function hoyolabHeaders(language: string = DEFAULT_LANGUAGE): Record<string, string> {
  return {
    'x-rpc-lang': language,
    'x-rpc-language': language,
    'x-rpc-platform': '4',
    'x-rpc-device_id': '',
    'x-rpc-device_fp': '',
  };
}

export type UidParam = 'role_id' | 'uid';

export interface ChronicleEndpoint {
  path: string;
  uidParam: UidParam;
}

export const ENDPOINTS = {
  index: { path: 'index', uidParam: 'role_id' },
  avatar_basic: { path: 'avatar/basic', uidParam: 'role_id' },
  avatar_info: { path: 'avatar/info', uidParam: 'role_id' },
  buddy_info: { path: 'buddy/info', uidParam: 'role_id' },
  shiyu_defense: { path: 'hadal_info_v2', uidParam: 'role_id' },
  deadly_assault: { path: 'hadal_mem_detail_v2', uidParam: 'uid' },
  lost_void: { path: 'abysss2_abstract', uidParam: 'uid' },
} as const satisfies Record<string, ChronicleEndpoint>;

export type EndpointKey = keyof typeof ENDPOINTS;

export interface RoleRef {
  roleId: string;
  server: string;
  nickname?: string;
}

export function chronicleUrl(
  key: EndpointKey,
  role: RoleRef,
  extra: Record<string, string> = {},
): string {
  const endpoint: ChronicleEndpoint = ENDPOINTS[key];
  const params = new URLSearchParams();
  params.set(endpoint.uidParam, role.roleId);
  params.set(endpoint.uidParam === 'role_id' ? 'server' : 'region', role.server);
  for (const [name, value] of Object.entries(extra)) params.set(name, value);
  return `${HOYOLAB_BASE_URL}/${endpoint.path}?${params.toString()}`;
}

/**
 * `avatar/info` de UN agente. Forma verificada el 2026-08-30: los corchetes de `id_list[]`
 * van literales y repetidos (la forma indexada `id_list[0]` devuelve -400005) y el endpoint
 * acepta un solo id por request (con 3 o con 36 también devuelve -400005).
 */
export function avatarInfoUrl(role: RoleRef, id: number | string): string {
  const endpoint: ChronicleEndpoint = ENDPOINTS.avatar_info;
  const params = new URLSearchParams();
  params.set('need_wiki', 'false');
  params.set(endpoint.uidParam, role.roleId);
  params.set('server', role.server);
  return `${HOYOLAB_BASE_URL}/${endpoint.path}?id_list[]=${encodeURIComponent(String(id))}&${params.toString()}`;
}

export function recordCardUrl(ltuid: string): string {
  return `${RECORD_CARD_URL}?uid=${encodeURIComponent(ltuid)}`;
}

export const REGIONS_BY_UID_PREFIX: Readonly<Record<string, string>> = {
  '10': 'prod_gf_us',
  '13': 'prod_gf_jp',
  '15': 'prod_gf_eu',
  '17': 'prod_gf_sg',
};
export const DEFAULT_REGION = 'prod_gf_eu';

export function regionForUid(uid: string): string | null {
  if (!/^\d{6,16}$/.test(uid)) return null;
  if (uid.length === 8) return null;
  return REGIONS_BY_UID_PREFIX[uid.slice(0, 2)] ?? DEFAULT_REGION;
}

export function discoverRole(cardData: unknown, fallbackUid?: string | null): RoleRef | null {
  const list = (cardData as { list?: unknown } | null | undefined)?.list;
  if (Array.isArray(list)) {
    for (const entry of list) {
      const game = entry as {
        game_id?: unknown;
        game_role_id?: unknown;
        region?: unknown;
        nickname?: unknown;
      };
      if (Number(game.game_id) !== ZZZ_GAME_ID) continue;
      if (game.game_role_id == null || game.region == null) continue;
      const role: RoleRef = {
        roleId: String(game.game_role_id),
        server: String(game.region),
      };
      if (typeof game.nickname === 'string' && game.nickname) role.nickname = game.nickname;
      return role;
    }
  }
  if (fallbackUid) {
    const region = regionForUid(fallbackUid);
    if (region) return { roleId: fallbackUid, server: region };
  }
  return null;
}

export function jitterMs(random: () => number = Math.random): number {
  return JITTER_MIN_MS + Math.floor(random() * (JITTER_MAX_MS - JITTER_MIN_MS + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SerializeOptions<T> {
  wait?: (ms: number) => Promise<void>;
  random?: () => number;
  stopWhen?: (result: T) => boolean;
}

export async function runSerialized<T>(
  steps: ReadonlyArray<() => Promise<T>>,
  options: SerializeOptions<T> = {},
): Promise<T[]> {
  const { wait = sleep, random = Math.random, stopWhen } = options;
  const results: T[] = [];
  for (const step of steps) {
    if (results.length > 0) await wait(jitterMs(random));
    const result = await step();
    results.push(result);
    if (stopWhen?.(result)) break;
  }
  return results;
}

export interface HttpResponseLike {
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<HttpResponseLike>;

export interface HoyolabResponse {
  kind: RetcodeKind;
  retcode: number | null;
  message: string;
  data: Record<string, unknown> | null;
  traceId: string | null;
  httpStatus: number;
}

export async function fetchHoyolab(
  url: string,
  options: { fetchFn?: FetchLike; language?: string } = {},
): Promise<HoyolabResponse> {
  const doFetch = options.fetchFn ?? (fetch as unknown as FetchLike);
  let response: HttpResponseLike;
  try {
    response = await doFetch(url, {
      credentials: 'include',
      headers: hoyolabHeaders(options.language),
    });
  } catch (error) {
    return {
      kind: 'error',
      retcode: null,
      message: `fallo de red: ${String(error)}`,
      data: null,
      traceId: null,
      httpStatus: 0,
    };
  }
  const traceId = response.headers.get('x-trace-id');
  if (response.status === 429) {
    return {
      kind: 'rate_limited',
      retcode: null,
      message: 'HTTP 429',
      data: null,
      traceId,
      httpStatus: 429,
    };
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return {
      kind: 'error',
      retcode: null,
      message: `HTTP ${response.status}: cuerpo no JSON`,
      data: null,
      traceId,
      httpStatus: response.status,
    };
  }
  const { retcode, message, data } = body as {
    retcode?: unknown;
    message?: unknown;
    data?: unknown;
  };
  const parsedRetcode = typeof retcode === 'number' ? retcode : null;
  const parsedData =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  return {
    kind: parsedRetcode === null ? 'error' : classifyRetcode(parsedRetcode),
    retcode: parsedRetcode,
    message: typeof message === 'string' ? message : '',
    data: parsedData,
    traceId,
    httpStatus: response.status,
  };
}
