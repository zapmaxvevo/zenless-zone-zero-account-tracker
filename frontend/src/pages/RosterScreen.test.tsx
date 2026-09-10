import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { agent, roster, wengine } from '../test/fixtures';
import { UID, orderOf, portraitFor, renderScreen, stubStoredKey } from '../test/render';
import RosterPage from './RosterPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function screen(): string {
  return renderScreen(`/account/${UID}/agents`, <RosterPage />);
}

beforeEach(() => {
  stubStoredKey(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el roster con agentes', () => {
  beforeEach(() => {
    stubApi({ listAgents: { items: roster() } });
  });

  it('muestra a cada agente con su atributo, su rango y su W-Engine', () => {
    const html = screen();

    const ellen = portraitFor(html, 'Ellen Joe');
    expect(ellen).toContain('Hielo');
    expect(ellen).toContain('Ataque');
    expect(ellen).toContain('Deep Sea Visitor');

    const anby = portraitFor(html, 'Anby');
    expect(anby).toContain('Eléctrico');
    expect(anby).toContain('Aturdimiento');
  });

  it('un agente sin W-Engine lo dice en vez de romperse', () => {
    expect(portraitFor(screen(), 'Anby')).toContain('Sin W-Engine');
  });

  it('ordena por score de build, no por el orden en que vino la lista', () => {
    const [ellen, lycaon, anby] = orderOf(screen(), 'Ellen Joe', 'Von Lycaon', 'Anby');

    expect(ellen).toBeLessThan(lycaon);
    expect(lycaon).toBeLessThan(anby);
  });
});

describe('el roster sin nada que mostrar', () => {
  it('sin agentes explica que Enka solo publica la vitrina', () => {
    stubApi({ listAgents: { items: [] } });
    const html = screen();

    expect(html).toContain('Esta cuenta no tiene agentes');
    expect(html).not.toContain('Cargando los agentes');
  });

  it('un fallo del backend no se confunde con una cuenta vacía', () => {
    stubApi({ listAgents: new ApiError(502, 'Enka caído') });
    const html = screen();

    expect(html).toContain('Enka no está respondiendo');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Esta cuenta no tiene agentes');
  });

  it('mientras la lista no vuelve, avisa que está cargando', () => {
    stubApi({});
    const html = screen();

    expect(html).toContain('Cargando los agentes…');
    expect(html).not.toContain('Esta cuenta no tiene agentes');
  });
});

describe('el roster sin la key de la cuenta', () => {
  it('esconde el alta de agente', () => {
    stubApi({ listAgents: { items: roster() } });

    expect(screen()).not.toContain('Agregar agente');
  });

  it('con la key guardada la ofrece', () => {
    stubStoredKey(UID);
    stubApi({ listAgents: { items: roster() } });

    expect(screen()).toContain('Agregar agente');
  });
});

describe('el score que ordena el roster', () => {
  it('un agente recién sacado queda debajo de uno con seis discos y W-Engine', () => {
    stubApi({
      listAgents: {
        items: [
          agent({
            id: 9,
            name: 'Recluta',
            level: 1,
            disc_count: 0,
            mindscape_level: 0,
            wengine: null,
          }),
          agent({
            id: 8,
            name: 'Veterana',
            level: 60,
            disc_count: 6,
            mindscape_level: 6,
            wengine: wengine(),
          }),
        ],
      },
    });

    const [veterana, recluta] = orderOf(screen(), 'Veterana', 'Recluta');
    expect(veterana).toBeLessThan(recluta);
  });
});
