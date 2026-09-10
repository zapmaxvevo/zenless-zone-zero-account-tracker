import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { account, bangboo, lostVoid } from '../test/fixtures';
import { UID, renderScreen, stubStoredKey } from '../test/render';
import BangboosPage from './BangboosPage';
import LostVoidPage from './LostVoidPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function voidScreen(): string {
  return renderScreen(`/account/${UID}/chronicle/void`, <LostVoidPage />);
}

function boosScreen(): string {
  return renderScreen(`/account/${UID}/chronicle/bangboos`, <BangboosPage />);
}

beforeEach(() => {
  stubStoredKey(UID);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el Vacío Perdido con progreso', () => {
  beforeEach(() => {
    stubApi({ getAccount: account(), getLostVoid: lostVoid() });
  });

  it('muestra la licencia, el log de exploración y las comisiones pendientes', () => {
    const html = voidScreen();

    expect(html).toContain('Nv. 12');
    expect(html).toContain('/ 120');
    expect(html).toContain('70% completado');
    expect(html).toContain('15 pendientes');
  });

  it('muestra el desafío definitivo con su nivel', () => {
    const html = voidScreen();

    expect(html).toContain('4200');
    expect(html).toContain('Score · Nivel VI');
  });
});

describe('el Vacío Perdido sin progreso', () => {
  it('una cuenta que nunca lo sincronizó no es un error: es un acumulado vacío', () => {
    stubApi({ getAccount: account(), getLostVoid: new ApiError(404, 'Sin datos') });
    const html = voidScreen();

    expect(html).toContain('Esta cuenta nunca sincronizó el Vacío Perdido');
    expect(html).not.toContain('Reintentar');
  });

  it('un fallo real del backend sí se muestra como error, con reintento', () => {
    stubApi({ getAccount: account(), getLostVoid: new ApiError(500, 'Se rompió') });
    const html = voidScreen();

    expect(html).toContain('Se rompió');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Esta cuenta nunca sincronizó el Vacío Perdido');
  });

  it('mientras carga no decide entre vacío y error', () => {
    stubApi({ getAccount: account() });
    const html = voidScreen();

    expect(html).toContain('Cargando el Vacío Perdido…');
    expect(html).not.toContain('Esta cuenta nunca sincronizó el Vacío Perdido');
  });
});

describe('los bangboos de una cuenta', () => {
  it('lista cada bangboo con su nivel y sus estrellas', () => {
    stubApi({
      getAccount: account(),
      listBangboos: {
        items: [
          bangboo(),
          bangboo({ game_id: 53002, name: 'Butler', level: 40, star: 3, rarity: 3 }),
        ],
      },
    });
    const html = boosScreen();

    expect(html).toContain('Amillion');
    expect(html).toContain('Butler');
    expect(html).toContain('5 de 5 estrellas');
    expect(html).toContain('3 de 5 estrellas');
    expect(html).toContain('2 bangboos registrados');
  });

  it('sin bangboos explica que salen del Battle Chronicle', () => {
    stubApi({ getAccount: account(), listBangboos: { items: [] } });
    const html = boosScreen();

    expect(html).toContain('Esta cuenta no tiene bangboos sincronizados');
    expect(html).toContain('0 bangboos registrados');
    expect(html).not.toContain('Reintentar');
  });

  it('un fallo del backend no se lee como una cuenta sin bangboos', () => {
    stubApi({ getAccount: account(), listBangboos: new ApiError(500, 'Se cayó') });
    const html = boosScreen();

    expect(html).toContain('Se cayó');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Esta cuenta no tiene bangboos sincronizados');
  });
});

describe('las barras de progreso del Vacío', () => {
  it('un total en cero no rompe el porcentaje', () => {
    stubApi({
      getAccount: account(),
      getLostVoid: lostVoid({ exploration_log: 0, max_exploration_log: 0 }),
    });

    expect(voidScreen()).toContain('0% completado');
  });

  it('el desafío sin nivel alcanzado muestra un guion, no un vacío', () => {
    stubApi({ getAccount: account(), getLostVoid: lostVoid({ ultimate_challenge_tier: '' }) });

    expect(voidScreen()).toContain('Score · —');
  });
});
