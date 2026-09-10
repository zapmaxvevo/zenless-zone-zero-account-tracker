/**
 * Lo que escribe: pegar la key, guardar una build, borrar un agente.
 *
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { agentDetail } from '../test/fixtures';
import { mount, settle, stubFetch } from '../test/live';
import { KEY, UID, stubStoredKey } from '../test/render';
import AccountKeyPage from './AccountKeyPage';
import AgentFormPage from './AgentFormPage';
import AgentPage from './AgentPage';

const ACCOUNT = `GET /accounts/${UID}`;
const OWNERSHIP = `GET /accounts/${UID}/ownership`;
const CATALOGS = {
  'GET /catalog/agents': { body: { items: [] } },
  'GET /catalog/wengines': { body: { items: [] } },
  'GET /catalog/discs': { body: { items: [] } },
  'GET /catalog/properties': { body: { items: [] } },
};

function accountBody(overrides: Record<string, unknown> = {}) {
  return {
    uid: UID,
    nickname: 'Proxy',
    level: 51,
    signature: '',
    profile_id: null,
    avatar_id: null,
    title_id: null,
    calling_card_id: null,
    last_synced_at: null,
    next_sync_available_at: null,
    region: 'prod_gf_us',
    chronicle_public: true,
    chronicle_synced_at: null,
    chronicle_import_source: null,
    has_owner: true,
    agent_count: 0,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('pegar una key en un navegador que no la tiene', () => {
  beforeEach(() => {
    stubStoredKey(null);
  });

  it('algo que no tiene forma de key ni se le consulta al backend', async () => {
    const calls = stubFetch({ [ACCOUNT]: { body: accountBody() } });

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.change(screen.getByLabelText('Pegar una key'), { target: { value: 'hola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la key acá' }));
    await settle();

    expect(screen.getByText(/Una key del tracker empieza con zzk_/)).toBeDefined();
    expect(calls.some((call) => call === OWNERSHIP)).toBe(false);
  });

  it('una key que no es la de este UID lo dice, y no se guarda', async () => {
    stubFetch({
      [ACCOUNT]: { body: accountBody() },
      [OWNERSHIP]: { status: 403, body: { code: 'forbidden', detail: 'No' } },
    });

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.change(screen.getByLabelText('Pegar una key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la key acá' }));
    await settle();

    expect(screen.getByText(/no es la de este UID/)).toBeDefined();
    expect(screen.queryByText('Olvidar la key')).toBeNull();
  });

  it('un UID que nadie reclamó es otro problema: no hay key que sirva', async () => {
    stubFetch({
      [ACCOUNT]: { body: accountBody({ has_owner: false }) },
      [OWNERSHIP]: { status: 409, body: { code: 'unclaimed_account', detail: 'Sin dueño' } },
    });

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.change(screen.getByLabelText('Pegar una key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la key acá' }));
    await settle();

    expect(screen.getByText(/Nadie reclamó este UID todavía/)).toBeDefined();
    expect(screen.queryByText(/no es la de este UID/)).toBeNull();
  });

  it('la key que el backend acepta habilita la escritura del UID', async () => {
    stubFetch({ [ACCOUNT]: { body: accountBody() }, [OWNERSHIP]: { status: 204 } });

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.change(screen.getByLabelText('Pegar una key'), { target: { value: KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar la key acá' }));
    await settle();

    await waitFor(() => expect(screen.getByText(/El backend aceptó la key/)).toBeDefined());
    expect(screen.getByText('Olvidar la key')).toBeDefined();
    expect(screen.getByText('Puede escribir')).toBeDefined();
  });
});

describe('olvidar la key guardada', () => {
  beforeEach(() => {
    stubStoredKey(UID);
    stubFetch({ [ACCOUNT]: { body: accountBody() } });
  });

  it('sin confirmar la key sigue ahí', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Olvidar la key' }));
    await settle();

    expect(screen.getByText('Puede escribir')).toBeDefined();
  });

  it('confirmando, el UID vuelve a modo lectura sin recargar la página', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await mount(`/account/${UID}/key`, <AccountKeyPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Olvidar la key' }));
    await settle();

    await waitFor(() => expect(screen.getByText(/Key borrada de este navegador/)).toBeDefined());
    expect(screen.getByText(/Este navegador no guarda la key del UID/)).toBeDefined();
  });

  it('ver la key la destapa y volver a tocar la tapa', async () => {
    await mount(`/account/${UID}/key`, <AccountKeyPage />);

    expect(screen.queryByText(KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver' }));
    expect(screen.getByText(KEY)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(screen.queryByText(KEY)).toBeNull();
  });
});

describe('borrar un agente del roster', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  it('sin confirmar no se borra', async () => {
    const calls = stubFetch({
      'GET /agents/1': { body: agentDetail() },
      'GET /catalog/properties': { body: { items: [] } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await mount(`/account/${UID}/agents/1`, <AgentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await settle();

    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('el aviso nombra al agente y avisa qué pasa con sus equipos', async () => {
    stubFetch({
      'GET /agents/1': { body: agentDetail() },
      'GET /catalog/properties': { body: { items: [] } },
    });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await mount(`/account/${UID}/agents/1`, <AgentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));

    expect(confirm.mock.calls[0][0]).toContain('Ellen Joe');
    expect(confirm.mock.calls[0][0]).toContain('esos equipos siguen existiendo');
  });

  it('un borrado que el backend rechaza deja al agente en pantalla, con el motivo', async () => {
    stubFetch({
      'GET /agents/1': { body: agentDetail() },
      'GET /catalog/properties': { body: { items: [] } },
      'DELETE /agents/1': { status: 403, body: { code: 'forbidden', detail: 'No' } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await mount(`/account/${UID}/agents/1`, <AgentPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    await settle();

    await waitFor(() => expect(screen.getByText(/no es la de este UID/)).toBeDefined());
    expect(screen.getByText('Ellen Joe')).toBeDefined();
  });
});

describe('guardar la edición de un agente', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  it('manda sólo lo que cambió', async () => {
    const bodies: unknown[] = [];
    stubFetch({ 'GET /agents/1': { body: agentDetail() }, ...CATALOGS });
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)));
      return real(input, init);
    });

    await mount(`/account/${UID}/agents/1/edit`, <AgentFormPage />);
    fireEvent.change(screen.getByLabelText('Mindscape'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle();

    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ mindscape_level: 4 });
  });

  it('el campo lleva el tope del juego, así que un valor fuera de rango ni se manda', async () => {
    const calls = stubFetch({ 'GET /agents/1': { body: agentDetail() }, ...CATALOGS });

    await mount(`/account/${UID}/agents/1/edit`, <AgentFormPage />);
    const level = screen.getByLabelText('Nivel', {
      selector: '#agent-level',
    }) as HTMLInputElement;
    fireEvent.change(level, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle();

    expect(level.checkValidity()).toBe(false);
    expect(calls.some((call) => call.startsWith('PATCH'))).toBe(false);
  });

  it('dos substats iguales en un disco se frenan acá y se explican', async () => {
    const calls = stubFetch({
      'GET /agents/1': { body: agentDetail() },
      ...CATALOGS,
      'GET /catalog/properties': {
        body: {
          items: [
            { prop_id: 20103, name: 'Prob. CRIT', format: '{0:0.#%}' },
            { prop_id: 21103, name: 'DAÑO CRIT', format: '{0:0.#%}' },
          ],
        },
      },
    });

    await mount(`/account/${UID}/agents/1/edit`, <AgentFormPage />);
    fireEvent.change(screen.getByLabelText('Substat 2 del disco 1'), {
      target: { value: '20103' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle();

    expect(screen.getByText('El disco 1: hay un substat repetido.')).toBeDefined();
    expect(calls.some((call) => call.startsWith('PATCH'))).toBe(false);
  });
});
