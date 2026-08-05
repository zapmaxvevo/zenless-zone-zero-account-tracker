import { describe, expect, it } from 'vitest';
import { isValidUid, normalizeUid, uidError } from './uid';

describe('isValidUid', () => {
  it('acepta entre 6 y 16 dígitos, con espacios alrededor', () => {
    expect(isValidUid('1300000000')).toBe(true);
    expect(isValidUid('123456')).toBe(true);
    expect(isValidUid('1234567890123456')).toBe(true);
    expect(isValidUid('  1300000000  ')).toBe(true);
  });

  it('rechaza vacíos, cortos, largos y cualquier cosa que no sea un dígito', () => {
    expect(isValidUid('')).toBe(false);
    expect(isValidUid('12345')).toBe(false);
    expect(isValidUid('12345678901234567')).toBe(false);
    expect(isValidUid('13000000ab')).toBe(false);
    expect(isValidUid('130 000 000')).toBe(false);
    expect(isValidUid('-1300000')).toBe(false);
  });
});

describe('uidError', () => {
  it('no se queja de un UID válido', () => {
    expect(uidError('1300000000')).toBeNull();
  });

  it('explica cada motivo de rechazo', () => {
    expect(uidError('  ')).toBe('Escribí un UID.');
    expect(uidError('13000x')).toBe('El UID son solo números.');
    expect(uidError('12345')).toBe('El UID tiene al menos 6 dígitos.');
    expect(uidError('1'.repeat(17))).toBe('El UID tiene como mucho 16 dígitos.');
  });
});

describe('normalizeUid', () => {
  it('saca los espacios de los bordes', () => {
    expect(normalizeUid('  1300000000\n')).toBe('1300000000');
  });
});
