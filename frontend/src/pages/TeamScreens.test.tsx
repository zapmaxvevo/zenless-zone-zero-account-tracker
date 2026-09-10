import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import TeamForm from '../components/TeamForm';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { stubApi } from '../test/fakeClient';
import { roster, team } from '../test/fixtures';
import { UID, render, renderScreen, stubStoredKey } from '../test/render';
import TeamEditorPage from './TeamEditorPage';
import TeamsPage from './TeamsPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function access(overrides: Partial<AccountAccess> = {}): AccountAccess {
  return {
    uid: UID,
    key: null,
    canWrite: true,
    hasOwner: true,
    untracked: false,
    resolving: false,
    saveKey: () => true,
    forget: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  stubStoredKey(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la lista de equipos', () => {
  function screen(): string {
    return renderScreen(`/account/${UID}/teams`, <TeamsPage />);
  }

  it('nombra cada equipo con sus miembros', () => {
    stubApi({ listTeams: { items: [team()] } });
    const html = screen();

    expect(html).toContain('Congelador');
    expect(html).toContain('Shiyu capa 7');
  });

  it('sin equipos invita a armar el primero', () => {
    stubApi({ listTeams: { items: [] } });
    const html = screen();

    expect(html).toContain('Todavía no armaste ningún equipo');
    expect(html).not.toContain('Cargando los equipos');
  });

  it('un fallo del backend no se lee como «no hay equipos»', () => {
    stubApi({ listTeams: new ApiError(500, 'Se cayó todo') });
    const html = screen();

    expect(html).toContain('Se cayó todo');
    expect(html).not.toContain('Todavía no armaste ningún equipo');
  });
});

describe('el editor de equipo', () => {
  function form(team: Parameters<typeof TeamForm>[0]['team'] = null): string {
    stubApi({ catalogAgents: { items: [] } });
    return render(<TeamForm uid={UID} access={access()} team={team} roster={roster()} />);
  }

  it('ofrece exactamente tres slots: no hay lugar para un cuarto agente', () => {
    const html = form();

    expect(html).toContain('Slot 1');
    expect(html).toContain('Slot 2');
    expect(html).toContain('Slot 3');
    expect(html).not.toContain('Slot 4');
  });

  it('cada slot puede elegir a cualquiera del roster, o quedar vacío', () => {
    const html = form();

    expect(html.split('Ellen Joe · Nv. 60')).toHaveLength(1 + 3);
    expect(html.split('— vacío —')).toHaveLength(1 + 3);
  });

  it('editar un equipo llega con cada miembro en su slot', () => {
    const html = form(team());

    expect(html).toContain('Editar equipo');
    expect(html).toContain('value="Congelador"');
  });

  it('sin agentes en la cuenta no hay nada que armar y lo explica', () => {
    stubApi({ catalogAgents: { items: [] } });
    const html = render(<TeamForm uid={UID} access={access()} team={null} roster={[]} />);

    expect(html).toContain('Esta cuenta no tiene agentes todavía');
    expect(html).not.toContain('Slot 1');
  });

  it('en modo lectura los slots quedan trabados y no se ofrece guardar', () => {
    stubApi({ catalogAgents: { items: [] } });
    const html = render(
      <TeamForm uid={UID} access={access({ canWrite: false })} team={null} roster={roster()} />,
    );

    expect(html).toContain('disabled=""');
    expect(html).not.toContain('>Guardar<');
    expect(html).toContain('>Volver<');
  });
});

describe('la pantalla del editor', () => {
  it('mientras el roster no vuelve no dibuja el formulario', () => {
    stubApi({});
    const html = renderScreen(`/account/${UID}/teams/7/edit`, <TeamEditorPage />);

    expect(html).toContain('Cargando…');
    expect(html).not.toContain('Slot 1');
  });

  it('con roster y equipo dibuja el formulario cargado', () => {
    stubApi({ listAgents: { items: roster() }, getTeam: team(), catalogAgents: { items: [] } });
    const html = renderScreen(`/account/${UID}/teams/7/edit`, <TeamEditorPage />);

    expect(html).toContain('Editar equipo');
    expect(html).toContain('Slot 3');
  });
});
