import type { ChronicleImportResponse, ChronicleImportWrite } from './chronicle';
import type { FetchLike } from './hoyolab';

export const DEFAULT_TRACKER_URL = 'http://127.0.0.1:8000';

export const STORAGE_KEYS = {
  trackerUrl: 'trackerUrl',
  frontendUrl: 'frontendUrl',
  apiToken: 'apiToken',
  lastImport: 'lastImport',
} as const;

export interface TrackerSettings {
  trackerUrl: string;
  apiToken: string;
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function importUrl(baseUrl: string, uid: string): string {
  return `${normalizeBaseUrl(baseUrl)}/accounts/${encodeURIComponent(uid)}/chronicle/import`;
}

// La ruta del SPA es /account/:uid (singular); /accounts/... es la API JSON del backend.
export function accountUrl(frontendBaseUrl: string, uid: string): string {
  return `${normalizeBaseUrl(frontendBaseUrl)}/account/${encodeURIComponent(uid)}`;
}

export class TrackerError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'TrackerError';
    this.status = status;
  }
}

export async function postChronicleImport(args: {
  settings: TrackerSettings;
  uid: string;
  payload: ChronicleImportWrite;
  fetchFn?: FetchLike;
}): Promise<ChronicleImportResponse> {
  const doFetch = args.fetchFn ?? (fetch as unknown as FetchLike);
  let response;
  try {
    response = await doFetch(importUrl(args.settings.trackerUrl, args.uid), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${args.settings.apiToken}`,
      },
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
    const detail = (body as { detail?: unknown } | null)?.detail;
    throw new TrackerError(
      response.status,
      typeof detail === 'string' ? detail : `El tracker respondió ${response.status}.`,
    );
  }
  return (body ?? {}) as ChronicleImportResponse satisfies ChronicleImportResponse;
}
