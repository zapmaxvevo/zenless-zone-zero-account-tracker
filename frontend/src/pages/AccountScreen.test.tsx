import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { account, agent, roster, team } from '../test/fixtures';
import { UID, orderOf, renderScreen, stubStoredKey, valueAfter, valueBefore } from '../test/render';
import AccountPage from './AccountPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function screen(): string {
  return renderScreen(`/account/${UID}`, <AccountPage />);
}

function stubDashboard(overrides: Record<string, unknown> = {}): void {
  stubApi({
    getAccount: account(),
    listAgents: { items: roster() },
    listTeams: { items: [team()] },
    ...overrides,
  });
}

beforeEach(() => {
  stubStoredKey(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el panel de una cuenta', () => {
  beforeEach(stubDashboard);

  it('presenta la cuenta con su apodo, su nivel y su servidor', () => {
    const html = screen();

    expect(html).toContain('Proxy');
    expect(html).toContain('Nivel Inter-Knot 51');
    expect(valueAfter(html, 'Servidor')).toBe('América');
    expect(valueAfter(html, 'UID')).toBe(UID);
  });

  it('cuenta agentes y equipos en singular y en plural', () => {
    expect(screen()).toContain('3 agentes · 1 equipo');
  });

  it('resume el roster: cuántos discos hay y a quién le falta W-Engine', () => {
    const html = screen();

    expect(valueAfter(html, 'Discos')).toBe('9');
    expect(html).toContain('1 sin W-Engine');
    expect(valueAfter(html, 'Nivel medio')).toBe('43');
  });

  it('el score de cuenta es el promedio de las builds', () => {
    expect(valueBefore(screen(), 'Score de cuenta')).toBe('55');
  });

  it('las mejores builds salen ordenadas por score', () => {
    const [ellen, lycaon, anby] = orderOf(screen(), 'Ellen Joe', 'Von Lycaon', 'Anby');

    expect(ellen).toBeLessThan(lycaon);
    expect(lycaon).toBeLessThan(anby);
  });

  it('el equipo guardado muestra sus tres caras y su score', () => {
    const html = screen();

    expect(html).toContain('Congelador');
    expect(html).toContain('3 de 3 slots · Shiyu capa 7');
  });
});

describe('una cuenta recién trackeada', () => {
  it('sin agentes ni equipos lo dice en cada bloque, sin esconderlos', () => {
    stubDashboard({
      getAccount: account({ agent_count: 0 }),
      listAgents: { items: [] },
      listTeams: { items: [] },
    });
    const html = screen();

    expect(html).toContain('Todavía no hay agentes sincronizados');
    expect(html).toContain('Ningún equipo guardado');
    expect(html).toContain('Mejores builds');
    expect(html).toContain('Equipos guardados');
  });

  it('sin agentes el score de cuenta es un guion, no un cero', () => {
    stubDashboard({ listAgents: { items: [] } });

    expect(valueBefore(screen(), 'Score de cuenta')).toBe('—');
  });
});

describe('el panel cuando la cuenta no llega', () => {
  it('un UID que el backend no conoce muestra su error y ningún dato', () => {
    stubDashboard({ getAccount: new ApiError(404, 'No existe') });
    const html = screen();

    expect(html).toContain('No encontramos esa cuenta');
    expect(html).not.toContain('Mejores builds');
  });

  it('mientras carga la cuenta no dibuja el panel', () => {
    stubApi({});
    const html = screen();

    expect(html).toContain('Cargando la cuenta…');
    expect(html).not.toContain('Mejores builds');
  });
});

describe('el botón de sincronizar', () => {
  it('en enfriamiento dice cuánto falta en vez de dejarse tocar', () => {
    const soon = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    stubDashboard({ getAccount: account({ next_sync_available_at: soon }) });

    expect(screen()).toContain('Disponible en');
  });

  it('sin enfriamiento se ofrece sincronizar', () => {
    stubDashboard();

    expect(screen()).toContain('>Sincronizar<');
  });
});

describe('el panel sin la key de la cuenta', () => {
  it('el atajo a la key avisa que se está en modo lectura', () => {
    stubDashboard();

    expect(screen()).toContain('Modo lectura');
  });

  it('con la key guardada el atajo lleva a administrarla', () => {
    stubStoredKey(UID);
    stubDashboard();
    const html = screen();

    expect(html).toContain('Key de la cuenta');
    expect(html).not.toContain('Modo lectura');
  });
});

describe('el resumen de discos', () => {
  it('con todos los agentes armados no habla de faltantes', () => {
    stubDashboard({ listAgents: { items: [agent({ id: 1 }), agent({ id: 2 })] } });

    expect(screen()).toContain('Todos con W-Engine');
  });
});
