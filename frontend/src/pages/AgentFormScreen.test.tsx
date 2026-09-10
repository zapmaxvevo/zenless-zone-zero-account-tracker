import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentForm from '../components/AgentForm';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { stubApi } from '../test/fakeClient';
import { agentDetail, disc } from '../test/fixtures';
import { UID, render, renderScreen, stubStoredKey } from '../test/render';
import AgentFormPage from './AgentFormPage';
import NotFoundPage from './NotFoundPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

const CATALOG_AGENTS = [
  {
    game_id: 1091,
    name: 'Ellen Joe',
    rarity: 4,
    profession: 'Attack',
    elements: ['Ice'],
    image_url: null,
    icon_url: null,
  },
  {
    game_id: 1011,
    name: 'Anby',
    rarity: 3,
    profession: 'Stun',
    elements: ['Elec'],
    image_url: null,
    icon_url: null,
  },
];

const CATALOG_WENGINES = [
  { game_id: 14109, name: 'Deep Sea Visitor', rarity: 4, profession: 'Attack', image_url: null },
];

const CATALOG_SETS = [{ set_id: 31000, name: 'Polar Metal', icon_url: null, bonus_props: {} }];

const CATALOG_PROPERTIES = [{ prop_id: 20103, name: 'Prob. CRIT', format: '{0:0.#%}' }];

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

function form(overrides: Partial<React.ComponentProps<typeof AgentForm>> = {}): string {
  return render(
    <AgentForm
      uid={UID}
      access={access()}
      agent={null}
      catalogError={null}
      agents={CATALOG_AGENTS}
      wengines={CATALOG_WENGINES}
      discSets={CATALOG_SETS}
      properties={CATALOG_PROPERTIES}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  stubStoredKey(null);
  stubApi({ catalogAgents: { items: CATALOG_AGENTS } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cargar un agente a mano', () => {
  it('deja elegir del catálogo y avisa que lo manual no se vuelve a pisar', () => {
    const html = form();

    expect(html).toContain('Agregar agente');
    expect(html).toContain('Ellen Joe');
    expect(html).toContain('Anby');
    expect(html).toContain('queda marcado como manual');
  });

  it('ofrece los seis discos, todos sin equipar', () => {
    const html = form();

    expect(html).toContain('0/6');
    expect(html.split('Equipado')).toHaveLength(1 + 6);
  });

  it('arranca sin W-Engine y ofrece equiparlo', () => {
    const html = form();

    expect(html).toContain('Sin W-Engine equipado');
    expect(html).toContain('>Equipar<');
    expect(html).not.toContain('>Desequipar<');
  });

  it('los límites del juego viajan en los propios campos', () => {
    const html = form();

    expect(html).toContain('max="60"');
    expect(html).toContain('max="6"');
    expect(html).toContain('max="12"');
  });
});

describe('editar un agente que ya existe', () => {
  it('llega con sus datos cargados y el título dice a quién se edita', () => {
    const html = form({ agent: agentDetail() });

    expect(html).toContain('Editar Ellen Joe');
    expect(html).toContain('value="60"');
    expect(html).not.toContain('— elegir —</option><option value="1091"');
  });

  it('con W-Engine equipado ofrece sacarlo y muestra su modelo', () => {
    const html = form({ agent: agentDetail() });

    expect(html).toContain('>Desequipar<');
    expect(html).toContain('Deep Sea Visitor');
  });

  it('cuenta cuántos discos vienen equipados', () => {
    expect(form({ agent: agentDetail({ discs: [disc(1), disc(2)] }) })).toContain('2/6');
  });

  it('un catálogo que no cargó se avisa sin bloquear el formulario', () => {
    const html = form({ catalogError: 'Faltan los datos estáticos de Enka' });

    expect(html).toContain('Faltan los datos estáticos de Enka');
    expect(html).toContain('Agregar agente');
  });
});

describe('el formulario sin la key de la cuenta', () => {
  it('queda trabado y ofrece volver en vez de guardar', () => {
    const html = form({ access: access({ canWrite: false }) });

    expect(html).toContain('disabled=""');
    expect(html).not.toContain('>Guardar<');
    expect(html).toContain('>Volver<');
  });
});

describe('la pantalla del formulario', () => {
  it('mientras el catálogo no vuelve no dibuja campos', () => {
    stubApi({});
    const html = renderScreen(`/account/${UID}/agents/1/edit`, <AgentFormPage />);

    expect(html).toContain('Cargando…');
    expect(html).not.toContain('Agregar agente');
  });

  it('con el catálogo y el agente cargados dibuja la edición', () => {
    stubApi({
      getAgent: agentDetail(),
      catalogAgents: { items: CATALOG_AGENTS },
      catalogWEngines: { items: CATALOG_WENGINES },
      catalogDiscSets: { items: CATALOG_SETS },
      catalogProperties: { items: CATALOG_PROPERTIES },
    });
    const html = renderScreen(`/account/${UID}/agents/1/edit`, <AgentFormPage />);

    expect(html).toContain('Editar Ellen Joe');
    expect(html).toContain('Polar Metal');
  });
});

describe('una dirección que no existe', () => {
  it('lo dice y ofrece volver al inicio', () => {
    const html = render(<NotFoundPage />);

    expect(html).toContain('No hay nada acá');
    expect(html).toContain('href="/"');
  });
});
