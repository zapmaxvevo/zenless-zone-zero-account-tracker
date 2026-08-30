import type { StatRead } from '../api/types';

export interface StatFormat {
  percent: boolean;
  minDecimals: number;
  maxDecimals: number;
}

const FORMAT_PATTERN = /^\{0:0(?:\.([0#]+))?(%)?\}$/;

const PLAIN_INTEGER: StatFormat = { percent: false, minDecimals: 0, maxDecimals: 0 };

export function parseStatFormat(format: string | null | undefined): StatFormat {
  const match = format ? FORMAT_PATTERN.exec(format.trim()) : null;
  if (!match) return PLAIN_INTEGER;

  const decimals = match[1] ?? '';
  return {
    percent: match[2] === '%',
    minDecimals: decimals.split('').filter((char) => char === '0').length,
    maxDecimals: decimals.length,
  };
}

export function formatStatValue(value: number, format: string | null | undefined): string {
  const spec = parseStatFormat(format);
  const scaled = spec.percent ? value / 100 : value;
  const text = formatNumber(scaled, spec.minDecimals, spec.maxDecimals);
  return spec.percent ? `${text}%` : text;
}

export function formatStat(stat: StatRead): string {
  return formatStatValue(stat.total ?? stat.value, stat.format);
}

export function statLabel(stat: Pick<StatRead, 'name' | 'prop_id'>): string {
  return stat.name ?? `Prop ${stat.prop_id}`;
}

function formatNumber(value: number, minDecimals: number, maxDecimals: number): string {
  const [whole, decimals = ''] = value.toFixed(maxDecimals).split('.');
  const kept = decimals.replace(/0+$/, '').padEnd(minDecimals, '0');
  return kept ? `${withThousands(whole)},${kept}` : withThousands(whole);
}

function withThousands(text: string): string {
  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return negative ? `-${grouped}` : grouped;
}
