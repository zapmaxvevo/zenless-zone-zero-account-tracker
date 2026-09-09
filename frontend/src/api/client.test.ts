import { describe, expect, it } from 'vitest';
import { ApiError, extractCode, extractDetail, statusFallback } from './client';

describe('extractDetail', () => {
  it('usa el detail string de FastAPI', () => {
    expect(extractDetail({ detail: 'UID inexistente' }, 'fallback')).toBe('UID inexistente');
  });

  it('junta los msg de un detail de validación', () => {
    const body = { detail: [{ msg: 'field required' }, { msg: 'value is not a valid integer' }] };
    expect(extractDetail(body, 'fallback')).toBe('field required, value is not a valid integer');
  });

  it('cae en el fallback si el body no tiene detail', () => {
    expect(extractDetail({ error: 'nope' }, 'fallback')).toBe('fallback');
    expect(extractDetail(null, 'fallback')).toBe('fallback');
    expect(extractDetail('texto plano', 'fallback')).toBe('fallback');
  });

  it('cae en el fallback si el detail es un string vacío o una lista inservible', () => {
    expect(extractDetail({ detail: '   ' }, 'fallback')).toBe('fallback');
    expect(extractDetail({ detail: [] }, 'fallback')).toBe('fallback');
    expect(extractDetail({ detail: [{ loc: ['body'] }] }, 'fallback')).toBe('fallback');
  });
});

describe('statusFallback', () => {
  it('prefiere el statusText', () => {
    expect(statusFallback(404, 'Not Found')).toBe('Not Found');
  });

  it('arma un mensaje con el código cuando no hay statusText', () => {
    expect(statusFallback(500, '')).toBe('Error 500');
  });
});

describe('extractCode', () => {
  it('devuelve el code del dominio cuando el backend lo manda', () => {
    expect(extractCode({ detail: 'x', code: 'unclaimed_account' })).toBe('unclaimed_account');
    expect(extractCode({ detail: 'x', code: '  forbidden  ' })).toBe('forbidden');
  });

  it('devuelve null cuando no viene, que es lo que pasa con el 422 de schema', () => {
    expect(extractCode({ detail: [{ msg: 'field required' }] })).toBeNull();
    expect(extractCode({ detail: 'x', code: '' })).toBeNull();
    expect(extractCode({ detail: 'x', code: 7 })).toBeNull();
    expect(extractCode(null)).toBeNull();
  });
});

describe('ApiError', () => {
  it('conserva status y detail, y es instanceof Error', () => {
    const err = new ApiError(429, 'rate limit');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
    expect(err.detail).toBe('rate limit');
    expect(err.code).toBeNull();
    expect(err.message).toBe('HTTP 429: rate limit');
    expect(err.name).toBe('ApiError');
  });

  it('lleva el code del dominio cuando el body lo trae', () => {
    expect(new ApiError(403, 'sin key', 'forbidden').code).toBe('forbidden');
  });
});
