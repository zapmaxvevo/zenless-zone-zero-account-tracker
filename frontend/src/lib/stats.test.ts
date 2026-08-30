import { describe, expect, it } from 'vitest';
import { formatStat, formatStatValue, parseStatFormat, statLabel } from './stats';

describe('parseStatFormat', () => {
  it('lee el entero, el decimal opcional y el porcentaje', () => {
    expect(parseStatFormat('{0:0}')).toEqual({ percent: false, minDecimals: 0, maxDecimals: 0 });
    expect(parseStatFormat('{0:0.#}')).toEqual({ percent: false, minDecimals: 0, maxDecimals: 1 });
    expect(parseStatFormat('{0:0.#%}')).toEqual({ percent: true, minDecimals: 0, maxDecimals: 1 });
    expect(parseStatFormat('{0:0.##}')).toEqual({ percent: false, minDecimals: 0, maxDecimals: 2 });
    expect(parseStatFormat('{0:0.00%}')).toEqual({ percent: true, minDecimals: 2, maxDecimals: 2 });
  });

  it('cae en entero plano si el formato falta o no se entiende', () => {
    const plain = { percent: false, minDecimals: 0, maxDecimals: 0 };
    expect(parseStatFormat(null)).toEqual(plain);
    expect(parseStatFormat('')).toEqual(plain);
    expect(parseStatFormat('vaya uno a saber')).toEqual(plain);
  });
});

describe('formatStatValue', () => {
  it('muestra los stats planos como enteros', () => {
    expect(formatStatValue(550, '{0:0}')).toBe('550');
    expect(formatStatValue(2436, '{0:0}')).toBe('2.436');
  });

  it('divide por 100 los porcentuales y les pone el signo', () => {
    expect(formatStatValue(480, '{0:0.#%}')).toBe('4,8%');
    expect(formatStatValue(800, '{0:0.#%}')).toBe('8%');
    expect(formatStatValue(1000, '{0:0.#%}')).toBe('10%');
    expect(formatStatValue(5000, '{0:0.#%}')).toBe('50%');
  });

  it('recorta los decimales sobrantes pero respeta los obligatorios', () => {
    expect(formatStatValue(316, '{0:0.#}')).toBe('316');
    expect(formatStatValue(3165, '{0:0.#}')).toBe('3.165');
    expect(formatStatValue(480, '{0:0.00%}')).toBe('4,80%');
  });

  it('sin formato trata el valor como entero', () => {
    expect(formatStatValue(24, null)).toBe('24');
    expect(formatStatValue(30, '')).toBe('30');
  });

  it('reproduce los bonus de set que publica Enka', () => {
    expect(formatStatValue(800, '{0:0.#%}')).toBe('8%');
    expect(formatStatValue(1000, '{0:0.#%}')).toBe('10%');
    expect(formatStatValue(1600, '{0:0.#%}')).toBe('16%');
    expect(formatStatValue(30, '{0:0}')).toBe('30');
  });
});

describe('formatStat', () => {
  it('usa el total, no la base por roll', () => {
    const critRate = {
      prop_id: 20103,
      name: 'CRIT Rate',
      format: '{0:0.#%}',
      value: 240,
      rolls: 3,
      total: 720,
    };
    const hp = { prop_id: 11103, name: 'HP', format: '{0:0}', value: 550, rolls: 0, total: 2200 };

    expect(formatStat(critRate)).toBe('7,2%');
    expect(formatStat(hp)).toBe('2.200');
  });

  it('sin total cae a la base cruda', () => {
    const hp = { prop_id: 11103, name: null, format: null, value: 550, rolls: 0, total: null };

    expect(formatStat(hp)).toBe('550');
  });
});

describe('statLabel', () => {
  it('usa el nombre resuelto, o el prop id si el backend no lo tiene', () => {
    expect(statLabel({ prop_id: 20103, name: 'CRIT Rate' })).toBe('CRIT Rate');
    expect(statLabel({ prop_id: 20103, name: null })).toBe('Prop 20103');
  });
});
