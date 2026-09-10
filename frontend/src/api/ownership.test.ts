import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import { ApiError, KEY_HEADER, api } from './client';
import { FORBIDDEN_MESSAGE, UNCLAIMED_MESSAGE, WRONG_KEY_MESSAGE, describeError } from './errors';

const UID = '1300000000';
const OTHER_UID = '1300000001';
const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

interface Call {
  url: string;
  key: string | undefined;
}

function stubFetch(body = '{}'): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, key: headers[KEY_HEADER] });
    return Promise.resolve(new Response(body, { status: 200 }));
  });
  return calls;
}

function stubRejection(status: number, detail: string, code: string): void {
  vi.stubGlobal('fetch', () =>
    Promise.resolve(new Response(JSON.stringify({ detail, code }), { status })),
  );
}

function stubStoredKeys(keys: Record<string, string>): Map<string, string> {
  const entries = new Map(Object.entries(keys).map(([uid, key]) => [storageKey(uid), key]));
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
  return entries;
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
    await api.listBangboos(UID);
    await api.catalogAgents();

    expect(calls).toHaveLength(8);
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
    await api.syncAccount(UID);

    expect(calls).toHaveLength(7);
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

  it('el rechazo del backend llega con su code, y cada uno dice otra cosa', async () => {
    stubStoredKeys({});

    stubRejection(403, 'This account has an owner', 'forbidden');
    const forbidden = await api
      .updateAgent(UID, 7, { level: 60 })
      .catch((caught: unknown) => caught);

    stubRejection(409, 'Claim the account before writing to it', 'unclaimed_account');
    const unclaimed = await api.deleteTeam(UID, 3).catch((caught: unknown) => caught);

    expect(forbidden).toBeInstanceOf(ApiError);
    expect((forbidden as ApiError).code).toBe('forbidden');
    expect(describeError(forbidden)).toBe(FORBIDDEN_MESSAGE);

    expect((unclaimed as ApiError).code).toBe('unclaimed_account');
    expect(describeError(unclaimed)).toBe(UNCLAIMED_MESSAGE);
  });

  it('el error recuerda si la llamada presentó una key, que es lo que separa los dos 403', async () => {
    stubStoredKeys({ [UID]: KEY });
    stubRejection(403, 'This account has an owner', 'forbidden');
    const withKey = await api.updateAgent(UID, 7, { level: 60 }).catch((c: unknown) => c);

    stubStoredKeys({});
    stubRejection(403, 'This account has an owner', 'forbidden');
    const withoutKey = await api.updateAgent(UID, 7, { level: 60 }).catch((c: unknown) => c);

    expect((withKey as ApiError).sentKey).toBe(true);
    expect(describeError(withKey)).toBe(WRONG_KEY_MESSAGE);

    expect((withoutKey as ApiError).sentKey).toBe(false);
    expect(describeError(withoutKey)).toBe(FORBIDDEN_MESSAGE);
  });

  it('empezar a trackear no manda key ni se guarda ninguna: la web ya no reclama nada', async () => {
    const entries = stubStoredKeys({});
    const calls = stubFetch(JSON.stringify({ uid: UID, has_owner: false, account_key: KEY }));

    await api.trackAccount(UID);

    expect(calls.map((call) => call.url)).toEqual(['/api/accounts']);
    expect(calls[0].key).toBeUndefined();
    expect([...entries.keys()]).toEqual([]);
  });
});
