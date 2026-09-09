import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import { KEY_HEADER, api } from './client';

const UID = '1300000000';
const OTHER_UID = '1300000001';
const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

interface Call {
  url: string;
  key: string | undefined;
}

function stubFetch(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, key: headers[KEY_HEADER] });
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  return calls;
}

function stubStoredKeys(keys: Record<string, string>): void {
  const entries = new Map(Object.entries(keys).map(([uid, key]) => [storageKey(uid), key]));
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la key en las llamadas al backend', () => {
  it('las lecturas no mandan el header aunque haya key guardada', async () => {
    stubStoredKeys({ [UID]: KEY });
    const calls = stubFetch();

    await api.getAccount(UID);
    await api.listAccounts();
    await api.listAgents(UID);
    await api.getAgent(7);
    await api.listTeams(UID);
    await api.getTeam(3);
    await api.getCredentialsStatus(UID);
    await api.listBangboos(UID);
    await api.catalogAgents();

    expect(calls).toHaveLength(9);
    expect(calls.every((call) => call.key === undefined)).toBe(true);
  });

  it('las escrituras mandan la key de la cuenta que tocan', async () => {
    stubStoredKeys({ [UID]: KEY });
    const calls = stubFetch();

    await api.createAgent(UID, { game_id: 1, level: 60 } as never);
    await api.updateAgent(UID, 7, { level: 60 });
    await api.deleteAgent(UID, 7);
    await api.createTeam(UID, { name: 'A', notes: '', members: [] });
    await api.updateTeam(UID, 3, { name: 'A', notes: '', members: [] });
    await api.deleteTeam(UID, 3);
    await api.storeCredentials(UID, { ltuid_v2: '42', ltoken_v2: 'v2_token' });
    await api.deleteCredentials(UID);
    await api.syncChronicle(UID);
    await api.syncAccount(UID);

    expect(calls).toHaveLength(10);
    expect(calls.every((call) => call.key === KEY)).toBe(true);
  });

  it('un agente de otra cuenta viaja con la key de esa cuenta, no con la de cualquiera', async () => {
    stubStoredKeys({ [UID]: KEY, [OTHER_UID]: `${KEY_PREFIX}otra` });
    const calls = stubFetch();

    await api.updateAgent(OTHER_UID, 7, { level: 60 });
    await api.deleteTeam(OTHER_UID, 3);

    expect(calls.map((call) => call.key)).toEqual([`${KEY_PREFIX}otra`, `${KEY_PREFIX}otra`]);
    expect(calls.map((call) => call.url)).toEqual(['/api/agents/7', '/api/teams/3']);
  });

  it('sin key guardada la escritura sale igual, y es el backend el que la rechaza', async () => {
    stubStoredKeys({});
    const calls = stubFetch();

    await api.updateAgent(UID, 7, { level: 60 });

    expect(calls[0].key).toBeUndefined();
  });

  it('empezar a trackear y reclamar no mandan key: son las puertas de entrada', async () => {
    stubStoredKeys({ [UID]: KEY });
    const calls = stubFetch();

    await api.trackAccount(UID);
    await api.claimAccount(UID);

    expect(calls.map((call) => call.url)).toEqual(['/api/accounts', `/api/accounts/${UID}/claim`]);
    expect(calls.every((call) => call.key === undefined)).toBe(true);
  });
});
