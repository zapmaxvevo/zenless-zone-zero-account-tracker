import { describe, expect, it } from 'vitest';
import { collapseBuildFailures, fetchBuilds } from './builds';
import { nextSnapshot, type RosterAgent } from './roster';
import type { BuildFailure, BuildsSync } from './builds';
import type { FetchLike, HttpResponseLike } from './hoyolab';
import { failureText, type SectionFailure } from './messages';

const role = { roleId: '1500123456', server: 'prod_gf_eu' };
const noWait = async () => {};

function body(payload: unknown): HttpResponseLike {
  return {
    status: 200,
    headers: { get: () => 'trace-1' },
    json: async () => payload,
  };
}

/** Un fetch falso que responde según el id que pide la URL. */
function fakeFetch(reply: (id: number) => unknown): { fetchFn: FetchLike; urls: string[] } {
  const urls: string[] = [];
  const fetchFn: FetchLike = async (url) => {
    urls.push(url);
    const id = Number(/id_list\[\]=(\d+)/.exec(url)?.[1]);
    return body(reply(id));
  };
  return { fetchFn, urls };
}

const okFor = (id: number) => ({ retcode: 0, message: 'OK', data: { avatar_list: [{ id }] } });

describe('fetchBuilds', () => {
  it('trae un payload por agente, en serie y con un id por request', async () => {
    const { fetchFn, urls } = fakeFetch(okFor);
    const builds = await fetchBuilds({ role, ids: [1091, 1311], fetchFn, wait: noWait });

    expect(builds.payloads).toEqual([
      { avatar_list: [{ id: 1091 }] },
      { avatar_list: [{ id: 1311 }] },
    ]);
    expect(builds.fetchedIds).toEqual([1091, 1311]);
    expect(builds.failures).toEqual([]);
    expect(builds.stopped).toBeNull();
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('id_list[]=1091');
  });

  it('un corte a la mitad no tira lo ya traído: los agentes previos viajan igual', async () => {
    const ids = [1, 2, 3, 4, 5, 6];
    const { fetchFn, urls } = fakeFetch((id) =>
      id === 5 ? { retcode: 10041, message: 'blocked' } : okFor(id),
    );
    const builds = await fetchBuilds({ role, ids, fetchFn, wait: noWait });

    expect(builds.payloads).toHaveLength(4);
    expect(builds.fetchedIds).toEqual([1, 2, 3, 4]);
    // El corte frena la pasada: el agente 6 nunca se pide.
    expect(urls).toHaveLength(5);
    expect(builds.stopped?.kind).toBe('hard_limit');
    expect(builds.failures).toEqual([
      {
        id: 5,
        section: 'avatar_info',
        kind: 'hard_limit',
        retcode: 10041,
        traceId: 'trace-1',
        message: 'blocked',
      },
    ]);
    expect(builds.requested).toBe(6);
  });

  it('la sesión caída, el rate limit y el captcha cortan la pasada igual que el hard limit', async () => {
    for (const retcode of [-100, 10101, 10035]) {
      const { fetchFn, urls } = fakeFetch((id) =>
        id === 3 ? { retcode, message: 'cortado' } : okFor(id),
      );
      const builds = await fetchBuilds({ role, ids: [1, 2, 3, 4, 5], fetchFn, wait: noWait });

      expect(builds.fetchedIds).toEqual([1, 2]);
      expect(urls).toHaveLength(3);
      expect(builds.stopped).not.toBeNull();
      expect(builds.requested).toBe(5);
    }
  });

  it('el 429 del WAF corta aunque no traiga retcode', async () => {
    const urls: string[] = [];
    const fetchFn: FetchLike = async (url) => {
      urls.push(url);
      if (urls.length < 3) return body(okFor(Number(/id_list\[\]=(\d+)/.exec(url)?.[1])));
      return { status: 429, headers: { get: () => 'trace-429' }, json: async () => null };
    };
    const builds = await fetchBuilds({ role, ids: [1, 2, 3, 4], fetchFn, wait: noWait });

    expect(builds.stopped?.kind).toBe('rate_limited');
    expect(builds.fetchedIds).toEqual([1, 2]);
    expect(urls).toHaveLength(3);
  });

  it('un corte en el primer agente no trae nada y deja a todos pendientes', async () => {
    const roster: RosterAgent[] = [
      { id: 1, level: 60, rank: 0 },
      { id: 2, level: 60, rank: 0 },
    ];
    const { fetchFn } = fakeFetch(() => ({ retcode: 10041, message: 'blocked' }));
    const builds = await fetchBuilds({ role, ids: [1, 2], fetchFn, wait: noWait });

    expect(builds.payloads).toEqual([]);
    // Sin marcas, `agentsToFetch` los vuelve a proponer enteros en el próximo import.
    const snapshot = nextSnapshot({ previous: {}, roster, fetchedIds: builds.fetchedIds });
    expect(snapshot).toEqual({});
  });

  it('lo que quedó afuera del import cortado se pide en el próximo', async () => {
    const roster: RosterAgent[] = [
      { id: 1, level: 60, rank: 0 },
      { id: 2, level: 60, rank: 0 },
      { id: 3, level: 60, rank: 0 },
    ];
    const { fetchFn } = fakeFetch((id) =>
      id === 2 ? { retcode: 10041, message: 'blocked' } : okFor(id),
    );
    const builds = await fetchBuilds({ role, ids: [1, 2, 3], fetchFn, wait: noWait });
    const snapshot = nextSnapshot({ previous: {}, roster, fetchedIds: builds.fetchedIds });

    expect(snapshot).toEqual({ '1': { level: 60, rank: 0 } });
  });

  it('un fallo suelto no corta la pasada: los demás siguen', async () => {
    const { fetchFn, urls } = fakeFetch((id) =>
      id === 1311 ? { retcode: -400005, message: 'Parameter Error' } : okFor(id),
    );
    const builds = await fetchBuilds({ role, ids: [1091, 1311, 1321], fetchFn, wait: noWait });

    expect(urls).toHaveLength(3);
    expect(builds.fetchedIds).toEqual([1091, 1321]);
    expect(builds.stopped).toBeNull();
    expect(builds.failures[0]?.kind).toBe('bad_params');
  });

  it('una respuesta OK pero vacía cuenta como fallo, no como build traída', async () => {
    const { fetchFn } = fakeFetch(() => ({ retcode: 0, message: 'OK', data: null }));
    const builds = await fetchBuilds({ role, ids: [1091], fetchFn, wait: noWait });

    expect(builds.fetchedIds).toEqual([]);
    expect(builds.failures[0]?.message).toBe('respuesta sin datos');
  });

  it('avisa agente por agente: es lo que mantiene vivo al service worker', async () => {
    const { fetchFn } = fakeFetch(okFor);
    const events: string[] = [];
    await fetchBuilds({
      role,
      ids: [1091, 1311, 1321],
      fetchFn,
      wait: noWait,
      onAgent: ({ id, done, total }) => events.push(`${id}:${done}/${total}`),
    });

    expect(events).toEqual(['1091:1/3', '1311:2/3', '1321:3/3']);
  });

  it('sin agentes que pedir no hace un solo request', async () => {
    const { fetchFn, urls } = fakeFetch(okFor);
    const builds = await fetchBuilds({ role, ids: [], fetchFn, wait: noWait });

    expect(urls).toEqual([]);
    expect(builds).toEqual({
      payloads: [],
      fetchedIds: [],
      failures: [],
      stopped: null,
      requested: 0,
    });
  });
});

describe('collapseBuildFailures', () => {
  const failure = (id: number, kind: SectionFailure['kind'], message: string): BuildFailure => ({
    id,
    section: 'avatar_info',
    kind,
    retcode: null,
    traceId: `trace-${id}`,
    message,
  });

  const sync = (over: Partial<BuildsSync>): BuildsSync => ({
    payloads: [],
    fetchedIds: [],
    failures: [],
    stopped: null,
    requested: 0,
    ...over,
  });

  it('veinte agentes fallando por lo mismo son UNA advertencia, no veinte', () => {
    const failures = Array.from({ length: 20 }, (_, i) => failure(i + 1, 'error', 'Server Error'));
    const collapsed = collapseBuildFailures(
      sync({ requested: 36, fetchedIds: Array.from({ length: 16 }, (_, i) => 100 + i), failures }),
    );

    expect(collapsed).toEqual({
      section: 'avatar_info',
      kind: 'error',
      retcode: null,
      traceId: 'trace-1',
      message: 'Server Error',
      text: 'faltaron 20 de 36 builds: Server Error (agente 1). Volvé a importar para completarlas',
    });
  });

  it('con motivos distintos manda el más frecuente y dice cuántos son', () => {
    const collapsed = collapseBuildFailures(
      sync({
        requested: 10,
        fetchedIds: [1, 2, 3, 4, 5, 6],
        failures: [
          failure(7, 'error', 'Server Error'),
          failure(8, 'not_public', 'not public'),
          failure(9, 'error', 'Server Error'),
          failure(10, 'error', 'Server Error'),
        ],
      }),
    );

    expect(collapsed?.kind).toBe('error');
    expect(collapsed?.traceId).toBe('trace-7');
    expect(collapsed?.text).toBe(
      'faltaron 4 de 10 builds, 3 por el mismo motivo: Server Error (agente 7). ' +
        'Volvé a importar para completarlas',
    );
  });

  it('cuenta los agentes que el corte dejó sin pedir, no sólo el que falló', () => {
    const collapsed = collapseBuildFailures(
      sync({
        requested: 36,
        fetchedIds: Array.from({ length: 30 }, (_, i) => i + 1),
        failures: [failure(31, 'hard_limit', 'blocked')],
        stopped: {
          kind: 'hard_limit',
          retcode: 10041,
          message: 'blocked',
          data: null,
          traceId: 'trace-31',
          httpStatus: 200,
        },
      }),
    );

    // 5 nunca se pidieron y 1 falló: las 6 faltan igual.
    expect(collapsed?.text).toBe(
      'faltaron 6 de 36 builds: blocked (agente 31). Volvé a importar para completarlas',
    );
  });

  it('sin faltantes no hay advertencia', () => {
    expect(collapseBuildFailures(sync({ requested: 3, fetchedIds: [1, 2, 3] }))).toBeNull();
    expect(collapseBuildFailures(sync({}))).toBeNull();
  });
});

describe('el texto que ve el usuario', () => {
  // Tal cual lo arma el background para la lista de advertencias del popup.
  const warning = (failure: SectionFailure) => `${failure.section}: ${failureText(failure)}`;

  const cutDuringBuilds = collapseBuildFailures({
    payloads: [],
    fetchedIds: Array.from({ length: 30 }, (_, i) => i + 1),
    failures: [
      {
        id: 31,
        section: 'avatar_info',
        kind: 'hard_limit',
        retcode: 10041,
        traceId: 'abc123',
        message: 'blocked',
      },
    ],
    stopped: null,
    requested: 36,
  })!;

  it('el corte durante las builds no dice que se canceló el import: no se canceló', () => {
    expect(warning(cutDuringBuilds)).toBe(
      'avatar_info: faltaron 6 de 36 builds: blocked (agente 31). ' +
        'Volvé a importar para completarlas [trace: abc123]',
    );
    expect(warning(cutDuringBuilds)).not.toContain('Se canceló el import entero');
  });

  it('el x-trace-id sigue viajando aunque el texto no pase por userMessage', () => {
    expect(warning(cutDuringBuilds)).toContain('[trace: abc123]');
  });

  it('un fallo de una sección principal sí usa el texto genérico del retcode', () => {
    expect(
      warning({
        section: 'lost_void',
        kind: 'hard_limit',
        retcode: 10041,
        traceId: 'xyz789',
        message: 'blocked',
      }),
    ).toBe(
      'lost_void: HoYoLAB cortó el acceso (retcode 10041). Se canceló el import entero; ' +
        'probá más tarde. Detalle: blocked. [trace: xyz789]',
    );
  });
});
