import { describe, expect, it } from 'vitest';
import { formatCountdown, msUntil } from './time';

const NOW = Date.parse('2026-08-05T12:00:00Z');

describe('msUntil', () => {
  it('mide lo que falta hasta una fecha futura', () => {
    expect(msUntil('2026-08-05T12:05:00Z', NOW)).toBe(5 * 60 * 1000);
  });

  it('da 0 cuando la fecha ya pasó, falta o no se puede parsear', () => {
    expect(msUntil('2026-08-05T11:59:00Z', NOW)).toBe(0);
    expect(msUntil(null, NOW)).toBe(0);
    expect(msUntil('cuando sea', NOW)).toBe(0);
  });

  it('interpreta la fecha del backend como UTC', () => {
    expect(msUntil('2026-08-05T12:00:30+00:00', NOW)).toBe(30_000);
  });
});

describe('formatCountdown', () => {
  it('muestra solo segundos abajo del minuto', () => {
    expect(formatCountdown(45_000)).toBe('45s');
    expect(formatCountdown(0)).toBe('0s');
  });

  it('muestra minutos y segundos, y horas y minutos', () => {
    expect(formatCountdown(125_000)).toBe('2m 05s');
    expect(formatCountdown(3_780_000)).toBe('1h 03m');
  });

  it('redondea hacia arriba para no anunciar 0s antes de tiempo', () => {
    expect(formatCountdown(1)).toBe('1s');
    expect(formatCountdown(59_400)).toBe('1m 00s');
  });

  it('trata los negativos como 0', () => {
    expect(formatCountdown(-5000)).toBe('0s');
  });
});
