import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import BangboosPage from './BangboosPage';
import ChroniclePage from './ChroniclePage';
import CredentialsPage from './CredentialsPage';
import LostVoidPage from './LostVoidPage';

function render(path: string, element: ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/:uid/chronicle/:section" element={element} />
        <Route path="/account/:uid/credentials" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

const UID = '1300000000';

describe('pantallas del Chronicle', () => {
  it('Shiyu abre con su marca de agua, su eyebrow y la barra de secciones', () => {
    const html = render(`/account/${UID}/chronicle/shiyu`, <ChroniclePage mode="shiyu" />);

    expect(html).toContain('SHIYU');
    expect(html).toContain(`HoYoLAB Chronicle // UID ${UID}`);
    expect(html).toContain('Temporada actual y anterior');
    expect(html).toContain('Cargando el Chronicle…');
    expect(html).toContain('ne-chronicle-nav');
  });

  it('Asalto cambia el título y el subtítulo, no la estructura', () => {
    const html = render(`/account/${UID}/chronicle/assault`, <ChroniclePage mode="assault" />);

    expect(html).toContain('ASALTO');
    expect(html).toContain('Asalto Mortal');
    expect(html).toContain('Ciclo actual y anterior');
  });

  it('Vacío Perdido dibuja el panel de progreso acumulado', () => {
    const html = render(`/account/${UID}/chronicle/void`, <LostVoidPage />);

    expect(html).toContain('VACÍO');
    expect(html).toContain('Progreso acumulado');
  });

  it('Bangboos abre el roster con su contador en cero mientras carga', () => {
    const html = render(`/account/${UID}/chronicle/bangboos`, <BangboosPage />);

    expect(html).toContain('BANGBOO');
    expect(html).toContain('Roster de bangboos');
    expect(html).toContain('0 bangboos registrados');
  });

  it('Conectar HoYoLAB jerarquiza la extensión sobre las cookies', () => {
    const html = render(`/account/${UID}/credentials`, <CredentialsPage />);

    expect(html).toContain('Conectar HoYoLAB');
    expect(html).toContain('Extensión del navegador');
    expect(html).toContain('Recomendado');
    expect(html).toContain('ZZZ_API_TOKEN');
    expect(html.indexOf('Extensión del navegador')).toBeLessThan(
      html.indexOf('Cookies de HoYoLAB'),
    );
    expect(html).toContain('Alternativa manual');
  });

  it('Conectar HoYoLAB dibuja el último import aunque nunca haya habido uno', () => {
    const html = render(`/account/${UID}/credentials`, <CredentialsPage />);

    expect(html).toContain('Último import desde la extensión');
    expect(html).toContain('—');
  });

  it('Conectar HoYoLAB conserva el formulario de cookies entero', () => {
    const html = render(`/account/${UID}/credentials`, <CredentialsPage />);

    expect(html).toContain('cred-ltuid');
    expect(html).toContain('cred-ltoken');
    expect(html).toContain('Guardar credenciales');
    expect(html).toContain('Borrar credenciales');
    expect(html).toContain('Solo se usan para sincronizar');
  });
});
