import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEY_PREFIX, storageKey } from '../lib/accountKey';
import BangboosPage from './BangboosPage';
import ChroniclePage from './ChroniclePage';
import AccountKeyPage from './AccountKeyPage';
import LostVoidPage from './LostVoidPage';

function render(path: string, element: ReactNode): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/:uid/chronicle/:section" element={element} />
        <Route path="/account/:uid/key" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}

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

describe('pantallas del Chronicle', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('la Key de la cuenta abre explicando de dónde sale y cómo pegarla', () => {
    const html = render(`/account/${UID}/key`, <AccountKeyPage />);

    expect(html).toContain('Key de la cuenta');
    expect(html).toContain('De dónde sale la key');
    expect(html).toContain('account-key');
    expect(html).toContain('Guardar la key acá');
    expect(html).toContain('Último import');
  });

  it('la Key de la cuenta ya no habla de cookies ni de sincronizar desde el servidor', () => {
    const html = render(`/account/${UID}/key`, <AccountKeyPage />);

    expect(html).not.toContain('cred-ltuid');
    expect(html).not.toContain('cred-ltoken');
    expect(html).not.toContain('Cookies de HoYoLAB');
    expect(html).not.toContain('Guardar credenciales');
  });
});
