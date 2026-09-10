import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, queryString } from './client';

function stubFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal('fetch', (url: string) => {
    urls.push(url);
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  return urls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queryString', () => {
  it('arma la query con lo que está presente', () => {
    expect(queryString({ force: true, previous: false })).toBe('?force=true&previous=false');
    expect(queryString({ mode: 'shiyu_defense' })).toBe('?mode=shiyu_defense');
  });

  it('saltea los parámetros ausentes para que el backend aplique su default', () => {
    expect(queryString({ force: undefined, previous: null })).toBe('');
    expect(queryString({})).toBe('');
    expect(queryString({ force: undefined, previous: true })).toBe('?previous=true');
  });
});

describe('rutas del chronicle', () => {
  it('filtra los desafíos por modo solo si se pide uno', async () => {
    const urls = stubFetch();

    await api.listChallenges('1300000000');
    await api.listChallenges('1300000000', 'deadly_assault');

    expect(urls).toEqual([
      '/api/accounts/1300000000/challenges',
      '/api/accounts/1300000000/challenges?mode=deadly_assault',
    ]);
  });

  it('pega a las rutas del resto del chronicle', async () => {
    const urls = stubFetch();

    await api.listBangboos('1300000000');
    await api.getLostVoid('1300000000');

    expect(urls).toEqual([
      '/api/accounts/1300000000/bangboos',
      '/api/accounts/1300000000/lost-void',
    ]);
  });
});
