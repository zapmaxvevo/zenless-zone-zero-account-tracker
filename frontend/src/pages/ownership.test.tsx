import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ReadOnlyNotice from '../components/ReadOnlyNotice';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import AccountKeyPage from './AccountKeyPage';
import HomePage from './HomePage';
import RosterPage from './RosterPage';
import TeamsPage from './TeamsPage';

const UID = '1300000000';
const KEY = `${KEY_PREFIX}0jvXwPnJHo0d8H8rWc2vQKPzE4mDwK5f`;

function stubStoredKeys(keys: Record<string, string>): void {
  const entries = new Map(Object.entries(keys).map(([uid, key]) => [storageKey(uid), key]));
  vi.stubGlobal('localStorage', {
    getItem: (name: string) => entries.get(name) ?? null,
    setItem: (name: string, value: string) => entries.set(name, value),
    removeItem: (name: string) => entries.delete(name),
  });
}

function render(path: string, element: ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={element} />
        <Route path="/account/:uid/key" element={element} />
        <Route path="/account/:uid/agents" element={element} />
        <Route path="/account/:uid/teams" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

function notice(state: AccountAccess, what = 'editar esta build'): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ReadOnlyNotice access={state} what={what} />
    </MemoryRouter>,
  );
}

function access(overrides: Partial<AccountAccess> = {}): AccountAccess {
  return {
    uid: UID,
    key: null,
    canWrite: false,
    hasOwner: true,
    untracked: false,
    resolving: false,
    saveKey: () => true,
    forget: () => {},
    ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
  stubStoredKeys({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el aviso de modo lectura', () => {
  it('con dueño y sin key, ofrece las dos únicas salidas que existen', () => {
    const html = notice(access());

    expect(html).toContain('Este UID tiene dueño');
    expect(html).toContain('editar esta build');
    expect(html).toContain(`/account/${UID}/key`);
    expect(html).toContain(`zzz-tracker rotate-key ${UID}`);
  });

  it('sin dueño ya no ofrece reclamar desde acá: manda a importar con la extensión', () => {
    const html = notice(access({ hasOwner: false }), 'armar equipos');

    expect(html).toContain('Nadie reclamó este UID');
    expect(html).toContain('Importalo con la extensión');
    expect(html).not.toContain('Reclamar este UID');
    expect(html).not.toContain('rotate-key');
  });

  it('mientras no se sabe de quién es el UID no lo declara con dueño', () => {
    const html = notice(access({ hasOwner: null, resolving: true }));

    expect(html).toContain('Viendo de quién es este UID');
    expect(html).not.toContain('Este UID tiene dueño');
    expect(html).not.toContain('rotate-key');
  });

  it('un UID que no está trackeado manda al registro, no a buscar una key', () => {
    const html = notice(access({ hasOwner: null, untracked: true }));

    expect(html).toContain('Este UID no está trackeado');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('Este UID tiene dueño');
  });

  it('con key no avisa nada', () => {
    expect(notice(access({ canWrite: true, key: KEY }))).toBe('');
  });
});

describe('pantallas sin la key del UID', () => {
  it('la Key de la cuenta explica el modo lectura y ofrece pegar una', () => {
    const html = render(`/account/${UID}/key`, <AccountKeyPage />);

    expect(html).toContain('Este navegador no guarda la key del UID');
    expect(html).toContain('Guardar la key acá');
    expect(html).not.toContain('Olvidar la key');
  });

  it('el roster y los equipos esconden lo que no se puede hacer sin key', () => {
    const roster = render(`/account/${UID}/agents`, <RosterPage />);
    const teams = render(`/account/${UID}/teams`, <TeamsPage />);

    expect(roster).toContain('Roster');
    expect(roster).not.toContain('Agregar agente');
    expect(teams).toContain('Equipos');
    expect(teams).not.toContain('Armar equipo');
  });
});

describe('pegar la key a mano habilita la escritura', () => {
  it('con la key en el navegador aparece copiarla y olvidarla', () => {
    stubStoredKeys({ [UID]: KEY });

    const html = render(`/account/${UID}/key`, <AccountKeyPage />);

    expect(html).toContain('Puede escribir');
    expect(html).toContain(KEY);
    expect(html).toContain('Olvidar la key');
    expect(html).not.toContain('Este navegador no guarda la key del UID');
  });

  it('el roster y los equipos recuperan sus acciones de escritura', () => {
    stubStoredKeys({ [UID]: KEY });

    expect(render(`/account/${UID}/agents`, <RosterPage />)).toContain('Agregar agente');
    expect(render(`/account/${UID}/teams`, <TeamsPage />)).toContain('Armar equipo');
  });
});

describe('la comprobación de la key cuenta como uso, así que no corre sola', () => {
  it('dibujar la pantalla de la key no consulta ownership: eso pasa solo al pegar', () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return new Promise<Response>(() => {});
    });
    stubStoredKeys({ [UID]: KEY });

    render(`/account/${UID}/key`, <AccountKeyPage />);

    expect(urls.some((url) => url.includes('/ownership'))).toBe(false);
  });
});

describe('seguir una cuenta ya no reparte keys', () => {
  it('el registro no muestra ningún cartel de key ni la pide', () => {
    const html = render('/', <HomePage />);

    expect(html).toContain('Seguir una cuenta');
    expect(html).not.toContain('ne-key');
    expect(html).not.toContain('no se vuelve a mostrar');
    expect(html).not.toContain('Ya la guardé');
  });
});
