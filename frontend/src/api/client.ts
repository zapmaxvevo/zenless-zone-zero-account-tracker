import type {
  AccountListResponse,
  AccountRead,
  AgentDetailRead,
  AgentListResponse,
  AgentUpdate,
  AgentWrite,
  BangbooListResponse,
  CatalogAgentRead,
  CatalogDiscSetRead,
  CatalogListResponse,
  CatalogPropertyRead,
  CatalogWEngineRead,
  ChallengeMode,
  ChallengeRunListResponse,
  ChronicleSyncResponse,
  CredentialRead,
  CredentialWrite,
  HealthResponse,
  LostVoidRead,
  TeamListResponse,
  TeamRead,
  TeamWrite,
} from './types';

const BASE = '/api';

/** Los defaults del backend: `force` apagado y `previous` prendido. */
export type ChronicleSyncOptions = { force?: boolean; previous?: boolean };

/** Error de una respuesta HTTP no exitosa, con el `detail` que devuelve FastAPI. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`HTTP ${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Saca el mensaje de error del body de una respuesta fallida.
 *
 * FastAPI manda `{detail: string}` para errores de dominio y `{detail: [{msg, loc}, ...]}`
 * para errores de validación; cualquier otra forma cae en `fallback`.
 */
export function extractDetail(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null || !('detail' in body)) return fallback;

  const { detail } = body as { detail: unknown };
  if (typeof detail === 'string') return detail.trim() || fallback;

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as { msg?: unknown }).msg === 'string'
          ? (item as { msg: string }).msg
          : null,
      )
      .filter((msg): msg is string => msg !== null);
    if (messages.length > 0) return messages.join(', ');
  }

  return fallback;
}

/** Mensaje por defecto cuando el body no trae un `detail` usable. */
export function statusFallback(status: number, statusText: string): string {
  return statusText.trim() || `Error ${status}`;
}

/**
 * Query string con los parámetros presentes: `'?force=true'`, o `''` si no queda ninguno.
 *
 * Omitir un parámetro no es lo mismo que mandarlo vacío: FastAPI aplica su default solo
 * cuando la clave no viaja.
 */
export function queryString(
  params: Record<string, string | number | boolean | null | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  const fallback = statusFallback(res.status, res.statusText);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Respuesta sin JSON (HTML de un proxy, body vacío): queda el fallback.
  }
  return new ApiError(res.status, extractDetail(body, fallback));
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body ?? {});
}

export function put<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PUT', path, body);
}

export function patch<T>(path: string, body: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function del<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export const api = {
  health: () => get<HealthResponse>('/health'),

  trackAccount: (uid: string) => post<AccountRead>('/accounts', { uid }),
  listAccounts: () => get<AccountListResponse>('/accounts'),
  getAccount: (uid: string) => get<AccountRead>(`/accounts/${uid}`),
  syncAccount: (uid: string) => post<AccountRead>(`/accounts/${uid}/sync`),

  listAgents: (uid: string) => get<AgentListResponse>(`/accounts/${uid}/agents`),
  getAgent: (agentId: number | string) => get<AgentDetailRead>(`/agents/${agentId}`),
  createAgent: (uid: string, body: AgentWrite) =>
    post<AgentDetailRead>(`/accounts/${uid}/agents`, body),
  updateAgent: (agentId: number | string, body: AgentUpdate) =>
    patch<AgentDetailRead>(`/agents/${agentId}`, body),
  deleteAgent: (agentId: number | string) => del<void>(`/agents/${agentId}`),

  listTeams: (uid: string) => get<TeamListResponse>(`/accounts/${uid}/teams`),
  createTeam: (uid: string, body: TeamWrite) => post<TeamRead>(`/accounts/${uid}/teams`, body),
  getTeam: (teamId: number | string) => get<TeamRead>(`/teams/${teamId}`),
  updateTeam: (teamId: number | string, body: TeamWrite) => put<TeamRead>(`/teams/${teamId}`, body),
  deleteTeam: (teamId: number | string) => del<void>(`/teams/${teamId}`),

  storeCredentials: (uid: string, body: CredentialWrite) =>
    put<CredentialRead>(`/accounts/${uid}/credentials`, body),
  deleteCredentials: (uid: string) => del<void>(`/accounts/${uid}/credentials`),

  syncChronicle: (uid: string, options: ChronicleSyncOptions = {}) =>
    post<ChronicleSyncResponse>(`/accounts/${uid}/chronicle/sync${queryString(options)}`),
  listChallenges: (uid: string, mode?: ChallengeMode) =>
    get<ChallengeRunListResponse>(`/accounts/${uid}/challenges${queryString({ mode })}`),
  listBangboos: (uid: string) => get<BangbooListResponse>(`/accounts/${uid}/bangboos`),
  getLostVoid: (uid: string) => get<LostVoidRead>(`/accounts/${uid}/lost-void`),

  catalogAgents: () => get<CatalogListResponse<CatalogAgentRead>>('/catalog/agents'),
  catalogWEngines: () => get<CatalogListResponse<CatalogWEngineRead>>('/catalog/wengines'),
  catalogDiscSets: () => get<CatalogListResponse<CatalogDiscSetRead>>('/catalog/discs'),
  catalogProperties: () => get<CatalogListResponse<CatalogPropertyRead>>('/catalog/properties'),
};
