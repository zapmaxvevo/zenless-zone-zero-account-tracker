import { describe, expect, it } from 'vitest';
import {
  avatarInfoUrl,
  chronicleUrl,
  classifyRetcode,
  discoverRole,
  fetchHoyolab,
  jitterMs,
  recordCardUrl,
  regionForUid,
  runSerialized,
  userMessage,
  DEFAULT_REGION,
  JITTER_MAX_MS,
  JITTER_MIN_MS,
  STOP_KINDS,
  type HttpResponseLike,
} from './hoyolab';

describe('classifyRetcode', () => {
  it('mapea cada familia de retcodes a su tipo', () => {
    expect(classifyRetcode(0)).toBe('ok');
    expect(classifyRetcode(-100)).toBe('invalid_session');
    expect(classifyRetcode(10001)).toBe('invalid_session');
    expect(classifyRetcode(10102)).toBe('not_public');
    expect(classifyRetcode(10104)).toBe('not_public');
    expect(classifyRetcode(10101)).toBe('rate_limited');
    expect(classifyRetcode(-110)).toBe('rate_limited');
    expect(classifyRetcode(1028)).toBe('rate_limited');
    expect(classifyRetcode(1034)).toBe('captcha');
    expect(classifyRetcode(10035)).toBe('captcha');
  });

  it('el 5003 no se trata como captcha hasta que la fase 0 lo observe en ZZZ', () => {
    expect(classifyRetcode(5003)).toBe('error');
  });

  it('el 10041 es el límite duro, no un captcha más', () => {
    expect(classifyRetcode(10041)).toBe('hard_limit');
  });

  it('el -400005 es un bug nuestro de parámetros, no un problema de la sesión', () => {
    expect(classifyRetcode(-400005)).toBe('bad_params');
    const text = userMessage('bad_params');
    expect(text).toContain('bug de la extensión');
    expect(STOP_KINDS).not.toContain('bad_params');
  });

  it('un retcode desconocido cae al error genérico', () => {
    expect(classifyRetcode(99999)).toBe('error');
  });
});

describe('avatarInfoUrl', () => {
  const role = { roleId: '1500123456', server: 'prod_gf_eu' };

  it('arma la forma verificada: id_list[] con corchetes literales y un solo id', () => {
    expect(avatarInfoUrl(role, 1091)).toBe(
      'https://sg-act-public-api.hoyolab.com/event/game_record_zzz/api/zzz/avatar/info' +
        '?id_list[]=1091&need_wiki=false&role_id=1500123456&server=prod_gf_eu',
    );
  });

  it('no usa la forma indexada id_list[0], que devuelve -400005', () => {
    expect(avatarInfoUrl(role, 1091)).not.toContain('id_list[0]');
    expect(avatarInfoUrl(role, 1091)).not.toContain('%5B%5D');
  });

  it('acepta el id como string', () => {
    expect(avatarInfoUrl(role, '1311')).toContain('id_list[]=1311');
  });
});

describe('jitterMs', () => {
  it('se queda dentro de la ventana 300-800', () => {
    expect(jitterMs(() => 0)).toBe(JITTER_MIN_MS);
    expect(jitterMs(() => 0.999999)).toBeLessThanOrEqual(JITTER_MAX_MS);
    expect(jitterMs(() => 0.5)).toBeGreaterThanOrEqual(JITTER_MIN_MS);
    expect(jitterMs(() => 0.5)).toBeLessThanOrEqual(JITTER_MAX_MS);
  });
});

describe('runSerialized', () => {
  it('ejecuta en serie, con una espera con jitter entre pasos y ninguna antes del primero', async () => {
    const waits: number[] = [];
    const order: string[] = [];
    const step = (name: string) => async () => {
      order.push(`start:${name}`);
      order.push(`end:${name}`);
      return name;
    };
    const results = await runSerialized([step('a'), step('b'), step('c')], {
      wait: async (ms) => {
        waits.push(ms);
      },
    });
    expect(results).toEqual(['a', 'b', 'c']);
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
    expect(waits).toHaveLength(2);
    for (const ms of waits) {
      expect(ms).toBeGreaterThanOrEqual(JITTER_MIN_MS);
      expect(ms).toBeLessThanOrEqual(JITTER_MAX_MS);
    }
  });

  it('stopWhen corta la secuencia sin ejecutar lo que falta', async () => {
    const executed: number[] = [];
    const steps = [1, 2, 3, 4].map((n) => async () => {
      executed.push(n);
      return n;
    });
    const results = await runSerialized(steps, {
      wait: async () => {},
      stopWhen: (n) => n === 2,
    });
    expect(results).toEqual([1, 2]);
    expect(executed).toEqual([1, 2]);
  });
});

describe('regionForUid', () => {
  it('deriva la región del prefijo del UID', () => {
    expect(regionForUid('1000000001')).toBe('prod_gf_us');
    expect(regionForUid('1300000001')).toBe('prod_gf_jp');
    expect(regionForUid('1500000001')).toBe('prod_gf_eu');
    expect(regionForUid('1700000001')).toBe('prod_gf_sg');
  });

  it('un prefijo desconocido cae a la región por defecto', () => {
    expect(regionForUid('9900000001')).toBe(DEFAULT_REGION);
  });

  it('los UID de 8 dígitos (China) no se soportan', () => {
    expect(regionForUid('12345678')).toBeNull();
  });

  it('lo que no parece un UID no tiene región', () => {
    expect(regionForUid('abc')).toBeNull();
    expect(regionForUid('')).toBeNull();
  });
});

describe('discoverRole', () => {
  const card = {
    list: [
      { game_id: 2, game_role_id: '700000001', region: 'os_euro', nickname: 'viajero' },
      { game_id: 8, game_role_id: '1500000001', region: 'prod_gf_eu', nickname: 'proxy' },
    ],
  };

  it('encuentra la entrada de ZZZ en getGameRecordCard', () => {
    expect(discoverRole(card)).toEqual({
      roleId: '1500000001',
      server: 'prod_gf_eu',
      nickname: 'proxy',
    });
  });

  it('sin entrada de ZZZ cae al UID conocido, con región por prefijo', () => {
    expect(discoverRole({ list: [{ game_id: 2 }] }, '1000000001')).toEqual({
      roleId: '1000000001',
      server: 'prod_gf_us',
    });
    expect(discoverRole(null, '1300000001')).toEqual({
      roleId: '1300000001',
      server: 'prod_gf_jp',
    });
  });

  it('el fallback rechaza UIDs chinos en vez de inventar región', () => {
    expect(discoverRole(null, '12345678')).toBeNull();
  });

  it('sin card ni fallback no hay rol', () => {
    expect(discoverRole(null)).toBeNull();
    expect(discoverRole({ list: 'no soy una lista' })).toBeNull();
  });
});

describe('chronicleUrl', () => {
  const role = { roleId: '1500000001', server: 'prod_gf_eu' };

  it('los endpoints de la familia role_id llevan role_id + server', () => {
    const url = new URL(chronicleUrl('index', role));
    expect(url.pathname.endsWith('/index')).toBe(true);
    expect(url.searchParams.get('role_id')).toBe('1500000001');
    expect(url.searchParams.get('server')).toBe('prod_gf_eu');
    expect(url.searchParams.get('uid')).toBeNull();
  });

  it('los endpoints de la familia uid llevan uid + region', () => {
    const url = new URL(chronicleUrl('deadly_assault', role, { schedule_type: '1' }));
    expect(url.pathname.endsWith('/hadal_mem_detail_v2')).toBe(true);
    expect(url.searchParams.get('uid')).toBe('1500000001');
    expect(url.searchParams.get('region')).toBe('prod_gf_eu');
    expect(url.searchParams.get('schedule_type')).toBe('1');
    expect(url.searchParams.get('role_id')).toBeNull();
  });

  it('abysss2 con tres eses es la errata real, no un typo', () => {
    expect(chronicleUrl('lost_void', role)).toContain('/abysss2_abstract?');
  });

  it('la URL del record card lleva el ltuid como uid', () => {
    expect(recordCardUrl('123456')).toBe(
      'https://sg-act-public-api.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=123456',
    );
  });
});

function fakeResponse(args: {
  status?: number;
  body?: unknown;
  traceId?: string | null;
  invalidJson?: boolean;
}): HttpResponseLike {
  return {
    status: args.status ?? 200,
    headers: { get: (name) => (name === 'x-trace-id' ? (args.traceId ?? null) : null) },
    json: () =>
      args.invalidJson ? Promise.reject(new Error('not json')) : Promise.resolve(args.body),
  };
}

describe('fetchHoyolab', () => {
  it('desenvuelve data y clasifica el retcode, guardando el x-trace-id', async () => {
    const response = await fetchHoyolab('https://example.test', {
      fetchFn: async () =>
        fakeResponse({
          body: { retcode: 0, message: 'OK', data: { role: { nickname: 'proxy' } } },
          traceId: 'trace-1',
        }),
    });
    expect(response.kind).toBe('ok');
    expect(response.data).toEqual({ role: { nickname: 'proxy' } });
    expect(response.traceId).toBe('trace-1');
  });

  it('manda las cookies y los headers x-rpc-*', async () => {
    let seenInit: RequestInit | undefined;
    await fetchHoyolab('https://example.test', {
      fetchFn: async (_url, init) => {
        seenInit = init;
        return fakeResponse({ body: { retcode: 0, message: '', data: {} } });
      },
      language: 'en-us',
    });
    expect(seenInit?.credentials).toBe('include');
    const headers = seenInit?.headers as Record<string, string>;
    expect(headers['x-rpc-lang']).toBe('en-us');
    expect(headers['x-rpc-language']).toBe('en-us');
    expect(headers['x-rpc-device_id']).toBe('');
  });

  it('un retcode de sesión vencida se clasifica aunque el HTTP sea 200', async () => {
    const response = await fetchHoyolab('https://example.test', {
      fetchFn: async () =>
        fakeResponse({ body: { retcode: -100, message: 'Not logged in', data: null } }),
    });
    expect(response.kind).toBe('invalid_session');
    expect(response.message).toBe('Not logged in');
    expect(response.data).toBeNull();
  });

  it('el 429 del WAF es rate limit aunque no haya retcode', async () => {
    const response = await fetchHoyolab('https://example.test', {
      fetchFn: async () => fakeResponse({ status: 429, invalidJson: true, traceId: 'trace-429' }),
    });
    expect(response.kind).toBe('rate_limited');
    expect(response.retcode).toBeNull();
    expect(response.traceId).toBe('trace-429');
  });

  it('un cuerpo que no es JSON degrada a error, no explota', async () => {
    const response = await fetchHoyolab('https://example.test', {
      fetchFn: async () => fakeResponse({ status: 502, invalidJson: true }),
    });
    expect(response.kind).toBe('error');
    expect(response.httpStatus).toBe(502);
  });

  it('un fallo de red degrada a error', async () => {
    const response = await fetchHoyolab('https://example.test', {
      fetchFn: async () => {
        throw new Error('DNS');
      },
    });
    expect(response.kind).toBe('error');
    expect(response.httpStatus).toBe(0);
  });
});
