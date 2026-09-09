import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function access(overrides: Partial<AccountAccess> = {}): AccountAccess {
  return {
    uid: UID,
    key: null,
    canWrite: false,
    claimLevel: null,
    claimable: false,
    claiming: false,
    error: null,
    issuedKey: null,
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
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ReadOnlyNotice access={access()} what="editar esta build" />
      </MemoryRouter>,
    );

    expect(html).toContain('Este UID tiene dueño');
    expect(html).toContain('editar esta build');
    expect(html).toContain(`/account/${UID}/credentials`);
    expect(html).not.toContain('Reclamar este UID');
  });

  it('sobre una cuenta sin dueño ofrece reclamarla, que es otro mensaje', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ReadOnlyNotice
          access={access({ claimLevel: 'unclaimed', claimable: true })}
          what="armar equipos"
        />
      </MemoryRouter>,
    );

    expect(html).toContain('Reclamalo para editar');
    expect(html).toContain('Reclamar este UID');
    expect(html).not.toContain('Este UID tiene dueño');
  });

  it('con key no avisa nada, y la key recién emitida se muestra una vez', () => {
    const clean = renderToStaticMarkup(
      <MemoryRouter>
        <ReadOnlyNotice access={access({ canWrite: true, key: KEY })} what="editar" />
      </MemoryRouter>,
    );
    expect(clean).not.toContain('modo lectura');

    const issued = renderToStaticMarkup(
      <MemoryRouter>
        <ReadOnlyNotice access={access({ canWrite: true, key: KEY, issuedKey: KEY })} what="e" />
      </MemoryRouter>,
    );
    expect(issued).toContain('no se vuelve a mostrar');
    expect(issued).toContain(KEY);
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
