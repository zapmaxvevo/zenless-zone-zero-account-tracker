import { describe, expect, it } from 'vitest';
import { buildImportPayload } from './chronicle';
import type { HttpResponseLike } from './hoyolab';
import {
  accountUrl,
  importUrl,
  normalizeBaseUrl,
  postChronicleImport,
  TrackerError,
} from './tracker';

const settings = { trackerUrl: 'http://127.0.0.1:8000/', apiToken: 'secreto' };
const payload = buildImportPayload({ region: 'prod_gf_eu', language: 'en-us', sections: {} });

function jsonResponse(status: number, body: unknown): HttpResponseLike {
  return { status, headers: { get: () => null }, json: () => Promise.resolve(body) };
}

describe('URLs del tracker', () => {
  it('normaliza la base sin barra final', () => {
    expect(normalizeBaseUrl('http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000');
    expect(normalizeBaseUrl('  https://zzz.example ')).toBe('https://zzz.example');
  });

  it('arma la ruta del import contra la API del backend', () => {
    expect(importUrl('http://127.0.0.1:8000/', '1500000001')).toBe(
      'http://127.0.0.1:8000/accounts/1500000001/chronicle/import',
    );
  });

  it('el link a la cuenta usa la ruta del SPA: /account/ en singular', () => {
    expect(accountUrl('https://zzz.example', '1500000001')).toBe(
      'https://zzz.example/account/1500000001',
    );
  });
});

describe('postChronicleImport', () => {
  it('hace el POST con Bearer y el payload en JSON', async () => {
    let seenUrl = '';
    let seenInit: RequestInit | undefined;
    const response = await postChronicleImport({
      settings,
      uid: '1500000001',
      payload,
      fetchFn: async (url, init) => {
        seenUrl = url;
        seenInit = init;
        return jsonResponse(200, { agents_synced: 3 });
      },
    });
    expect(seenUrl).toBe('http://127.0.0.1:8000/accounts/1500000001/chronicle/import');
    expect(seenInit?.method).toBe('POST');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer secreto');
    expect(headers['content-type']).toBe('application/json');
    expect(JSON.parse(seenInit?.body as string)).toEqual(payload);
    expect(response.agents_synced).toBe(3);
  });

  it('un 401 propaga el detail del backend', async () => {
    await expect(
      postChronicleImport({
        settings,
        uid: '1500000001',
        payload,
        fetchFn: async () => jsonResponse(401, { detail: 'invalid token' }),
      }),
    ).rejects.toThrowError(new TrackerError(401, 'invalid token'));
  });

  it('un error sin detail usa el status', async () => {
    await expect(
      postChronicleImport({
        settings,
        uid: '1500000001',
        payload,
        fetchFn: async () => jsonResponse(422, {}),
      }),
    ).rejects.toThrowError('El tracker respondió 422.');
  });

  it('sin conexión el error dice a qué URL no llegó', async () => {
    await expect(
      postChronicleImport({
        settings,
        uid: '1500000001',
        payload,
        fetchFn: async () => {
          throw new Error('ECONNREFUSED');
        },
      }),
    ).rejects.toThrowError('No se pudo conectar con el tracker en http://127.0.0.1:8000/.');
  });
});
