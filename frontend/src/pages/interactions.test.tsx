/**
 * Lo que sólo se puede probar con la pantalla viva: efectos, clics y estado.
 *
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { roster, team } from '../test/fixtures';
import { mount, settle, stubFetch } from '../test/live';
import { UID, stubStoredKey } from '../test/render';
import HomePage from './HomePage';
import RosterPage from './RosterPage';
import TeamEditorPage from './TeamEditorPage';
import TeamsPage from './TeamsPage';

const AGENTS = `GET /accounts/${UID}/agents`;
const TEAMS = `GET /accounts/${UID}/teams`;
const CATALOG = 'GET /catalog/agents';

beforeEach(() => {
  stubStoredKey(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reintentar después de un error', () => {
  it('vuelve a pedirle la lista al backend y muestra los agentes', async () => {
    const calls = stubFetch({
      [AGENTS]: [{ status: 502, body: { detail: 'Enka caído' } }, { body: { items: roster() } }],
      [CATALOG]: { body: { items: [] } },
    });

    await mount(`/account/${UID}/agents`, <RosterPage />);
    expect(screen.getByText(/Enka no está respondiendo/)).toBeDefined();
    expect(calls.filter((call) => call === AGENTS)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await settle();

    expect(calls.filter((call) => call === AGENTS)).toHaveLength(2);
    await waitFor(() => expect(screen.getByText('Ellen Joe')).toBeDefined());
    expect(screen.queryByText(/Enka no está respondiendo/)).toBeNull();
  });
});

describe('los filtros del roster', () => {
  beforeEach(() => {
    stubFetch({ [AGENTS]: { body: { items: roster() } }, [CATALOG]: { body: { items: [] } } });
  });

  it('buscar por nombre deja sólo a quien coincide', async () => {
    await mount(`/account/${UID}/agents`, <RosterPage />);

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'anby' } });

    expect(screen.getByText('Anby')).toBeDefined();
    expect(screen.queryByText('Ellen Joe')).toBeNull();
  });

  it('un filtro que no deja pasar a nadie lo dice en vez de mostrar la grilla vacía', async () => {
    await mount(`/account/${UID}/agents`, <RosterPage />);

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'nadie' } });

    expect(screen.getByText('Ningún agente coincide con el filtro.')).toBeDefined();
  });

  it('el atributo filtra por el elemento del agente', async () => {
    await mount(`/account/${UID}/agents`, <RosterPage />);

    fireEvent.change(screen.getByLabelText('Atributo'), { target: { value: 'Elec' } });

    expect(screen.getByText('Anby')).toBeDefined();
    expect(screen.queryByText('Von Lycaon')).toBeNull();
  });

  it('ordenar por nombre cambia el orden que impone el score', async () => {
    const view = await mount(`/account/${UID}/agents`, <RosterPage />);

    fireEvent.change(screen.getByLabelText('Orden'), { target: { value: 'name' } });

    const names = [...view.container.querySelectorAll('.ne-portrait-name h4')].map(
      (node) => node.textContent,
    );
    expect(names).toEqual(['Anby', 'Ellen Joe', 'Von Lycaon']);
  });
});

describe('el editor de equipo', () => {
  beforeEach(() => {
    stubFetch({
      [AGENTS]: { body: { items: roster() } },
      [CATALOG]: { body: { items: [] } },
      [`GET /teams/7`]: { body: team() },
    });
    stubStoredKey(UID);
  });

  it('no deja poner al mismo agente en dos slots', async () => {
    await mount(`/account/${UID}/teams/new`, <TeamEditorPage />);

    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Doble' } });
    fireEvent.change(screen.getByLabelText('Slot 1'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Slot 2'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle();

    expect(screen.getByText(/cada uno puede ocupar un solo slot/)).toBeDefined();
  });

  it('no hay un cuarto slot que llenar', async () => {
    await mount(`/account/${UID}/teams/new`, <TeamEditorPage />);

    expect(screen.getByLabelText('Slot 3')).toBeDefined();
    expect(screen.queryByLabelText('Slot 4')).toBeNull();
  });

  it('un equipo sin nombre no se guarda', async () => {
    const calls = stubFetch({
      [AGENTS]: { body: { items: roster() } },
      [CATALOG]: { body: { items: [] } },
    });

    await mount(`/account/${UID}/teams/new`, <TeamEditorPage />);
    fireEvent.change(screen.getByLabelText('Slot 1'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await settle();

    expect(screen.getByText('Poné un nombre al equipo.')).toBeDefined();
    expect(calls.some((call) => call.startsWith('POST'))).toBe(false);
  });
});

describe('borrar un equipo', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  it('sin confirmar no se borra nada', async () => {
    const calls = stubFetch({
      [TEAMS]: { body: { items: [team()] } },
      [CATALOG]: { body: { items: [] } },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await mount(`/account/${UID}/teams`, <TeamsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    await settle();

    expect(calls.some((call) => call.startsWith('DELETE'))).toBe(false);
  });

  it('confirmando se borra y la lista se vuelve a pedir', async () => {
    const calls = stubFetch({
      [TEAMS]: [{ body: { items: [team()] } }, { body: { items: [] } }],
      [CATALOG]: { body: { items: [] } },
      'DELETE /teams/7': { status: 204 },
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await mount(`/account/${UID}/teams`, <TeamsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Borrar' }));
    await settle();

    expect(calls).toContain('DELETE /teams/7');
    await waitFor(() => expect(screen.getByText(/Todavía no armaste ningún equipo/)).toBeDefined());
  });
});

describe('seguir una cuenta nueva', () => {
  it('un UID que no son solo números ni se manda al backend', async () => {
    const calls = stubFetch({ 'GET /accounts': { body: { items: [] } } });

    await mount('/', <HomePage />);
    fireEvent.change(screen.getByLabelText('UID de la cuenta'), { target: { value: '13ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await settle();

    expect(screen.getByText('El UID son solo números.')).toBeDefined();
    expect(calls.some((call) => call === 'POST /accounts')).toBe(false);
  });

  it('un UID válido se manda y el error se borra al seguir escribiendo', async () => {
    const calls = stubFetch({
      'GET /accounts': { body: { items: [] } },
      'POST /accounts': { body: { uid: UID } },
    });

    await mount('/', <HomePage />);
    const input = screen.getByLabelText('UID de la cuenta');

    fireEvent.change(input, { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await settle();
    expect(screen.getByText('El UID tiene al menos 6 dígitos.')).toBeDefined();

    fireEvent.change(input, { target: { value: UID } });
    expect(screen.queryByText('El UID tiene al menos 6 dígitos.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Importar' }));
    await settle();
    expect(calls).toContain('POST /accounts');
  });

  it('actualizar vuelve a pedir la lista de cuentas', async () => {
    const calls = stubFetch({ 'GET /accounts': { body: { items: [] } } });

    await mount('/', <HomePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await settle();

    expect(calls.filter((call) => call === 'GET /accounts')).toHaveLength(2);
  });
});
