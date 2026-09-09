import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AccountKeyBanner from '../components/AccountKeyBanner';
import ReadOnlyNotice from '../components/ReadOnlyNotice';
import type { AccountAccess } from '../hooks/useAccountAccess';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import CredentialsPage from './CredentialsPage';
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
        <Route path="/account/:uid/credentials" element={element} />
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
    claimLevel: null,
    claimable: false,
    claiming: false,
    untracked: false,
    resolving: false,
    error: null,
    issuedKey: null,
    issuedKeyStored: true,
    claim: () => {},
    dismissIssuedKey: () => {},
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
  it('sin key manda a pegar la del UID, que ya tiene dueño', () => {
    const html = notice(access());

    expect(html).toContain('Este UID tiene dueño');
    expect(html).toContain('editar esta build');
    expect(html).toContain(`/account/${UID}/credentials`);
    expect(html).not.toContain('Reclamar este UID');
  });

  it('sobre una cuenta provisional el import todavía rota la key, y lo dice', () => {
    const html = notice(access({ claimLevel: 'provisional' }));

    expect(html).toContain('importá el Chronicle con la extensión');
    expect(html).toContain('te devuelve una key nueva');
    expect(html).not.toContain('rotate-key');
  });

  it('sobre una cuenta verificada el import ya no sirve: manda a rotate-key', () => {
    const html = notice(access({ claimLevel: 'verified' }));

    expect(html).toContain(`zzz-tracker rotate-key ${UID}`);
    expect(html).toContain('volver a importar no la rota');
    expect(html).not.toContain('te devuelve una key nueva');
  });

  it('mientras no se sabe el nivel de reclamo no promete ninguna recuperación', () => {
    const html = notice(access());

    expect(html).not.toContain('rotate-key');
    expect(html).not.toContain('importá el Chronicle');
  });

  it('sobre una cuenta sin dueño ofrece reclamarla, que es otro mensaje', () => {
    const html = notice(access({ claimLevel: 'unclaimed', claimable: true }), 'armar equipos');

    expect(html).toContain('Reclamalo para editar');
    expect(html).toContain('Reclamar este UID');
    expect(html).not.toContain('Este UID tiene dueño');
  });

  it('mientras no se sabe de quién es el UID no lo declara con dueño', () => {
    const html = notice(access({ resolving: true }));

    expect(html).toContain('Viendo de quién es este UID');
    expect(html).not.toContain('Este UID tiene dueño');
    expect(html).not.toContain(`/account/${UID}/credentials`);
  });

  it('un UID que no está trackeado manda al registro, no a buscar una key', () => {
    const html = notice(access({ untracked: true }));

    expect(html).toContain('Este UID no está trackeado');
    expect(html).toContain('no está en el tracker todavía');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('Este UID tiene dueño');
    expect(html).not.toContain('Reclamar este UID');
  });

  it('con key no avisa nada, y la key recién emitida se muestra una vez', () => {
    expect(notice(access({ canWrite: true, key: KEY }))).not.toContain('modo lectura');

    const issued = notice(access({ canWrite: true, key: KEY, issuedKey: KEY }));
    expect(issued).toContain('no se vuelve a mostrar');
    expect(issued).toContain(KEY);
  });
});

describe('el cartel de la key recién emitida', () => {
  function banner(stored: boolean): string {
    return renderToStaticMarkup(
      <MemoryRouter>
        <AccountKeyBanner uid={UID} accountKey={KEY} stored={stored} />
      </MemoryRouter>,
    );
  }

  it('cuando se guardó, dice que ya quedó en este navegador', () => {
    const html = banner(true);

    expect(html).toContain('Guardá esta key: no se vuelve a mostrar');
    expect(html).toContain('Ya quedó guardada en este navegador');
    expect(html).toContain(KEY);
  });

  it('cuando el navegador no la dejó guardar, no miente: empuja a copiarla', () => {
    const html = banner(false);

    expect(html).toContain('Copiá esta key ahora: no se pudo guardar');
    expect(html).toContain('no la dejó guardar');
    expect(html).toContain('anotala vos');
    expect(html).not.toContain('Ya quedó guardada en este navegador');
    expect(html).toContain(KEY);
  });
});

describe('pantallas sin la key del UID', () => {
  it('Conectar HoYoLAB se dibuja entera pero con el formulario de cookies apagado', () => {
    const html = render(`/account/${UID}/credentials`, <CredentialsPage />);

    expect(html).toContain('Esta computadora está en modo lectura');
    expect(html).toContain('<fieldset class="ne-lock" disabled=""');
    expect(html).not.toContain('Guardar credenciales');
    expect(html).toContain('Guardar la key acá');
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
  it('con la key en el navegador vuelven el guardado de cookies y el olvido de la key', () => {
    stubStoredKeys({ [UID]: KEY });

    const html = render(`/account/${UID}/credentials`, <CredentialsPage />);

    expect(html).toContain('Esta computadora puede escribir este UID');
    expect(html).toContain('Guardar credenciales');
    expect(html).toContain('Olvidar la key');
    expect(html).not.toContain('Esta computadora está en modo lectura');
  });

  it('el roster y los equipos recuperan sus acciones de escritura', () => {
    stubStoredKeys({ [UID]: KEY });

    expect(render(`/account/${UID}/agents`, <RosterPage />)).toContain('Agregar agente');
    expect(render(`/account/${UID}/teams`, <TeamsPage />)).toContain('Armar equipo');
  });
});
