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
    has_owner: true,
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

  it('lleva a las cuatro secciones y a la key de la cuenta', () => {
    const html = render(PATH);

    expect(html).toContain('/account/1300000000/chronicle/shiyu');
    expect(html).toContain('/account/1300000000/chronicle/assault');
    expect(html).toContain('/account/1300000000/chronicle/void');
    expect(html).toContain('/account/1300000000/chronicle/bangboos');
    expect(html).toContain('/account/1300000000/key');
    expect(html).toContain('Key de la cuenta');
  });

  it('marca activa solo la sección en la que está', () => {
    const html = render('/account/1300000000/chronicle/void');

    expect(html.split('is-active').length - 1).toBe(1);
    expect(html).toMatch(/is-active[^>]*>Vacío Perdido/);
  });

  it('una cuenta importada por extensión recuerda que se refresca desde ahí', () => {
    const html = render(PATH, { account: account({ chronicle_import_source: 'extension' }) });

    expect(html).toContain('Importá de nuevo desde la extensión');
  });

  it('nunca ofrece sincronizar el Chronicle: el servidor ya no habla con HoYoLAB', () => {
    const html = render(PATH, { account: account() });

    expect(html).not.toContain('Sincronizar');
    expect(html).toContain('Key de la cuenta');
    expect(html).toContain(`/account/${UID}/key`);
  });

  it('sin datos manda a la extensión, que es el único camino que quedó', () => {
    const html = render('/account/1300000000/chronicle/bangboos', { empty: true });

    expect(html).toContain('Sin datos del Chronicle');
    expect(html).toContain('El Chronicle entra solo por la extensión');
    expect(html).toContain('/account/1300000000/key');
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
