import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { MODE_DEADLY_ASSAULT } from '../api/types';
import { stubApi } from '../test/fakeClient';
import { account, attempt, bangboo, run } from '../test/fixtures';
import { UID, orderOf, renderScreen, stubStoredKey, valueAfter } from '../test/render';
import ChroniclePage from './ChroniclePage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

const CATALOG = {
  items: [
    {
      game_id: 1091,
      name: 'Ellen Joe',
      rarity: 4,
      profession: 'Attack',
      elements: ['Ice'],
      image_url: null,
      icon_url: null,
    },
  ],
};

function shiyu(): string {
  return renderScreen(`/account/${UID}/chronicle/shiyu`, <ChroniclePage mode="shiyu" />);
}

function assault(): string {
  return renderScreen(`/account/${UID}/chronicle/assault`, <ChroniclePage mode="assault" />);
}

function stubRuns(items: unknown[]): void {
  stubApi({
    getAccount: account(),
    listChallenges: { items },
    listBangboos: { items: [bangboo()] },
    catalogAgents: CATALOG,
  });
}

beforeEach(() => {
  stubStoredKey(UID);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la Defensa Shiyu con temporadas', () => {
  beforeEach(() => {
    stubRuns([
      run(),
      run({ id: 12, begin_time: '2026-08-01T04:00:00Z', total_stars: 21, score: 800 }),
    ]);
  });

  it('marca cuál es la temporada actual y cuál la anterior', () => {
    const [current, previous] = orderOf(shiyu(), 'Temporada actual', 'Temporada anterior');

    expect(current).toBeLessThan(previous);
  });

  it('resume la temporada con su score, sus estrellas, su ranking y su tiempo', () => {
    const html = shiyu();

    expect(valueAfter(html, 'Score')).toBe('1000');
    expect(valueAfter(html, 'Estrellas')).toBe('★ 27');
    expect(valueAfter(html, 'Ranking')).toBe('Top 12,5%');
    expect(valueAfter(html, 'Tiempo')).toBe('15 min');
  });

  it('dibuja las siete capas, jugadas o no', () => {
    const html = shiyu();

    for (const layer of ['01', '02', '03', '04', '05', '06', '07']) {
      expect(html).toContain(`>${layer}</span>`);
    }
  });

  it('cada intento nombra su capa y su jefe con el equipo que lo pasó', () => {
    const html = shiyu();

    expect(html).toContain('Capa 07');
    expect(html).toContain('Ellen Joe');
    expect(html).toContain('Amillion');
  });
});

describe('el Asalto Mortal', () => {
  it('cambia el vocabulario a ciclos y no dibuja capas', () => {
    stubRuns([run({ mode: MODE_DEADLY_ASSAULT, entries: [attempt({ layer_index: null })] })]);
    const html = assault();

    expect(html).toContain('Ciclo actual');
    expect(html).toContain('Asalto Mortal');
    expect(html).not.toContain('Capa 07');
  });

  it('no mezcla los modos: una corrida de Shiyu no aparece en Asalto', () => {
    stubRuns([run()]);
    const html = assault();

    expect(html).toContain('No hay temporadas guardadas de este modo');
  });
});

describe('una temporada sin datos y una cuenta sin temporadas son cosas distintas', () => {
  it('la temporada que volvió vacía se dibuja igual, con los valores en guion', () => {
    stubRuns([run({ entries: [] })]);
    const html = shiyu();

    expect(html).toContain('Esta temporada volvió sin datos');
    expect(html).toContain('Temporada actual');
    expect(valueAfter(html, 'Score')).toBe('—');
    expect(valueAfter(html, 'Estrellas')).toBe('—');
    expect(html).not.toContain('No hay temporadas guardadas');
  });

  it('sin ninguna temporada guardada explica que HoYoLAB solo publica dos', () => {
    stubRuns([]);
    const html = shiyu();

    expect(html).toContain('No hay temporadas guardadas de este modo');
    expect(html).not.toContain('Esta temporada volvió sin datos');
    expect(html).not.toContain('Sincronizado');
  });

  it('un error del Chronicle no se lee como una cuenta sin temporadas', () => {
    stubApi({
      getAccount: account(),
      listChallenges: new ApiError(503, 'Chronicle caído'),
      listBangboos: { items: [] },
      catalogAgents: CATALOG,
    });
    const html = shiyu();

    expect(html).toContain('Faltan los datos estáticos de Enka');
    expect(html).not.toContain('No hay temporadas guardadas');
  });

  it('mientras carga no decide todavía si hay temporadas', () => {
    stubApi({ getAccount: account(), catalogAgents: CATALOG });
    const html = shiyu();

    expect(html).toContain('Cargando el Chronicle…');
    expect(html).not.toContain('No hay temporadas guardadas');
  });
});
