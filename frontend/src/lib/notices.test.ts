import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorNotice, reportNotice } from './notices';

describe('el aviso de un sync que salió bien a medias', () => {
  it('no dice nada cuando trajo todo', () => {
    expect(reportNotice(false, [])).toBeNull();
  });

  it('el sync salteado y los modos sin datos son acento, no error', () => {
    expect(reportNotice(true, [])?.tone).toBe('warn');

    const partial = reportNotice(false, ['shiyu_defense', 'deadly_assault']);
    expect(partial?.title).toBe('Modos sin datos');
    expect(partial?.text).toContain('Defensa Shiyu y Asalto Mortal');
  });
});

describe('el aviso de un sync que falló', () => {
  it('un 403 por la key no se anuncia como Chronicle privado', () => {
    const notice = errorNotice(
      new ApiError(403, 'Account 1300000000 belongs to whoever holds its key', 'forbidden'),
    );

    expect(notice.title).toBe('Este UID tiene dueño');
    expect(notice.text).not.toContain('privado');
    expect(notice.text).toContain('key');
  });

  it('el 403 del Chronicle privado sigue diciendo lo suyo', () => {
    const notice = errorNotice(
      new ApiError(403, 'That player keeps their Battle Chronicle private', 'data_not_public'),
    );

    expect(notice.title).toBe('Chronicle privado');
    expect(notice.text).toContain('HoYoLAB');
  });

  it('el captcha se reconoce por su code y no por la palabra en el detail', () => {
    const notice = errorNotice(new ApiError(503, 'geetest triggered', 'captcha_required'));

    expect(notice.title).toBe('HoYoLAB pidió un captcha');
    expect(notice.tone).toBe('warn');
  });

  it('los otros 503 no se disfrazan de captcha', () => {
    const notice = errorNotice(new ApiError(503, 'static data missing', 'static_data_unavailable'));

    expect(notice.title).toBe('No se pudo sincronizar');
    expect(notice.text).toContain('sync-static');
  });

  it('una cuenta sin reclamar no sale en inglés crudo', () => {
    const notice = errorNotice(
      new ApiError(409, 'Account 1300000000 has no owner yet', 'unclaimed_account'),
    );

    expect(notice.title).toBe('La cuenta no está reclamada');
    expect(notice.text).toContain('Reclamalo');
    expect(notice.text).not.toContain('has no owner yet');
  });

  it('sin code cae en el status, y un 403 mudo no diagnostica nada', () => {
    expect(errorNotice(new ApiError(429, 'rate limited')).title).toBe(
      'HoYoLAB está frenando las consultas',
    );
    expect(errorNotice(new ApiError(401, 'no cookies')).title).toBe('Credenciales de HoYoLAB');
    expect(errorNotice(new ApiError(403, 'algo pasó')).title).toBe('No se pudo sincronizar');
  });
});
