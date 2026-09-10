import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import { stubApi } from '../test/fakeClient';
import { account } from '../test/fixtures';
import { UID, renderScreen, stubStoredKey } from '../test/render';
import AccountKeyPage from './AccountKeyPage';

vi.mock('../api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/client')>()),
  api: (await import('../test/fakeClient')).api,
}));
vi.mock('../hooks/useApi', () => import('../test/fakeUseApi'));

function screen(): string {
  return renderScreen(`/account/${UID}/key`, <AccountKeyPage />);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('de quién es el UID', () => {
  beforeEach(() => {
    stubStoredKey(null);
  });

  it('un UID con dueño y sin key acá queda en modo lectura', () => {
    stubApi({ getAccount: account({ has_owner: true }) });
    const html = screen();

    expect(html).toContain('Modo lectura · con dueño');
    expect(html).toContain('Este navegador no guarda la key del UID');
  });

  it('un UID que nadie reclamó se distingue de uno cuya key no tenemos', () => {
    stubApi({ getAccount: account({ has_owner: false }) });
    const html = screen();

    expect(html).toContain('Modo lectura · sin dueño');
    expect(html).not.toContain('Modo lectura · con dueño');
  });

  it('un UID que el backend no conoce no se declara ni con dueño ni sin dueño', () => {
    stubApi({ getAccount: new ApiError(404, 'No existe') });
    const html = screen();

    expect(html).not.toContain('Modo lectura · sin dueño');
    expect(html).not.toContain('Modo lectura · con dueño');
  });

  it('mientras no se sabe de quién es, no lo declara sin dueño', () => {
    stubApi({});
    const html = screen();

    expect(html).not.toContain('Modo lectura · sin dueño');
    expect(html).not.toContain('Modo lectura · con dueño');
  });
});

describe('la key guardada en este navegador', () => {
  beforeEach(() => {
    stubStoredKey(UID);
  });

  it('con la key el UID se puede escribir y la key se puede olvidar', () => {
    stubApi({ getAccount: account() });
    const html = screen();

    expect(html).toContain('Puede escribir');
    expect(html).toContain('Olvidar la key');
    expect(html).not.toContain('Este navegador no guarda la key del UID');
  });

  it('la key no se muestra sola: hay que pedir verla', () => {
    stubApi({ getAccount: account() });
    const html = screen();

    expect(html).toContain('••••••••••••••••••••••••');
    expect(html).toContain('>Ver<');
    expect(html).toContain('>Copiar<');
  });
});

describe('de dónde sale la key', () => {
  beforeEach(() => {
    stubStoredKey(null);
  });

  it('los tres pasos apuntan a la extensión, no al servidor', () => {
    stubApi({ getAccount: account() });
    const html = screen();

    expect(html).toContain('Instalá la extensión');
    expect(html).toContain('Apuntala a este tracker');
    expect(html).toContain('Importá');
    expect(html).not.toContain('Cookies de HoYoLAB');
  });

  it('un UID importado con la extensión muestra cuándo fue el último import', () => {
    stubApi({ getAccount: account({ chronicle_import_source: 'extension' }) });

    expect(screen()).toContain('3 agentes trackeados');
  });

  it('un UID que nunca se importó no inventa una fecha', () => {
    stubApi({ getAccount: account({ chronicle_import_source: null }) });

    expect(screen()).toContain('Último import · —');
  });
});
