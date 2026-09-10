import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { agentDetail, disc, stat } from '../test/fixtures';
import { UID, renderScreen, stubStoredKey, valueBefore } from '../test/render';
import AgentPage from './AgentPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

const PROPERTIES = {
  items: [{ prop_id: 31201, name: 'DAÑO de hielo', format: '%' }],
};

function screen(): string {
  return renderScreen(`/account/${UID}/agents/1`, <AgentPage />);
}

beforeEach(() => {
  stubStoredKey(UID);
  stubApi({ getAgent: agentDetail(), catalogProperties: PROPERTIES });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la build de un agente', () => {
  it('dibuja los seis discos con su set y sus substats', () => {
    const html = screen();

    expect(html).toContain('Polar Metal');
    expect(html).not.toContain('Slot vacío');
    expect(html).toContain('Prob. CRIT');
    expect(html).toContain('DAÑO CRIT');
  });

  it('muestra el score de build que sale de esos discos', () => {
    expect(valueBefore(screen(), 'Score de build')).toBe('55');
    expect(valueBefore(screen(), 'Discos equipados')).toBe('6/6');
  });

  it('lista las habilidades con su nivel', () => {
    const html = screen();

    expect(html).toContain('Ataque básico');
    expect(html).toContain('Habilidad central');
    expect(html).toContain('Asistencia');
  });

  it('nombra el set completo y su bonus traducido', () => {
    const html = screen();

    expect(html).toContain('4pz Polar Metal');
    expect(html).toContain('DAÑO de hielo');
  });
});

describe('una build incompleta', () => {
  it('un agente sin W-Engine lo dice y no rompe la pantalla', () => {
    stubApi({ getAgent: agentDetail({ wengine: null }), catalogProperties: PROPERTIES });
    const html = screen();

    expect(html).toContain('Sin W-Engine equipado');
    expect(html).toContain('Ellen Joe');
  });

  it('los slots sin disco se dibujan vacíos, no desaparecen', () => {
    stubApi({
      getAgent: agentDetail({ discs: [disc(1), disc(2)] }),
      catalogProperties: PROPERTIES,
    });
    const html = screen();

    expect(html.split('Slot vacío')).toHaveLength(1 + 4);
    expect(valueBefore(html, 'Discos equipados')).toBe('2/6');
  });

  it('un agente sin ningún set completo lo dice', () => {
    stubApi({ getAgent: agentDetail({ equipped_sets: [] }), catalogProperties: PROPERTIES });
    const html = screen();

    expect(html).toContain('Ningún set completo');
    expect(html).toContain('Sin set completo');
  });

  it('un disco sin substats no cuenta para el score', () => {
    stubApi({
      getAgent: agentDetail({
        discs: [1, 2, 3, 4, 5, 6].map((slot) => disc(slot, { substats: [] })),
      }),
      catalogProperties: PROPERTIES,
    });

    expect(valueBefore(screen(), 'Score de build')).toBe('0');
  });
});

describe('las subestadísticas que suman', () => {
  it('la leyenda nombra las de la especialidad del agente', () => {
    expect(screen()).toContain('Subestadísticas que suman al score de Ataque');
  });

  it('un agente de otra especialidad cuenta otras', () => {
    stubApi({
      getAgent: agentDetail({ profession: 'Defense' }),
      catalogProperties: PROPERTIES,
    });
    const html = screen();

    expect(html).toContain('Subestadísticas que suman al score de Defensa');
    expect(html).toContain('DEF%');
  });
});

describe('la build que no llega', () => {
  it('un agente que no existe muestra el error del backend, no una build vacía', () => {
    stubApi({ getAgent: new ApiError(404, 'No existe'), catalogProperties: PROPERTIES });
    const html = screen();

    expect(html).toContain('No encontramos esa cuenta');
    expect(html).not.toContain('Score de build');
  });

  it('mientras carga no dibuja discos', () => {
    stubApi({ catalogProperties: PROPERTIES });
    const html = screen();

    expect(html).toContain('Cargando la build…');
    expect(html).not.toContain('Score de build');
  });
});

describe('los substats clave de un disco', () => {
  const shared = disc(1, {
    substats: [
      stat({ prop_id: 20103, name: 'Crit', value: 240, rolls: 3 }),
      stat({ prop_id: 13102, name: 'def_ratio', value: 480, rolls: 3 }),
    ],
  });

  function scoreOf(profession: string): string {
    stubApi({
      getAgent: agentDetail({ profession, discs: [shared] }),
      catalogProperties: PROPERTIES,
    });
    return valueBefore(screen(), 'Score de build');
  }

  it('el mismo disco vale más para quien usa esa subestadística', () => {
    expect(scoreOf('Attack')).toBe('12');
    expect(scoreOf('Defense')).toBe('13');
  });
});
