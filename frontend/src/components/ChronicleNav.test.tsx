import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccountRead } from '../api/types';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import ChronicleNav from './ChronicleNav';

const UID = '1300000000';
const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

function stubStoredKey(uid: string | null): void {
  const entries = new Map(uid ? [[storageKey(uid), KEY]] : []);
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
}

function account(overrides: Partial<AccountRead> = {}): AccountRead {
  return {
    uid: '1300000000',
    nickname: 'Proxy',
    level: 60,
    signature: '',
    profile_id: null,
    avatar_id: null,
    title_id: null,
    calling_card_id: null,
    last_synced_at: null,
    next_sync_available_at: null,
    region: 'América',
    chronicle_public: true,
    chronicle_synced_at: null,
    chronicle_import_source: null,
    has_hoyolab_credentials: false,
    claim_level: 'provisional',
    agent_count: 0,
    ...overrides,
  };
}

function render(path: string, props: { account?: AccountRead | null; empty?: boolean } = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <ChronicleNav uid="1300000000" account={props.account ?? null} empty={props.empty ?? false} />
    </MemoryRouter>,
  );
}

const PATH = '/account/1300000000/chronicle/shiyu';

describe('ChronicleNav', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lleva a las cuatro secciones y a la conexión con HoYoLAB', () => {
    const html = render(PATH);

    expect(html).toContain('/account/1300000000/chronicle/shiyu');
    expect(html).toContain('/account/1300000000/chronicle/assault');
    expect(html).toContain('/account/1300000000/chronicle/void');
    expect(html).toContain('/account/1300000000/chronicle/bangboos');
    expect(html).toContain('/account/1300000000/credentials');
    expect(html).toContain('Conectar HoYoLAB');
  });

  it('marca activa solo la sección en la que está', () => {
    const html = render('/account/1300000000/chronicle/void');

    expect(html.split('is-active').length - 1).toBe(1);
    expect(html).toMatch(/is-active[^>]*>Vacío Perdido/);
  });

  it('sin credenciales no ofrece el botón de sincronizar', () => {
    expect(render(PATH)).not.toContain('Sincronizar Chronicle');
    expect(render(PATH, { account: account() })).not.toContain('Sincronizar Chronicle');
  });

  it('con cookies guardadas ofrece el botón de sincronizar', () => {
    const html = render(PATH, { account: account({ has_hoyolab_credentials: true }) });

    expect(html).toContain('Sincronizar Chronicle');
    expect(html).not.toContain('Importá de nuevo desde la extensión');
  });

  it('sin la key del UID el sync del Chronicle no se ofrece: es una escritura', () => {
    stubStoredKey(null);

    const html = render(PATH, { account: account({ has_hoyolab_credentials: true }) });

    expect(html).not.toContain('Sincronizar Chronicle');
    expect(html).toContain('Conectar HoYoLAB');
  });

  it('una cuenta importada por extensión no sincroniza desde acá', () => {
    const html = render(PATH, {
      account: account({ chronicle_import_source: 'extension', has_hoyolab_credentials: true }),
    });

    expect(html).toContain('Importá de nuevo desde la extensión');
    expect(html).not.toContain('Sincronizar Chronicle');
  });

  it('sin datos ni conexión manda a conectar HoYoLAB', () => {
    const html = render('/account/1300000000/chronicle/bangboos', { empty: true });

    expect(html).toContain('Sin datos del Chronicle');
    expect(html).toContain('Conectá HoYoLAB');
    expect(html).toContain('/account/1300000000/credentials');
  });

  it('sin datos pero con cookies manda a sincronizar, no a conectar', () => {
    const html = render(PATH, {
      account: account({ has_hoyolab_credentials: true }),
      empty: true,
    });

    expect(html).toContain('Sin datos del Chronicle');
    expect(html).toContain('sincronizá el Chronicle');
    expect(html).not.toContain('Conectá HoYoLAB');
  });

  it('sin datos pero importada por extensión manda a importar de nuevo', () => {
    const html = render(PATH, {
      account: account({ chronicle_import_source: 'extension' }),
      empty: true,
    });

    expect(html).toContain('Sin datos del Chronicle');
    expect(html).toContain('Abrí el popup de la extensión');
  });
});
