import { describe, expect, it } from 'vitest';
import { buildImportPayload } from './chronicle';
import type { FetchLike, HttpResponseLike } from './hoyolab';
import {
  type AccountKeys,
  accountKeyFor,
  extractDetail,
  accountKeysAfterImport,
  accountUrl,
  importUrl,
  normalizeBaseUrl,
  parseAccountKeys,
  postChronicleImport,
  TrackerError,
  withAccountKey,
  withoutAccountKey,
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

  it('con key la cuelga del fragmento para que el frontend quede autenticado', () => {
    expect(accountUrl('https://zzz.example', '1500000001', 'zzk_abc')).toBe(
      'https://zzz.example/account/1500000001#key=zzk_abc',
    );
  });
});

describe('keys de cuenta guardadas', () => {
  it('parsea el mapa de storage y descarta lo que no sea uid -> string', () => {
    expect(
      parseAccountKeys({ '1500000001': 'zzk_uno', '1500000002': 42, '1500000003': '  ' }),
    ).toEqual({ '1500000001': 'zzk_uno' });
    expect(parseAccountKeys(undefined)).toEqual({});
    expect(parseAccountKeys(['zzk_uno'])).toEqual({});
  });

  it('la key rotada reemplaza a la vieja del mismo uid, no se agrega al lado', () => {
    const keys = withAccountKey(
      { '1500000001': 'zzk_vieja', '1500000002': 'zzk_otra' },
      '1500000001',
      'zzk_nueva',
    );
    expect(keys).toEqual({ '1500000001': 'zzk_nueva', '1500000002': 'zzk_otra' });
    expect(Object.values(keys)).not.toContain('zzk_vieja');
  });

  it('guardar una key no toca el mapa anterior', () => {
    const previous = { '1500000001': 'zzk_vieja' };
    withAccountKey(previous, '1500000001', 'zzk_nueva');
    expect(previous).toEqual({ '1500000001': 'zzk_vieja' });
  });

  it('borrar una key deja las de los otros uid', () => {
    expect(withoutAccountKey({ a: '1', b: '2' }, 'a')).toEqual({ b: '2' });
  });

  it('un import que devuelve key la persiste pisando la vieja del mismo uid', () => {
    const previous = { '1500000001': 'zzk_vieja', '1500000002': 'zzk_otra' };
    const next = accountKeysAfterImport(previous, '1500000001', { account_key: 'zzk_rotada' });
    expect(next).toEqual({ '1500000001': 'zzk_rotada', '1500000002': 'zzk_otra' });
  });

  it('un import que no rota deja el mapa igual y no hay nada que escribir', () => {
    const previous = { '1500000001': 'zzk_vigente' };
    expect(accountKeysAfterImport(previous, '1500000001', {})).toBe(previous);
    expect(accountKeysAfterImport(previous, '1500000001', { account_key: null })).toBe(previous);
  });

  it('un import con la key vigente vuelve sin account_key y la guardada sigue sirviendo', () => {
    const previous = { '1500000001': 'zzk_vigente' };
    const next = accountKeysAfterImport(previous, '1500000001', { account_key: undefined });
    expect(next).toBe(previous);
    expect(accountKeyFor(next, '1500000001')).toBe('zzk_vigente');
  });

  it('un import de un uid nuevo suma su key sin tocar las demás', () => {
    expect(
      accountKeysAfterImport({ '1500000001': 'zzk_uno' }, '1500000002', {
        account_key: 'zzk_dos',
      }),
    ).toEqual({ '1500000001': 'zzk_uno', '1500000002': 'zzk_dos' });
  });

  it('un uid sin key guardada no devuelve nada', () => {
    expect(accountKeyFor({ '1500000001': 'zzk_uno' }, '1500000002')).toBeUndefined();
  });
});

describe('extractDetail', () => {
  it('devuelve el string tal cual, recortado', () => {
    expect(extractDetail({ detail: '  esta cuenta tiene dueño  ' })).toBe(
      'esta cuenta tiene dueño',
    );
  });

  it('junta los msg de la lista de errores de schema', () => {
    expect(
      extractDetail({ detail: [{ msg: 'Field required' }, { msg: 'región desconocida' }] }),
    ).toBe('Field required, región desconocida');
  });

  it('ignora las entradas sin msg usable', () => {
    expect(
      extractDetail({ detail: [{ msg: 'ok' }, { loc: ['body'] }, { msg: '  ' }, 'texto'] }),
    ).toBe('ok');
  });

  it('sin detail reconocible devuelve vacío para que decida quien llama', () => {
    expect(extractDetail({})).toBe('');
    expect(extractDetail(null)).toBe('');
    expect(extractDetail({ detail: 42 })).toBe('');
    expect(extractDetail({ detail: [] })).toBe('');
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

  it('manda X-Account-Key cuando hay key guardada para ese uid', async () => {
    let seenInit: RequestInit | undefined;
    await postChronicleImport({
      settings: { ...settings, accountKey: 'zzk_vigente' },
      uid: '1500000001',
      payload,
      fetchFn: async (_url, init) => {
        seenInit = init;
        return jsonResponse(200, { agents_synced: 1 });
      },
    });
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-account-key']).toBe('zzk_vigente');
  });

  it('sin key guardada no manda el header: si el UID está libre, el import lo reclama', async () => {
    let seenInit: RequestInit | undefined;
    const response = await postChronicleImport({
      settings,
      uid: '1500000001',
      payload,
      fetchFn: async (_url, init) => {
        seenInit = init;
        return jsonResponse(200, { agents_synced: 1, account_key: 'zzk_nueva' });
      },
    });
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-account-key']).toBeUndefined();
    // La key rotada viene en la respuesta y es la única vez que se puede leer.
    expect(response.account_key).toBe('zzk_nueva');
  });

  it('sin token no manda Authorization: el Bearer es opcional', async () => {
    let seenInit: RequestInit | undefined;
    await postChronicleImport({
      settings: { trackerUrl: settings.trackerUrl },
      uid: '1500000001',
      payload,
      fetchFn: async (_url, init) => {
        seenInit = init;
        return jsonResponse(200, {});
      },
    });
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers.authorization).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  it('un 403 explica que la cuenta tiene dueño y cómo conseguir la key', async () => {
    let seenInit: RequestInit | undefined;
    const error = await postChronicleImport({
      settings,
      uid: '1500000001',
      payload,
      fetchFn: async (_url, init) => {
        seenInit = init;
        return jsonResponse(403, { detail: 'esta cuenta tiene dueño; falta X-Account-Key' });
      },
    }).catch((caught: unknown) => caught as TrackerError);

    expect(error).toBeInstanceOf(TrackerError);
    const thrown = error as TrackerError;
    expect(thrown.status).toBe(403);
    // El detail del backend se conserva y se le agrega qué hacer.
    expect(thrown.message).toContain('esta cuenta tiene dueño; falta X-Account-Key');
    expect(thrown.message).toContain('copiala desde sus opciones');
    expect(thrown.message).toContain('zzz-tracker rotate-key 1500000001');
    // No mandó key: el mensaje no puede decir que la guardada dejó de servir.
    expect(thrown.message).not.toContain('ya no sirve');
    expect((seenInit?.headers as Record<string, string>)['x-account-key']).toBeUndefined();
  });

  it('un 403 con key mandada dice que la key guardada quedó vieja', async () => {
    await expect(
      postChronicleImport({
        settings: { ...settings, accountKey: 'zzk_vieja' },
        uid: '1500000001',
        payload,
        fetchFn: async () => jsonResponse(403, {}),
      }),
    ).rejects.toThrowError(/la key guardada acá ya no sirve/);
  });

  it('un 403 no emite key: la guardada no se pisa ni se borra', async () => {
    let keys: AccountKeys = { '1500000001': 'zzk_de_otra_maquina' };
    // La misma secuencia que corre el background: POST y, sólo si salió bien, persistir la
    // key que haya devuelto.
    const runImport = async (fetchFn: FetchLike) => {
      const response = await postChronicleImport({ settings, uid: '1500000001', payload, fetchFn });
      keys = accountKeysAfterImport(keys, '1500000001', response);
    };

    await expect(
      runImport(async () => jsonResponse(403, { detail: 'esta cuenta tiene dueño' })),
    ).rejects.toThrowError(TrackerError);
    expect(keys).toEqual({ '1500000001': 'zzk_de_otra_maquina' });
  });

  it('guarda el code estable del backend cuando viene en el cuerpo', async () => {
    const thrown = (await postChronicleImport({
      settings,
      uid: '1500000001',
      payload,
      fetchFn: async () => jsonResponse(403, { detail: 'con dueño', code: 'account_owned' }),
    }).catch((error: unknown) => error)) as TrackerError;
    expect(thrown.code).toBe('account_owned');
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

  it('un 422 de schema trae el detail como lista y se lee igual', async () => {
    // Forma exacta de FastAPI cuando falla la validación del body: el backend la devuelve, por
    // ejemplo, si la región del import no está en el allowlist.
    await expect(
      postChronicleImport({
        settings,
        uid: '1500000001',
        payload,
        fetchFn: async () =>
          jsonResponse(422, {
            detail: [
              { type: 'literal_error', loc: ['body', 'region'], msg: 'región desconocida: xx' },
              { type: 'missing', loc: ['body', 'payloads', 'index'], msg: 'Field required' },
            ],
          }),
      }),
    ).rejects.toThrowError('región desconocida: xx, Field required');
  });

  it('un detail en lista sin ningún msg usable cae al status', async () => {
    await expect(
      postChronicleImport({
        settings,
        uid: '1500000001',
        payload,
        fetchFn: async () => jsonResponse(422, { detail: [{ loc: ['body'] }] }),
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
