import { describe, expect, it } from 'vitest';
import { ApiError } from './client';
import {
  FORBIDDEN_MESSAGE,
  UNCLAIMED_MESSAGE,
  describeError,
  isMissingKeyError,
  isRateLimited,
  isUnclaimedError,
} from './errors';

describe('describeError', () => {
  it('explica en criollo los status que el usuario puede encontrarse', () => {
    expect(describeError(new ApiError(404, 'Account 1300 is not tracked'))).toContain('UID');
    expect(describeError(new ApiError(429, 'rate limited'))).toContain('limitando');
    expect(describeError(new ApiError(502, 'upstream failed'))).toContain('Enka');
    expect(describeError(new ApiError(503, 'static data missing'))).toContain('sync-static');
    expect(describeError(new ApiError(409, 'Agent 1041 is already tracked'))).toContain(
      'ya tiene ese agente',
    );
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

describe('los dos 409 del modelo de propiedad', () => {
  it('separa el choque de dominio del UID sin dueño por el code, no por el texto', () => {
    const conflict = new ApiError(409, 'Agent 1041 is already tracked', 'conflict');
    const unclaimed = new ApiError(
      409,
      'Claim the account before writing to it',
      'unclaimed_account',
    );

    expect(describeError(conflict)).toContain('ya tiene ese agente');
    expect(describeError(unclaimed)).toBe(UNCLAIMED_MESSAGE);
    expect(describeError(conflict)).not.toBe(describeError(unclaimed));
  });

  it('el 403 de la key dice otra cosa que el 403 del Chronicle privado', () => {
    const missingKey = new ApiError(403, 'This account has an owner', 'forbidden');
    const notPublic = new ApiError(
      403,
      'That player keeps their Chronicle private',
      'data_not_public',
    );

    expect(describeError(missingKey)).toBe(FORBIDDEN_MESSAGE);
    expect(describeError(notPublic)).toBe('That player keeps their Chronicle private');
  });

  it('reconoce los dos casos por su code y no por su status', () => {
    expect(isMissingKeyError(new ApiError(403, 'x', 'forbidden'))).toBe(true);
    expect(isMissingKeyError(new ApiError(403, 'x', 'data_not_public'))).toBe(false);
    expect(isUnclaimedError(new ApiError(409, 'x', 'unclaimed_account'))).toBe(true);
    expect(isUnclaimedError(new ApiError(409, 'x', 'conflict'))).toBe(false);
  });

  it('sin code cae en el mensaje por status: el 422 de schema de FastAPI no lo trae', () => {
    const schema = new ApiError(422, 'body.uid: field required');

    expect(schema.code).toBeNull();
    expect(describeError(schema)).toBe(
      'Los datos enviados no son válidos: body.uid: field required',
    );
    expect(describeError(new ApiError(409, 'Agent 1041 is already tracked'))).toContain(
      'ya tiene ese agente',
    );
  });

  it('un code que la unión no conoce llega crudo y cae al fallback por status', () => {
    const unknown = new ApiError(503, 'el backend inventó un error nuevo', 'import_disabled');

    expect(unknown.code).toBe('import_disabled');
    expect(describeError(unknown)).toContain('sync-static');
    expect(isMissingKeyError(unknown)).toBe(false);
    expect(isUnclaimedError(unknown)).toBe(false);
  });

  it('reconoce el freno de la API por code o por status, que acá no se pisan', () => {
    expect(isRateLimited(new ApiError(429, 'slow down', 'rate_limited'))).toBe(true);
    expect(isRateLimited(new ApiError(429, 'slow down'))).toBe(true);
    expect(isRateLimited(new ApiError(403, 'x', 'forbidden'))).toBe(false);
    expect(isRateLimited(new TypeError('Failed to fetch'))).toBe(false);
  });
});
