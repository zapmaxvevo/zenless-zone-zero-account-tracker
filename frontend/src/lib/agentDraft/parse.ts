export function parseId(text: string): number | null {
  const value = parseInt(text, 10);
  return Number.isNaN(value) || value <= 0 ? null : value;
}

export function toNumber(text: string, fallback = 0): number {
  const value = parseInt(text, 10);
  return Number.isNaN(value) ? fallback : value;
}
