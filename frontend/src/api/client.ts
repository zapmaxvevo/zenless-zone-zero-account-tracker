import { readKey } from '../lib/accountKey';
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
  HealthResponse,
  LostVoidRead,
  TeamListResponse,
  TeamRead,
  TeamWrite,
} from './types';

const BASE = '/api';

export const KEY_HEADER = 'X-Account-Key';

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;
  readonly code: string | null;
  readonly sentKey: boolean;

  constructor(
    status: number,
    detail: string,
    code: string | null = null,
    sentKey: boolean = false,
  ) {
    super(`HTTP ${status}: ${detail}`);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.code = code;
    this.sentKey = sentKey;
  }
}

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

export function extractCode(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('code' in body)) return null;

  const { code } = body as { code: unknown };
  return typeof code === 'string' && code.trim() !== '' ? code.trim() : null;
}

export function statusFallback(status: number, statusText: string): string {
  return statusText.trim() || `Error ${status}`;
}

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

async function toApiError(res: Response, sentKey: boolean): Promise<ApiError> {
  const fallback = statusFallback(res.status, res.statusText);
  const body: unknown = await res.json().catch(() => null);
  return new ApiError(res.status, extractDetail(body, fallback), extractCode(body), sentKey);
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  owner?: string,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const key = owner ? readKey(owner) : null;
  if (key) headers[KEY_HEADER] = key;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res, key !== null);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function get<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function post<T>(path: string, body?: unknown, owner?: string): Promise<T> {
  return request<T>('POST', path, body ?? {}, owner);
}

export function put<T>(path: string, body: unknown, owner?: string): Promise<T> {
  return request<T>('PUT', path, body, owner);
}

export function patch<T>(path: string, body: unknown, owner?: string): Promise<T> {
  return request<T>('PATCH', path, body, owner);
}

export function del<T>(path: string, owner?: string): Promise<T> {
  return request<T>('DELETE', path, undefined, owner);
}

export const api = {
  health: () => get<HealthResponse>('/health'),

  trackAccount: (uid: string) => post<AccountRead>('/accounts', { uid }),

  listAccounts: () => get<AccountListResponse>('/accounts'),
  getAccount: (uid: string) => get<AccountRead>(`/accounts/${uid}`),
  syncAccount: (uid: string) => post<AccountRead>(`/accounts/${uid}/sync`, {}, uid),

  listAgents: (uid: string) => get<AgentListResponse>(`/accounts/${uid}/agents`),
  getAgent: (agentId: number | string) => get<AgentDetailRead>(`/agents/${agentId}`),
  createAgent: (uid: string, body: AgentWrite) =>
    post<AgentDetailRead>(`/accounts/${uid}/agents`, body, uid),
  updateAgent: (uid: string, agentId: number | string, body: AgentUpdate) =>
    patch<AgentDetailRead>(`/agents/${agentId}`, body, uid),
  deleteAgent: (uid: string, agentId: number | string) => del<void>(`/agents/${agentId}`, uid),

  listTeams: (uid: string) => get<TeamListResponse>(`/accounts/${uid}/teams`),
  createTeam: (uid: string, body: TeamWrite) => post<TeamRead>(`/accounts/${uid}/teams`, body, uid),
  getTeam: (teamId: number | string) => get<TeamRead>(`/teams/${teamId}`),
  updateTeam: (uid: string, teamId: number | string, body: TeamWrite) =>
    put<TeamRead>(`/teams/${teamId}`, body, uid),
  deleteTeam: (uid: string, teamId: number | string) => del<void>(`/teams/${teamId}`, uid),

  listChallenges: (uid: string, mode?: ChallengeMode) =>
    get<ChallengeRunListResponse>(`/accounts/${uid}/challenges${queryString({ mode })}`),
  listBangboos: (uid: string) => get<BangbooListResponse>(`/accounts/${uid}/bangboos`),
  getLostVoid: (uid: string) => get<LostVoidRead>(`/accounts/${uid}/lost-void`),

  catalogAgents: () => get<CatalogListResponse<CatalogAgentRead>>('/catalog/agents'),
  catalogWEngines: () => get<CatalogListResponse<CatalogWEngineRead>>('/catalog/wengines'),
  catalogDiscSets: () => get<CatalogListResponse<CatalogDiscSetRead>>('/catalog/discs'),
  catalogProperties: () => get<CatalogListResponse<CatalogPropertyRead>>('/catalog/properties'),
};
