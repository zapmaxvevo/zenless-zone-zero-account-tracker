import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { account } from '../test/fixtures';
import { UID, orderOf, renderScreen, stubStoredKey } from '../test/render';
import HomePage from './HomePage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function screen(): string {
  return renderScreen('/', <HomePage />);
}

beforeEach(() => {
  stubStoredKey(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el registro de cuentas', () => {
  it('lista cada cuenta seguida con su apodo, su nivel y sus agentes', () => {
    stubApi({
      listAccounts: {
        items: [
          account(),
          account({ uid: '1500000000', nickname: '', level: 30, agent_count: 12 }),
        ],
      },
    });
    const html = screen();

    expect(html).toContain('Proxy');
    expect(html).toContain('Nivel 51 · 3 agentes');
    expect(html).toContain(`href="/account/${UID}"`);
    expect(html).toContain('href="/account/1500000000"');
  });

  it('una cuenta sin apodo se identifica por su UID', () => {
    stubApi({ listAccounts: { items: [account({ nickname: '' })] } });

    expect(screen()).toContain(`UID ${UID}`);
  });

  it('sin cuentas invita a trackear la primera', () => {
    stubApi({ listAccounts: { items: [] } });
    const html = screen();

    expect(html).toContain('Todavía no seguís ninguna cuenta');
    expect(html).toContain('Pegá un UID acá arriba');
    expect(html).not.toContain('Buscando cuentas');
  });

  it('un backend caído no se lee como «no seguís ninguna cuenta»', () => {
    stubApi({ listAccounts: new ApiError(500, 'Se cayó el backend') });
    const html = screen();

    expect(html).toContain('Se cayó el backend');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Todavía no seguís ninguna cuenta');
  });

  it('mientras busca no decide que la lista está vacía', () => {
    stubApi({});
    const html = screen();

    expect(html).toContain('Buscando cuentas…');
    expect(html).not.toContain('Todavía no seguís ninguna cuenta');
  });
});

describe('el alta de una cuenta', () => {
  beforeEach(() => {
    stubApi({ listAccounts: { items: [] } });
  });

  it('explica que los datos salen de la vitrina pública de Enka', () => {
    const html = screen();

    expect(html).toContain('Seguir una cuenta');
    expect(html).toContain('Enka.Network');
    expect(html).toContain('UID de la cuenta');
  });

  it('el formulario va antes que la lista: primero se trackea, después se mira', () => {
    const [form, list] = orderOf(screen(), 'UID de la cuenta', 'Cuentas seguidas');

    expect(form).toBeLessThan(list);
  });
});
