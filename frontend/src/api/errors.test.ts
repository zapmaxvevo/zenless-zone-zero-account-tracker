import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import { describeError } from './errors';

describe('describeError', () => {
  it('explica en criollo los status que el usuario puede encontrarse', () => {
    expect(describeError(new ApiError(404, 'Account 1300 is not tracked'))).toContain('UID');
    expect(describeError(new ApiError(429, 'rate limited'))).toContain('limitando');
    expect(describeError(new ApiError(502, 'upstream failed'))).toContain('Enka');
    expect(describeError(new ApiError(503, 'static data missing'))).toContain('sync-static');
  });

  it('suma el detail del backend a los errores de validación', () => {
    expect(describeError(new ApiError(422, 'uid: string does not match pattern'))).toBe(
      'Los datos enviados no son válidos: uid: string does not match pattern',
    );
  });

  it('deja pasar el detail de los status sin mensaje propio', () => {
    expect(describeError(new ApiError(500, 'Internal error'))).toBe('Internal error');
  });

  it('avisa cuando el fetch ni llegó al backend', () => {
    expect(describeError(new TypeError('Failed to fetch'))).toContain('backend');
  });

  it('tiene una salida para lo que no es un Error', () => {
    expect(describeError('vaya uno a saber')).toBe('Ocurrió un error inesperado.');
  });
});
