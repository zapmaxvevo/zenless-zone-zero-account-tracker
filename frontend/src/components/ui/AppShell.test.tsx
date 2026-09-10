import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../api/client';
import { stubApi } from '../../test/fakeClient';
import { UID, stubStoredKey } from '../../test/render';
import AppShell from './AppShell';

vi.mock('../../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/client')>()),
  api: (await import('../../test/fakeClient')).api,
}));
vi.mock('../../hooks/useApi', () => import('../../test/fakeUseApi'));

function render(path: string): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>contenido</p>} />
          <Route path="/account/:uid" element={<p>contenido</p>} />
          <Route path="/account/:uid/*" element={<p>contenido</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('el shell de la aplicación', () => {
  it('pone las scanlines una sola vez, encima de todo', () => {
    stubStoredKey(null);
    stubApi({});

    expect(render('/').split('ne-scanlines')).toHaveLength(1 + 1);
  });

  it('dibuja la pantalla que le toca adentro', () => {
    stubStoredKey(null);
    stubApi({});

    expect(render('/')).toContain('contenido');
  });
});

describe('las pestañas de cuenta', () => {
  it('fuera de una cuenta no hay a dónde navegar', () => {
    stubStoredKey(null);
    stubApi({});
    const html = render('/');

    expect(html).not.toContain('>Roster<');
    expect(html).not.toContain('>Shiyu<');
    expect(html).not.toContain('Sincronizar');
  });

  it('dentro de una cuenta aparecen sus cinco secciones y su UID', () => {
    stubStoredKey(null);
    stubApi({});
    const html = render(`/account/${UID}/agents`);

    for (const tab of ['Panel', 'Roster', 'Equipos', 'Shiyu', 'Asalto']) {
      expect(html).toContain(`>${tab}</a>`);
    }
    expect(html).toContain(UID);
    expect(html).toContain('Sincronizar');
  });

  it('marca como activa la sección en la que se está', () => {
    stubStoredKey(null);
    stubApi({});
    const html = render(`/account/${UID}/agents`);

    expect(html).toContain('aria-current="page"');
  });
});

describe('el estado del backend al pie', () => {
  it('mientras no contesta lo dice', () => {
    stubStoredKey(null);
    stubApi({});

    expect(render('/')).toContain('Consultando el backend…');
  });

  it('cuando contesta muestra qué versión está corriendo', () => {
    stubStoredKey(null);
    stubApi({ health: { status: 'ok', app: 'zzz-tracker', version: '0.4.0' } });
    const html = render('/');

    expect(html).toContain('zzz-tracker 0.4.0 · ok');
    expect(html).not.toContain('Backend offline');
  });

  it('cuando no contesta avisa que está caído, con el motivo', () => {
    stubStoredKey(null);
    stubApi({ health: new ApiError(503, 'Sin datos estáticos') });
    const html = render('/');

    expect(html).toContain('Backend offline');
    expect(html).toContain('Faltan los datos estáticos de Enka');
  });
});
